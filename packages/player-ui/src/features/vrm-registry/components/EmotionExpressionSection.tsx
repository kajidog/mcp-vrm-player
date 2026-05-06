import type { EmotionBinding } from '../../emotions'

interface EmotionExpressionSectionProps {
  bindings: EmotionBinding[]
  expressionOptions: string[]
  onUpdate: (emotion: EmotionBinding['emotion'], fields: Partial<EmotionBinding>) => void
}

export function EmotionExpressionSection({ bindings, expressionOptions, onUpdate }: EmotionExpressionSectionProps) {
  return (
    <div className="space-y-2">
      <div className="text-[11px] text-[var(--ui-text-secondary)]">
        weight は表情の強度（0=適用しない / 1=最大）。VRM ロード時に表情名と感情名が一致した未設定行は自動補完されます。
      </div>
      <div className="grid gap-2 lg:grid-cols-2">
        {bindings.map((binding) => (
          <div
            key={binding.emotion}
            className="grid grid-cols-[5.5rem_minmax(0,1fr)_4.5rem] items-center gap-2 rounded-md border border-[var(--ui-border)] bg-[var(--ui-bg)] p-2"
          >
            <div className="text-xs font-semibold text-[var(--ui-text)]">{binding.emotion}</div>
            <select
              value={binding.expressionName ?? ''}
              onChange={(event) =>
                onUpdate(binding.emotion, {
                  expressionName: event.target.value || undefined,
                })
              }
              className="min-w-0 rounded-md border border-[var(--ui-border)] bg-[var(--ui-button-bg)] px-2 py-1.5 text-xs text-[var(--ui-text)] focus:border-[var(--ui-accent)] focus:outline-none"
            >
              <option value="">表情なし</option>
              {expressionOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={0}
              max={1}
              step={0.1}
              value={binding.weight ?? 1}
              onChange={(event) =>
                onUpdate(binding.emotion, {
                  weight: Math.min(1, Math.max(0, Number(event.target.value))),
                })
              }
              className="w-full rounded-md border border-[var(--ui-border)] bg-[var(--ui-button-bg)] px-2 py-1.5 text-xs text-[var(--ui-text)] focus:border-[var(--ui-accent)] focus:outline-none"
            />
          </div>
        ))}
      </div>
    </div>
  )
}
