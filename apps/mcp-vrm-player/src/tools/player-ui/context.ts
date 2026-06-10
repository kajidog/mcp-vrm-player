import type { ToolDeps } from '../types.js'
import type { PlayerUIShared } from './types.js'

export interface PlayerUIToolContext {
  deps: ToolDeps
  shared: PlayerUIShared
  speakerIconCache: Map<string, string>
}

export function createPlayerUIToolContext(deps: ToolDeps, shared: PlayerUIShared): PlayerUIToolContext {
  return {
    deps,
    shared,
    speakerIconCache: new Map<string, string>(),
  }
}
