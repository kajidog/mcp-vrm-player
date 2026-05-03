import type { App } from '@modelcontextprotocol/ext-apps'
import type { VrmPayload } from '../types'

interface TextContent {
  type: 'text'
  text: string
}

// CallToolResult の content 配列から最初の text コンテンツを取り出す。
function getTextPayload(content: unknown): string | null {
  if (!Array.isArray(content)) return null
  const textContent = content.find((c) => (c as { type?: string }).type === 'text') as TextContent | undefined
  return textContent?.type === 'text' ? textContent.text : null
}

// isError=true の場合は text コンテンツをエラーメッセージとして送出する。
function assertNoToolError(result: { isError?: boolean; content?: unknown }): void {
  if (!result.isError) return
  const payload = getTextPayload(result.content)
  throw new Error(payload ?? 'Tool call failed')
}

/**
 * サーバ側の `_get_default_vrm_for_player` を叩き、デフォルト VRM を取得する。
 * デフォルトが未設定の場合はサーバが空 JSON `{}` を返すため、ここでは null を返す。
 * 呼び出し側はこの null を「デフォルトなし＝空表示」として扱う。
 */
export async function fetchDefaultVrmOnServer(app: App): Promise<VrmPayload | null> {
  const result = await app.callServerTool({
    name: '_get_default_vrm_for_player',
    arguments: {},
  })
  assertNoToolError(result)

  const payload = getTextPayload(result.content)
  if (!payload) return null

  const parsed = JSON.parse(payload) as {
    vrmBase64?: string
    vrmMimeType?: string
  }

  // vrmBase64 が無い＝サーバ側でデフォルトが用意されていない。
  if (!parsed.vrmBase64) return null
  return {
    vrmBase64: parsed.vrmBase64,
    vrmMimeType: parsed.vrmMimeType ?? 'model/gltf-binary',
  }
}
