import { DeleteIcon, FullscreenExitIcon, FullscreenIcon } from '~/icons'

interface VrmRegisterHeaderProps {
  isEdit: boolean
  fullscreen: boolean
  canFullscreen: boolean
  saving: boolean
  loadingExisting: boolean
  deleting: boolean
  onBack: () => void
  onSave: () => void
  onRequestDelete: () => void
  onToggleFullscreen?: () => void
}

export function VrmRegisterHeader({
  isEdit,
  fullscreen,
  canFullscreen,
  saving,
  loadingExisting,
  deleting,
  onBack,
  onSave,
  onRequestDelete,
  onToggleFullscreen,
}: VrmRegisterHeaderProps) {
  return (
    <div className="sticky top-0 z-30 flex items-center justify-between gap-2 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 py-2 shadow-sm">
      <button
        type="button"
        onClick={onBack}
        className="rounded-md border border-[var(--ui-border)] bg-[var(--ui-button-bg)] px-2 py-1 text-xs text-[var(--ui-text)] hover:border-[var(--ui-accent)]"
      >
        キャンセル
      </button>
      <div className="truncate text-sm font-semibold text-[var(--ui-text)]">{isEdit ? 'VRM を編集' : 'VRM を追加'}</div>
      <div className="flex items-center gap-1.5">
        {canFullscreen && onToggleFullscreen ? (
          <button
            type="button"
            title={fullscreen ? 'インライン表示' : '全画面'}
            onClick={onToggleFullscreen}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-[var(--ui-border)] bg-[var(--ui-button-bg)] text-[var(--ui-text)] hover:border-[var(--ui-accent)]"
          >
            {fullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
          </button>
        ) : null}
        {isEdit ? (
          <button
            type="button"
            title="削除"
            onClick={onRequestDelete}
            disabled={saving || loadingExisting || deleting}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-[var(--ui-border)] bg-[var(--ui-button-bg)] text-[var(--ui-danger)] hover:border-[var(--ui-danger)] disabled:opacity-50"
          >
            <DeleteIcon />
          </button>
        ) : null}
        <button
          type="button"
          onClick={onSave}
          disabled={saving || loadingExisting || deleting}
          className="rounded-md border border-[var(--ui-accent)] bg-[var(--ui-accent)] px-3 py-1 text-xs font-semibold text-white hover:bg-[var(--ui-accent-hover)] disabled:opacity-50"
        >
          {saving ? '保存中...' : '保存'}
        </button>
      </div>
    </div>
  )
}
