import { createHash } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import type { Stats } from 'node:fs'
import { readFile, readdir, stat, unlink, utimes } from 'node:fs/promises'
import { join } from 'node:path'
import { type AccentPhrase, type AudioQuery, planAudioCacheCleanup, resolveAudioCachePolicy } from '@kajidog/tts-client'
import { writeBinaryAtomic } from '../persistence.js'
import type { ToolDeps } from '../types.js'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AUDIO_CACHE_FILE_PATTERN = /^[a-f0-9]{64}\.txt$/
const AUDIO_CACHE_QUERY_FILE_PATTERN = /^[a-f0-9]{64}\.query\.json$/
const DEFAULT_AUDIO_CACHE_TTL_DAYS = 30
const DEFAULT_AUDIO_CACHE_MAX_MB = 512
const AUDIO_CACHE_CLEANUP_EVERY_WRITES = 20
// メモリキャッシュの上限。ディスクキャッシュ無効時でも無制限に成長しないようにする。
const MEM_CACHE_MAX_BYTES = 64 * 1024 * 1024
const MEM_QUERY_MAX_ENTRIES = 200

// ---------------------------------------------------------------------------
// AudioCacheStore
// ---------------------------------------------------------------------------

export class AudioCacheStore {
  private dir: string
  // 挿入順 = LRU 順として使う（ヒット時に再挿入して末尾へ移動）。
  private readonly mem = new Map<string, string>()
  private memBytes = 0
  private readonly memQuery = new Map<string, AudioQuery>()

  private isDiskEnabled: boolean
  private ttlMs: number | null
  private maxBytes: number | null

  private cleanupRunning = false
  private pendingCleanup = false
  private writesSinceCleanup = 0

  constructor(config: ToolDeps['config']) {
    this.dir = config.playerCacheDir || join(process.cwd(), '.tts-player-cache')

    const enabledFlag = config.playerAudioCacheEnabled !== false
    const ttlDays = Number.isFinite(config.playerAudioCacheTtlDays)
      ? config.playerAudioCacheTtlDays
      : DEFAULT_AUDIO_CACHE_TTL_DAYS
    const maxMb = Number.isFinite(config.playerAudioCacheMaxMb)
      ? config.playerAudioCacheMaxMb
      : DEFAULT_AUDIO_CACHE_MAX_MB

    const cachePolicy = resolveAudioCachePolicy({ enabledFlag, ttlDays, maxMb })
    this.isDiskEnabled = cachePolicy.isDiskCacheEnabled
    this.ttlMs = cachePolicy.ttlMs
    this.maxBytes = cachePolicy.maxBytes

    try {
      mkdirSync(this.dir, { recursive: true })
      if (this.isDiskEnabled) {
        this.scheduleCleanup(true)
      }
    } catch (error) {
      console.warn('Warning: failed to create TTS player cache directory:', error)
    }
  }

  getDir(): string {
    return this.dir
  }

  private audioPath(cacheKey: string): string {
    return join(this.dir, `${cacheKey}.txt`)
  }

  private queryPath(cacheKey: string): string {
    return join(this.dir, `${cacheKey}.query.json`)
  }

  async readCachedBase64(cacheKey: string): Promise<string | null> {
    const inMemory = this.mem.get(cacheKey)
    if (inMemory !== undefined) {
      // LRU: ヒットしたエントリを末尾（最新）へ移動する。
      this.mem.delete(cacheKey)
      this.mem.set(cacheKey, inMemory)
      return inMemory
    }
    if (!this.isDiskEnabled) return null

    try {
      const base64 = (await readFile(this.audioPath(cacheKey), 'utf-8')).trim()
      if (base64.length > 0) {
        this.memSet(cacheKey, base64)
        this.touchForEviction(cacheKey)
        return base64
      }
    } catch {
      // cache miss
    }
    return null
  }

