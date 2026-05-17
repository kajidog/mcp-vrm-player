import type { App } from '@modelcontextprotocol/ext-apps'
import { Html, OrbitControls } from '@react-three/drei'
import { Canvas, useThree } from '@react-three/fiber'
import { type ComponentRef, useEffect, useRef, useState } from 'react'
import type { PoseSource } from '~/features/poses/types'
import { SettingsIcon } from '~/icons'
import { useColorScheme } from '../hooks/useColorScheme'
import type { MouthRef } from '../hooks/useLipSync'
import { useRenderSettings } from '../hooks/useRenderSettings'
import type { VrmPlayerState, VrmSource } from '../types'
import { RenderSettingsPanel } from './RenderSettingsPanel'
import { VRMScene } from './VRMScene'

// drei の OrbitControls はサードパーティ実装（three-stdlib）を ref に出すので、
// その型は drei コンポーネントから ComponentRef で取り出して同じ型を共有する。
type OrbitControlsImpl = ComponentRef<typeof OrbitControls>

interface VRMCanvasProps {
  app?: App | null
  // null のときはモデル無しの空シーンを描画する（背景・ライト・グリッドのみ）。
  source: VrmSource | null
  onError: (message: string) => void
  pose?: PoseSource | null
  expression?: { name: string; weight: number } | null
  // 吹き出しに出すテキスト。null のときは吹き出しを描画しない。
  speechText: string | null
  gaze?: VrmPlayerState['currentSegmentGaze']
  currentIndex?: number | null
  totalSegments?: number
  hasSegments?: boolean
  fullscreen?: boolean
  mouthRef?: MouthRef
  onPrev?: () => void
  onNext?: () => void
  onExpressionsReady?: (names: string[]) => void
  onLoadStart?: () => void
  onLoaded?: () => void
  heightClassName?: string
  renderPanelOpen?: boolean
  onOpenRenderPanel?: () => void
  onCloseRenderPanel?: () => void
  onOpenServerSettings?: () => void
  onOpenPoses?: () => void
}

const SCENE_COLORS = {
  light: { canvasBg: '#f3f4f6', gridA: '#d4d4d8', gridB: '#e4e4e7' },
  dark: { canvasBg: '#1c1c1e', gridA: '#2c2c2e', gridB: '#38383a' },
} as const

/**
 * 右ドラッグでパンする際に出てしまうブラウザの contextmenu を抑止する。
 * OrbitControls 自身は preventDefault しないので、最低限ここで止める。
 */
function CanvasContextMenuSuppressor() {
  const { gl } = useThree()
  useEffect(() => {
    const dom = gl.domElement
    const onContextMenu = (event: MouseEvent) => event.preventDefault()
    dom.addEventListener('contextmenu', onContextMenu)
    return () => dom.removeEventListener('contextmenu', onContextMenu)
  }, [gl])
  return null
}

/**
 * VRM ロード後の上半身付近の y を controls.target / camera に反映する。
 * 同じ y を二重適用しないよう lastApplied をキャッシュする。
 */
function CenterController({
  controlsRef,
  centerY,
}: {
  controlsRef: React.RefObject<OrbitControlsImpl | null>
  centerY: number | null
}) {
  const { camera } = useThree()
  const lastAppliedRef = useRef<number | null>(null)

  useEffect(() => {
    if (centerY === null) return
    if (lastAppliedRef.current === centerY) return
    const controls = controlsRef.current
    if (!controls) return
    const dy = centerY - controls.target.y
    controls.target.y = centerY
    camera.position.y += dy
    controls.update()
    lastAppliedRef.current = centerY
  }, [centerY, camera, controlsRef])

  return null
}

