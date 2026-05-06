import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { getVrmModelUrl } from '../../vrm-http.js'
import type { EmotionBinding } from '../emotions.js'
import type { PoseRegistryStore } from '../pose-registry/store.js'
import { isBuiltinPoseResourceId } from '../pose-registry/types.js'
import { registerToolIfEnabled } from '../registration.js'
import type { ToolDeps } from '../types.js'
import { createErrorResponse } from '../utils.js'
import type { VrmRegistryStore } from './store.js'

interface PublicVrmEntry {
  id: string
  name: string
  speakerId: number
  isDefault: boolean
  vrmUrl: string
  vrmSizeBytes: number
  updatedAt: number
  emotionBindings?: EmotionBinding[]
  poses: { id: string; name: string; loop: boolean }[]
}

export function registerVrmPublicTools(
  deps: ToolDeps,
  registry: VrmRegistryStore,
  poseRegistry: PoseRegistryStore
): void {
  const { server, disabledTools, config } = deps

  registerToolIfEnabled(
    server,
    disabledTools,
    'list_vrms',
    {
      title: 'List VRMs',
      description:
        'List registered VRM models. Use this before calling speak_player to discover valid modelId values, model poses, and emotion bindings. Pass segments[].pose as one of poses[].name and segments[].emotion as neutral/happy/angry/sad/relaxed/surprised/serious. Returns metadata only (no binary).',
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (): Promise<CallToolResult> => {
      try {
        const entries: PublicVrmEntry[] = registry.list().map((model) => ({
          id: model.id,
          name: model.name,
          speakerId: model.speakerId,
          isDefault: model.isDefault,
          vrmUrl: getVrmModelUrl(config, model.id),
          vrmSizeBytes: model.vrmSizeBytes,
          updatedAt: model.updatedAt,
          emotionBindings: model.emotionBindings,
          poses: (model.poses ?? []).flatMap((attachment) => {
            if (isBuiltinPoseResourceId(attachment.poseId)) {
              return [{ id: attachment.poseId, name: attachment.name, loop: true }]
            }
            const pose = poseRegistry.get(attachment.poseId)
            return pose ? [{ id: attachment.poseId, name: attachment.name, loop: pose.loop }] : []
          }),
        }))
        const summary =
          entries.length === 0 ? 'No VRM models registered.' : `${entries.length} VRM model(s) registered.`
        return {
          content: [
            {
              type: 'text',
              text: `${summary}\n${JSON.stringify({ vrms: entries }, null, 2)}`,
            },
          ],
          structuredContent: { vrms: entries },
        }
      } catch (error) {
        return createErrorResponse(error)
      }
    }
  )
}