  async writeCachedBase64(cacheKey: string, base64: string): Promise<void> {
    this.memSet(cacheKey, base64)
    if (!this.isDiskEnabled) return
    try {
      await writeBinaryAtomic(this.audioPath(cacheKey), Buffer.from(base64, 'utf-8'))
      this.scheduleCleanup()
    } catch (error) {
      console.warn('Warning: failed to write TTS player cache:', error)
    }
  }

  /**
   * キャッシュ音声を生成した AudioQuery をサイドカー保存する。
   * キャッシュヒット時にエンジンへ往復せずに済むようにするためのもので、失敗しても致命的ではない。
   */
  async writeCachedQuery(cacheKey: string, query: AudioQuery): Promise<void> {
    this.memQuerySet(cacheKey, query)
    if (!this.isDiskEnabled) return
    try {
      await writeBinaryAtomic(this.queryPath(cacheKey), Buffer.from(JSON.stringify(query), 'utf-8'))
    } catch (error) {
      console.warn('Warning: failed to write TTS player query cache:', error)
    }
  }

  async readCachedQuery(cacheKey: string): Promise<AudioQuery | null> {
    const inMemory = this.memQuery.get(cacheKey)
    if (inMemory) return inMemory
    if (!this.isDiskEnabled) return null
    try {
      const query = JSON.parse(await readFile(this.queryPath(cacheKey), 'utf-8')) as AudioQuery
      this.memQuerySet(cacheKey, query)
      return query
    } catch {
      return null
    }
  }

  // -------------------------------------------------------------------------
  // In-memory LRU
  // -------------------------------------------------------------------------

  private memSet(cacheKey: string, base64: string): void {
    this.memDelete(cacheKey)
    this.mem.set(cacheKey, base64)
    this.memBytes += base64.length
    while (this.memBytes > MEM_CACHE_MAX_BYTES && this.mem.size > 0) {
      const oldestKey = this.mem.keys().next().value
      if (oldestKey === undefined) break
      this.memDelete(oldestKey)
    }
  }

  private memDelete(cacheKey: string): void {
    const existing = this.mem.get(cacheKey)
    if (existing !== undefined) {
      this.memBytes -= existing.length
      this.mem.delete(cacheKey)
    }
  }

  private memQuerySet(cacheKey: string, query: AudioQuery): void {
    this.memQuery.delete(cacheKey)
    this.memQuery.set(cacheKey, query)
    while (this.memQuery.size > MEM_QUERY_MAX_ENTRIES) {
      const oldestKey = this.memQuery.keys().next().value
      if (oldestKey === undefined) break
      this.memQuery.delete(oldestKey)
    }
  }

  /** 読み取りヒットで mtime を更新し、mtime ベースの eviction を LRU 近似にする（失敗は無視）。 */
  private touchForEviction(cacheKey: string): void {
    const now = new Date()
    void utimes(this.audioPath(cacheKey), now, now).catch(() => {})
    void utimes(this.queryPath(cacheKey), now, now).catch(() => {})
  }

  // -------------------------------------------------------------------------
  // Cleanup
  // -------------------------------------------------------------------------

  private async cleanupFiles(): Promise<void> {
    if (!this.isDiskEnabled) return

    try {
      const entries = await readdir(this.dir, { withFileTypes: true })
      const now = Date.now()
      // 音声 (.txt) と AudioQuery サイドカー (.query.json) はペアで扱う:
      // サイズは合算、mtime は新しい方、削除も常に両方まとめて行う。
      interface PairInfo {
        size: number
        mtimeMs: number
        paths: string[]
      }
      const pairs = new Map<string, PairInfo>()

      for (const entry of entries) {
        if (!entry.isFile()) continue
        if (!AUDIO_CACHE_FILE_PATTERN.test(entry.name) && !AUDIO_CACHE_QUERY_FILE_PATTERN.test(entry.name)) continue
        const filePath = join(this.dir, entry.name)
        let fileStat: Stats
        try {
          fileStat = await stat(filePath)
        } catch {
          continue
        }
        const cacheKey = entry.name.slice(0, 64)
        const pair = pairs.get(cacheKey) ?? { size: 0, mtimeMs: 0, paths: [] }
        pair.size += fileStat.size
        pair.mtimeMs = Math.max(pair.mtimeMs, fileStat.mtimeMs)
        pair.paths.push(filePath)
        pairs.set(cacheKey, pair)
      }

      const toDelete = planAudioCacheCleanup({
        entries: [...pairs.entries()].map(([cacheKey, pair]) => ({
          path: cacheKey,
          size: pair.size,
          mtimeMs: pair.mtimeMs,
        })),
        now,
        ttlMs: this.ttlMs,
        maxBytes: this.maxBytes,
      })

      if (toDelete.size === 0) return

      for (const cacheKey of toDelete) {
        const pair = pairs.get(cacheKey)
        if (!pair) continue
        for (const path of pair.paths) {
          try {
            await unlink(path)
          } catch {
            // ignore cleanup races
          }
        }
        this.memDelete(cacheKey)
        this.memQuery.delete(cacheKey)
      }
    } catch (error) {
      console.warn('Warning: failed to cleanup TTS player audio cache:', error)
    }
  }

