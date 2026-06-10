import { parseAudioQuery, parseStringInput } from '@kajidog/tts-client'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

// Re-export functions moved to tts-client (keeps existing './utils.js' imports working)
export { parseAudioQuery, parseStringInput }

export const createErrorResponse = (error: unknown): CallToolResult => ({
  content: [
    {
      type: 'text',
      text: `Error: ${error instanceof Error ? error.message : String(error)}`,
    },
  ],
  isError: true,
})
