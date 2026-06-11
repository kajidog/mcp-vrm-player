import { randomUUID } from 'node:crypto'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js'
import { type Context, Hono, type Next } from 'hono'
import { cors } from 'hono/cors'

import {
  type AuthInfo,
  type AuthVariables,
  type OAuthConfig,
  bearerAuth,
  createProtectedResourceMetadata,
} from './auth/index.js'
import type { BaseServerConfig } from './config.js'
import { deleteSessionConfig } from './session.js'

// 型定義
interface ErrorResponse {
  jsonrpc: '2.0'
  error: {
    code: number
    message: string
  }
  id: null
}

interface HealthCheckResponse {
  status: 'ok'
  transports: number
  timestamp: string
}

export interface CreateHttpAppOptions {
  server: McpServer
  config: BaseServerConfig
  /** セッションごとに新しい McpServer を生成するファクトリ関数（HTTPモード用） */
  serverFactory?: () => McpServer
  /** 追加のCORSヘッダー（例: 'X-TTS-Speaker'） */
  extraCorsHeaders?: string[]
  /** セッション初期化時のコールバック（ヘッダーからの設定読み取り等に使用） */
  onSessionInitialized?: (sessionId: string, request: Request, authInfo?: AuthInfo) => void
  /** セッション終了時のコールバック */
  onSessionClosed?: (sessionId: string) => void
  /** MCP 以外のHTTPルートを追加するための拡張フック */
  configureApp?: (app: Hono<{ Variables: AuthVariables }>) => void
  /** OAuth JWT Bearer 認証設定。有効時は API キー認証より優先される */
  authConfig?: OAuthConfig | null
  /** OAuth JWT Bearer 認証を適用する Hono パスパターン */
  authProtectedRoutes?: string[]
  /** OAuth JWT Bearer 認証で route ごとに要求する scope */
  authRequiredScopes?: Record<string, string[]>
  /** アイドルセッションを破棄するまでの時間（ミリ秒、既定: 60 分） */
  sessionIdleTimeoutMs?: number
  /** 同時に保持するセッション数の上限。超過時は最も古いセッションを破棄（既定: 100） */
  maxSessions?: number
}

/**
 * JSONRPCエラーレスポンスを生成するヘルパー関数
 */
function badRequestError(message = 'Bad Request: No valid session ID provided'): ErrorResponse {
  return {
    jsonrpc: '2.0',
    error: { code: -32000, message },
    id: null,
  }
}

function internalServerError(): ErrorResponse {
  return {
    jsonrpc: '2.0',
    error: { code: -32603, message: 'Internal server error' },
    id: null,
  }
}

function forbiddenError(message: string): ErrorResponse {
  return {
    jsonrpc: '2.0',
    error: { code: -32000, message },
    id: null,
  }
}

function unauthorizedError(message: string): ErrorResponse {
  return {
    jsonrpc: '2.0',
    error: { code: -32001, message },
    id: null,
  }
}

/** ログにセッションIDの全文を残さないための短縮表記 */
function shortSessionId(sessionId: string): string {
  return `${sessionId.slice(0, 8)}…`
}

/** JWT から導出した、セッションの所有者を表す識別子（sub > clientId） */
function resolveAuthSubject(authInfo?: AuthInfo): string | undefined {
  const sub = authInfo?.extra?.sub
  if (typeof sub === 'string' && sub.trim()) return sub.trim()

  const clientId = authInfo?.clientId
  if (typeof clientId === 'string' && clientId.trim() && clientId !== 'unknown') return clientId.trim()

  return undefined
}

/**
 * Origin検証ミドルウェア
 */
function validateOrigin(config: BaseServerConfig) {
  return async (c: Context, next: Next) => {
    const origin = c.req.header('Origin')

    if (!origin) {
      return next()
    }

    try {
      const originUrl = new URL(origin)
      const originWithoutPort = `${originUrl.protocol}//${originUrl.hostname}`

      const isAllowed = config.allowedOrigins.some((allowed) => {
        try {
          const allowedUrl = new URL(allowed)
          return originWithoutPort === `${allowedUrl.protocol}//${allowedUrl.hostname}`
        } catch {
          return false
        }
      })

      if (!isAllowed) {
        console.log(`Rejected request with invalid Origin: ${origin} (allowed: ${config.allowedOrigins.join(', ')})`)
        return c.json(forbiddenError('Forbidden: Invalid Origin header'), { status: 403 })
      }
    } catch {
      console.log(`Rejected request with malformed Origin: ${origin}`)
      return c.json(forbiddenError('Forbidden: Malformed Origin header'), { status: 403 })
    }

    return next()
  }
}

/**
 * Host検証ミドルウェア
 */
function validateHost(config: BaseServerConfig) {
  return async (c: Context, next: Next) => {
    const host = c.req.header('Host')

    if (!host) {
      return next()
    }

    const hostname = host.includes(':') ? host.split(':')[0] : host

    if (!config.allowedHosts.includes(hostname)) {
      console.log(`Rejected request with invalid Host: ${host} (allowed: ${config.allowedHosts.join(', ')})`)
      return c.json(forbiddenError('Forbidden: Invalid Host header'), { status: 403 })
    }

    return next()
  }
}

