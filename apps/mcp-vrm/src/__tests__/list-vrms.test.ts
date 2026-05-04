import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ServerConfig } from '../config.js'
import { registerVrmPublicTools } from '../tools/vrm-registry/public-tools.js'
import { VrmRegistryStore } from '../tools/vrm-registry/store.js'

const TMP = join(process.cwd(), '__test_list_vrms_tmp__')

const SAMPLE_VRM_BYTES = Buffer.from([0x67, 0x6c, 0x54, 0x46, 0x02, 0x00, 0x00, 0x00, 0x0c, 0x00, 0x00, 0x00])
const SAMPLE_VRM_BASE64 = SAMPLE_VRM_BYTES.toString('base64')

function buildHarness(registry: VrmRegistryStore) {
  const registrations: Array<{ name: string; handler: (args: Record<string, unknown>) => Promise<CallToolResult> }> = []
  const server = {
    registerTool: (
      name: string,
      _config: unknown,
      handler: (args: Record<string, unknown>) => Promise<CallToolResult>
    ) => {
      registrations.push({ name, handler })
    },
  } as unknown as Parameters<typeof registerVrmPublicTools>[0]['server']

  const config = {
    httpHost: 'localhost',
    httpPort: 8765,
  } as unknown as ServerConfig

  registerVrmPublicTools(
    {
      server,
      ttsClient: {} as never,
      engine: {} as never,
      capabilities: {} as never,
      config,
      disabledTools: new Set(),
    },
    registry
  )

  const registration = registrations.find((r) => r.name.endsWith('list_vrms'))
  if (!registration) throw new Error('list_vrms was not registered')
  return (args: Record<string, unknown> = {}) => registration.handler(args)
}

describe('list_vrms public tool', () => {
  let registry: VrmRegistryStore

  beforeEach(() => {
    rmSync(TMP, { recursive: true, force: true })
    mkdirSync(TMP, { recursive: true })
    registry = new VrmRegistryStore({ cacheDir: TMP })
  })

  afterEach(() => {
    rmSync(TMP, { recursive: true, force: true })
  })

  it('登録 VRM が無いときは空配列を返す', async () => {
    const invoke = buildHarness(registry)
    const result = await invoke()
    expect(result.isError).toBeUndefined()
    const structured = result.structuredContent as { vrms: unknown[] }
    expect(structured.vrms).toEqual([])
  })

  it('登録済み VRM のメタデータを返す（vrmUrl 付き、バイナリは含めない）', async () => {
    const a = await registry.register({
      name: 'Alice',
      speakerId: 7,
      isDefault: true,
      vrmBase64: SAMPLE_VRM_BASE64,
    })
    const b = await registry.register({ name: 'Bob', speakerId: 3, vrmBase64: SAMPLE_VRM_BASE64 })

    const invoke = buildHarness(registry)
    const result = await invoke()

    expect(result.isError).toBeUndefined()
    const structured = result.structuredContent as {
      vrms: Array<{
        id: string
        name: string
        speakerId: number
        isDefault: boolean
        vrmUrl: string
        vrmSizeBytes: number
      }>
    }

    expect(structured.vrms).toHaveLength(2)
    const alice = structured.vrms.find((v) => v.id === a.id)
    expect(alice).toMatchObject({
      name: 'Alice',
      speakerId: 7,
      isDefault: true,
      vrmUrl: `http://localhost:8765/vrms/${a.id}.vrm`,
      vrmSizeBytes: SAMPLE_VRM_BYTES.byteLength,
    })
    const bob = structured.vrms.find((v) => v.id === b.id)
    expect(bob?.isDefault).toBe(false)

    expect(JSON.stringify(result)).not.toContain('vrmBase64')
    expect(JSON.stringify(result)).not.toContain('vrmFilePath')
  })
})
