import type { App } from '@modelcontextprotocol/ext-apps'
import { useEffect } from 'react'
import { DPR_OPTIONS, POSE_EASING_OPTIONS, useRenderSettings } from '../hooks/useRenderSettings'
import { SettingNumber, SettingSelect, SettingToggle } from './SettingsControls'

interface RenderSettingsPanelProps {
  app: App | null
  onClose: () => void
  onOpenServerSettings: () => void
  onOpenPoses: () => void
}

/**
 * 3D ビュー右側に重ねる「表示設定」パネル。renderSettings はトグル即時に VRMCanvas に
 * 反映されるため、3D 空間を操作しながら挙動を確認できる。サーバー側設定（適用ボタンが必要なもの）
 * は別画面（SettingsView）に分ける。
 */
export function RenderSettingsPanel({ app, onClose, onOpenServerSettings, onOpenPoses }: RenderSettingsPanelProps) {
  const { settings, update } = useRenderSettings(app)

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  return (
    <aside className="render-settings-drawer" aria-label="表示設定">
      <div className="flex items-center justify-between border-b border-[var(--ui-border)] px-3 py-2">
        <div className="text-sm font-semibold text-[var(--ui-text)]">表示設定</div>
        <button
          type="button"
          onClick={onClose}
          aria-label="閉じる"
          className="rounded-md border border-[var(--ui-border)] bg-[var(--ui-button-bg)] px-2 py-1 text-xs text-[var(--ui-text)] hover:border-[var(--ui-accent)]"
        >
          閉じる
        </button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        <div className="text-[11px] leading-relaxed text-[var(--ui-text-secondary)]">
          ここでの変更はプレイヤーに即時反映されます。
        </div>
        <SettingSelect
          label="解像度"
          description="高くするほど精細に見えますが描画負荷が上がります。"
          value={settings.dprMax}
          options={DPR_OPTIONS}
          onChange={(dprMax) => update({ dprMax })}
        />
        <SettingNumber
          label="3D空間の明るさ"
          value={settings.sceneLightIntensity}
          min={0.6}
          max={1.8}
          step={0.05}
          defaultValue={1}
          onChange={(sceneLightIntensity) => update({ sceneLightIntensity })}
        />
        <SettingToggle
          label="瞬き"
          checked={settings.blinkEnabled}
          defaultValue={true}
          onChange={(blinkEnabled) => update({ blinkEnabled })}
        />
        <SettingToggle
          label="視線を動かす"
          checked={settings.lookAtCamera}
          defaultValue={true}
          onChange={(lookAtCamera) => update({ lookAtCamera })}
        />
        <SettingToggle
          label="顔をカメラに向ける"
          checked={settings.headTrackCamera}
          defaultValue={false}
          onChange={(headTrackCamera) => update({ headTrackCamera })}
        />
        <SettingSelect
          label="ポーズ遷移"
          value={settings.poseEasing}
          options={POSE_EASING_OPTIONS}
          onChange={(poseEasing) => update({ poseEasing })}
        />
        <SettingNumber
          label="表情フェード(ms)"
          value={settings.expressionTransitionMs}
          min={0}
          max={500}
          step={10}
          defaultValue={120}
          onChange={(expressionTransitionMs) => update({ expressionTransitionMs })}
        />
        <SettingNumber
          label="口パク補正(ms)"
          value={settings.moraTimingOffsetMs}
          min={-200}
          max={200}
          step={10}
          defaultValue={0}
          onChange={(moraTimingOffsetMs) => update({ moraTimingOffsetMs })}
        />
      </div>

      <div className="grid grid-cols-2 gap-2 border-t border-[var(--ui-border)] px-3 py-2">
        <button
          type="button"
          onClick={onOpenServerSettings}
          className="rounded-md border border-[var(--ui-border)] bg-[var(--ui-button-bg)] px-3 py-1.5 text-xs text-[var(--ui-text)] hover:border-[var(--ui-accent)]"
        >
          設定
        </button>
        <button
          type="button"
          onClick={onOpenPoses}
          className="rounded-md border border-[var(--ui-border)] bg-[var(--ui-button-bg)] px-3 py-1.5 text-xs text-[var(--ui-text)] hover:border-[var(--ui-accent)]"
        >
          ポーズ管理
        </button>
      </div>
    </aside>
  )
}
