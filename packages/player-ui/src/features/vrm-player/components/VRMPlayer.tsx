import type { App } from '@modelcontextprotocol/ext-apps'
import { useEffect, useRef, useState } from 'react'
import type { PosePresetId } from '../../poses/presets'
import { POSE_PRESETS } from '../../poses/presets'
import { fetchVrmListOnServer } from '../hooks/vrmPlayerToolClient'
import type { VrmSource } from '../types'
import { VRMCanvas } from './VRMCanvas'

interface VRMPlayerProps {
  app: App | null
  source: VrmSource | null
  loadingModel: boolean
  // 現在適用したいポーズID。プリセット名と一致しなければ無視（idle 扱い）。
  pose?: string
  // 吹き出しに出す現在発話中のセグメントテキスト（再生していなければ null）。
  speechText: string | null
  // 表示中の登録モデルID（同じモデルはピッカーでハイライト）。
  activeModelId: string | null
  onModelError: (message: string) => void
  onSwitchVrm: (modelId: string) => Promise<void>
  // ヘッダ右の「メニュー」ボタン押下時に呼ばれる。VRM 一覧画面への遷移用。
  // 渡されない場合はボタンを描画しない。
  onOpenMenu?: () => void
}

interface VrmListEntry {
  id: string
  name: string
  speakerId: number
  isDefault?: boolean
}

// 文字列を PosePresetId に絞り込む。未知のプリセットは undefined を返し、VRMScene 側で idle として扱う。
function asPresetId(value: string | undefined): PosePresetId | undefined {
  if (!value) return undefined
  return value in POSE_PRESETS ? (value as PosePresetId) : undefined
}

/**
 * 登録済み VRM 一覧を出すドロップダウン。
 * 1 件もなければボタンを無効化し、メニューから「+ 追加」へ誘導する。
 */
function VrmModelPicker({
  app,
  activeModelId,
  busy,
  onSelect,
  refreshKey,
}: {
  app: App | null
  activeModelId: string | null
  busy: boolean
  onSelect: (modelId: string) => void
  refreshKey: number
}) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<VrmListEntry[]>([])
  const [loading, setLoading] = useState(false)
  const wrapRef = useRef<HTMLDivElement | null>(null)

  // 開いた瞬間 / refreshKey が更新された瞬間にリフレッシュする。
  // refreshKey はメニュー画面遷移後に親側で +1 されて伝わるため、依存に含める必要がある。
  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshKey is a parent-controlled bump used only to retrigger this effect
  useEffect(() => {
    if (!app || !open) return
    let cancelled = false
    setLoading(true)
    fetchVrmListOnServer(app)
      .then((list) => {
        if (!cancelled) setItems(list)
      })
      .catch(() => {
        if (!cancelled) setItems([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [app, open, refreshKey])

  // 外側クリックで閉じる。
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (!wrapRef.current) return
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        disabled={busy || !app}
        onClick={() => setOpen((v) => !v)}
        className="rounded-md border border-[var(--ui-border)] bg-[var(--ui-button-bg)] px-2 py-1 text-xs text-[var(--ui-text)] hover:border-[var(--ui-accent)] disabled:opacity-50"
      >
        モデル切替 ▾
      </button>
      {open ? (
        <div className="absolute right-0 z-10 mt-1 max-h-60 w-56 overflow-auto rounded-md border border-[var(--ui-border)] bg-[var(--ui-surface)] py-1 shadow-lg">
          {loading ? (
            <div className="flex items-center gap-2 px-3 py-2 text-xs text-[var(--ui-text-secondary)]">
              <div className="vv-spinner-sm" /> 読み込み中…
            </div>
          ) : items.length === 0 ? (
            <div className="px-3 py-2 text-xs text-[var(--ui-text-secondary)]">登録済み VRM がありません</div>
          ) : (
            items.map((item) => {
              const active = item.id === activeModelId
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setOpen(false)
                    if (!active) onSelect(item.id)
                  }}
                  className={`block w-full truncate px-3 py-2 text-left text-xs hover:bg-[var(--ui-button-bg)] disabled:opacity-50 ${
                    active ? 'font-semibold text-[var(--ui-accent)]' : 'text-[var(--ui-text)]'
                  }`}
                >
                  {item.name}
                  {item.isDefault ? <span className="ml-1 text-[10px] opacity-70">（デフォルト）</span> : null}
                  <span className="ml-1 text-[10px] text-[var(--ui-text-secondary)]">話者{item.speakerId}</span>
                </button>
              )
            })
          )}
        </div>
      ) : null}
    </div>
  )
}

/**
 * Player UI のレイアウト。ヘッダ（ラベル/状態/モデル切替）と
 * 3D プレビュー（VRMCanvas）を並べる。
 * source が null のときも Canvas は常に出すので「空の空間」が表示される。
 */
export function VRMPlayer({
  app,
  source,
  loadingModel,
  pose,
  speechText,
  activeModelId,
  onModelError,
  onSwitchVrm,
  onOpenMenu,
}: VRMPlayerProps) {
  const presetPose = asPresetId(pose)
  // モデル一覧をリスト/登録系の操作後にリフレッシュさせるためのカウンタ。
  // メニュー画面から戻ってきた時に新規追加分が反映されないと体験が悪いので、開閉のたびに +1 する。
  const [listRefreshKey, setListRefreshKey] = useState(0)

  return (
    <div className="space-y-3 p-3">
      <div className="flex items-center justify-between rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 py-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-[var(--ui-text)]">VRM Preview</div>
          <div className="truncate text-xs text-[var(--ui-text-secondary)]">
            {source?.label ?? 'vrmUrl / vrmBase64 / vrmResourceUri を待機中'}
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-[var(--ui-text-secondary)]">
          {loadingModel ? <div className="vv-spinner-sm" /> : null}
          {source ? 'ready' : 'idle'}
          <VrmModelPicker
            app={app}
            activeModelId={activeModelId}
            busy={loadingModel}
            onSelect={(modelId) => {
              void onSwitchVrm(modelId)
            }}
            refreshKey={listRefreshKey}
          />
          {onOpenMenu ? (
            <button
              type="button"
              className="rounded-md border border-[var(--ui-border)] bg-[var(--ui-button-bg)] px-2 py-1 text-xs text-[var(--ui-text)] hover:border-[var(--ui-accent)]"
              onClick={() => {
                setListRefreshKey((v) => v + 1)
                onOpenMenu()
              }}
            >
              メニュー
            </button>
          ) : null}
        </div>
      </div>

      <VRMCanvas source={source} onError={onModelError} pose={presetPose} speechText={speechText} />
    </div>
  )
}
