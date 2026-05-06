import type { App } from '@modelcontextprotocol/ext-apps'
import { useEffect, useState } from 'react'
import { parseToolJson } from '../utils/toolJson'

export interface SpeakerStyle {
  id: number
  name: string
  characterName: string
  uuid: string
}

export function useSpeakers(app: App | null) {
  const [speakers, setSpeakers] = useState<SpeakerStyle[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!app) return
    let cancelled = false
    setLoading(true)
    setError(null)
    void app
      .callServerTool({ name: '_get_speakers_for_player', arguments: {} })
      .then((result) => {
        if (cancelled) return
        const list = parseToolJson<SpeakerStyle[]>(result)
        setSpeakers(Array.isArray(list) ? list : [])
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [app])

  return { speakers, loading, error }
}
