# MCP Web Auth

MCP サーバーの OAuth 認証用ログイン画面です。Supabase Auth またはローカル開発用認証サーバーを使用できます。

## セットアップ

### 1. 環境変数を設定

```bash
cp .env.example .env
```

### 2. モードを選択

#### Supabase モード（本番用）

```bash
# .env
VITE_AUTH_MODE=supabase
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
```

Supabase の Authentication 設定で Redirect URLs に以下を追加:
- `http://localhost:5173` (開発用)
- `https://your-github-pages-url` (本番用)

#### ローカルモード（開発用）

```bash
# .env
VITE_AUTH_MODE=local
VITE_LOCAL_AUTH_SERVER=http://localhost:3001
```

## 開発

### Supabase モード

```bash
pnpm dev
```

### ローカルモード

2つのターミナルで実行:

```bash
# ターミナル 1: ローカル認証サーバー（ポート 3001）
pnpm dev:auth

# ターミナル 2: ログイン画面（ポート 5173）
pnpm dev
```

ブラウザで http://localhost:5173 を開く。

ローカル認証サーバーは JWT を発行し、`/.well-known/jwks.json` と `/.well-known/oauth-authorization-server` を公開します。VRM MCP サーバー側は以下の設定で接続できます:

```bash
MCP_OAUTH_ENABLED=true
MCP_AUTH_SERVER_URL=http://localhost:3001
MCP_JWKS_URI=http://localhost:3001/.well-known/jwks.json
MCP_RESOURCE_NAME="VRM MCP Server"
```

## ビルド

```bash
pnpm build
```

`dist/` フォルダが生成されます。

## GitHub Pages デプロイ

1. GitHub リポジトリの Settings > Pages で Source を "GitHub Actions" に設定
2. `dist/` フォルダを gh-pages ブランチにプッシュ

## 使い方

MCP クライアントからこの認証画面にリダイレクトします:

```
https://your-auth-page.github.io/?redirect_uri=YOUR_CALLBACK_URL&state=RANDOM_STATE
```

ログイン成功後、以下のパラメータ付きで `redirect_uri` にリダイレクトされます:

| パラメータ | 説明 |
|-----------|------|
| `access_token` | JWT アクセストークン |
| `token_type` | "bearer" |
| `expires_in` | 有効期限（秒） |
| `state` | 元のリクエストの state 値 |

## ファイル構成

```
apps/web-auth/
├── src/
│   ├── App.tsx          # ログイン画面 + コールバック処理
│   ├── main.tsx         # エントリーポイント
│   ├── supabase.ts      # Supabase/ローカルモード設定
│   └── vite-env.d.ts    # 型定義
├── scripts/
│   └── dev-auth-server.js  # ローカル開発用認証サーバー
├── index.html
├── vite.config.ts
├── .env.example
└── README.md
```
