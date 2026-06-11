import { useSyncExternalStore } from 'react'
import { NextIcon, PauseIcon, PlayIcon, PrevIcon } from '~/icons'

interface TransportBarProps {
  isPlaying: boolean
  canReplay: boolean
  hasSegments: boolean
  currentIndex: number | null
  totalSegments: number
  // 再生時刻はこのコンポーネントだけが購読し、親ツリーを 4Hz で再レンダーさせない。
  subscribeTime: (listener: () => void) => () => void
  getTimeSnapshot: () => { currentTime: number; duration: number }
  onPlay: () => void
  onPause: () => void
  onPrev: () => void
  onNext: () => void
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '--:--'
  const rounded = Math.floor(seconds)
  const minutes = Math.floor(rounded / 60)
  const rest = rounded % 60
  return `${minutes.toString().padStart(2, '0')}:${rest.toString().padStart(2, '0')}`
}

export function TransportBar({
  isPlaying,
  canReplay,
  hasSegments,
  currentIndex,
  totalSegments,
  subscribeTime,
  getTimeSnapshot,
  onPlay,
  onPause,
  onPrev,
  onNext,
}: TransportBarProps) {
  const { currentTime, duration } = useSyncExternalStore(subscribeTime, getTimeSnapshot)
  const trackLabel = totalSegments > 0 ? `${(currentIndex ?? 0) + 1}/${totalSegments}` : '-/0'

  return (
    <div className="flex min-w-0 shrink-0 items-center gap-2">
      <div className="whitespace-nowrap text-xs tabular-nums text-[var(--ui-text-secondary)]">
        {trackLabel} · {formatTime(currentTime)} / {formatTime(duration)}
      </div>
      <button
        type="button"
        title="Previous"
        disabled={!hasSegments}
        onClick={onPrev}
        className="flex h-9 w-9 items-center justify-center rounded-md border border-[var(--ui-border)] bg-[var(--ui-button-bg)] text-[var(--ui-text)] hover:border-[var(--ui-accent)] disabled:opacity-40"
      >
        <PrevIcon />
      </button>
      <button
        type="button"
        title={isPlaying ? 'Pause' : canReplay ? 'Replay' : 'Play'}
        disabled={!hasSegments}
        onClick={isPlaying ? onPause : onPlay}
        className="flex h-10 w-10 items-center justify-center rounded-md border border-[var(--ui-accent)] bg-[var(--ui-accent)] text-white hover:bg-[var(--ui-accent-hover)] disabled:opacity-40"
      >
        {isPlaying ? <PauseIcon /> : <PlayIcon />}
      </button>
      <button
        type="button"
        title="Next"
        disabled={!hasSegments}
        onClick={onNext}
        className="flex h-9 w-9 items-center justify-center rounded-md border border-[var(--ui-border)] bg-[var(--ui-button-bg)] text-[var(--ui-text)] hover:border-[var(--ui-accent)] disabled:opacity-40"
      >
        <NextIcon />
      </button>
    </div>
  )
}
