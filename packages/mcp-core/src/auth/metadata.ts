import type { OAuthConfig } from './config.js'

export function createProtectedResourceMetadata(config: OAuthConfig) {
  return {
    resource: config.mcpServerUrl,
    authorization_servers: [config.authServerUrl],
    jwks_uri: config.jwksUri,
    ...(config.issuer ? { issuer: config.issuer } : {}),
    scopes_supported: config.scopesSupported,
    bearer_methods_supported: ['header'],
    resource_documentation: `${config.resourceName} - MCP Server`,
  }
}
