interface ConfirmDeleteDialogProps {
  label: string
  deleting: boolean
  deleteError: string | null
  onCancel: () => void
  onDelete: () => void
}

export function ConfirmDeleteDialog({ label, deleting, deleteError, onCancel, onDelete }: ConfirmDeleteDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <div className="w-full max-w-sm rounded-lg border border-[var(--ui-border)] bg-[var(--ui-bg)] p-4 shadow-xl">
        <div className="text-sm font-semibold text-[var(--ui-text)]">VRM を削除しますか？</div>
        <div className="mt-2 text-xs leading-relaxed text-[var(--ui-text-secondary)]">
          「{label}」を一覧から削除します。VRM ファイルも削除されます。
        </div>
        {deleteError ? <div className="mt-3 text-xs text-red-600">{deleteError}</div> : null}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={deleting}
            className="rounded-md border border-[var(--ui-border)] bg-[var(--ui-button-bg)] px-3 py-1.5 text-xs text-[var(--ui-text)] hover:border-[var(--ui-accent)] disabled:opacity-50"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={deleting}
            className="rounded-md border border-[var(--ui-danger)] bg-[var(--ui-danger)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            {deleting ? '削除中...' : '削除'}
          </button>
        </div>
      </div>
    </div>
  )
}
