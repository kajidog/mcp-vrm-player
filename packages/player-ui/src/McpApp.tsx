import { VRMPlayer } from './features/vrm-player/components/VRMPlayer'
import { useVrmPlayerApp } from './features/vrm-player/hooks/useVrmPlayerApp'

function LoadingView({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 p-3">
      <div className="vv-spinner" />
      {label}
    </div>
  )
}

function ErrorView({ message }: { message: string }) {
  return (
    <div className="space-y-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
      <div className="font-semibold">VRM を表示できませんでした</div>
      <div>{message}</div>
    </div>
  )
}

export function McpApp() {
  const player = useVrmPlayerApp()

  if (player.status === 'connecting') {
    return <LoadingView label="Connecting..." />
  }

  if (player.status === 'error') {
    return <ErrorView message={player.errorMsg} />
  }

  if (!player.isReadyForDisplay) {
    return null
  }

  return (
    <VRMPlayer
      source={player.source}
      loadingModel={player.loadingModel}
      onLocalFile={player.loadLocalVrmFile}
      onModelError={player.setModelError}
    />
  )
}
