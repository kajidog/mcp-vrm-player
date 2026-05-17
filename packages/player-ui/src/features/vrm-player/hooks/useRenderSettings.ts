import type { App } from '@modelcontextprotocol/ext-apps'
import { useEffect, useState } from 'react'
import {
  type PlayerRenderSettings,
  fetchPlayerSettingsOnServer,
  setPlayerSettingsOnServer,
} from './vrmPlayerToolClient'

const LEGACY_STORAGE_KEY = 'vrm-player:render-settings'
const EVENT_NAME = 'vrm-player:render-settings-changed'

export interface RenderSettings extends Required<PlayerRenderSettings> {
  // Canvas の dpr 上限。1 で標準、上げるほど高解像度（負荷増）。
  dprMax: number
  // 3D 空間全体のライト倍率。
  sceneLightIntensity: number
  // 自動瞬きの有無。
  blinkEnabled: boolean
  // セグメントごとの視線演出を有効化するかどうか。OFF で真正面を見続ける。
  lookAtCamera: boolean
  // 頭ボーン自体をカメラ方向へ回すかどうか。lookAt より大きな動きで、首ごとこちらを向く。
  headTrackCamera: boolean
  poseEasing: 'linear' | 'easeInOutQuad'
  expressionTransitionMs: number
  moraTimingOffsetMs: number
}

export const DEFAULT_RENDER_SETTINGS: RenderSettings = {
  dprMax: 1.5,
  sceneLightIntensity: 1,
  blinkEnabled: true,
  lookAtCamera: true,
  headTrackCamera: false,
  poseEasing: 'easeInOutQuad',
  expressionTransitionMs: 120,
  moraTimingOffsetMs: 0,
}

export const DPR_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 1.0, label: '標準 (1.0×)' },
  { value: 1.5, label: '高 (1.5×)' },
  { value: 2.0, label: '最高 (2.0×)' },
  { value: 3.0, label: 'ネイティブ (3.0×)' },
]

export const POSE_EASING_OPTIONS: Array<{ value: RenderSettings['poseEasing']; label: string }> = [
  { value: 'easeInOutQuad', label: 'なめらか' },
  { value: 'linear', label: '一定' },
]

let currentSettings = DEFAULT_RENDER_SETTINGS
const subscribers = new Set<(settings: RenderSettings) => void>()

function normalize(input: PlayerRenderSettings | undefined): RenderSettings {
  const parsed = input ?? {}
  return {
    dprMax: typeof parsed.dprMax === 'number' && parsed.dprMax > 0 ? parsed.dprMax : DEFAULT_RENDER_SETTINGS.dprMax,
    sceneLightIntensity:
      typeof parsed.sceneLightIntensity === 'number' && Number.isFinite(parsed.sceneLightIntensity)
        ? Math.min(1.8, Math.max(0.6, parsed.sceneLightIntensity))
        : DEFAULT_RENDER_SETTINGS.sceneLightIntensity,
    blinkEnabled: typeof parsed.blinkEnabled === 'boolean' ? parsed.blinkEnabled : DEFAULT_RENDER_SETTINGS.blinkEnabled,
    lookAtCamera: typeof parsed.lookAtCamera === 'boolean' ? parsed.lookAtCamera : DEFAULT_RENDER_SETTINGS.lookAtCamera,
    headTrackCamera:
      typeof parsed.headTrackCamera === 'boolean' ? parsed.headTrackCamera : DEFAULT_RENDER_SETTINGS.headTrackCamera,
    poseEasing:
      parsed.poseEasing === 'linear' || parsed.poseEasing === 'easeInOutQuad'
        ? parsed.poseEasing
        : DEFAULT_RENDER_SETTINGS.poseEasing,
    expressionTransitionMs:
      typeof parsed.expressionTransitionMs === 'number' && Number.isFinite(parsed.expressionTransitionMs)
        ? Math.min(1000, Math.max(0, parsed.expressionTransitionMs))
        : DEFAULT_RENDER_SETTINGS.expressionTransitionMs,
    moraTimingOffsetMs:
      typeof parsed.moraTimingOffsetMs === 'number' && Number.isFinite(parsed.moraTimingOffsetMs)
        ? Math.min(200, Math.max(-200, parsed.moraTimingOffsetMs))
        : DEFAULT_RENDER_SETTINGS.moraTimingOffsetMs,
  }
}

function publish(settings: RenderSettings): void {
  currentSettings = settings
  for (const subscriber of subscribers) subscriber(settings)
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(EVENT_NAME))
}

function loadLegacySettings(): RenderSettings | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(LEGACY_STORAGE_KEY)
    if (!raw) return null
    return normalize(JSON.parse(raw) as PlayerRenderSettings)
  } catch {
    return null
  }
}

function saveFallbackSettings(settings: RenderSettings): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // localStorage が使えない環境ではサーバー側保存だけに任せる。
  }
}

function removeLegacySettings(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(LEGACY_STORAGE_KEY)
  } catch {
    // localStorage が無効でもサーバー側設定は使える。
  }
}

/**
 * ユーザーごとに保存するレンダリング設定。
 * app が未確立の間は既定値を使い、確立後にサーバー側のユーザー設定へ同期する。
 */
export function useRenderSettings(app: App | null = null): {
  settings: RenderSettings
  update: (patch: Partial<RenderSettings>) => void
} {
  const [settings, setSettings] = useState<RenderSettings>(() => currentSettings)

  useEffect(() => {
    subscribers.add(setSettings)
    const handler = () => setSettings(currentSettings)
    window.addEventListener(EVENT_NAME, handler)
    return () => {
      subscribers.delete(setSettings)
      window.removeEventListener(EVENT_NAME, handler)
    }
  }, [])

  useEffect(() => {
    if (!app) return
    let cancelled = false
    fetchPlayerSettingsOnServer(app)
      .then(async (response) => {
        if (cancelled) return
        const legacy = response.overrides.renderSettings ? null : loadLegacySettings()
        const next = legacy ?? normalize(response.overrides.renderSettings)
        publish(next)
        if (legacy) {
          try {
            await setPlayerSettingsOnServer(app, { renderSettings: legacy })
            removeLegacySettings()
          } catch (error) {
            console.warn('[useRenderSettings] failed to migrate fallback render settings:', error)
          }
        } else if (response.overrides.renderSettings) {
          removeLegacySettings()
        }
      })
      .catch((error) => {
        console.warn('[useRenderSettings] failed to fetch render settings:', error)
        const fallback = loadLegacySettings()
        if (fallback) publish(fallback)
      })
    return () => {
      cancelled = true
    }
  }, [app])

  const update = (patch: Partial<RenderSettings>) => {
    const next = normalize({ ...currentSettings, ...patch })
    publish(next)
    saveFallbackSettings(next)
    if (!app) return
    void setPlayerSettingsOnServer(app, { renderSettings: next })
      .then(() => removeLegacySettings())
      .catch((error) => {
        console.warn('[useRenderSettings] failed to persist render settings:', error)
      })
  }

  return { settings, update }
}
