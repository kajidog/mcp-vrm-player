# vrm-mcp

開発中

`vrm-mcp` は、ChatGPT や Claude などの MCP 対応チャット上で、好きなVRMモデルを表示しながら会話できるサーバーです。VOICEVOX / sakuraai を使った音声合成と、リップシンク・表情・ポーズを組み合わせた再生に対応しています。

## 主な機能

- チャット上で VRM キャラクターを表示し、音声つきで会話できる
- VRMモデルを複数登録し、会話ごとに利用モデルを切り替えできる
- 感情（neutral/happy/angry/sad など）とポーズを指定して発話できる
- 音声再生に合わせたリップシンク・表情反映に対応
- VOICEVOX / sakuraai をTTSエンジンとして利用可能

> 補足: `speak_player` / `open_model_manager` は MCP Apps UI を開けるクライアントで利用します。

## クイックスタート

```bash
pnpm -r i
pnpm -r dev
```

## MCPツール一覧

- `vrm_start_here`
- `vrm_find_models`
- `vrm_speak_player` (App tool)
- `vrm_open_model_manager` (App tool)
- `vrm_list_vrms`

## 主要設定

- `--engine` / `TTS_ENGINE`: `voicevox` または `sakuraai`
- `--base-url` / `TTS_BASE_URL`: TTSエンジンURL
- `--speaker` / `TTS_DEFAULT_SPEAKER`: デフォルト話者ID
- `--disable-tools` / `TTS_DISABLED_TOOLS`: 無効化するツール名
- `--disable-groups` / `TTS_DISABLED_GROUPS`: 無効化グループ（`player`, `dictionary`, `file`, `apps`）
- `--auto-play` / `TTS_AUTO_PLAY`: UIプレイヤー自動再生

`--init` で `.voicevoxrc.json` テンプレートを生成できます。

## OAuth 認証

HTTP モードでは OAuth JWT Bearer 認証を有効化できます。有効時は `/mcp`, `/vrms/:fileName`, `/poses/:fileName` が `Authorization: Bearer <JWT>` 必須になり、`/health` と `/.well-known/oauth-protected-resource` は認証不要です。

```bash
MCP_HTTP_MODE=true
MCP_OAUTH_ENABLED=true
MCP_SERVER_URL=http://localhost:3000
MCP_AUTH_SERVER_URL=http://localhost:3001
MCP_JWKS_URI=http://localhost:3001/.well-known/jwks.json
MCP_RESOURCE_NAME="VRM MCP Server"
```

`MCP_ISSUER` を指定した場合は JWT の `iss` も検証します。`MCP_OAUTH_SCOPES` はカンマ区切りで指定でき、既定は `mcp:tools,mcp:resources` です。OAuth 有効時は `MCP_API_KEY` より OAuth JWT が優先され、`/mcp` では API キー認証を要求しません。

詳しいローカル開発手順、Supabase 設定、環境変数一覧は [docs/auth-setup.md](docs/auth-setup.md) を参照してください。
