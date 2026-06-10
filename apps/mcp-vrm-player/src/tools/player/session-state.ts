import { join } from 'node:path'
import type { AccentPhrase, AudioQuery } from '@kajidog/tts-client'
import { DebouncedJsonFile } from '../persistence.js'
import type { ToolDeps } from '../types.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PlayerSegmentState {
  text: string
  speaker: number
  speakerName?: string
  kana?: string
  audioQuery?: AudioQuery
  accentPhrases?: AccentPhrase[]
  speedScale: number
  intonationScale?: number
  volumeScale?: number
  prePhonemeLength?: number
  postPhonemeLength?: number
  pauseLengthScale?: number
  explicitSpeedScale?: number
  requestedPose?: string
  pose?: string
  poseFallbackReason?: string
  emotion?: string
  gaze?: 'camera' | 'away' | 'front'
  expressionName?: string
  expressionWeight?: number
}

export interface PlayerSessionState {
  userId?: string
  segments: PlayerSegmentState[]
  updatedAt: number
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_PERSISTED_STATES = 500
const MAX_STATE_AGE_MS = 30 * 24 * 60 * 60 * 1000

// ---------------------------------------------------------------------------
// SessionStateStore
// ---------------------------------------------------------------------------

export class SessionStateStore {
  private readonly state = new Map<string, PlayerSessionState>()
  private readonly file: DebouncedJsonFile

  constructor(config: ToolDeps['config'], audioCacheDir: string) {
    this.file = new DebouncedJsonFile(
      config.playerStateFile || join(audioCacheDir, 'player-state.json'),
      'player state',
      () => this.buildPayload()
    )

    this.loadFromDisk()
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  set(key: string, sessionState: PlayerSessionState): void {
    this.state.set(key, sessionState)
    this.file.scheduleSave()
  }

  get(viewUUID: string | undefined, sessionId: string | undefined): PlayerSessionState | undefined {
    if (viewUUID) {
      const s = this.state.get(viewUUID)
      if (s) return s
    }
    const key = sessionId ?? 'global'
    const s = this.state.get(key)
    if (s) return s
    return undefined
  }

  getByKey(key: string): PlayerSessionState | undefined {
    return this.state.get(key)
  }

  // -------------------------------------------------------------------------
  // Disk persistence
  // -------------------------------------------------------------------------

  // 保存時に期限切れ・超過分を間引き、メモリ上の状態も同期させる。
  private buildPayload(): unknown {
    const now = Date.now()
    const validEntries = [...this.state.entries()]
      .filter(([, s]) => now - s.updatedAt <= MAX_STATE_AGE_MS)
      .sort((a, b) => b[1].updatedAt - a[1].updatedAt)
      .slice(0, MAX_PERSISTED_STATES)

    this.state.clear()
    for (const [key, s] of validEntries) {
      this.state.set(key, s)
    }

    return {
      version: 1,
      savedAt: now,
      entries: validEntries,
    }
  }

  private loadFromDisk(): void {
    const parsed = this.file.load<{ entries?: Array<[string, PlayerSessionState]> }>()
    if (!parsed || !Array.isArray(parsed.entries)) return

    const now = Date.now()
    for (const entry of parsed.entries) {
      if (!Array.isArray(entry) || entry.length !== 2) continue
      const [key, s] = entry
      if (!key || typeof key !== 'string') continue
      if (!s || typeof s.updatedAt !== 'number' || !Array.isArray(s.segments)) continue
      if (now - s.updatedAt > MAX_STATE_AGE_MS) continue
      this.state.set(key, s)
    }
  }
}
