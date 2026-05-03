import { useState } from 'react'
import { VRMPlayer } from './features/vrm-player/components/VRMPlayer'
import { useVrmPlayerApp } from './features/vrm-player/hooks/useVrmPlayerApp'
import { VrmListView } from './features/vrm-registry/VrmListView'
import { VrmRegisterView } from './features/vrm-registry/VrmRegisterView'

type View = 'player' | 'list' | 'register' | 'edit'

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
  const [view, setView] = useState<View>('player')
  const [editingModelId, setEditingModelId] = useState<string | null>(null)
  const player = useVrmPlayerApp()

  if (player.status === 'connecting') {
    return <LoadingView label="Connecting..." />
  }

  if (!player.isReadyForDisplay || !player.app) {
    // App ハンドル未確立のあいだはレイアウトを描かない（Connection error 表示は下の error 分岐で）。
    if (player.status === 'error') return <ErrorView message={player.errorMsg} />
    return null
  }

  if (view === 'list') {
    return (
      <VrmListView
        app={player.app}
        onBack={() => setView('player')}
        onAdd={() => {
          setEditingModelId(null)
          setView('register')
        }}
        onEdit={(modelId) => {
          setEditingModelId(modelId)
          setView('edit')
        }}
      />
    )
  }

  if (view === 'register' || view === 'edit') {
    return (
      <VrmRegisterView
        app={player.app}
        modelId={view === 'edit' ? editingModelId : null}
        onBack={() => setView('list')}
        onSaved={() => {
          setEditingModelId(null)
          setView('list')
        }}
      />
    )
  }

  if (player.status === 'error') {
    return <ErrorView message={player.errorMsg} />
  }

  return (
    <VRMPlayer
      source={player.source}
      loadingModel={player.loadingModel}
      onLocalFile={player.loadLocalVrmFile}
      onModelError={player.setModelError}
      onOpenMenu={() => setView('list')}
    />
  )
}
