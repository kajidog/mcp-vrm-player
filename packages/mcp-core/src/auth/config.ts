import type { BaseServerConfig } from '../config.js'

export interface OAuthConfig {
  enabled: boolean
  mcpServerUrl: string
  authServerUrl: string
  jwksUri: string
  issuer?: string
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

  const authServerUrl = config.oauthAuthServerUrl
  const scopesSupported = config.oauthScopes.map((scope) => scope.trim()).filter(Boolean)

  return {
    enabled: true,
    mcpServerUrl: config.mcpServerUrl,
    authServerUrl,
    jwksUri: config.oauthJwksUri || `${authServerUrl}/.well-known/jwks.json`,
    issuer: config.oauthIssuer,
    audience: config.oauthAudience || config.mcpServerUrl,
    scopesSupported,
    resourceName: config.oauthResourceName || defaults.resourceName || 'MCP Server',
  }
}
