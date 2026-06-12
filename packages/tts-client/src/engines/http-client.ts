import { VoicevoxError, VoicevoxErrorCode } from '../error.js'

export type HttpMethod = 'get' | 'post' | 'put' | 'delete'
export type ResponseType = 'json' | 'arraybuffer' | 'text'

export interface HttpClientOptions {
  baseUrl: string
  defaultHeaders?: Record<string, string>
  timeoutMs?: number
  retry?: {
    maxRetries?: number
    baseDelayMs?: number
    retryStatuses?: number[]
  }
}

export interface HttpRequestOptions {
  /** このリクエストだけ既定タイムアウトを上書きする（例: 長文の音声合成）。 */
  timeoutMs?: number
}

export const DEFAULT_TIMEOUT_MS = 30000

/**
 * 音声合成リクエスト用の長めのタイムアウト。
 * 長文テキストや低速なハードウェアでは合成が既定の 30 秒を超えることがあるため、
 * メタデータ系（audio_query 等）とは別に余裕を持たせる。
 */
export const SYNTHESIS_TIMEOUT_MS = 120000

export class HttpClient {
  public readonly baseUrl: string
  private readonly defaultHeaders: Record<string, string>
  private readonly timeoutMs: number
  private readonly maxRetries: number
  private readonly baseDelayMs: number
  private readonly retryStatuses: Set<number>

  constructor(options: HttpClientOptions) {
    this.baseUrl = normalizeUrl(options.baseUrl)
    this.defaultHeaders = options.defaultHeaders ?? {}
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    this.maxRetries = options.retry?.maxRetries ?? 0
    this.baseDelayMs = options.retry?.baseDelayMs ?? 500
    this.retryStatuses = new Set(options.retry?.retryStatuses ?? [429])
  }

  public async request<T>(
    method: HttpMethod,
    endpoint: string,
    data: unknown = null,
    headers: Record<string, string> = {},
    responseType: ResponseType = 'json',
    options: HttpRequestOptions = {}
  ): Promise<T> {
    const timeoutMs = options.timeoutMs ?? this.timeoutMs
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      const init: RequestInit = {
        method: method.toUpperCase(),
        headers: {
          ...this.defaultHeaders,
          ...headers,
        },
        signal: AbortSignal.timeout(timeoutMs),
      }

      if (data !== null) {
        init.body = JSON.stringify(data)
      }

      let response: Response
      try {
        response = await fetch(`${this.baseUrl}${endpoint}`, init)
      } catch (error) {
        // ネットワークエラー / タイムアウトもステータスコード同様にリトライ対象とする。
        if (attempt < this.maxRetries) {
          await delay(this.baseDelayMs * 2 ** attempt)
          continue
        }
        throw new VoicevoxError(
          `API request failed: ${error instanceof Error ? error.message : String(error)}`,
          VoicevoxErrorCode.API_CONNECTION_ERROR,
          error
        )
      }
      if (!response.ok) {
        // body を必ず消費してソケットを解放しつつ、エンジンのエラー detail を拾う。
        const detail = (await response.text().catch(() => '')).trim()
        if (attempt < this.maxRetries && this.retryStatuses.has(response.status)) {
          await delay(resolveRetryDelayMs(response, this.baseDelayMs, attempt))
          continue
        }
        throw new VoicevoxError(
          `API request failed: ${response.status}${detail ? ` - ${detail.slice(0, 500)}` : ''}`,
          VoicevoxErrorCode.API_CONNECTION_ERROR
        )
      }

      if (responseType === 'arraybuffer') {
        return (await response.arrayBuffer()) as T
      }
      if (responseType === 'text') {
        return (await response.text()) as T
      }
      return (await response.json()) as T
    }
    throw new VoicevoxError('API request failed', VoicevoxErrorCode.API_CONNECTION_ERROR)
  }
}

export function normalizeUrl(url: string): string {
  return url.replace(/\/+$/, '')
}

function resolveRetryDelayMs(response: Response, baseDelayMs: number, attempt: number): number {
  const retryAfter = response.headers.get('retry-after')
  const retryAfterMs = parseRetryAfterMs(retryAfter)
  if (retryAfterMs !== null) return Math.min(retryAfterMs, 10_000)
  return baseDelayMs * 2 ** attempt
}

function parseRetryAfterMs(value: string | null): number | null {
  if (!value) return null
  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000
  const dateMs = Date.parse(value)
  if (Number.isNaN(dateMs)) return null
  return Math.max(0, dateMs - Date.now())
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
