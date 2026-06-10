import { join } from 'node:path'
import type { ServerConfig } from '../../config.js'
import { ANONYMOUS_USER_ID } from '../auth-context.js'
import { DebouncedJsonFile } from '../persistence.js'

const SETTINGS_FILE_NAME = 'player-settings.json'

export interface PlayerRenderSettings {
  dprMax?: number
  sceneLightIntensity?: number
  blinkEnabled?: boolean
  lookAtCamera?: boolean
  headTrackCamera?: boolean
  poseEasing?: 'linear' | 'easeInOutQuad'
  expressionTransitionMs?: number
  moraTimingOffsetMs?: number
}

export interface PlayerSettingsOverrides {
  speedScale?: number
  prePhonemeLength?: number
  postPhonemeLength?: number
  autoPlay?: boolean
  usePublicVrms?: boolean
  activeModelId?: string
  renderSettings?: PlayerRenderSettings
}

export interface PlayerSettingsPatch {
  speedScale?: number | null
  prePhonemeLength?: number | null
  postPhonemeLength?: number | null
  autoPlay?: boolean | null
  usePublicVrms?: boolean | null
  activeModelId?: string | null
  renderSettings?: PlayerRenderSettings | null
}

export interface PlayerCliDefaults {
  speedScale: number
  prePhonemeLength?: number
  postPhonemeLength?: number
  autoPlay: boolean
  usePublicVrms: boolean
}

export class PlayerSettingsStore {
  private overridesByUser = new Map<string, PlayerSettingsOverrides>()
  private readonly file: DebouncedJsonFile
  private readonly cliDefaults: PlayerCliDefaults

  constructor(config: ServerConfig, settingsFilePath?: string) {
    this.file = new DebouncedJsonFile(
      settingsFilePath || join(config.playerCacheDir, SETTINGS_FILE_NAME),
      'player settings',
      () => ({ version: 1, savedAt: Date.now(), users: Object.fromEntries(this.overridesByUser) })
    )
    this.cliDefaults = {
      speedScale: config.defaultSpeedScale,
      prePhonemeLength: config.defaultPrePhonemeLength,
      postPhonemeLength: config.defaultPostPhonemeLength,
      autoPlay: config.autoPlay,
      usePublicVrms: true,
    }

    this.loadFromDisk()
  }

  get(userId = ANONYMOUS_USER_ID): PlayerSettingsOverrides {
    return { ...(this.overridesByUser.get(userId) ?? {}) }
  }

  getCliDefaults(): PlayerCliDefaults {
    return { ...this.cliDefaults }
  }

  set(patch: PlayerSettingsPatch, userId = ANONYMOUS_USER_ID): PlayerSettingsOverrides {
    this.overridesByUser.set(userId, applyPatch(this.overridesByUser.get(userId) ?? {}, patch))
    this.file.scheduleSave()
    return this.get(userId)
  }

  reset(userId = ANONYMOUS_USER_ID): PlayerSettingsOverrides {
    this.overridesByUser.delete(userId)
    this.file.scheduleSave()
    return this.get(userId)
  }

  applyDefaults<T extends PlayerSettingsOverrides>(
    input: T,
    userId = ANONYMOUS_USER_ID
  ): T & Required<Pick<PlayerSettingsOverrides, 'speedScale' | 'autoPlay' | 'usePublicVrms'>> {
    const overrides = this.overridesByUser.get(userId) ?? {}
    return {
      ...input,
      speedScale: input.speedScale ?? overrides.speedScale ?? this.cliDefaults.speedScale,
      prePhonemeLength: input.prePhonemeLength ?? overrides.prePhonemeLength ?? this.cliDefaults.prePhonemeLength,
      postPhonemeLength: input.postPhonemeLength ?? overrides.postPhonemeLength ?? this.cliDefaults.postPhonemeLength,
      autoPlay: input.autoPlay ?? overrides.autoPlay ?? this.cliDefaults.autoPlay,
      usePublicVrms: input.usePublicVrms ?? overrides.usePublicVrms ?? this.cliDefaults.usePublicVrms,
    }
  }

  private loadFromDisk(): void {
    const parsed = this.file.load<{
      overrides?: PlayerSettingsOverrides
      users?: Record<string, PlayerSettingsOverrides>
    }>()
    if (!parsed) return
    this.overridesByUser.clear()
    if (parsed.users && typeof parsed.users === 'object') {
      for (const [userId, overrides] of Object.entries(parsed.users)) {
        this.overridesByUser.set(userId, normalizeOverrides(overrides ?? {}))
      }
    } else if (parsed.overrides) {
      this.overridesByUser.set(ANONYMOUS_USER_ID, normalizeOverrides(parsed.overrides))
    }
  }