function WheelTrackController({
  controlsRef,
  hasSegments,
  currentIndex,
  totalSegments,
  onPrev,
  onNext,
}: {
  controlsRef: React.RefObject<OrbitControlsImpl | null>
  hasSegments: boolean
  currentIndex: number | null
  totalSegments: number
  onPrev: () => void
  onNext: () => void
}) {
  const { camera, gl } = useThree()
  const middleDragRef = useRef<{ active: boolean; lastY: number }>({ active: false, lastY: 0 })
  const lastWheelSwitchRef = useRef(0)

  useEffect(() => {
    const dom = gl.domElement

    const zoomByDelta = (deltaY: number) => {
      const controls = controlsRef.current
      if (!controls) return
      const target = controls.target
      const direction = camera.position.clone().sub(target)
      const distance = direction.length()
      if (distance <= 0) return
      const nextDistance = Math.min(8, Math.max(0.45, distance * (1 + deltaY * 0.004)))
      camera.position.copy(target).add(direction.normalize().multiplyScalar(nextDistance))
      controls.update()
    }

    const onWheel = (event: WheelEvent) => {
      if (event.shiftKey) {
        event.preventDefault()
        zoomByDelta(event.deltaY)
        return
      }
      if (!hasSegments || middleDragRef.current.active) return
      const now = Date.now()
      if (now - lastWheelSwitchRef.current < 200) return
      const index = currentIndex ?? 0
      if (event.deltaY > 0) {
        // 末尾では次へ送らない（無効化）。
        if (index >= totalSegments - 1) return
        event.preventDefault()
        lastWheelSwitchRef.current = now
        onNext()
      } else if (event.deltaY < 0) {
        // 先頭では前へ戻さない（無効化）。
        if (index <= 0) return
        event.preventDefault()
        lastWheelSwitchRef.current = now
        onPrev()
      }
    }

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 1) return
      event.preventDefault()
      middleDragRef.current = { active: true, lastY: event.clientY }
      dom.setPointerCapture?.(event.pointerId)
    }

    const onPointerMove = (event: PointerEvent) => {
      if (!middleDragRef.current.active) return
      event.preventDefault()
      const dy = event.clientY - middleDragRef.current.lastY
      middleDragRef.current.lastY = event.clientY
      zoomByDelta(dy)
    }

    const onPointerUp = (event: PointerEvent) => {
      if (!middleDragRef.current.active) return
      event.preventDefault()
      middleDragRef.current = { active: false, lastY: 0 }
      dom.releasePointerCapture?.(event.pointerId)
    }

    dom.addEventListener('wheel', onWheel, { passive: false })
    dom.addEventListener('pointerdown', onPointerDown)
    dom.addEventListener('pointermove', onPointerMove)
    dom.addEventListener('pointerup', onPointerUp)
    dom.addEventListener('pointercancel', onPointerUp)
    return () => {
      dom.removeEventListener('wheel', onWheel)
      dom.removeEventListener('pointerdown', onPointerDown)
      dom.removeEventListener('pointermove', onPointerMove)
      dom.removeEventListener('pointerup', onPointerUp)
      dom.removeEventListener('pointercancel', onPointerUp)
    }
  }, [camera, controlsRef, currentIndex, gl, hasSegments, onNext, onPrev, totalSegments])

  return null
}

/**
 * three.js のキャンバスとシーン構成（背景・ライト・グリッド・カメラ操作）を担当。
 * モデルそのものの読み込みは `VRMScene` 側に委譲する。
 */
