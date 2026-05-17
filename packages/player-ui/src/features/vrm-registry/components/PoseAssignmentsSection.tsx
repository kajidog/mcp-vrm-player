import type { App } from '@modelcontextprotocol/ext-apps'
import { DeleteIcon } from '~/icons'
import { PoseRegisterModal } from '../../poses/PoseRegisterModal'
import type { RegisterPoseRequest } from '../../poses/hooks/usePoseRegistry'
import type { ModelPoseAttachment, PoseMetadata } from '../../poses/types'
import type { VrmSource } from '../../vrm-player/types'

export interface PoseFormAttachment extends ModelPoseAttachment {
  _key: string
}

interface PoseGroup {
  key: string
  name: string
  items: Array<{ attachment: PoseFormAttachment; index: number }>
}

interface PoseAssignmentsSectionProps {
  app: App | null
  poseFormOpen: boolean
  saving: boolean
  poseSectionDisabled: boolean
  previewSource: VrmSource | null
  availablePoses: Array<{ id: string; name?: string }>
  poseGroups: PoseGroup[]
  groupNameRefs: React.RefObject<Map<string, HTMLInputElement | null>>
  onPoseFormOpenChange: (open: boolean) => void
  onRegisterPose: (request: RegisterPoseRequest) => Promise<PoseMetadata>
  onRenamePoseGroup: (oldName: string, nextName: string) => void
  onChangeAttachmentPoseId: (index: number, poseId: string) => void
  onRemoveAttachmentAt: (index: number) => void
  onAddVariationToGroup: (groupName: string) => void
  onAddPoseGroup: () => void
  poseLabel: (poseId: string) => string
}

export function PoseAssignmentsSection({
  app,
  poseFormOpen,
  saving,
  poseSectionDisabled,
  previewSource,
  availablePoses,
  poseGroups,
  groupNameRefs,
  onPoseFormOpenChange,
  onRegisterPose,
  onRenamePoseGroup,
  onChangeAttachmentPoseId,
  onRemoveAttachmentAt,
  onAddVariationToGroup,
  onAddPoseGroup,
  poseLabel,
}: PoseAssignmentsSectionProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] leading-relaxed text-[var(--ui-text-secondary)]">
          MCP
          からポーズ名で呼び出します。同じポーズ名にバリエーションを複数登録すると、再生のたびにランダムで切り替わります。
        </div>
        <button
          type="button"
          onClick={() => onPoseFormOpenChange(true)}
          disabled={poseSectionDisabled}
          className="shrink-0 rounded-md border border-[var(--ui-border)] bg-[var(--ui-button-bg)] px-2 py-1 text-xs text-[var(--ui-text)] hover:border-[var(--ui-accent)] disabled:opacity-50"
        >
          ポーズを登録
        </button>
      </div>

      {poseFormOpen ? (
        <PoseRegisterModal
          app={app}
          existingIds={availablePoses.map((pose) => pose.id)}
          saving={saving}
          previewSource={previewSource}
          onClose={() => onPoseFormOpenChange(false)}
          onRegister={onRegisterPose}
        />
      ) : null}

      {poseSectionDisabled ? (
        <div className="rounded-md border border-dashed border-[var(--ui-border)] p-4 text-center text-xs text-[var(--ui-text-secondary)]">
          VRM ファイルを選択するとポーズを編集できます。
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {poseGroups.map((group) => (
              <div
                key={group.key}
                className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] gap-2 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-bg)] p-2"
              >
                <label className="flex flex-col gap-1">
                  <span className="block text-[11px] text-[var(--ui-text-secondary)]">ポーズ名</span>
                  <input
                    ref={(el) => {
                      if (el) groupNameRefs.current.set(group.key, el)
                      else groupNameRefs.current.delete(group.key)
                    }}
                    value={group.name}
                    onChange={(event) => onRenamePoseGroup(group.name, event.target.value)}
                    placeholder="例: happy"
                    className="h-10 w-full min-w-0 rounded-md border border-[var(--ui-border)] bg-[var(--ui-button-bg)] px-2 text-sm font-semibold text-[var(--ui-text)] focus:border-[var(--ui-accent)] focus:outline-none"
                  />
                </label>
                <div className="flex flex-col gap-1.5 self-start">
                  <span className="block text-[11px] text-[var(--ui-text-secondary)]">バリエーション</span>
                  {group.items.map(({ attachment, index }) => (
                    <div
                      key={attachment._key}
                      className="grid h-10 grid-cols-[minmax(0,1fr)_auto] items-center gap-1.5 rounded-md border border-[var(--ui-border)] bg-[var(--ui-button-bg)] px-2"
                    >
                      <select
                        value={attachment.poseId}
                        onChange={(event) => onChangeAttachmentPoseId(index, event.target.value)}
                        className="min-w-0 truncate rounded border border-transparent bg-transparent text-xs text-[var(--ui-text)] focus:border-[var(--ui-accent)] focus:outline-none"
                      >
                        {availablePoses.map((pose) => (
                          <option
                            key={pose.id}
                            value={pose.id}
                            className="bg-[var(--ui-button-bg)] text-[var(--ui-text)]"
                          >
                            {poseLabel(pose.id)}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        title="削除"
                        onClick={() => onRemoveAttachmentAt(index)}
                        className="flex h-7 w-7 items-center justify-center rounded text-[var(--ui-danger)] hover:bg-[var(--ui-tag-bg)]"
                      >
                        <DeleteIcon />
                      </button>
                    </div>
                  ))}
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => onAddVariationToGroup(group.name)}
                      disabled={availablePoses.length === 0}
                      className="rounded-md border border-dashed border-[var(--ui-border)] px-2 py-1 text-[11px] text-[var(--ui-text-secondary)] hover:border-[var(--ui-accent)] hover:text-[var(--ui-text)] disabled:opacity-50"
                    >
                      + バリエーション
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {poseGroups.length === 0 ? (
              <div className="rounded-md border border-dashed border-[var(--ui-border)] p-4 text-center text-xs text-[var(--ui-text-secondary)]">
                まだポーズが割り当てられていません。下の「+ 割り当てを追加」から作成してください。
              </div>
            ) : null}
          </div>
          <div className="flex justify-end pt-1">
            <button
              type="button"
              onClick={onAddPoseGroup}
              disabled={availablePoses.length === 0}
              className="rounded-md border border-[var(--ui-accent)] bg-[var(--ui-accent)] px-3 py-1 text-xs font-semibold text-white hover:bg-[var(--ui-accent-hover)] disabled:opacity-50"
            >
              + 割り当てを追加
            </button>
          </div>
        </>
      )}
    </div>
  )
}
