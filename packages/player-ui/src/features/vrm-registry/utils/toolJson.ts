import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

interface TextContent {
  type: 'text'
  text: string
}

function getTextPayload(content: unknown): string | null {
  if (!Array.isArray(content)) return null
  const text = content.find((c) => (c as { type?: string }).type === 'text') as TextContent | undefined
  return text?.type === 'text' ? text.text : null
}

export function parseToolJson<T>(result: CallToolResult): T {
  if (result.isError) {
    throw new Error(getTextPayload(result.content) ?? 'Tool call failed')
  }
  const text = getTextPayload(result.content)
  if (!text) throw new Error('Tool returned no text content')
  return JSON.parse(text) as T
}
