import type { EmotionBinding } from '../../emotions'
import type { SpeakerStyle } from '../hooks/useSpeakers'

interface EmotionSpeakerSectionProps {
  bindings: EmotionBinding[]
  speakers: SpeakerStyle[]
  onUpdate: (emotion: EmotionBinding['emotion'], fields: Partial<EmotionBinding>) => void
}

export function EmotionSpeakerSection({ bindings, speakers, onUpdate }: EmotionSpeakerSectionProps) {
  return (
    <div className="space-y-2">
      <div className="text-[11px] text-[var(--ui-text-secondary)]">未指定の感情はデフォルト話者を使います。</div>
      <div className="grid gap-2 lg:grid-cols-2">
        {bindings.map((binding) => (
          <div
            key={binding.emotion}
            className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-2 rounded-md border border-[var(--ui-border)] bg-[var(--ui-bg)] p-2"
          >
            <div className="text-xs font-semibold text-[var(--ui-text)]">{binding.emotion}</div>
            <select
              value={binding.speakerId ?? ''}
              onChange={(event) =>
                onUpdate(binding.emotion, {
                  speakerId: event.target.value === '' ? undefined : Number(event.target.value),
                })
              }
              className="min-w-0 rounded-md border border-[var(--ui-border)] bg-[var(--ui-button-bg)] px-2 py-1.5 text-xs text-[var(--ui-text)] focus:border-[var(--ui-accent)] focus:outline-none"
            >
              <option value="">既定話者</option>
              {speakers.map((s) => (
                <option key={`${binding.emotion}-${s.uuid}-${s.id}`} value={s.id}>
                  {s.characterName}（{s.name}）
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </div>
  )
}
