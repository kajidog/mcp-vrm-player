import type { App } from '@modelcontextprotocol/ext-apps'
import { FullscreenExitIcon, FullscreenIcon } from '~/icons'
import { usePlayerChrome } from '../PlayerChromeContext'
import type { PlayerTransport } from '../types'
import { ModelStrip } from './ModelStrip'
import { TransportBar } from './TransportBar'

interface PlayerHeaderProps {
  app: App | null
  activeModelId: string | null
  loadingModel: boolean
  listRefreshKey: number
  transport: PlayerTransport
  onSwitchVrm: (modelId: string) => void
}

export function PlayerHeader({
  app,
  activeModelId,
  loadingModel,
  listRefreshKey,
  transport,
  onSwitchVrm,
}: PlayerHeaderProps) {
  const chrome = usePlayerChrome()
  return (
    <div className="flex items-center gap-2 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface)] px-2 py-2">
      <ModelStrip
        app={app}
        activeModelId={activeModelId}
        busy={loadingModel}
        refreshKey={listRefreshKey}
        onSelect={onSwitchVrm}
        onAdd={chrome.onAddModel}
        onEdit={chrome.onEditModel}
      />
      <TransportBar
        isPlaying={transport.isPlaying}
        canReplay={transport.canReplay}
        hasSegments={transport.hasSegments}
        currentIndex={transport.currentIndex}
        totalSegments={transport.totalSegments}
        subscribeTime={transport.subscribeTime}
        getTimeSnapshot={transport.getTimeSnapshot}
        onPlay={transport.onPlay}
        onPause={transport.onPause}
        onPrev={transport.onPrev}
        onNext={transport.onNext}
      />
      <div className="flex shrink-0 items-center gap-1">
        {loadingModel ? <div className="vv-spinner-sm" /> : null}
        {chrome.canFullscreen ? (
          <button
            type="button"
            title={chrome.fullscreen ? 'Inline' : 'Fullscreen'}
            onClick={chrome.onToggleFullscreen}
            className="flex h-9 w-9 items-center justify-center rounded-md border border-[var(--ui-border)] bg-[var(--ui-button-bg)] text-[var(--ui-text)] hover:border-[var(--ui-accent)]"
          >
            {chrome.fullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
          </button>
        ) : null}
      </div>
    </div>
  )
}
