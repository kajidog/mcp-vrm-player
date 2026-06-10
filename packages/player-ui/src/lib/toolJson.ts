import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

interface TextContent {
  type: 'text'
  text: string
}

/** CallToolResult の content 配列から最初の text コンテンツを取り出す。 */
export function getTextPayload(content: unknown): string | null {
  if (!Array.isArray(content)) return null
  const textContent = content.find((c) => (c as { type?: string }).type === 'text') as TextContent | undefined
  return textContent?.type === 'text' ? textContent.text : null
}

/** isError=true の場合は text コンテンツをエラーメッセージとして送出する。 */
export function assertNoToolError(result: { isError?: boolean; content?: unknown }): void {
  if (!result.isError) return
  const payload = getTextPayload(result.content)
  throw new Error(payload ?? 'Tool call failed')
}

/** ツール結果の text コンテンツを JSON としてパースする。isError 時は例外送出。 */
export function parseToolJson<T>(result: CallToolResult): T {
  assertNoToolError(result)
  const text = getTextPayload(result.content)
  if (!text) throw new Error('Tool returned no text content')
  return JSON.parse(text) as T
}
