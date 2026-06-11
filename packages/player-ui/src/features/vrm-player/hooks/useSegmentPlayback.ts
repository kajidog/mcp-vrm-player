import { useCallback, useEffect, useRef, useState } from 'react'
import type { PoseSource } from '~/features/poses/types'
import { base64ToBlobUrl } from '~/lib/binary'
import type { VrmPlayerState } from '../types'
import type { PoseSegment } from '../utils/vrmPayload'
import type { LipSyncController } from './useLipSync'

interface UseSegmentPlaybackOptions {
  lipSync: LipSyncController
  resolvePose: (poseName: string | undefined, seed?: number) => PoseSource | null
  resolveExpression: (segment: PoseSegment | null) => VrmPlayerState['expression']
  onError: (message: string) => void
  /** セグメントの再生が実際に始まった時に呼ばれる。前回のエラー表示のクリア等に使う。 */
  onPlaybackStart?: () => void
  /** 裏で進行中の後続セグメント音声取得があればその Promise を返す（なければ null）。 */
  waitForPendingAudio?: () => Promise<unknown> | null
}

export function useSegmentPlayback({
  lipSync,
  resolvePose,
  resolveExpression,
  onError,
  onPlaybackStart,
  waitForPendingAudio,
}: UseSegmentPlaybackOptions) {
  const [pose, setPose] = useState<PoseSource | null>(null)
  const [expression, setExpression] = useState<VrmPlayerState['expression']>(null)
  const [segments, setSegments] = useState<PoseSegment[]>([])
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState<number | null>(null)
  const [paused, setPaused] = useState(false)
  // 再生時刻は React state にせず外部ミニストアで配信する。timeupdate（約4Hz）のたびに
  // 3D シーンを含むプレイヤー全体が再レンダーされるのを防ぎ、時刻表示だけが購読する。
  const timeListenersRef = useRef(new Set<() => void>())
  const timeSnapshotRef = useRef({ currentTime: 0, duration: 0 })
  const publishTime = (patch: Partial<{ currentTime: number; duration: number }>) => {
    const prev = timeSnapshotRef.current
    const next = { ...prev, ...patch }
    if (next.currentTime === prev.currentTime && next.duration === prev.duration) return
    timeSnapshotRef.current = next
    for (const listener of timeListenersRef.current) listener()
  }
  const subscribeTime = useCallback((listener: () => void) => {
    timeListenersRef.current.add(listener)
    return () => {
      timeListenersRef.current.delete(listener)
    }
  }, [])
  const getTimeSnapshot = useCallback(() => timeSnapshotRef.current, [])
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const audioUrlRef = useRef<string | null>(null)
  const segmentsRef = useRef<PoseSegment[]>([])
  const playbackIndexRef = useRef(0)
  const playbackVersionRef = useRef(0)

  const releaseAudioUrl = () => {
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current)
      audioUrlRef.current = null
    }
  }

  const stopPlayback = () => {
    setPaused(false)
    const audio = audioRef.current
    if (audio) {
      audio.onended = null
      audio.onerror = null
      try {
        audio.pause()
      } catch {
        // 既に再生していなくてもエラーにしない。
      }
      audio.removeAttribute('src')
      audio.load()
    }
    releaseAudioUrl()
    lipSync.setSegment(null)
    publishTime({ currentTime: 0, duration: 0 })
    setExpression(null)
    setCurrentSegmentIndex(null)
  }

  const failPlayback = (message: string) => {
    const list = segmentsRef.current
    stopPlayback()
    segmentsRef.current = list
    setSegments(list)
    setPose(resolvePose('idle'))
    onError(message)
  }

  const playSegmentAt = (index: number, version: number): void => {
    if (version !== playbackVersionRef.current) return
    setPaused(false)
    const list = segmentsRef.current
    const current = list[index]
    if (!current) {
      playbackIndexRef.current = list.length
      setCurrentSegmentIndex(null)
      setPose(resolvePose('idle'))
      setExpression(null)
      return
    }

    playbackIndexRef.current = index
    setCurrentSegmentIndex(index)
    publishTime({ currentTime: 0, duration: 0 })
    setPose(resolvePose(current.pose ?? 'idle', index))
    setExpression(resolveExpression(current))

    const audio = audioRef.current
    releaseAudioUrl()

    if (!audio) {
      failPlayback('音声プレイヤーの初期化に失敗しました。')
      return
    }
    if (!current.audioBase64) {
      // 先頭セグメントのみ先行取得して再生開始するため、再生や「次へ」が裏の取得を
      // 追い越すことがある。進行中の取得があれば完了を待ってから再試行し、
      // それでも音声がない場合のみエラーにする。
      const pending = waitForPendingAudio?.()
      if (pending) {
        void pending
          .then(() => {
            if (version !== playbackVersionRef.current) return
            if (!segmentsRef.current[index]?.audioBase64) {
              failPlayback(`セグメント ${index + 1} の音声データがありません。`)
              return
            }
            playSegmentAt(index, version)
          })
          .catch(() => {
            // 取得失敗は useVrmPlayerApp 側の catch がエラー表示するため、ここでは何もしない。
          })
        return
      }
      failPlayback(`セグメント ${index + 1} の音声データがありません。`)
      return
    }

    let url: string
    try {
      url = base64ToBlobUrl(current.audioBase64, current.audioMimeType ?? 'audio/wav')
    } catch {
      // base64 が壊れている場合、onended 連鎖の中で未捕捉例外にせずエラー表示に落とす。
      failPlayback(`セグメント ${index + 1} の音声データを読み込めませんでした。`)
      return
    }
    audioUrlRef.current = url
    audio.src = url
    audio.onended = () => {
      if (version !== playbackVersionRef.current) return
      publishTime({ currentTime: Number.isFinite(audio.duration) ? audio.duration : 0 })
      playSegmentAt(index + 1, version)
    }
    audio.onerror = () => {
      if (version !== playbackVersionRef.current) return
      failPlayback(`セグメント ${index + 1} の音声を読み込めませんでした。`)
    }
    lipSync.setSegment(current)
    lipSync.resumeContext()
    // 再生が始まる時点で前回のエラー表示を片付ける（play() が失敗すれば改めてエラーになる）。
    onPlaybackStart?.()
    void audio.play().catch((error) => {
      if (version !== playbackVersionRef.current) return
      failPlayback(`音声の再生に失敗しました: ${error instanceof Error ? error.message : String(error)}`)
    })
  }

  const startPlayback = (next: PoseSegment[], options: { autoPlay?: boolean } = {}) => {
    stopPlayback()
    segmentsRef.current = next
    setSegments(next)
    playbackVersionRef.current += 1
    if (next.length === 0) {
      playbackIndexRef.current = 0
      setCurrentSegmentIndex(null)
      setPose(null)
      setExpression(null)
      return
    }
    if (options.autoPlay === false) {
      playbackIndexRef.current = 0
      setCurrentSegmentIndex(null)
      setPose(resolvePose('idle'))
      setExpression(null)
      return
    }
    playSegmentAt(0, playbackVersionRef.current)
  }

  const updateSegments = (next: PoseSegment[]) => {
    segmentsRef.current = next
    setSegments(next)
    const currentSegment = currentSegmentIndex !== null ? next[currentSegmentIndex] : null
    if (currentSegment) {
      setExpression(resolveExpression(currentSegment))
    }
  }

  const play = () => {
    const list = segmentsRef.current
    if (list.length === 0) return

    if (paused) {
      setPaused(false)
      const audio = audioRef.current
      if (audio?.src && audio.paused && currentSegmentIndex !== null) {
        lipSync.setSegment(list[currentSegmentIndex] ?? null)
        lipSync.resumeContext()
        void audio.play().catch((error) => {
          failPlayback(`音声の再生に失敗しました: ${error instanceof Error ? error.message : String(error)}`)
        })
        return
      }
      // 一時停止中に audio.src が失われていた場合は、現在のセグメントから再生し直す。
      if (currentSegmentIndex !== null) {
        jumpTo(currentSegmentIndex)
        return
      }
    }

    if (currentSegmentIndex === null) {
      startPlayback(list)
    }
  }

  const pause = () => {
    if (currentSegmentIndex === null || paused) return
    const audio = audioRef.current
    if (audio?.src && !audio.paused) {
      audio.pause()
      lipSync.setSegment(null)
      setPaused(true)
    }
  }

  const jumpTo = (index: number) => {
    const list = segmentsRef.current
    if (list.length === 0) return
    stopPlayback()
    playbackVersionRef.current += 1
    segmentsRef.current = list
    setSegments(list)
    playSegmentAt(Math.min(Math.max(index, 0), list.length - 1), playbackVersionRef.current)
  }

  const prev = () => {
    const current = currentSegmentIndex ?? playbackIndexRef.current
    jumpTo(current - 1)
  }

  const next = () => {
    const current = currentSegmentIndex ?? -1
    jumpTo(current + 1)
  }

  const clearSegments = () => {
    stopPlayback()
    segmentsRef.current = []
    setSegments([])
    setCurrentSegmentIndex(null)
    setPose(null)
  }

  const refreshCurrentVisuals = () => {
    const currentSegment = currentSegmentIndex !== null ? segmentsRef.current[currentSegmentIndex] : null
    setPose(resolvePose(currentSegment?.pose ?? 'idle', currentSegmentIndex ?? undefined))
    setExpression(resolveExpression(currentSegment))
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: stopPlayback uses refs only and is stable across renders
  useEffect(() => {
    const audio = new Audio()
    const updateTime = () => publishTime({ currentTime: Number.isFinite(audio.currentTime) ? audio.currentTime : 0 })
    const updateDuration = () => publishTime({ duration: Number.isFinite(audio.duration) ? audio.duration : 0 })
    audio.addEventListener('timeupdate', updateTime)
    audio.addEventListener('loadedmetadata', updateDuration)
    audioRef.current = audio
    lipSync.attachAudio(audio)
    return () => {
      stopPlayback()
      audio.removeEventListener('timeupdate', updateTime)
      audio.removeEventListener('loadedmetadata', updateDuration)
      audioRef.current = null
      lipSync.dispose()
    }
  }, [])

  return {
    pose,
    expression,
    segments,
    segmentsRef,
    currentSegmentIndex,
    subscribeTime,
    getTimeSnapshot,
    isPlaying: currentSegmentIndex !== null && !paused,
    canReplay: currentSegmentIndex === null && segments.length > 0,
    hasSegments: segments.length > 0,
    currentSegmentText: currentSegmentIndex !== null ? (segments[currentSegmentIndex]?.text ?? null) : null,
    currentSegmentGaze: currentSegmentIndex !== null ? (segments[currentSegmentIndex]?.gaze ?? null) : null,
    startPlayback,
    updateSegments,
    stopPlayback,
    clearSegments,
    refreshCurrentVisuals,
    play,
    pause,
    prev,
    next,
  }
}
