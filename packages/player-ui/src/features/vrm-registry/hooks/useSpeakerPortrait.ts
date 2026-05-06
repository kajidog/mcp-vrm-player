import type { App } from '@modelcontextprotocol/ext-apps'
import { useEffect, useRef, useState } from 'react'
import { parseToolJson } from '../utils/toolJson'

// 話者ポートレート（キャラクター画像）のフェッチ + uuid 単位のメモリキャッシュ。
export function useSpeakerPortrait(app: App | null, uuid: string | null) {
  const [portraits, setPortraits] = useState<Record<string, string | null>>({})
  const inFlight = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!app || !uuid) return
    if (portraits[uuid] !== undefined) return
    if (inFlight.current.has(uuid)) return
    inFlight.current.add(uuid)
    let cancelled = false
    void app
      .callServerTool({ name: '_get_speaker_icon_for_player', arguments: { speakerUuid: uuid } })
      .then((result) => {
        if (cancelled) return
        const parsed = parseToolJson<{ portrait?: string | null }>(result)
        setPortraits((prev) => ({ ...prev, [uuid]: parsed.portrait ?? null }))
      })
      .catch(() => {
        if (cancelled) return
        setPortraits((prev) => ({ ...prev, [uuid]: null }))
      })
      .finally(() => {
        inFlight.current.delete(uuid)
      })
    return () => {
      cancelled = true
    }
  }, [app, uuid, portraits])

  return uuid ? (portraits[uuid] ?? null) : null
}
