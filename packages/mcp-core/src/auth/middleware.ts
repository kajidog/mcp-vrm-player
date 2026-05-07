import type { Context, MiddlewareHandler } from 'hono'
import { type OAuthConfig, verifyAccessToken } from './index.js'

/**
 * Hono middleware for JWT Bearer authentication
 */
export function bearerAuth(config: OAuthConfig): MiddlewareHandler {
  return async (c: Context, next) => {
    if (c.req.method === 'OPTIONS') {
      return next()
    }

    const authHeader = c.req.header('Authorization')

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      c.header('WWW-Authenticate', `Bearer realm="${config.resourceName}"`)
      return c.text('Unauthorized', 401)
    }

    const token = authHeader.slice('Bearer '.length).trim()

    try {
      const authInfo = await verifyAccessToken(token, config.jwksUri, config.issuer)
      // Store auth info in context for downstream handlers
      c.set('auth', authInfo)
      await next()
    } catch (error) {
      console.error('Token verification failed:', error)
      c.header('WWW-Authenticate', `Bearer realm="${config.resourceName}", error="invalid_token"`)
      return c.text('Unauthorized', 401)
    }
  }
}
