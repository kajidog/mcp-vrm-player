import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  getConfig,
  getConfigTemplate,
  getHelpText,
  parseCliArgs,
  parseConfigFile,
  parseEnvVars,
  resetConfigCache,
} from '../config'

describe('config module', () => {
  describe('parseCliArgs', () => {
    it('空の引数で空のオブジェクトを返す', () => {
      const result = parseCliArgs([])
      expect(result).toEqual({})
    })

    it('--base-url を正しくパースする', () => {
      const result = parseCliArgs(['--base-url', 'http://example.com:50021'])
      expect(result.baseUrl).toBe('http://example.com:50021')
    })

    it('--speaker を正しくパースする', () => {
      const result = parseCliArgs(['--speaker', '3'])
      expect(result.defaultSpeaker).toBe(3)
    })

    it('--speed を正しくパースする', () => {
      const result = parseCliArgs(['--speed', '1.5'])
      expect(result.defaultSpeedScale).toBe(1.5)
    })

    it('--auto-play を正しくパースする', () => {
      const result = parseCliArgs(['--auto-play'])
      expect(result.autoPlay).toBe(true)
    })

    it('--no-auto-play を正しくパースする', () => {
      const result = parseCliArgs(['--no-auto-play'])
      expect(result.autoPlay).toBe(false)
    })

    it('--player-state-file を正しくパースする', () => {
      const result = parseCliArgs(['--player-state-file', '/tmp/player-state.json'])
      expect(result.playerStateFile).toBe('/tmp/player-state.json')
    })

    it('--disable-tools を正しくパースする', () => {
      const result = parseCliArgs(['--disable-tools', 'speak,get_speaker_detail'])
      expect(result.disabledTools).toEqual(['speak', 'get_speaker_detail'])
    })

    it('--disable-tools でスペースをトリムする', () => {
      const result = parseCliArgs(['--disable-tools', 'speak, get_speaker_detail , stop_speaker'])
      expect(result.disabledTools).toEqual(['speak', 'get_speaker_detail', 'stop_speaker'])
    })

    it('--http を正しくパースする', () => {
      const result = parseCliArgs(['--http'])
      expect(result.httpMode).toBe(true)
    })

    it('--port を正しくパースする', () => {
      const result = parseCliArgs(['--port', '8080'])
      expect(result.httpPort).toBe(8080)
    })

    it('--host を正しくパースする', () => {
      const result = parseCliArgs(['--host', '127.0.0.1'])
      expect(result.httpHost).toBe('127.0.0.1')
    })

    it('--api-key を正しくパースする', () => {
      const result = parseCliArgs(['--api-key', 'test-key'])
      expect(result.apiKey).toBe('test-key')
    })

    it('OAuth オプションを正しくパースする', () => {
      const result = parseCliArgs([
        '--oauth',
        '--mcp-server-url',
        'https://mcp.example.com',
        '--oauth-auth-server-url',
        'https://auth.example.com',
        '--oauth-jwks-uri',
        'https://auth.example.com/jwks.json',
        '--oauth-issuer',
        'https://auth.example.com',
        '--oauth-audience',
        'authenticated',
        '--oauth-scopes',
        'openid,email,profile',
        '--oauth-resource-name',
        'Custom MCP',
      ])
      expect(result.oauthEnabled).toBe(true)
      expect(result.mcpServerUrl).toBe('https://mcp.example.com')
      expect(result.oauthAuthServerUrl).toBe('https://auth.example.com')
      expect(result.oauthJwksUri).toBe('https://auth.example.com/jwks.json')
      expect(result.oauthIssuer).toBe('https://auth.example.com')
      expect(result.oauthAudience).toBe('authenticated')
      expect(result.oauthScopes).toEqual(['openid', 'email', 'profile'])
      expect(result.oauthResourceName).toBe('Custom MCP')
    })

    it('--engine-api-key を正しくパースする', () => {
      const result = parseCliArgs(['--engine-api-key', 'test-engine-key'])
      expect(result.engineApiKey).toBe('test-engine-key')
    })

    it('複数の引数を正しくパースする', () => {
      const result = parseCliArgs([
        '--base-url',
        'http://example.com:50021',
        '--speaker',
        '5',
        '--no-auto-play',
        '--http',
        '--port',
        '3001',
      ])
      expect(result.baseUrl).toBe('http://example.com:50021')
      expect(result.defaultSpeaker).toBe(5)
      expect(result.autoPlay).toBe(false)
      expect(result.httpMode).toBe(true)
      expect(result.httpPort).toBe(3001)
    })

    it('値が必要な引数で値がない場合はスキップする', () => {
      const result = parseCliArgs(['--base-url', '--speaker', '3'])
      expect(result.baseUrl).toBeUndefined()
      expect(result.defaultSpeaker).toBe(3)
    })
  })

  describe('parseEnvVars', () => {
    it('空の環境変数で空のオブジェクトを返す', () => {
      const result = parseEnvVars({})
      expect(result).toEqual({})
    })

    it('TTS_BASE_URL を正しく読み込む', () => {
      const result = parseEnvVars({ TTS_BASE_URL: 'http://example.com:50021' })
      expect(result.baseUrl).toBe('http://example.com:50021')
    })

    it('TTS_DEFAULT_SPEAKER を正しく読み込む', () => {
      const result = parseEnvVars({ TTS_DEFAULT_SPEAKER: '3' })
      expect(result.defaultSpeaker).toBe(3)
    })

    it('TTS_DEFAULT_SPEED_SCALE を正しく読み込む', () => {
      const result = parseEnvVars({ TTS_DEFAULT_SPEED_SCALE: '1.5' })
      expect(result.defaultSpeedScale).toBe(1.5)
    })

    it('TTS_AUTO_PLAY=false で false を返す', () => {
      const result = parseEnvVars({ TTS_AUTO_PLAY: 'false' })
      expect(result.autoPlay).toBe(false)
    })

    it('TTS_AUTO_PLAY=true で true を返す', () => {
      const result = parseEnvVars({ TTS_AUTO_PLAY: 'true' })
      expect(result.autoPlay).toBe(true)
    })

    it('TTS_PLAYER_CACHE_DIR を正しく読み込む', () => {
      const result = parseEnvVars({ TTS_PLAYER_CACHE_DIR: '/tmp/cache' })
      expect(result.playerCacheDir).toBe('/tmp/cache')
    })

    it('TTS_PLAYER_STATE_FILE を正しく読み込む', () => {
      const result = parseEnvVars({ TTS_PLAYER_STATE_FILE: '/tmp/player-state.json' })
      expect(result.playerStateFile).toBe('/tmp/player-state.json')
    })

    it('TTS_DISABLED_TOOLS を正しく読み込む', () => {
      const result = parseEnvVars({ TTS_DISABLED_TOOLS: 'speak,generate_query' })
      expect(result.disabledTools).toEqual(['speak', 'generate_query'])
    })

    it('MCP_HTTP_MODE=true で true を返す', () => {
      const result = parseEnvVars({ MCP_HTTP_MODE: 'true' })
      expect(result.httpMode).toBe(true)
    })

    it('MCP_HTTP_PORT を正しく読み込む', () => {
      const result = parseEnvVars({ MCP_HTTP_PORT: '8080' })
      expect(result.httpPort).toBe(8080)
    })

    it('MCP_HTTP_HOST を正しく読み込む', () => {
      const result = parseEnvVars({ MCP_HTTP_HOST: '127.0.0.1' })
      expect(result.httpHost).toBe('127.0.0.1')
    })

    it('MCP_API_KEY を正しく読み込む', () => {
      const result = parseEnvVars({ MCP_API_KEY: 'env-key' })
      expect(result.apiKey).toBe('env-key')
    })

    it('OAuth 環境変数を正しく読み込む', () => {
      const result = parseEnvVars({
        MCP_OAUTH_ENABLED: 'true',
        MCP_SERVER_URL: 'https://mcp.example.com',
        MCP_AUTH_SERVER_URL: 'https://auth.example.com',
        MCP_JWKS_URI: 'https://auth.example.com/jwks.json',
        MCP_ISSUER: 'https://auth.example.com',
        MCP_OAUTH_AUDIENCE: 'authenticated',
        MCP_OAUTH_SCOPES: 'openid, email, profile',
        MCP_RESOURCE_NAME: 'Custom MCP',
      })
      expect(result.oauthEnabled).toBe(true)
      expect(result.mcpServerUrl).toBe('https://mcp.example.com')
      expect(result.oauthAuthServerUrl).toBe('https://auth.example.com')
      expect(result.oauthJwksUri).toBe('https://auth.example.com/jwks.json')
      expect(result.oauthIssuer).toBe('https://auth.example.com')
      expect(result.oauthAudience).toBe('authenticated')
      expect(result.oauthScopes).toEqual(['openid', 'email', 'profile'])
      expect(result.oauthResourceName).toBe('Custom MCP')
    })

    it('TTS_API_KEY を正しく読み込む', () => {
      const result = parseEnvVars({ TTS_API_KEY: 'engine-env-key' })
      expect(result.engineApiKey).toBe('engine-env-key')
    })

    it('空の数値環境変数はスキップする（0にならない）', () => {
      const result = parseEnvVars({
        MCP_HTTP_PORT: '',
        TTS_DEFAULT_SPEAKER: '',
        TTS_DEFAULT_SPEED_SCALE: '',
      })
      expect(result.httpPort).toBeUndefined()
      expect(result.defaultSpeaker).toBeUndefined()
      expect(result.defaultSpeedScale).toBeUndefined()
    })

    it('空の文字列環境変数はスキップする', () => {
      const result = parseEnvVars({
        TTS_BASE_URL: '',
        TTS_PLAYER_CACHE_DIR: '',
      })
      expect(result.baseUrl).toBeUndefined()
      expect(result.playerCacheDir).toBeUndefined()
    })
  })

  describe('getConfig', () => {
    beforeEach(() => {
      resetConfigCache()
    })

    it('デフォルト値を返す', () => {
      const result = getConfig([], {})
      expect(result.baseUrl).toBe('http://localhost:50021')
      expect(result.defaultSpeaker).toBe(1)
      expect(result.defaultSpeedScale).toBe(1.0)
      expect(result.autoPlay).toBe(true)
      expect(result.playerCacheDir).toContain('.tts-player-cache')
      expect(result.playerStateFile).toContain('.tts-player-cache/player-state.json')
      expect(result.disabledTools).toEqual([])
      expect(result.httpMode).toBe(false)
      expect(result.httpPort).toBe(3000)
      expect(result.httpHost).toBe('0.0.0.0')
      expect(result.apiKey).toBeUndefined()
      expect(result.oauthEnabled).toBe(false)
      expect(result.mcpServerUrl).toBe('http://localhost:3000')
      expect(result.oauthAuthServerUrl).toBe('http://localhost:3001')
      expect(result.oauthJwksUri).toBeUndefined()
      expect(result.oauthIssuer).toBeUndefined()
      expect(result.oauthAudience).toBeUndefined()
      expect(result.oauthScopes).toEqual(['openid', 'email', 'profile'])
      expect(result.oauthResourceName).toBeUndefined()
      expect(result.engineApiKey).toBeUndefined()
    })

    it('環境変数がデフォルト値を上書きする', () => {
      const result = getConfig([], {
        TTS_BASE_URL: 'http://env.example.com:50021',
        TTS_DEFAULT_SPEAKER: '5',
      })
      expect(result.baseUrl).toBe('http://env.example.com:50021')
      expect(result.defaultSpeaker).toBe(5)
    })

    it('CLI引数が環境変数を上書きする', () => {
      const result = getConfig(['--base-url', 'http://cli.example.com:50021', '--speaker', '10'], {
        TTS_BASE_URL: 'http://env.example.com:50021',
        TTS_DEFAULT_SPEAKER: '5',
      })
      expect(result.baseUrl).toBe('http://cli.example.com:50021')
      expect(result.defaultSpeaker).toBe(10)
    })

    it('CLI引数がデフォルト値を上書きする', () => {
      const result = getConfig(['--no-auto-play'], {})
      expect(result.autoPlay).toBe(false)
    })

    it('player state file 未指定時は player cache dir に追従する', () => {
      const result = getConfig(['--player-cache-dir', '/tmp/cache-dir'], {})
      expect(result.playerCacheDir).toBe('/tmp/cache-dir')
      expect(result.playerStateFile).toBe('/tmp/cache-dir/player-state.json')
    })

    it('player state file 指定時は player cache dir より優先する', () => {
      const result = getConfig(['--player-cache-dir', '/tmp/cache-dir', '--player-state-file', '/tmp/state.json'], {})
      expect(result.playerCacheDir).toBe('/tmp/cache-dir')
      expect(result.playerStateFile).toBe('/tmp/state.json')
    })

    it('優先順位: CLI > ENV > デフォルト の順に設定される', () => {
      const result = getConfig(['--speaker', '100'], {
        TTS_BASE_URL: 'http://env.example.com:50021',
        TTS_DEFAULT_SPEAKER: '50',
      })
      // CLI引数があるのでCLI値
      expect(result.defaultSpeaker).toBe(100)
      // CLI引数がないので環境変数値
      expect(result.baseUrl).toBe('http://env.example.com:50021')
      // 両方ないのでデフォルト値
      expect(result.defaultSpeedScale).toBe(1.0)
    })

    it('無効化ツールが正しく設定される', () => {
      const result = getConfig(['--disable-tools', 'speak,stop_speaker'], {})
      expect(result.disabledTools).toEqual(['speak', 'stop_speaker'])
    })

    it('sakuraai はデフォルトURLとTTS_API_KEYを使う', () => {
      const result = getConfig([], {
        TTS_ENGINE: 'sakuraai',
        TTS_API_KEY: 'engine-env-key',
      })
      expect(result.baseUrl).toBe('https://api.ai.sakura.ad.jp')
      expect(result.engineApiKey).toBe('engine-env-key')
    })

    it('sakuraai で API key 未指定ならエラーにする', () => {
      expect(() => getConfig([], { TTS_ENGINE: 'sakuraai' })).toThrow(/TTS_API_KEY/)
    })

    it('aivisspeech はデフォルトURLとして localhost:10101 を使う', () => {
      const result = getConfig([], { TTS_ENGINE: 'aivisspeech' })
      expect(result.baseUrl).toBe('http://localhost:10101')
    })
  })

  describe('parseConfigFile', () => {
    const tmpDir = join(process.cwd(), '__test_config_tmp__')

    beforeEach(() => {
      mkdirSync(tmpDir, { recursive: true })
    })

    afterEach(() => {
      rmSync(tmpDir, { recursive: true, force: true })
    })

    it('存在しないファイルパスで空オブジェクトを返す', () => {
      const result = parseConfigFile('/tmp/non-existent-config.json')
      expect(result).toEqual({})
    })

    it('JSON設定ファイルを正しくパースする', () => {
      const configPath = join(tmpDir, 'test-config.json')
      writeFileSync(configPath, JSON.stringify({ 'base-url': 'http://test:50021', speaker: 5 }))
      const result = parseConfigFile(configPath)
      expect(result.baseUrl).toBe('http://test:50021')
      expect(result.defaultSpeaker).toBe(5)
    })

    it('boolean値を正しくパースする', () => {
      const configPath = join(tmpDir, 'bool-config.json')
      writeFileSync(configPath, JSON.stringify({ 'auto-play': false, 'player-audio-cache': true }))
      const result = parseConfigFile(configPath)
      expect(result.autoPlay).toBe(false)
      expect(result.playerAudioCacheEnabled).toBe(true)
    })

    it('camelCaseキーを受け入れる', () => {
      const configPath = join(tmpDir, 'camel-config.json')
      writeFileSync(configPath, JSON.stringify({ playerAudioCacheEnabled: true, autoPlay: false }))
      const result = parseConfigFile(configPath)
      expect(result.playerAudioCacheEnabled).toBe(true)
      expect(result.autoPlay).toBe(false)
    })

    it('string[]型を正しくパースする', () => {
      const configPath = join(tmpDir, 'array-config.json')
      writeFileSync(configPath, JSON.stringify({ 'disable-tools': ['speak', 'stop_speaker'] }))
      const result = parseConfigFile(configPath)
      expect(result.disabledTools).toEqual(['speak', 'stop_speaker'])
    })

    it('不正なJSONファイルで空オブジェクトを返す', () => {
      const configPath = join(tmpDir, 'invalid-config.json')
      writeFileSync(configPath, 'not valid json{')
      const result = parseConfigFile(configPath)
      expect(result).toEqual({})
    })

    it('サーバー設定も正しくパースする', () => {
      const configPath = join(tmpDir, 'server-config.json')
      writeFileSync(configPath, JSON.stringify({ http: true, port: 8080 }))
      const result = parseConfigFile(configPath)
      expect(result.httpMode).toBe(true)
      expect(result.httpPort).toBe(8080)
    })

    it('空文字列のパスオプションはスキップする（ランタイムデフォルトを上書きしない）', () => {
      const configPath = join(tmpDir, 'empty-path-config.json')
      writeFileSync(
        configPath,
        JSON.stringify({
          'player-cache-dir': '',
          'player-state-file': '',
        })
      )
      const result = parseConfigFile(configPath)
      expect(result.playerCacheDir).toBeUndefined()
      expect(result.playerStateFile).toBeUndefined()
    })

    it('設定ファイル内のAPIキーを拒否する', () => {
      const configPath = join(tmpDir, 'secret-config.json')
      writeFileSync(configPath, JSON.stringify({ engine: 'sakuraai', engineApiKey: 'must-not-be-here' }))

      expect(() => parseConfigFile(configPath)).toThrow(/must not contain API keys/)
    })
  })

  describe('getConfig with config file', () => {
    const tmpDir = join(process.cwd(), '__test_config_tmp2__')

    beforeEach(() => {
      resetConfigCache()
      mkdirSync(tmpDir, { recursive: true })
    })

    afterEach(() => {
      rmSync(tmpDir, { recursive: true, force: true })
    })

    it('CLI > ENV > config file > デフォルト の優先順位', () => {
      const configPath = join(tmpDir, 'priority-config.json')
      writeFileSync(configPath, JSON.stringify({ 'base-url': 'http://file:50021', speaker: 10, speed: 2.0 }))
      const result = getConfig(['--config', configPath, '--speaker', '99'], {
        TTS_DEFAULT_SPEED_SCALE: '3.0',
      })
      // CLI引数が最優先
      expect(result.defaultSpeaker).toBe(99)
      // 環境変数が次
      expect(result.defaultSpeedScale).toBe(3.0)
      // 設定ファイルが次
      expect(result.baseUrl).toBe('http://file:50021')
    })
  })

  describe('getHelpText', () => {
    it('help文が生成される', () => {
      const help = getHelpText()
      expect(help).toContain('Usage:')
      expect(help).toContain('--help')
      expect(help).toContain('--base-url')
      expect(help).toContain('--speaker')
      expect(help).toContain('--http')
      expect(help).toContain('--port')
      expect(help).toContain('--config')
    })

    it('グループごとに整理されている', () => {
      const help = getHelpText()
      expect(help).toContain('TTS Configuration:')
      expect(help).toContain('UI Player Options:')
      expect(help).toContain('Server Options:')
    })

    it('Examplesが含まれる', () => {
      const help = getHelpText()
      expect(help).toContain('Examples:')
      expect(help).toContain('npx @kajidog/mcp-vrm-player')
    })
  })

  describe('getConfigTemplate', () => {
    it('デフォルトが未定義のオプションはテンプレートに含まれない', () => {
      const template = getConfigTemplate()
      // ランタイムデフォルトを持つパスオプションは含まれない
      expect(template).not.toHaveProperty('player-cache-dir')
      expect(template).not.toHaveProperty('player-state-file')
      // configFile は除外済み
      expect(template).not.toHaveProperty('config')
    })

    it('明示的なデフォルトを持つオプションは含まれる', () => {
      const template = getConfigTemplate()
      expect(template).toHaveProperty('engine', 'voicevox')
      expect(template).toHaveProperty('speaker', 1)
      expect(template).toHaveProperty('speed', 1.0)
      expect(template).toHaveProperty('auto-play', true)
      expect(template).not.toHaveProperty('api-key')
      expect(template).not.toHaveProperty('engine-api-key')
    })
  })
})
