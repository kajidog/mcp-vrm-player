import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ServerConfig } from '../../config.js'
import { PlayerSettingsStore } from '../player/player-settings-store.js'

const TMP = join(process.cwd(), '__test_player_settings_tmp__')

function createStore() {
  return new PlayerSettingsStore({
    playerCacheDir: TMP,
    defaultSpeedScale: 1,
    defaultPrePhonemeLength: 0.1,
    defaultPostPhonemeLength: 0.2,
    autoPlay: true,
  } as ServerConfig)
}

describe('PlayerSettingsStore', () => {
  beforeEach(() => {
    rmSync(TMP, { recursive: true, force: true })
    mkdirSync(TMP, { recursive: true })
  })

  afterEach(() => {
    rmSync(TMP, { recursive: true, force: true })
  })

  it('設定はユーザーごとに保存される', async () => {
    const store = createStore()

    store.set(
      {
        speedScale: 1.2,
        usePublicVrms: false,
        activeModelId: 'model-a',
        renderSettings: {
          dprMax: 2,
          sceneLightIntensity: 1.25,
          blinkEnabled: false,
          poseEasing: 'linear',
          moraTimingOffsetMs: 30,
        },
      },
      'user-a'
    )
    store.set({ autoPlay: false }, 'user-b')

    expect(store.applyDefaults({}, 'user-a')).toMatchObject({
      speedScale: 1.2,
      autoPlay: true,
      usePublicVrms: false,
    })
    expect(store.applyDefaults({}, 'user-b')).toMatchObject({
      speedScale: 1,
      autoPlay: false,
      usePublicVrms: true,
    })

    await store.flush()
    const reloaded = createStore()
    expect(reloaded.applyDefaults({}, 'user-a').usePublicVrms).toBe(false)
    expect(reloaded.get('user-a').activeModelId).toBe('model-a')
    expect(reloaded.get('user-a').renderSettings).toMatchObject({
      dprMax: 2,
      sceneLightIntensity: 1.25,
      blinkEnabled: false,
      poseEasing: 'linear',
      moraTimingOffsetMs: 30,
    })
    expect(reloaded.get('user-b').renderSettings).toBeUndefined()
    expect(reloaded.applyDefaults({}, 'user-b').autoPlay).toBe(false)
  })

  it('未指定フィールドは既存の表示設定を消さない', () => {
    const store = createStore()

    store.set(
      {
        renderSettings: {
          dprMax: 2,
          sceneLightIntensity: 1.4,
          headTrackCamera: true,
        },
      },
      'user-a'
    )

    store.set({ activeModelId: 'model-b' }, 'user-a')

    expect(store.get('user-a')).toMatchObject({
      activeModelId: 'model-b',
      renderSettings: {
        dprMax: 2,
        sceneLightIntensity: 1.4,
        headTrackCamera: true,
      },
    })
  })
})
