import { createContext, useContext } from 'react'

/**
 * プレイヤー画面の「チューム」= 画面遷移・パネル開閉・表示モードに関する状態と操作。
 *
 * これらは McpApp が所有する view 状態に紐づくが、実際に使うのは
 * PlayerHeader / VRMPlayer といった深い階層のコンポーネントなので、
 * VRMPlayer → PlayerHeader と素通しで引き回さずに Context で配る。
 * モデルやセグメントなどのデータ系 prop は従来どおり明示的に渡す。
 */
export interface PlayerChrome {
  fullscreen: boolean
  canFullscreen: boolean
  renderPanelOpen: boolean
  onToggleFullscreen: () => void
  onOpenRenderPanel: () => void
  onCloseRenderPanel: () => void
  onOpenServerSettings: () => void
  onOpenPoses: () => void
  onAddModel: () => void
  onEditModel: (modelId: string) => void
}

const noop = () => {}

// Provider 外（プレビュー用途など）で使われた場合は「チューム無し」として振る舞う。
const defaultChrome: PlayerChrome = {
  fullscreen: false,
  canFullscreen: false,
  renderPanelOpen: false,
  onToggleFullscreen: noop,
  onOpenRenderPanel: noop,
  onCloseRenderPanel: noop,
  onOpenServerSettings: noop,
  onOpenPoses: noop,
  onAddModel: noop,
  onEditModel: noop,
}

export const PlayerChromeContext = createContext<PlayerChrome>(defaultChrome)

export function usePlayerChrome(): PlayerChrome {
  return useContext(PlayerChromeContext)
}