export function VRMCanvas({
  app = null,
  source,
  onError,
  pose,
  expression,
  speechText,
  gaze = null,
  currentIndex = null,
  totalSegments = 0,
  hasSegments = false,
  fullscreen = false,
  mouthRef,
  onPrev = () => {},
  onNext = () => {},
  onExpressionsReady,
  onLoadStart,
  onLoaded,
  heightClassName = 'h-[420px]',
  renderPanelOpen = false,
  onOpenRenderPanel,
  onCloseRenderPanel,
  onOpenServerSettings,
  onOpenPoses,
}: VRMCanvasProps) {
  const controlsRef = useRef<OrbitControlsImpl | null>(null)
  const colorScheme = useColorScheme()
  const colors = SCENE_COLORS[colorScheme]
  const { settings: renderSettings } = useRenderSettings(app)
  // VRMScene からセンタリング情報（上半身 y）を受け取って、カメラ追従と吹き出し位置に流す。
  const [centerY, setCenterY] = useState<number | null>(null)
  const [headPosition, setHeadPosition] = useState<[number, number, number] | null>(null)
  const sourceKey = `${source?.src ?? ''}:${source?.data?.byteLength ?? 0}:${source?.label ?? ''}`
  const previousIndexRef = useRef<number | null>(null)
  const bubbleDirection =
    currentIndex !== null && previousIndexRef.current !== null && currentIndex < previousIndexRef.current
      ? 'down'
      : 'up'

  useEffect(() => {
    if (currentIndex !== null) previousIndexRef.current = currentIndex
  }, [currentIndex])

  // biome-ignore lint/correctness/useExhaustiveDependencies: sourceKey intentionally clears stale model anchors while the next VRM loads
  useEffect(() => {
    setCenterY(null)
    setHeadPosition(null)
  }, [sourceKey])

  return (
    <div
      className={`vrm-canvas-host relative overflow-hidden border border-[var(--ui-border)] bg-[var(--ui-surface)] ${
        fullscreen ? 'h-full min-h-0 rounded-none' : 'rounded-lg'
      }`}
    >
      <div className={fullscreen ? 'h-full min-h-0 w-full' : `${heightClassName} w-full`}>
        <Canvas
          camera={{ position: [0, 1.35, 2.2], fov: 28 }}
          // 設定の dprMax で上限を切り替え。1.5 を超えると描画負荷が上がるが見栄えは向上する。
          dpr={[1, renderSettings.dprMax]}
          gl={{
            antialias: false,
            powerPreference: 'high-performance',
          }}
        >
          <color attach="background" args={[colors.canvasBg]} />
          <ambientLight intensity={1.45 * renderSettings.sceneLightIntensity} />
          <hemisphereLight args={['#ffffff', '#d9e1ec', 0.35 * renderSettings.sceneLightIntensity]} />
          <directionalLight position={[1.5, 2.5, 2]} intensity={1.7 * renderSettings.sceneLightIntensity} />
          <directionalLight position={[-1, 1.5, -1]} intensity={0.75 * renderSettings.sceneLightIntensity} />
          <gridHelper args={[6, 12, colors.gridA, colors.gridB]} position={[0, -1, 0]} />
          {source ? (
            <VRMScene
              source={source}
              onError={onError}
              pose={pose}
              expression={expression}
              mouthRef={mouthRef}
              blinkEnabled={renderSettings.blinkEnabled}
              lookAtCamera={renderSettings.lookAtCamera}
              gaze={gaze}
              headTrackCamera={renderSettings.headTrackCamera}
              poseEasing={renderSettings.poseEasing}
              expressionTransitionMs={renderSettings.expressionTransitionMs}
              onCenterReady={setCenterY}
              onHeadReady={setHeadPosition}
              onExpressionsReady={onExpressionsReady}
              onLoadStart={onLoadStart}
              onLoaded={onLoaded}
            />
          ) : null}
          {/* 仮置き target。ロード完了後に CenterController が VRM の上半身高さに更新する。 */}
          {/* 左ドラッグ=回転 / 右ドラッグ=パン。ズームは WheelTrackController で割り当てる。 */}
          <OrbitControls ref={controlsRef} enablePan enableZoom={false} target={[0, 1.1, 0]} />
          <CanvasContextMenuSuppressor />
          <WheelTrackController
            controlsRef={controlsRef}
            hasSegments={hasSegments}
            currentIndex={currentIndex}
            totalSegments={totalSegments}
            onPrev={onPrev}
            onNext={onNext}
          />
          <CenterController controlsRef={controlsRef} centerY={centerY} />
          {speechText ? (
            <SpeechBubble3D
              centerY={centerY}
              headPosition={headPosition}
              text={speechText}
              transitionKey={`${currentIndex ?? 'none'}:${speechText}`}
              direction={bubbleDirection}
            />
          ) : null}
        </Canvas>
      </div>
      {onOpenRenderPanel && !renderPanelOpen ? (
        <button
          type="button"
          title="表示設定"
          aria-label="表示設定を開く"
          onClick={onOpenRenderPanel}
          className="absolute bottom-3 right-3 z-40 flex h-9 w-9 items-center justify-center rounded-full border border-[var(--ui-border)] bg-[var(--ui-button-bg)] text-[var(--ui-text)] shadow-md hover:border-[var(--ui-accent)]"
        >
          <SettingsIcon />
        </button>
      ) : null}
      {renderPanelOpen && onCloseRenderPanel && onOpenServerSettings && onOpenPoses ? (
        <RenderSettingsPanel
          app={app}
          onClose={onCloseRenderPanel}
          onOpenServerSettings={onOpenServerSettings}
          onOpenPoses={onOpenPoses}
        />
      ) : null}
    </div>
  )
}

