import type { PoseSource } from '~/features/poses/types'
import { VRMCanvas } from '../../vrm-player/components/VRMCanvas'
import type { MouthRef } from '../../vrm-player/hooks/useLipSync'
import type { VrmSource } from '../../vrm-player/types'
import type { SpeakerStyle } from '../hooks/useSpeakers'

interface VrmPreviewPanelProps {
  source: VrmSource | null
  isEdit: boolean
  fullscreen: boolean
  previewError: string | null
  previewExpressionName: string | null
  previewPoseId: string
  previewSpeakerId: number | null
  availableExpressionNames: string[]
  availablePoses: Array<{ id: string; name?: string }>
  speakers: SpeakerStyle[]
  speakersLoading: boolean
  previewPose: PoseSource | null
  previewExpression: { name: string; weight: number } | null
  mouthRef: MouthRef
  onPreviewExpressionChange: (name: string | null) => void
  onPreviewPoseChange: (id: string) => void
  onPreviewSpeakerChange: (id: number) => void
  onError: (message: string | null) => void
  onExpressionsReady: (names: string[]) => void
  openFilePicker: () => void
  poseLabel: (poseId: string) => string
}

export function VrmPreviewPanel({
  source,
  isEdit,
  fullscreen,
  previewError,
  previewExpressionName,
  previewPoseId,
  previewSpeakerId,
  availableExpressionNames,
  availablePoses,
  speakers,
  speakersLoading,
  previewPose,
  previewExpression,
  mouthRef,
  onPreviewExpressionChange,
  onPreviewPoseChange,
  onPreviewSpeakerChange,
  onError,
  onExpressionsReady,
  openFilePicker,
  poseLabel,
}: VrmPreviewPanelProps) {
  const previewControlsDisabled = source === null

  return (
    <div
      className={`flex flex-col gap-2 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-3 ${
        fullscreen ? 'h-[calc(100vh-5rem)] min-h-[420px] flex-none' : ''
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex min-w-[150px] flex-1 items-center gap-2 rounded-md border border-[var(--ui-border)] bg-[var(--ui-button-bg)] px-2 py-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--ui-text-secondary)]">
            表情
          </span>
          <select
            value={previewExpressionName ?? ''}
            onChange={(event) => onPreviewExpressionChange(event.target.value || null)}
            disabled={previewControlsDisabled || availableExpressionNames.length === 0}
            className="min-w-0 flex-1 truncate rounded border-none bg-[var(--ui-button-bg)] text-xs text-[var(--ui-text)] focus:outline-none disabled:opacity-50"
          >
            <option value="">なし</option>
            {availableExpressionNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex min-w-[150px] flex-1 items-center gap-2 rounded-md border border-[var(--ui-border)] bg-[var(--ui-button-bg)] px-2 py-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--ui-text-secondary)]">
            ポーズ
          </span>
          <select
            value={previewPoseId}
            onChange={(event) => onPreviewPoseChange(event.target.value)}
            disabled={previewControlsDisabled || availablePoses.length === 0}
            className="min-w-0 flex-1 truncate rounded border-none bg-[var(--ui-button-bg)] text-xs text-[var(--ui-text)] focus:outline-none disabled:opacity-50"
          >
            {availablePoses.map((pose) => (
              <option key={pose.id} value={pose.id}>
                {poseLabel(pose.id)}
              </option>
            ))}
          </select>
        </label>

        <label className="flex min-w-[180px] flex-1 items-center gap-2 rounded-md border border-[var(--ui-border)] bg-[var(--ui-button-bg)] px-2 py-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--ui-text-secondary)]">
            話者
          </span>
          <select
            value={previewSpeakerId ?? ''}
            onChange={(event) => {
              const next = event.target.value === '' ? null : Number(event.target.value)
              if (next !== null) onPreviewSpeakerChange(next)
            }}
            disabled={previewControlsDisabled || speakersLoading || speakers.length === 0}
            className="min-w-0 flex-1 truncate rounded border-none bg-[var(--ui-button-bg)] text-xs text-[var(--ui-text)] focus:outline-none disabled:opacity-50"
          >
            <option value="" disabled>
              {speakersLoading ? '読み込み中...' : '選択'}
            </option>
            {speakers.map((s) => (
              <option key={`${s.uuid}-${s.id}`} value={s.id}>
                {s.characterName}（{s.name}）
              </option>
            ))}
          </select>
        </label>
      </div>

      {previewError ? <div className="text-xs text-red-600">{previewError}</div> : null}

      {source ? (
        <VRMCanvas
          source={source}
          onError={onError}
          pose={previewPose}
          expression={previewExpression}
          mouthRef={mouthRef}
          onExpressionsReady={onExpressionsReady}
          speechText={null}
          fullscreen={fullscreen}
          heightClassName={fullscreen ? 'h-full' : 'h-[min(60vh,560px)] min-h-[360px]'}
        />
      ) : isEdit ? (
        <div className="flex h-[360px] items-center justify-center rounded-md border border-dashed border-[var(--ui-border)] text-center text-xs text-[var(--ui-text-secondary)]">
          既存 VRM のプレビューURLを取得しています。
        </div>
      ) : (
        <div className="flex h-[360px] flex-col items-center justify-center gap-2 rounded-md border border-dashed border-[var(--ui-border)] text-center text-xs text-[var(--ui-text-secondary)]">
          <div>VRM ファイルをドロップまたは選択するとプレビューできます。</div>
          <button
            type="button"
            onClick={openFilePicker}
            className="rounded-md border border-[var(--ui-border)] bg-[var(--ui-button-bg)] px-3 py-1 text-xs text-[var(--ui-text)] hover:border-[var(--ui-accent)]"
          >
            ファイルを選択
          </button>
        </div>
      )}
    </div>
  )
}