  private scheduleCleanup(force = false): void {
    if (!this.isDiskEnabled) return
    if (!force) {
      this.writesSinceCleanup += 1
      if (this.writesSinceCleanup < AUDIO_CACHE_CLEANUP_EVERY_WRITES) return
    }
    this.writesSinceCleanup = 0
    if (this.cleanupRunning) {
      this.pendingCleanup = true
      return
    }
    this.cleanupRunning = true
    void this.cleanupFiles()
      .catch((error) => console.warn('Warning: failed to cleanup TTS player audio cache:', error))
      .finally(() => {
        this.cleanupRunning = false
        if (this.pendingCleanup) {
          this.pendingCleanup = false
          this.scheduleCleanup(true)
        }
      })
  }
}

// ---------------------------------------------------------------------------
// Pure utility (no state dependency)
// ---------------------------------------------------------------------------

/** プロパティ列挙順に依存しない JSON 文字列化（キーを再帰的にソート）。 */
function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value))
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep)
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    const sorted: Record<string, unknown> = {}
    for (const key of Object.keys(record).sort()) {
      sorted[key] = sortKeysDeep(record[key])
    }
    return sorted
  }
  return value
}

export function createAudioCacheKey(input: {
  engineId?: string
  baseUrl?: string
  text: string
  speaker: number
  audioQuery?: AudioQuery
  speedScale: number
  dictionaryRevision?: number
  intonationScale?: number
  volumeScale?: number
  prePhonemeLength?: number
  postPhonemeLength?: number
  pauseLengthScale?: number
  accentPhrases?: AccentPhrase[]
}): string {
  const keyInput = input.audioQuery
    ? stableStringify({
        engineId: input.engineId ?? 'unknown',
        baseUrl: input.baseUrl ?? '',
        speaker: input.speaker,
        text: input.text,
        dictionaryRevision: input.dictionaryRevision ?? 0,
        audioQuery: input.audioQuery,
      })
    : stableStringify({
        engineId: input.engineId ?? 'unknown',
        baseUrl: input.baseUrl ?? '',
        speaker: input.speaker,
        text: input.text,
        dictionaryRevision: input.dictionaryRevision ?? 0,
        speedScale: Number(input.speedScale.toFixed(4)),
        intonationScale: input.intonationScale === undefined ? null : Number(input.intonationScale.toFixed(4)),
        volumeScale: input.volumeScale === undefined ? null : Number(input.volumeScale.toFixed(4)),
        prePhonemeLength: input.prePhonemeLength === undefined ? null : Number(input.prePhonemeLength.toFixed(4)),
        postPhonemeLength: input.postPhonemeLength === undefined ? null : Number(input.postPhonemeLength.toFixed(4)),
        pauseLengthScale: input.pauseLengthScale === undefined ? null : Number(input.pauseLengthScale.toFixed(4)),
        accentPhrases: input.accentPhrases ?? null,
      })
  return createHash('sha256').update(keyInput).digest('hex')
}