/**
 * APIキー検証ミドルウェア
 */
function validateApiKey(config: BaseServerConfig) {
  return async (c: Context, next: Next) => {
    if (!config.apiKey || c.req.method === 'OPTIONS') {
      return next()
    }

    const xApiKey = c.req.header('X-API-Key')
    const authorization = c.req.header('Authorization')
    const bearerToken = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : undefined
    const providedKey = xApiKey ?? bearerToken

    if (providedKey !== config.apiKey) {
      console.log('Rejected request with invalid API key')
      return c.json(unauthorizedError('Unauthorized: Invalid API key'), { status: 401 })
    }

    return next()
  }
}

/**
 * MCP HTTP アプリケーションを作成する
 *
 * @param options - HTTPアプリの設定オプション
 * @returns 設定済みのHonoアプリケーション
 */
export function createHttpApp(options: CreateHttpAppOptions): Hono<{ Variables: AuthVariables }> {
  const {
    server,
    config,
    serverFactory,
    extraCorsHeaders = [],
    onSessionInitialized,
    onSessionClosed,
    configureApp,
    authConfig,
    authProtectedRoutes = [],
    authRequiredScopes = {},
    sessionIdleTimeoutMs = 60 * 60 * 1000,
    maxSessions = 100,
  } = options

  // セッションごとのtransportと、作成時に束縛した認証主体・最終アクティビティを管理
  interface SessionEntry {
    transport: WebStandardStreamableHTTPServerTransport
    subject?: string
    lastActivity: number
  }
  const sessions: Map<string, SessionEntry> = new Map()

  // serverFactory 未指定時は共有 server を使えるセッションは1つだけ。
  // SDK の Server は一度 connect すると再 connect できないため、2セッション目以降は
  // 不透明な 500 ではなく明示的なエラーで拒否する。close 後も再利用はしない。
  let sharedServerConsumed = false
  if (!serverFactory) {
    console.warn(
      '[mcp-core] serverFactory not provided; HTTP mode will support only a single session. ' +
        'Provide serverFactory to support multiple sessions.'
    )
  }

  // initialize 処理中（onsessioninitialized 前）のセッション数。
  // 並行 initialize が全員同じ sessions.size を観測して maxSessions を
  // 突破しないよう、同期的にこのカウンタで枠を予約する
  let pendingInitializations = 0

  function closeSession(sessionId: string, reason: string): void {
    const entry = sessions.get(sessionId)
    if (!entry) return
    // 容量の解放を確定させるため同期的に削除する（onclose 側の削除は no-op になる）
    sessions.delete(sessionId)
    console.log(`Closing session ${shortSessionId(sessionId)} (${reason})`)
    entry.transport.close().catch((e) => {
      console.error(`Failed to close session ${shortSessionId(sessionId)}:`, e)
      // close 失敗時は onclose が呼ばれない可能性があるためここでクリーンアップする
      deleteSessionConfig(sessionId)
      onSessionClosed?.(sessionId)
    })
  }

  // アイドルセッションの定期破棄（明示的な DELETE を送らないクライアント対策）
  const sweeper = setInterval(
    () => {
      const now = Date.now()
      for (const [sessionId, entry] of sessions) {
        if (now - entry.lastActivity > sessionIdleTimeoutMs) {
          closeSession(sessionId, 'idle timeout')
        }
      }
    },
    Math.min(sessionIdleTimeoutMs, 60 * 1000)
  )
  sweeper.unref?.()

  function evictOldestSession(): void {
    let oldestId: string | undefined
    let oldestActivity = Number.POSITIVE_INFINITY
    for (const [sessionId, entry] of sessions) {
      if (entry.lastActivity < oldestActivity) {
        oldestActivity = entry.lastActivity
        oldestId = sessionId
      }
    }
    if (oldestId) closeSession(oldestId, 'max sessions reached')
  }

  /**
   * MCP エンドポイントハンドラー
   */
  async function handleMCP(c: Context<{ Variables: AuthVariables }>): Promise<Response> {
    console.log(`Received ${c.req.method} request for MCP`)

    const sessionId = c.req.header('mcp-session-id')
    const authInfo = c.get('auth')

    try {
      // 既存セッションの再利用
      const existing = sessionId ? sessions.get(sessionId) : undefined
      if (sessionId && existing) {
        // セッション作成時の認証主体と異なる主体からの再利用は拒否する
        const subject = resolveAuthSubject(authInfo)
        if (existing.subject !== undefined && subject !== existing.subject) {
          console.log(`Rejected session reuse with mismatched identity: ${shortSessionId(sessionId)}`)
          return c.json(forbiddenError('Forbidden: Session does not belong to the authenticated identity'), {
            status: 403,
          })
        }
        console.log(`Reusing existing session: ${shortSessionId(sessionId)}`)
        existing.lastActivity = Date.now()
        return existing.transport.handleRequest(c.req.raw, { authInfo })
      }

      // 新しいセッションの初期化（POSTリクエストのみ）
      if (c.req.method === 'POST') {
        let body: unknown
        try {
          body = await c.req.json()
        } catch {
          return c.json(badRequestError('Invalid JSON'), { status: 400 })
        }

        // initializeリクエストの場合のみ新しいtransportを作成
        if (isInitializeRequest(body)) {
          console.log('Creating new WebStandard session')

          // 同期的に枠を予約してから非同期処理に入る（予約なしだと並行 initialize が
          // すべて旧サイズを観測して上限を超過できてしまう）
          if (sessions.size + pendingInitializations >= maxSessions) {
            evictOldestSession()
          }
          if (sessions.size + pendingInitializations >= maxSessions) {
            console.log('Rejected initialize request: session capacity exhausted')
            return c.json(badRequestError('Too many concurrent sessions'), { status: 503 })
          }
          pendingInitializations++
          let reserved = true
          const releaseReservation = () => {
            if (reserved) {
              reserved = false
              pendingInitializations--
            }
          }

          // コールバック用にリクエストを保持
          const rawRequest = c.req.raw
          const subject = resolveAuthSubject(authInfo)

          const transport = new WebStandardStreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            onsessioninitialized: (newSessionId) => {
              console.log(`Session initialized: ${shortSessionId(newSessionId)}`)
              sessions.set(newSessionId, { transport, subject, lastActivity: Date.now() })
              // 予約をコミット済みセッションへ振り替える
              releaseReservation()

              // アプリ固有の初期化処理
              onSessionInitialized?.(newSessionId, rawRequest, authInfo)
            },
          })

          // クリーンアップハンドラー
          transport.onclose = () => {
            const sid = transport.sessionId
            if (sid) {
              console.log(`Transport closed for session: ${shortSessionId(sid)}`)
              sessions.delete(sid)
              deleteSessionConfig(sid)

              // アプリ固有のクリーンアップ処理
              onSessionClosed?.(sid)
            }
          }

          try {
            // セッションごとに新しいサーバーインスタンスを使用
            let sessionServer: McpServer
            if (serverFactory) {
              sessionServer = serverFactory()
            } else if (!sharedServerConsumed) {
              sessionServer = server
              sharedServerConsumed = true
            } else {
              await transport.close().catch(() => {})
              console.log('Rejected initialize request: shared server already bound to a session')
              return c.json(
                badRequestError(
                  'Server is single-session (no serverFactory configured) and a session is already bound. ' +
                    'Provide serverFactory to support multiple sessions.'
                ),
                { status: 503 }
              )
            }
            try {
              await sessionServer.connect(transport)
            } catch (e) {
              // connect 失敗時に transport を放置するとセッションがリークする
              await transport.close().catch(() => {})
              throw e
            }

            // リクエスト処理（parsedBodyを渡す）
            return await transport.handleRequest(c.req.raw, { parsedBody: body, authInfo })
          } finally {
            // 初期化に至らなかった場合の予約解放（成功時は onsessioninitialized 側で解放済み）
            releaseReservation()
          }
        }
      }

      // セッションIDがなく、initializeリクエストでもない場合
      console.log('Invalid request - no session ID and not an initialize request')
      return c.json(badRequestError(), { status: 400 })
    } catch (e) {
      console.error('MCP connection error:', e)
      return c.json(internalServerError(), { status: 500 })
    }
  }

  /**
   * ヘルスチェックエンドポイントハンドラー
   */
  function handleHealth(c: Context): Response {
    const response: HealthCheckResponse = {
      status: 'ok',
      transports: sessions.size,
      timestamp: new Date().toISOString(),
    }
    return c.json(response)
  }

  // アプリケーションのセットアップ
  const app: Hono<{ Variables: AuthVariables }> = new Hono()

  // CORSを設定
  const allowHeaders = [
    'Content-Type',
    'mcp-session-id',
    'Last-Event-ID',
    'mcp-protocol-version',
    'X-API-Key',
    'Authorization',
    ...extraCorsHeaders,
  ]

  app.use(
    '/mcp',
    cors({
      origin: '*',
      allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
      allowHeaders,
      exposeHeaders: ['mcp-session-id', 'mcp-protocol-version'],
    })
  )

  // セキュリティミドルウェアを適用
  app.use('/mcp', validateOrigin(config))
  app.use('/mcp', validateHost(config))
  if (authConfig) {
    app.get('/.well-known/oauth-protected-resource', (c) => c.json(createProtectedResourceMetadata(authConfig)))
    app.get('/.well-known/oauth-protected-resource/mcp', (c) => c.json(createProtectedResourceMetadata(authConfig)))
    for (const route of authProtectedRoutes) {
      app.use(route, bearerAuth(authConfig, authRequiredScopes[route] ?? []))
    }
  } else {
    app.use('/mcp', validateApiKey(config))
  }

  configureApp?.(app)

  // ルート定義
  app.all('/mcp', handleMCP)
  app.get('/health', handleHealth)

  return app
}
