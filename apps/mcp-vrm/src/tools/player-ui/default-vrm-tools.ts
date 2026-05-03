import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { registerAppToolIfEnabled } from '../registration.js'
import { createErrorResponse } from '../utils.js'
import type { PlayerUIToolContext } from './context.js'

function resolveDefaultVrmPath(configuredPath: string): string | null {
  const trimmed = configuredPath.trim()
  if (!trimmed) return null
  return resolve(trimmed)
}

export function registerPlayerDefaultVrmTools(context: PlayerUIToolContext): void {
  const { deps, shared } = context
  const { server, disabledTools, config } = deps
  const { playerResourceUri, vrmRegistry } = shared

  registerAppToolIfEnabled(
    server,
    disabledTools,
    '_get_default_vrm_for_player',
    {
      title: 'Get Default VRM (Player)',
      description: 'Get default VRM data for the player UI fallback. This tool is only callable from the app UI.',
      _meta: {
        ui: {
          resourceUri: playerResourceUri,
          visibility: ['app'],
        },
      },
    },
    async (): Promise<CallToolResult> => {
      try {
        const defaultModel = vrmRegistry?.getDefault()
        if (defaultModel) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  vrmBase64: vrmRegistry?.readVrmBase64(defaultModel.id) ?? '',
                  vrmMimeType: 'model/gltf-binary',
                  sourcePath: defaultModel.vrmFilePath,
                }),
              },
            ],
          }
        }

        const filePath = resolveDefaultVrmPath(config.playerDefaultVrmPath)
        if (!filePath) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({}),
              },
            ],
          }
        }

        if (!existsSync(filePath)) {
          throw new Error(
            `Default VRM file not found: ${filePath}. Set TTS_PLAYER_DEFAULT_VRM_PATH or --player-default-vrm-path.`
          )
        }

        const data = await readFile(filePath)
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                vrmBase64: data.toString('base64'),
                vrmMimeType: 'model/gltf-binary',
                sourcePath: filePath,
              }),
            },
          ],
        }
      } catch (error) {
        return createErrorResponse(error)
      }
    }
  )
}
