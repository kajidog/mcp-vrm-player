import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import * as z from 'zod'
import { registerAppToolIfEnabled } from '../registration.js'
import { createErrorResponse } from '../utils.js'
import type { PlayerUIToolContext } from './context.js'

const DEFAULT_TEST_TEXT = 'こんにちは、これはテスト音声です。'

/**
 * Phase 3: VRM 登録/編集画面の「音声テスト」ボタン用ツール。
 *
 * speak_player を流用しないのは、合成テストは public な発話ツールとは責務が違い、
 * session-state への保存や viewUUID 発行など余計な副作用が走るのを避けるため。
 * 結果は base64 オーディオのみ返す。
 */
export function registerTestSpeakTools(context: PlayerUIToolContext): void {
  const { deps, shared } = context
  const { server, disabledTools, config } = deps
  const { playerResourceUri, synthesizeWithCache } = shared

  registerAppToolIfEnabled(
    server,
    disabledTools,
    '_test_speak_for_player',
    {
      title: 'Test Speak (Player)',
      description:
        'Synthesize a short test phrase for the given speaker and return base64 audio. Only callable from the app UI.',
      inputSchema: {
        speakerId: z.number().describe('Speaker ID to use for synthesis'),
        text: z.string().optional().describe('Optional text. Defaults to a short test phrase.'),
      },
      _meta: {
        ui: { resourceUri: playerResourceUri, visibility: ['app'] },
      },
    },
    async ({ speakerId, text }: { speakerId: number; text?: string }): Promise<CallToolResult> => {
      try {
        const finalText = (text ?? '').trim() || DEFAULT_TEST_TEXT
        const result = await synthesizeWithCache({
          text: finalText,
          speaker: speakerId,
          speedScale: config.defaultSpeedScale,
        })
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                audioBase64: result.audioBase64,
                audioMimeType: 'audio/wav',
                text: finalText,
                speakerId,
                speakerName: result.speakerName,
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
