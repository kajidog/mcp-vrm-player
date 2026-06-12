import type { App } from '@modelcontextprotocol/ext-apps'
import type { PoseSource } from '~/features/poses/types'
import { usePlayerChrome } from '../PlayerChromeContext'
import type { MouthRef } from '../hooks/useLipSync'
import type { PlayerTransport, VrmPlayerState, VrmSource } from '../types'
import { PlayerHeader } from './PlayerHeader'
import { RenderSettingsButton, RenderSettingsPanel } from './RenderSettingsPanel'
import { VRMCanvas } from './VRMCanvas'

interface VRMPlayerProps {
  app: App | null
  source: VrmSource | null
  loadingModel: boolean
  pose?: PoseSource | null
  expression?: { name: string; weight: number } | null
  speechText: string | null
  gaze: VrmPlayerState['currentSegmentGaze']
  activeModelId: string | null
  listRefreshKey: number
  mouthRef: MouthRef
  transport: PlayerTransport
  onSwitchVrm: (modelId: string) => Promise<void>
  onModelError: (message: string) => void
  onVrmLoadStart: () => void
  onVrmLoaded: () => void
}

export function VRMPlayer({
  app,
  source,
  loadingModel,
  pose,
  expression,
  speechText,
  gaze,
  activeModelId,
  listRefreshKey,
  mouthRef,
  transport,
  onSwitchVrm,
  onModelError,
  onVrmLoadStart,
  onVrmLoaded,
}: VRMPlayerProps) {
  const chrome = usePlayerChrome()
  return (
    <div className={chrome.fullscreen ? 'flex h-full min-h-0 flex-col gap-2 p-2' : 'space-y-3 p-3'}>
      <PlayerHeader
        app={app}
        activeModelId={activeModelId}
        loadingModel={loadingModel}
        listRefreshKey={listRefreshKey}
        transport={transport}
        onSwitchVrm={(modelId) => {
          void onSwitchVrm(modelId)
        }}
      />
      {/* 表示設定の歯車ボタンとドロワーはキャンバス領域に absolute で重ねるため relative にする。 */}
      <div className={chrome.fullscreen ? 'relative min-h-0 flex-1' : 'relative'}>
        <VRMCanvas
          app={app}
          source={source}
          onError={onModelError}
          pose={pose}
          expression={expression}
          speechText={speechText}
          gaze={gaze}
          currentIndex={transport.currentIndex}
          totalSegments={transport.totalSegments}
          fullscreen={chrome.fullscreen}
          hasSegments={transport.hasSegments}
          mouthRef={mouthRef}
          onPrev={transport.onPrev}
          onNext={transport.onNext}
          onLoadStart={onVrmLoadStart}
          onLoaded={onVrmLoaded}
        />
        {!chrome.renderPanelOpen ? <RenderSettingsButton onOpen={chrome.onOpenRenderPanel} /> : null}
        {chrome.renderPanelOpen ? (
          <RenderSettingsPanel
            app={app}
            onClose={chrome.onCloseRenderPanel}
            onOpenServerSettings={chrome.onOpenServerSettings}
            onOpenPoses={chrome.onOpenPoses}
          />
        ) : null}
      </div>
    </div>
  )
}