/**
 * キャラクターの顔の右側にワールド座標で浮かぶ吹き出し。drei の Html を使って DOM で
 * 見栄えを作る。頭ボーン位置から下方向へ伸ばし、デフォルトカメラで画面外に出ないようにする。
 * centerY が null（VRM 未ロード等）の時は仮値で 0.4 を使う。
 */
interface SpeechBubbleItem {
  key: string
  text: string
  phase: 'enter' | 'exit'
  direction: 'up' | 'down'
}

function SpeechBubble3D({
  centerY,
  headPosition,
  text,
  transitionKey,
  direction,
}: {
  centerY: number | null
  headPosition: [number, number, number] | null
  text: string
  transitionKey: string
  direction: 'up' | 'down'
}) {
  // 吹き出しは「顔の少し右」に左上を置く。頭の上に出すとデフォルトカメラで画面外に
  // はみ出しやすいので、頭ボーン y を基準に下方向へ伸ばす形にしている。
  const position: [number, number, number] = headPosition
    ? [headPosition[0] + 0.18, headPosition[1] + 0.02, headPosition[2]]
    : [0, (centerY ?? 0.4) + 0.35, 0]
  const [items, setItems] = useState<SpeechBubbleItem[]>([{ key: transitionKey, text, phase: 'enter', direction }])

  useEffect(() => {
    setItems((current) => {
      const active = current.find((item) => item.phase === 'enter')
      if (active?.key === transitionKey) return current
      const exiting = active ? [{ ...active, phase: 'exit' as const, direction }] : []
      return [...exiting, { key: transitionKey, text, phase: 'enter', direction }]
    })

    const timer = setTimeout(() => {
      setItems([{ key: transitionKey, text, phase: 'enter', direction }])
    }, 180)
    return () => clearTimeout(timer)
  }, [direction, text, transitionKey])

  return (
    <Html position={position} zIndexRange={[30, 0]}>
      <div className="pointer-events-none relative min-h-9 w-[min(260px,40vw)] select-none">
        <div className="invisible whitespace-pre-wrap break-words px-3 py-1.5 text-[11px] leading-relaxed">{text}</div>
        {items.map((item) => (
          <div
            key={`${item.phase}:${item.key}`}
            className={`absolute inset-x-0 top-0 whitespace-pre-wrap break-words rounded-lg border border-[var(--ui-border)] bg-[var(--ui-bubble-bg)] px-3 py-1.5 text-center text-[11px] leading-relaxed text-[var(--ui-text)] shadow-lg ${
              item.phase === 'enter' ? `now-playing-enter-${item.direction}` : `now-playing-exit-${item.direction}`
            }`}
          >
            {item.text}
          </div>
        ))}
      </div>
    </Html>
  )
}
