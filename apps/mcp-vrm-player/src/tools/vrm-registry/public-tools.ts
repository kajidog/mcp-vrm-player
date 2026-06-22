import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import * as z from 'zod'
import { getVrmModelUrl } from '../../vrm-http.js'
import { resolveUserId } from '../auth-context.js'
import type { EmotionBinding } from '../emotions.js'
import { EMOTION_NAMES } from '../emotions.js'
import { buildNext, composeDescription, filterToolRefs } from '../guidance-refs.js'
import { DEFAULT_POSE_NAMES, getRegistrationGuide } from '../guidance.js'
import type { PlayerSettingsStore } from '../player/player-settings-store.js'
import { resolvePoseNames } from '../pose-registry/attachments.js'
import type { PoseRegistryStore } from '../pose-registry/store.js'
import { registerAppToolIfEnabled, registerToolIfEnabled } from '../registration.js'
import type { ToolDeps, ToolHandlerExtra } from '../types.js'
import { createErrorResponse } from '../utils.js'
import type { VrmRegistryStore } from './store.js'
import type { VrmModel } from './types.js'

interface PublicVrmEntry {
  id: string
  name: string
  speakerId: number
  isDefault: boolean
  vrmUrl: string
  vrmSizeBytes: number
  updatedAt: number
  emotionBindings?: EmotionBinding[]
  poses: string[]
}

