import { rmSync } from 'node:fs'
import { join } from 'node:path'
import type { EngineCapabilities, TtsEngine } from '@kajidog/tts-client'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { afterAll, describe, expect, it } from 'vitest'
import type { ServerConfig } from '../config.js'
import { TOOL_GROUPS } from '../tool-groups.js'
import { registerPlayerTools } from '../tools/player.js'
import { addToolPrefix } from '../tools/registration.js'
import type { ToolDeps } from '../tools/types.js'

const TMP = join(process.cwd(), '__test_tool_groups_tmp__')

afterAll(() => {
  rmSync(TMP, { recursive: true, force: true })
})

// 実際にサーバーへ登録し、グループ定義との突き合わせに使うツール名一覧を得る。
function collectRegisteredToolNames(): Set<string> {
  const server = new McpServer({ name: 'tool-groups-test', version: '0.0.0' })

  const capabilities: EngineCapabilities = {
    audioQuery: true,
    directSpeech: false,
    accentPhrases: true,
    moraData: true,
    userDictionary: true,
    speakerInfo: true,
    speakerList: true,
  }
  const engine = {
    id: 'stub',
    displayName: 'Stub Engine',
    baseUrl: 'http://localhost:50021',
    capabilities,
  } as unknown as TtsEngine

  const config = {
    httpHost: 'localhost',
    httpPort: 8765,
    autoPlay: true,
    defaultSpeaker: 1,
    defaultSpeedScale: 1.0,
    playerCacheDir: TMP,
    playerStateFile: join(TMP, 'player-state.json'),
    playerAudioCacheEnabled: false,
    playerDefaultVrmPath: '',
    disabledTools: [],
    disabledGroups: [],
  } as unknown as ServerConfig

  const deps: ToolDeps = {
    server,
    ttsClient: {} as ToolDeps['ttsClient'],
    engine,
    capabilities,
    config,
    disabledTools: new Set(),
  }

  registerPlayerTools(deps)

  const registeredTools = (server as unknown as { _registeredTools: Record<string, unknown> })._registeredTools
  return new Set(Object.keys(registeredTools))
}

describe('TOOL_GROUPS と登録済みツールの突き合わせ', () => {
  const registered = collectRegisteredToolNames()

  it('サーバーにツールが登録されている', () => {
    expect(registered.size).toBeGreaterThan(0)
  })

  // グループに実在しないツール名が紛れ込むと --disable-groups が無言の no-op になるため、
  // 全グループの全メンバーが実際に登録されていることを検証する。
  for (const [groupName, members] of Object.entries(TOOL_GROUPS)) {
    it(`グループ "${groupName}" のツールはすべて登録済みである`, () => {
      const missing = members.map(addToolPrefix).filter((name) => !registered.has(name))
      expect(missing).toEqual([])
    })
  }
})
