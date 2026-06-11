import type { BaseServerConfig } from '../config.js'
import { getProtectedResourceIdentifier } from './metadata.js'

export interface OAuthConfig {
  enabled: boolean
  mcpServerUrl: string
  authServerUrl: string
  jwksUri: string
  /** JWT の iss 検証に使う issuer。OAuth 有効時は必須（未設定だと iss 検証が黙ってスキップされるため）。 */
  issuer: string
  audience?: string
  scopesSupported: string[]
  resourceName: string
}

export interface OAuthConfigDefaults {
  resourceName?: string
}

export function createOAuthConfig(
  config: Pick<
    BaseServerConfig,
    | 'oauthEnabled'
    | 'mcpServerUrl'
    | 'oauthAuthServerUrl'
    | 'oauthJwksUri'
    | 'oauthIssuer'
    | 'oauthAudience'
    | 'oauthScopes'
    | 'oauthResourceName'
  >,
  defaults: OAuthConfigDefaults = {}
): OAuthConfig | null {
  if (!config.oauthEnabled) return null

  const issuer = config.oauthIssuer?.trim()
  if (!issuer) {
    throw new Error(
      'OAuth is enabled but no issuer is configured. Set MCP_ISSUER (--oauth-issuer) so JWT iss claims are validated.'
    )
  }

  const authServerUrl = config.oauthAuthServerUrl
  const scopesSupported = config.oauthScopes.map((scope) => scope.trim()).filter(Boolean)

  return {
    enabled: true,
    mcpServerUrl: config.mcpServerUrl,
    authServerUrl,
    jwksUri: config.oauthJwksUri || `${authServerUrl}/.well-known/jwks.json`,
    issuer,
    // RFC 8707: aud 検証のデフォルトは protected resource metadata が公開する resource 識別子
    // (<base>/mcp) に合わせる。ベース URL のままだと RFC 準拠クライアントのトークンを弾いてしまう。
    audience: config.oauthAudience || getProtectedResourceIdentifier({ mcpServerUrl: config.mcpServerUrl }),
    scopesSupported,
    resourceName: config.oauthResourceName || defaults.resourceName || 'MCP Server',
  }
}
