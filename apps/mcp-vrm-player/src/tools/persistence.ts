import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { ANONYMOUS_USER_ID } from './auth-context.js'

const DEFAULT_DEBOUNCE_MS = 300

/**
 * デバウンス付き JSON 永続化ヘルパー。
 *
 * 各ストアに共通する「mkdir → 寛容なロード → デバウンス保存 → atomic 書き込み →
 * flush」の流れをまとめる。保存ペイロードはコンストラクタの buildPayload で構築する。
 */
export class DebouncedJsonFile {
  private debounceTimer: ReturnType<typeof setTimeout> | null = null

  constructor(
    readonly filePath: string,
    private readonly label: string,
    private readonly buildPayload: () => unknown,
    private readonly debounceMs: number = DEFAULT_DEBOUNCE_MS
  ) {
    try {
      mkdirSync(dirname(this.filePath), { recursive: true })
    } catch (error) {
      console.warn(`Warning: failed to prepare ${this.label} directory:`, error)
    }
  }

  /** 起動時ロード。ファイル無し・破損時は null を返し、呼び出し側は空状態で継続する。 */
  load<T>(): T | null {
    try {
      if (!existsSync(this.filePath)) return null
      return JSON.parse(readFileSync(this.filePath, 'utf-8')) as T
    } catch (error) {
      console.warn(`Warning: failed to load ${this.label}, starting empty:`, error)
      return null
    }
  }

  /** デバウンス付きで保存を予約する。 */
  scheduleSave(): void {
    if (this.debounceTimer !== null) clearTimeout(this.debounceTimer)
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null
      void this.saveToDisk()
    }, this.debounceMs)
  }

  /** atomic（tmp 書き込み → rename）に即時保存する。失敗しても例外は投げず警告のみ。 */
  async saveToDisk(): Promise<void> {
    try {
      const payload = JSON.stringify(this.buildPayload())
      const tempPath = `${this.filePath}.${randomUUID()}.tmp`
      await writeFile(tempPath, payload, 'utf-8')
      await rename(tempPath, this.filePath)
    } catch (error) {
      console.warn(`Warning: failed to persist ${this.label}:`, error)
    }
  }

  /** 予約済みのデバウンス保存を取り消して即時保存する（テスト・終了処理用）。 */
  async flush(): Promise<void> {
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }
    await this.saveToDisk()
  }
}

/**
 * バイナリを atomic に書き込む。
 * 一時ファイル名に UUID を含めることで、同一パスへの並行書き込みが
 * 同じ tmp ファイルを取り合って破損する問題（TOCTOU）を避ける。
 */
export async function writeBinaryAtomic(filePath: string, data: Buffer): Promise<void> {
  const tempPath = `${filePath}.${randomUUID()}.tmp`
  await writeFile(tempPath, data)
  await rename(tempPath, filePath)
}

/** 所有者IDを正規化する（空・未指定は匿名ユーザー扱い）。 */
export function normalizeOwnerUserId(ownerUserId: string | undefined): string {
  return ownerUserId?.trim() || ANONYMOUS_USER_ID
}

export interface DecodeGlbBase64Options {
  /** エラーメッセージで使う入力フィールド名（例: 'vrmBase64'） */
  fieldName: string
  /** エラーメッセージで使うファイル種別（例: 'VRM file'） */
  fileLabel: string
  /** glTF magic エラーで使うフォーマット名（例: 'GLB/VRM'） */
  magicLabel: string
  maxBytes: number
}

/** base64 (data URL 可) をデコードし、GLB バイナリとして検証する。 */
export function decodeAndValidateGlbBase64(value: string, options: DecodeGlbBase64Options): Buffer {
  const { fieldName, fileLabel, magicLabel, maxBytes } = options
  const raw = value.trim()
  const withoutDataUrl = raw.startsWith('data:') ? (raw.split(',', 2)[1] ?? '') : raw
  const normalized = withoutDataUrl.replace(/\s/g, '')
  if (!normalized) throw new Error(`${fieldName} is required`)
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normalized) || /=/.test(normalized.slice(0, -2))) {
    throw new Error(`${fieldName} must be valid base64`)
  }
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
  const buffer = Buffer.from(padded, 'base64')
  if (buffer.byteLength === 0) throw new Error(`${fileLabel} is empty`)
  if (buffer.byteLength > maxBytes) {
    throw new Error(`${fileLabel} is too large. Maximum size is ${maxBytes} bytes.`)
  }
  if (buffer.byteLength < 12 || buffer.subarray(0, 4).toString('ascii') !== 'glTF') {
    throw new Error(`${fileLabel} must be a ${magicLabel} binary starting with glTF magic`)
  }
  return buffer
}
