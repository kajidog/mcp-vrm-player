import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ServerConfig } from '../../config.js'
import { PlayerSettingsStore } from '../player/player-settings-store.js'
import { PoseRegistryStore } from '../pose-registry/store.js'
import type { ToolDeps, ToolHandlerExtra } from '../types.js'
import { registerVrmPublicTools } from '../vrm-registry/public-tools.js'
import { VrmRegistryStore } from '../vrm-registry/store.js'

const TMP = join(process.cwd(), '__test_set_default_model_tmp__')

const SAMPLE_VRM_BYTES = Buffer.from([
  0x67,
  0x6c,
  0x54,
  0x46, // glTF
  0x02,
  0x00,
  0x00,
  0x00, // version 2
  0x0c,
  0x00,
  0x00,
  0x00, // length
])
const SAMPLE_VRM_BASE64 = SAMPLE_VRM_BYTES.toString('base64')

type Handler = (args: Record<string, unknown>, extra: ToolHandlerExtra) => Promise<CallToolResult>

function buildHarness() {
  const handlers = new Map<string, Handler>()
  const server = {
    registerTool: (name: string, _config: Record<string, unknown>, handler: Handler) => {
      handlers.set(name, handler)
    },
  } as unknown as ToolDeps['server']

  const config = {
    playerCacheDir: TMP,
    defaultSpeedScale: 1.0,
    autoPlay: true,
    httpHost: 'localhost',
    httpPort: 8765,
  } as unknown as ServerConfig

  const registry = new VrmRegistryStore({ cacheDir: TMP })
  const poseRegistry = new PoseRegistryStore({ cacheDir: TMP })
  const playerSettings = new PlayerSettingsStore(config, join(TMP, 'player-settings.json'))

  const deps = {
    server,
    disabledTools: new Set<string>(),
    config,
    ttsClient: { checkHealth: async () => ({ connected: true }) } as unknown as ToolDeps['ttsClient'],
    engine: { id: 'voicevox', displayName: 'VOICEVOX' } as unknown as ToolDeps['engine'],
    capabilities: {} as unknown as ToolDeps['capabilities'],
  } as ToolDeps

  registerVrmPublicTools(deps, registry, poseRegistry, playerSettings)

  return { handlers, registry, playerSettings }
}

function parseStructured(result: CallToolResult): Record<string, unknown> {
  return result.structuredContent as Record<string, unknown>
}

describe('vrm_set_default_model', () => {
  beforeEach(() => {
    rmSync(TMP, { recursive: true, force: true })
    mkdirSync(TMP, { recursive: true })
  })

  afterEach(() => {
    rmSync(TMP, { recursive: true, force: true })
  })

  it('既定モデルを切り替え、排他制御される', async () => {
    const { handlers, registry } = buildHarness()
    const handler = handlers.get('vrm_set_default_model')
    expect(handler).toBeDefined()

    const a = await registry.register({ name: 'A', speakerId: 1, vrmBase64: SAMPLE_VRM_BASE64 })
    const b = await registry.register({ name: 'B', speakerId: 2, vrmBase64: SAMPLE_VRM_BASE64 })
    expect(registry.getDefault('anonymous')?.id).toBe(a.id)

    const result = await handler!({ modelId: b.id }, {})
    expect(result.isError).toBeFalsy()
    expect(registry.getDefault('anonymous')?.id).toBe(b.id)
    expect(registry.get(a.id)?.isDefault).toBe(false)

    const structured = parseStructured(result)
    expect((structured.newDefault as { modelId: string }).modelId).toBe(b.id)
  })

  it('直前の既定を previousDefault として返す（undo の手がかり）', async () => {
    const { handlers, registry } = buildHarness()
    const handler = handlers.get('vrm_set_default_model')!

    const a = await registry.register({ name: 'A', speakerId: 1, vrmBase64: SAMPLE_VRM_BASE64 })
    const b = await registry.register({ name: 'B', speakerId: 2, vrmBase64: SAMPLE_VRM_BASE64 })

    const result = await handler({ modelId: b.id }, {})
    const structured = parseStructured(result)
    expect(structured.previousDefault).toEqual({ modelId: a.id, name: 'A' })
  })

  it('適用範囲 appliesTo に vrm_speak_player が含まれる', async () => {
    const { handlers, registry } = buildHarness()
    const handler = handlers.get('vrm_set_default_model')!
    const a = await registry.register({ name: 'A', speakerId: 1, vrmBase64: SAMPLE_VRM_BASE64 })

    const structured = parseStructured(await handler({ modelId: a.id }, {}))
    const appliesTo = structured.appliesTo as string[]
    expect(appliesTo.some((entry) => entry.includes('vrm_speak_player'))).toBe(true)
  })

  it('activeModelId も新しい既定に同期される', async () => {
    const { handlers, registry, playerSettings } = buildHarness()
    const handler = handlers.get('vrm_set_default_model')!
    const a = await registry.register({ name: 'A', speakerId: 1, vrmBase64: SAMPLE_VRM_BASE64 })

    await handler({ modelId: a.id }, {})
    expect(playerSettings.get('anonymous').activeModelId).toBe(a.id)
  })

  it('存在しない modelId はエラー応答になる', async () => {
    const { handlers } = buildHarness()
    const handler = handlers.get('vrm_set_default_model')!

    const result = await handler({ modelId: 'does-not-exist' }, {})
    expect(result.isError).toBe(true)
  })
})