export function registerVrmPublicTools(
  deps: ToolDeps,
  registry: VrmRegistryStore,
  poseRegistry: PoseRegistryStore,
  playerSettings?: PlayerSettingsStore
): void {
  const { server, disabledTools, config, ttsClient, engine } = deps

  registerToolIfEnabled(
    server,
    disabledTools,
    'start_here',
    {
      title: 'Start Here',
      description:
        'Call this first before using other vrm tools. Returns engine status, registered model summary, default model, pose names, fixed emotion names, and player settings.',
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (_args: Record<string, never>, extra: ToolHandlerExtra): Promise<CallToolResult> => {
      try {
        const visibility = resolveVrmVisibility(playerSettings, extra)
        const health = await ttsClient.checkHealth()
        const models = registry.listVisible(visibility)
        const defaultModel = registry.getDefault(visibility.userId)
        const effectiveSettings = playerSettings?.applyDefaults({}, visibility.userId) ?? {
          autoPlay: config.autoPlay,
          speedScale: config.defaultSpeedScale,
          usePublicVrms: true,
        }
        const structured: Record<string, unknown> = {
          engine: {
            id: engine.id,
            displayName: engine.displayName,
            connected: health.connected,
            version: health.version,
            url: health.url,
          },
          modelsCount: models.length,
          defaultModel: defaultModel
            ? {
                modelId: defaultModel.id,
                name: defaultModel.name,
                poses: resolvePoseNames(defaultModel.poses, poseRegistry),
              }
            : null,
          defaultPoses: DEFAULT_POSE_NAMES,
          emotions: EMOTION_NAMES,
          gaze: ['camera', 'away', 'front'],
          settings: {
            autoPlay: effectiveSettings.autoPlay,
            speedScale: effectiveSettings.speedScale,
          },
          ...(models.length === 0 ? { registrationGuide: getRegistrationGuide(false) } : {}),
        }
        const next =
          models.length === 0
            ? buildNext(disabledTools, [
                { tool: 'open_model_manager', text: 'Call vrm_open_model_manager with knowsHowToUse: true.' },
              ])
            : buildNext(disabledTools, [{ tool: 'speak_player', text: 'Use vrm_speak_player.' }])
        if (next) structured.next = next
        return {
          content: [{ type: 'text', text: JSON.stringify(structured, null, 2) }],
          structuredContent: structured,
        }
      } catch (error) {
        return createErrorResponse(error)
      }
    }
  )

  registerToolIfEnabled(
    server,
    disabledTools,
    'find_models',
    {
      title: 'Find VRM Models',
      description: composeDescription(
        disabledTools,
        'Find registered VRM models and valid pose names. Pass pose names only. Per-segment gaze values are camera, away, or front.',
        [
          {
            tool: 'speak_player',
            text: 'Use this when the user asks for a specific model or before passing modelId/segments[].pose to speak_player.',
          },
        ]
      ),
      inputSchema: {
        modelId: z.string().optional().describe('Exact VRM model ID to look up.'),
        query: z.string().optional().describe('Case-insensitive search text matched against model name or ID.'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (
      { modelId, query }: { modelId?: string; query?: string },
      extra: ToolHandlerExtra
    ): Promise<CallToolResult> => {
      try {
        const visibility = resolveVrmVisibility(playerSettings, extra)
        const models = filterModels(registry.listVisible(visibility), modelId, query).map((model) => ({
          modelId: model.id,
          name: model.name,
          isDefault: model.ownerUserId === visibility.userId && model.isDefault,
          poses: resolvePoseNames(model.poses, poseRegistry),
        }))
        const structured: Record<string, unknown> = {
          models,
          ...(models.length === 0 ? { registrationGuide: getRegistrationGuide(false) } : {}),
        }
        if (models.length === 0) {
          const next = buildNext(disabledTools, [
            {
              tool: 'open_model_manager',
              text: 'Call vrm_open_model_manager with knowsHowToUse: true, then ask the user to register a VRM model.',
            },
          ])
          if (next) structured.next = next
        }
        return {
          content: [{ type: 'text', text: JSON.stringify(structured, null, 2) }],
          structuredContent: structured,
        }
      } catch (error) {
        return createErrorResponse(error)
      }
    }
  )

  registerAppToolIfEnabled(
    server,
    disabledTools,
    'open_model_manager',
    {
      title: 'Open Model Manager',
      description:
        'Open the VRM model registration/edit UI. Use only when the user needs to register or edit a model. If the user already knows the UI, pass knowsHowToUse: true.',
      inputSchema: {
        modelId: z.string().optional().describe('VRM model ID to edit. Omit to open the registration screen.'),
        knowsHowToUse: z.boolean().optional().describe('Set true to omit detailed registration instructions.'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      _meta: { ui: { resourceUri: 'ui://speak-player/player.html' } },
    },
    async (
      {
        modelId,
        knowsHowToUse,
      }: {
        modelId?: string
        knowsHowToUse?: boolean
      },
      extra: ToolHandlerExtra
    ): Promise<CallToolResult> => {
      try {
        const visibility = resolveVrmVisibility(playerSettings, extra)
        if (modelId) {
          const model = registry.get(modelId)
          if (!model || model.ownerUserId !== visibility.userId) throw new Error(`VRM model not found: ${modelId}`)
        }
        const structured = {
          action: 'openModelManager',
          mode: modelId ? 'edit' : 'register',
          modelId,
          displayed: true,
          registrationGuide: getRegistrationGuide(knowsHowToUse),
        }
        return {
          content: [
            {
              type: 'text',
              text: `${modelId ? 'Model edit UI displayed.' : 'Model registration UI displayed.'}\n${structured.registrationGuide}`,
            },
          ],
          structuredContent: structured,
          _meta: structured,
        }
      } catch (error) {
        return createErrorResponse(error)
      }
    }
  )

  registerToolIfEnabled(
    server,
    disabledTools,
    'list_vrms',
    {
      title: 'List VRMs',
      description: composeDescription(
        disabledTools,
        'List registered VRM models. Pass segments[].pose as one of poses only; pose resource IDs are not accepted. Pass segments[].emotion as neutral/happy/angry/sad/relaxed/surprised/serious, and segments[].gaze as camera/away/front. Returns metadata only (no binary).',
        [
          {
            tool: 'speak_player',
            text: 'Use this before calling speak_player to discover valid modelId values, model pose names, and emotion bindings.',
          },
        ]
      ),
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (_args: Record<string, never>, extra: ToolHandlerExtra): Promise<CallToolResult> => {
      try {
        const visibility = resolveVrmVisibility(playerSettings, extra)
        const entries: PublicVrmEntry[] = registry.listVisible(visibility).map((model) => ({
          id: model.id,
          name: model.name,
          speakerId: model.speakerId,
          isDefault: model.ownerUserId === visibility.userId && model.isDefault,
          vrmUrl: getVrmModelUrl(config, model.id, { userId: visibility.userId }),
          vrmSizeBytes: model.vrmSizeBytes,
          updatedAt: model.updatedAt,
          emotionBindings: model.emotionBindings,
          poses: resolvePoseNames(model.poses, poseRegistry),
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

  registerToolIfEnabled(
    server,
    disabledTools,
    'set_default_model',
    {
      title: 'Set Default Model',
      description: composeDescription(
        disabledTools,
        'Set one of your own registered VRM models as the persistent default. Public models owned by other users cannot be set as the default. Returns the previous default so it can be restored.',
        [{ tool: 'speak_player', text: 'The default is used by speak_player when modelId is omitted.' }]
      ),
      inputSchema: {
        modelId: z
          .string()
          .describe(
            composeDescription(disabledTools, 'VRM model ID to set as the default.', [
              { tool: 'list_vrms', text: 'Discover IDs with vrm_list_vrms.' },
            ])
          ),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ modelId }: { modelId: string }, extra: ToolHandlerExtra): Promise<CallToolResult> => {
      try {
        const visibility = resolveVrmVisibility(playerSettings, extra)
        const previous = registry.getDefault(visibility.userId)
        const target = registry.getVisible(modelId, visibility)
        if (!target) throw new Error(`VRM model not found: ${modelId}`)
        // The registry default is per-owner, so a visible public model owned by another
        // user cannot be set as your default. Fail with a clear, actionable message
        // instead of the owner-scoped store throwing a misleading "VRM not found".
        if (target.ownerUserId !== visibility.userId) {
          throw new Error(
            `Cannot set "${target.name}" (${modelId}) as the default: it is a public model owned by another user. Only your own registered models can be set as the default.`
          )
        }
        const updated = registry.setDefault(modelId, visibility.userId)
        // Keep the player UI (which prefers activeModelId) in sync with the new default.
        playerSettings?.set({ activeModelId: updated.id }, visibility.userId)
        const previousDefault = previous ? { modelId: previous.id, name: previous.name } : null
        const structured = {
          newDefault: {
            modelId: updated.id,
            name: updated.name,
            poses: resolvePoseNames(updated.poses, poseRegistry),
          },
          previousDefault,
          appliesTo: [
            ...filterToolRefs(disabledTools, [
              { tool: 'speak_player', text: 'vrm_speak_player (when modelId is omitted)' },
            ]),
            'player UI model resolution',
            ...filterToolRefs(disabledTools, [{ tool: 'start_here', text: 'vrm_start_here display' }]),
          ],
        }
        const revertHint = previousDefault
          ? ` Previous default: "${previousDefault.name}" — restore it by calling this tool with modelId="${previousDefault.modelId}".`
          : ''
        const speakHint = filterToolRefs(disabledTools, [
          { tool: 'speak_player', text: ' vrm_speak_player will use it when modelId is omitted.' },
        ]).join('')
        return {
          content: [
            {
              type: 'text',
              text: `Default VRM model set to "${updated.name}".${speakHint}${revertHint}\n${JSON.stringify(structured, null, 2)}`,
            },
          ],
          structuredContent: structured,
        }
      } catch (error) {
        return createErrorResponse(error)
      }
    }
  )
}

function filterModels(models: VrmModel[], modelId: string | undefined, query: string | undefined): VrmModel[] {
  if (modelId?.trim()) return models.filter((model) => model.id === modelId.trim())
  const needle = query?.trim().toLowerCase()
  if (!needle) return models
  return models.filter((model) => model.id.toLowerCase().includes(needle) || model.name.toLowerCase().includes(needle))
}

function resolveVrmVisibility(playerSettings: PlayerSettingsStore | undefined, extra: ToolHandlerExtra | undefined) {
  const userId = resolveUserId(extra)
  const settings = playerSettings?.applyDefaults({}, userId)
  return { userId, usePublicVrms: settings?.usePublicVrms ?? true }
}
