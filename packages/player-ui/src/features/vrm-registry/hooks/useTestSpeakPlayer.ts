import type { App } from '@modelcontextprotocol/ext-apps'
import { useCallback, useEffect, useRef } from 'react'
import { base64ToBlobUrl } from '~/lib/binary'
import { parseToolJson } from '~/lib/toolJson'
import type { AudioQuery } from '~/types'
import type { LipSyncController } from '../../vrm-player/hooks/useLipSync'
import type { PoseSegment } from '../../vrm-player/utils/vrmPayload'

// 試聴用のサンプル文。短く中立な発話を 1 つランダムに選んで再生する。
const SAMPLE_PHRASES = [
  'こんにちは。',
  '今日もよろしくね。',
  'これはテスト音声です。',
  '準備はできた？',
  'うん、いい感じ。',
] as const

function pickRandom<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]
}

// プレビュー試聴用。永続的な <audio> を 1 つだけ作って lipSync に attach し、
// 話者切替のたびに src だけ差し替える。リクエスト ID で古い合成結果を破棄する。
export function useTestSpeakPlayer(app: App | null, lipSync: LipSyncController) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const blobUrlRef = useRef<string | null>(null)
  const requestIdRef = useRef(0)
  const appRef = useRef(app)
  appRef.current = app

  useEffect(() => {
    const audio = new Audio()
    audioRef.current = audio
    lipSync.attachAudio(audio)
    return () => {
      requestIdRef.current += 1
      audio.onended = null
      audio.onerror = null
      try {
        audio.pause()
      } catch {
        // 既に停止していてもエラーにしない。
      }
      audio.removeAttribute('src')
      audio.load()
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current)
        blobUrlRef.current = null
      }
      audioRef.current = null
      lipSync.setSegment(null)
      lipSync.dispose()
    }
  }, [lipSync])

  return useCallback(
    async (speakerId: number) => {
      const currentApp = appRef.current
      const audio = audioRef.current
      if (!currentApp || !audio) return
      const requestId = ++requestIdRef.current
      const text = pickRandom(SAMPLE_PHRASES)
      try {
        const result = await currentApp.callServerTool({
          name: '_resynthesize_for_player',
          arguments: { speakerId, text },
        })
        if (requestId !== requestIdRef.current) return
        const parsed = parseToolJson<{
          audioBase64: string
          audioMimeType?: string
          audioQuery?: AudioQuery
          speedScale?: number
        }>(result)
        try {
          audio.pause()
        } catch {
          // ignore
        }
        if (blobUrlRef.current) {
          URL.revokeObjectURL(blobUrlRef.current)
        }
        const url = base64ToBlobUrl(parsed.audioBase64, parsed.audioMimeType ?? 'audio/wav')
        blobUrlRef.current = url
        audio.src = url
        const segment: PoseSegment = {
          text,
          speaker: speakerId,
          audioQuery: parsed.audioQuery,
          speedScale: parsed.speedScale,
        }
        lipSync.setSegment(segment)
        lipSync.resumeContext()
        audio.onended = () => {
          if (requestId !== requestIdRef.current) return
          lipSync.setSegment(null)
        }
        audio.onerror = () => {
          if (requestId !== requestIdRef.current) return
          lipSync.setSegment(null)
        }
        try {
          await audio.play()
        } catch (error) {
          console.warn('[useTestSpeakPlayer] play failed:', error)
          lipSync.setSegment(null)
        }
      } catch (error) {
        console.warn('[useTestSpeakPlayer] synthesize failed:', error)
      }
    },
    [lipSync]
  )
}
