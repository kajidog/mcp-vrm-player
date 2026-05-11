/**
 * SettingsView と RenderSettingsPanel から共通で使う小さなコントロール群。
 * 1 ファイルにまとめて、見た目（ボーダー・余白・vv-slider クラス等）を統一する。
 */

export function SettingToggle({
  label,
  checked,
  defaultValue,
  onChange,
}: {
  label: string
  checked: boolean
  defaultValue: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <label className="flex items-center justify-between gap-3 text-xs text-[var(--ui-text)]">
      <div>
        <div className="font-semibold">{label}</div>
        <div className="text-[var(--ui-text-secondary)]">既定: {defaultValue ? 'ON' : 'OFF'}</div>
      </div>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 accent-[var(--ui-accent)]"
      />
    </label>
  )
}

export function SettingSelect<T extends number | string>({
  label,
  description,
  value,
  options,
  onChange,
}: {
  label: string
  description?: string
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (value: T) => void
}) {
  return (
    <label className="block text-xs text-[var(--ui-text)]">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="font-semibold">{label}</span>
        {description ? <span className="text-[var(--ui-text-secondary)]">{description}</span> : null}
      </div>
      <select
        value={String(value)}
        onChange={(event) => {
          const raw = event.target.value
          const next = typeof options[0]?.value === 'number' ? (Number(raw) as T) : (raw as T)
          onChange(next)
        }}
        className="w-full rounded-md border border-[var(--ui-border)] bg-[var(--ui-button-bg)] px-2 py-1 text-xs text-[var(--ui-text)]"
      >
        {options.map((option) => (
          <option key={String(option.value)} value={String(option.value)}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

export function SettingNumber({
  label,
  value,
  min,
  max,
  step,
  defaultValue,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  defaultValue?: number
  onChange: (value: number) => void
}) {
  return (
    <label className="block text-xs text-[var(--ui-text)]">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="font-semibold">{label}</span>
        <span className="text-[var(--ui-text-secondary)]">既定: {defaultValue ?? 'VOICEVOX'}</span>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          className="vv-slider min-w-0 flex-1"
        />
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={Number(value.toFixed(2))}
          onChange={(event) => onChange(Number(event.target.value))}
          className="w-20 rounded-md border border-[var(--ui-border)] bg-[var(--ui-button-bg)] px-2 py-1 text-right text-xs text-[var(--ui-text)]"
        />
      </div>
    </label>
  )
}
