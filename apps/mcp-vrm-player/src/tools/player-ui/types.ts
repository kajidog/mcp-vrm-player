import type { TtsEngine } from '@kajidog/tts-client'
import type { PlayerSettingsStore } from '../player/player-settings-store.js'
import type { SpeakerEntry, SynthesizeInput, SynthesizeResult } from '../player/runtime.js'
import type { PlayerSegmentState, PlayerSessionState } from '../player/session-state.js'
import type { PoseRegistryStore } from '../pose-registry/store.js'
import type { VrmRegistryStore } from '../vrm-registry/store.js'

// 正準定義は player/session-state.ts および player/runtime.ts にあり、ここでは再エクスポートのみ行う。
export type { PlayerSegmentState, PlayerSessionState, SpeakerEntry, SynthesizeInput, SynthesizeResult }

export interface PlayerUIShared {
  playerEngine: TtsEngine
  playerResourceUri: string
  synthesizeWithCache: (input: SynthesizeInput) => Promise<SynthesizeResult>
  setSessionState: (key: string, state: PlayerSessionState) => void
  getSessionState: (key: string) => PlayerSessionState | undefined
  getSpeakerList: () => Promise<SpeakerEntry[]>
  vrmRegistry: VrmRegistryStore
  poseRegistry: PoseRegistryStore
  playerSettings: PlayerSettingsStore
}