  async flush(): Promise<void> {
    await this.file.flush()
  }
}

function applyPatch(current: PlayerSettingsOverrides, patch: PlayerSettingsPatch): PlayerSettingsOverrides {
  const next: PlayerSettingsOverrides = { ...current }
  for (const key of ['speedScale', 'prePhonemeLength', 'postPhonemeLength'] as const) {
    if (!(key in patch)) continue
    const value = patch[key]
    if (value === undefined) {
      continue
    }
    if (value === null) {
      delete next[key]
    } else if (Number.isFinite(value)) {
      next[key] = value
    }
  }
  if ('autoPlay' in patch) {
    const value = patch.autoPlay
    if (value === undefined) {
      // Undefined means "field omitted"; null explicitly resets.
    } else if (value === null) {
      next.autoPlay = undefined
    } else {
      next.autoPlay = value
    }
  }
  if ('usePublicVrms' in patch) {
    const value = patch.usePublicVrms
    if (value === undefined) {
      // Undefined means "field omitted"; null explicitly resets.
    } else if (value === null) {
      next.usePublicVrms = undefined
    } else {
      next.usePublicVrms = value
    }
  }
  if ('activeModelId' in patch) {
    const value = patch.activeModelId
    if (value === undefined) {
      // Undefined means "field omitted"; null/empty explicitly resets.
    } else if (value === null || !value.trim()) {
      next.activeModelId = undefined
    } else {
      next.activeModelId = value
    }
  }
  if ('renderSettings' in patch) {
    if (patch.renderSettings === undefined) {
      // Undefined means "field omitted"; null explicitly resets.
    } else if (patch.renderSettings === null) {
      next.renderSettings = undefined
    } else {
      const renderSettings = normalizeRenderSettings(patch.renderSettings)
      next.renderSettings = Object.keys(renderSettings).length > 0 ? renderSettings : undefined
    }
  }
  return next
}

function normalizeOverrides(input: PlayerSettingsOverrides): PlayerSettingsOverrides {
  const result: PlayerSettingsOverrides = {}
  for (const key of ['speedScale', 'prePhonemeLength', 'postPhonemeLength'] as const) {
    const value = input[key]
    if (typeof value === 'number' && Number.isFinite(value)) result[key] = value
  }
  if (typeof input.autoPlay === 'boolean') result.autoPlay = input.autoPlay
  if (typeof input.usePublicVrms === 'boolean') result.usePublicVrms = input.usePublicVrms
  if (typeof input.activeModelId === 'string' && input.activeModelId.trim()) result.activeModelId = input.activeModelId
  const renderSettings = normalizeRenderSettings(input.renderSettings)
  if (Object.keys(renderSettings).length > 0) result.renderSettings = renderSettings
  return result
}

function normalizeRenderSettings(input: PlayerRenderSettings | undefined): PlayerRenderSettings {
  if (!input || typeof input !== 'object') return {}
  const result: PlayerRenderSettings = {}
  if (typeof input.dprMax === 'number' && Number.isFinite(input.dprMax) && input.dprMax > 0) {
    result.dprMax = Math.min(3, Math.max(1, input.dprMax))
  }
  if (typeof input.sceneLightIntensity === 'number' && Number.isFinite(input.sceneLightIntensity)) {
    result.sceneLightIntensity = Math.min(1.8, Math.max(0.6, input.sceneLightIntensity))
  }
  if (typeof input.blinkEnabled === 'boolean') result.blinkEnabled = input.blinkEnabled
  if (typeof input.lookAtCamera === 'boolean') result.lookAtCamera = input.lookAtCamera
  if (typeof input.headTrackCamera === 'boolean') result.headTrackCamera = input.headTrackCamera
  if (input.poseEasing === 'linear' || input.poseEasing === 'easeInOutQuad') result.poseEasing = input.poseEasing
  if (typeof input.expressionTransitionMs === 'number' && Number.isFinite(input.expressionTransitionMs)) {
    result.expressionTransitionMs = Math.min(1000, Math.max(0, input.expressionTransitionMs))
  }
  if (typeof input.moraTimingOffsetMs === 'number' && Number.isFinite(input.moraTimingOffsetMs)) {
    result.moraTimingOffsetMs = Math.min(200, Math.max(-200, input.moraTimingOffsetMs))
  }
  return result
}
