import { useEffect, useRef } from 'react'
import type { AudioQuery } from '~/types'
import type { PoseSegment } from '../utils/vrmPayload'

/** VRM の母音表情チャネル。`@pixiv/three-vrm` の expression プリセット名に対応。 */
export interface MouthValues {
  aa: number
  ih: number
  ou: number
  ee: number
  oh: number
}

export type MouthRef = { current: MouthValues }

export interface LipSyncController {
  /** VRMScene が毎フレーム読み取る。値は in-place 更新される。 */
  mouthRef: MouthRef
  /** audio 要素の生成タイミングで 1 回だけ呼ぶ。AudioContext と AnalyserNode を構築する。 */
  attachAudio: (audio: HTMLAudioElement) => void
  /** セグメント切替時に呼ぶ。null を渡すと口は閉じへ減衰する。 */
  setSegment: (segment: PoseSegment | null) => void
  /** ユーザー操作起源の play() 直前に呼ぶ。autoplay policy 対策。 */
  resumeContext: () => void
  setMoraTimingOffsetMs: (offsetMs: number) => void
  /** unmount 時に呼ぶ。RAF と AudioContext を解放する。 */
  dispose: () => void
}

type VowelKey = 'aa' | 'ih' | 'ou' | 'ee' | 'oh' | 'N' | 'silent'

// VOICEVOX は無声化母音を大文字（A/I/U/E/O）で返す。大文字側は devoiced=true で扱う。
const VOWEL_MAP: Record<string, { vowel: VowelKey; devoiced: boolean }> = {
  a: { vowel: 'aa', devoiced: false },
  A: { vowel: 'aa', devoiced: true },
  i: { vowel: 'ih', devoiced: false },
  I: { vowel: 'ih', devoiced: true },
  u: { vowel: 'ou', devoiced: false },
  U: { vowel: 'ou', devoiced: true },
  e: { vowel: 'ee', devoiced: false },
  E: { vowel: 'ee', devoiced: true },
  o: { vowel: 'oh', devoiced: false },
  O: { vowel: 'oh', devoiced: true },
  N: { vowel: 'N', devoiced: false },
}

interface MoraEvent {
  start: number
  end: number
  vowel: VowelKey
  devoiced: boolean
  // 次モーラの子音。/N/ の閉口判定と先取り表現の判定に使う。
  followingConsonant?: string
}

interface MoraFrame {
  consonant?: string
  consonantLength?: number
  vowel?: string
  vowelLength?: number
  isPause?: boolean
}

function mapVowel(raw: string | undefined | null): { vowel: VowelKey; devoiced: boolean } {
  if (!raw) return { vowel: 'silent', devoiced: false }
  return VOWEL_MAP[raw] ?? { vowel: 'silent', devoiced: false }
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

// VOICEVOX の子音トークンは p/b/m/py/by/my 等。先頭文字で両唇音を判定する。
const LABIAL_INITIALS = new Set(['p', 'b', 'm'])
function isLabialConsonant(consonant: string | undefined): boolean {
  if (!consonant) return false
  return LABIAL_INITIALS.has(consonant[0])
}

function buildTimeline(query: AudioQuery): MoraEvent[] {
  const speed = query.speedScale && query.speedScale > 0 ? query.speedScale : 1
  const frames: MoraFrame[] = []
  for (const phrase of query.accent_phrases ?? []) {
    for (const mora of phrase.moras ?? []) {
      frames.push({
        consonant: mora.consonant ?? undefined,
        consonantLength:
          typeof mora.consonant_length === 'number' && Number.isFinite(mora.consonant_length)
            ? mora.consonant_length
            : undefined,
        vowel: mora.vowel,
        vowelLength: mora.vowel_length,
      })
    }
    const pause = phrase.pause_mora
    if (pause && typeof pause.vowel_length === 'number') {
      frames.push({ isPause: true, vowelLength: pause.vowel_length })
    }
  }

  const events: MoraEvent[] = []
  let t = (query.prePhonemeLength ?? 0) / speed
  for (let i = 0; i < frames.length; i += 1) {
    const frame = frames[i]
    if (frame.consonantLength !== undefined) t += frame.consonantLength / speed
    if (frame.isPause) {
      t += (frame.vowelLength ?? 0) / speed
      continue
    }
    const dur = (frame.vowelLength ?? 0) / speed
    if (dur > 0) {
      const { vowel, devoiced } = mapVowel(frame.vowel)
      // 直後のフレームが非 pause なら、その consonant を後続子音として記録する。
      // pause を挟む場合は発話の切れ目とみなして空のまま（/N/ の閉口判定を起動しない）。
      const nextFrame = frames[i + 1]
      const followingConsonant = nextFrame && !nextFrame.isPause ? nextFrame.consonant : undefined
      events.push({ start: t, end: t + dur, vowel, devoiced, followingConsonant })
      t += dur
    }
  }
  return events
}

/**
 * 二分探索で `now` を含む（または直前の）イベント index を返す。該当無しは -1。
 */
function findEventIndex(events: MoraEvent[], now: number): number {
  if (events.length === 0) return -1
  let lo = 0
  let hi = events.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const ev = events[mid]
    if (now < ev.start) hi = mid - 1
    else if (now >= ev.end) lo = mid + 1
    else return mid
  }
  return -1
}

// 母音 → 5 チャネル分配。無声化は gain を絞る。/N/ は後続が両唇音なら閉口。
function shapeFor(vowel: VowelKey, devoiced: boolean, followingConsonant: string | undefined): MouthValues {
  const gain = devoiced ? 0.3 : 1
  switch (vowel) {
    case 'aa':
      return { aa: gain, ih: 0, ou: 0, ee: 0, oh: 0 }
    case 'ih':
      return { aa: 0, ih: gain, ou: 0, ee: 0, oh: 0 }
    case 'ou':
      return { aa: 0, ih: 0, ou: gain, ee: 0, oh: 0 }
    case 'ee':
      return { aa: 0, ih: 0, ou: 0, ee: gain, oh: 0 }
    case 'oh':
      return { aa: 0, ih: 0, ou: 0, ee: 0, oh: gain }
    case 'N':
      return isLabialConsonant(followingConsonant)
        ? { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 }
        : { aa: 0.08, ih: 0, ou: 0, ee: 0, oh: 0 }
    default:
      return { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 }
  }
}

function lerpShape(a: MouthValues, b: MouthValues, t: number): MouthValues {
  return {
    aa: a.aa + (b.aa - a.aa) * t,
    ih: a.ih + (b.ih - a.ih) * t,
    ou: a.ou + (b.ou - a.ou) * t,
    ee: a.ee + (b.ee - a.ee) * t,
    oh: a.oh + (b.oh - a.oh) * t,
  }
}

function scaleShape(shape: MouthValues, gain: number): MouthValues {
  return {
    aa: shape.aa * gain,
    ih: shape.ih * gain,
    ou: shape.ou * gain,
    ee: shape.ee * gain,
    oh: shape.oh * gain,
  }
}

// 台形エンベロープ: アタック 20% / ホールド 60% / リリース 20%。短いモーラでも十分に開く。
function trapezoidEnvelope(progress: number): number {
  if (progress <= 0 || progress >= 1) return 0
  if (progress < 0.2) return progress / 0.2
  if (progress > 0.8) return (1 - progress) / 0.2
  return 1
}

const VOWEL_PEAK = 0.9
// 末尾何秒ぶん、次モーラの形を先取りしてブレンドするか。
const ANTICIPATION_WINDOW_SEC = 0.04
// アタック/リリースの時定数（秒）。フレームレートに非依存にするための exp 減衰用。
const TAU_ATTACK = 0.04
const TAU_RELEASE = 0.08
// 振幅 × 形のハイブリッド時の、RMS=0 でも残す最低スケール。
const RMS_FLOOR = 0.3

export function useLipSync(): LipSyncController {
  const mouthRef = useRef<MouthValues>({ aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 })
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const analyserBufRef = useRef<Uint8Array<ArrayBuffer> | null>(null)
  const timelineRef = useRef<MoraEvent[]>([])
  const moraTimingOffsetMsRef = useRef(0)
  const rafRef = useRef<number | null>(null)
  const lastTickMsRef = useRef<number | null>(null)
  const disposedRef = useRef(false)

  const tick = (nowMs: number) => {
    if (disposedRef.current) return

    const prevMs = lastTickMsRef.current
    lastTickMsRef.current = nowMs
    // タブ非アクティブ等で delta が跳ねた時に大ジャンプしないように上限を設ける。
    const delta = prevMs === null ? 0 : Math.min(0.1, Math.max(0, (nowMs - prevMs) / 1000))

    const audio = audioRef.current
    const analyser = analyserRef.current
    const analyserBuf = analyserBufRef.current
    const ctx = audioCtxRef.current
    const timeline = timelineRef.current

    // analyser が使えれば毎フレーム RMS を取る。timeline 駆動時は「形 × 振幅」の振幅側に使い、
    // timeline が無いときは RMS だけで aa を駆動する（mora 非対応エンジン向け）。
    let rmsNorm = 0
    let hasRms = false
    if (analyser && analyserBuf) {
      analyser.getByteTimeDomainData(analyserBuf)
      let sumSq = 0
      for (let i = 0; i < analyserBuf.length; i += 1) {
        const v = (analyserBuf[i] - 128) / 128
        sumSq += v * v
      }
      const rms = Math.sqrt(sumSq / analyserBuf.length)
      rmsNorm = clamp01((rms - 0.02) * 4)
      hasRms = true
    }

    let target: MouthValues = { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 }

    if (audio && timeline.length > 0) {
      // AudioContext.outputLatency が取れる環境では、出力バッファ遅延ぶん「実際に耳に届く位置」を補正する。
      // audio.currentTime はデコーダ出力時点の値で、スピーカーに出るのは outputLatency 秒あと。
      const outputLatency =
        ctx?.outputLatency && Number.isFinite(ctx.outputLatency) && ctx.outputLatency > 0 ? ctx.outputLatency : 0
      const now = audio.currentTime + moraTimingOffsetMsRef.current / 1000 - outputLatency
      const idx = findEventIndex(timeline, now)
      if (idx >= 0) {
        const ev = timeline[idx]
        const span = ev.end - ev.start
        const progress = span > 0 ? (now - ev.start) / span : 0
        const envelope = trapezoidEnvelope(progress)
        const currentShape = shapeFor(ev.vowel, ev.devoiced, ev.followingConsonant)

        // 末尾窓に入ったら次イベントの母音を先取りしてブレンドする（co-articulation）。
        let shape = currentShape
        const remaining = ev.end - now
        if (remaining > 0 && remaining < ANTICIPATION_WINDOW_SEC) {
          const next = timeline[idx + 1]
          if (next) {
            const blend = clamp01((ANTICIPATION_WINDOW_SEC - remaining) / ANTICIPATION_WINDOW_SEC)
            const nextShape = shapeFor(next.vowel, next.devoiced, next.followingConsonant)
            shape = lerpShape(currentShape, nextShape, blend)
          }
        }

        // ハイブリッド振幅: RMS が読めるなら強弱に追随、読めなければ envelope のみ。
        const amplitudeScale = hasRms ? RMS_FLOOR + (1 - RMS_FLOOR) * rmsNorm : 1
        target = scaleShape(shape, VOWEL_PEAK * envelope * amplitudeScale)
      }
    } else if (audio && hasRms) {
      // timeline 不在: RMS だけで aa を駆動する。
      target.aa = rmsNorm
    }

    // 時定数ベースの平滑化。alpha = 1 - exp(-delta/tau) でフレームレートに非依存。
    const alphaAttack = delta > 0 ? 1 - Math.exp(-delta / TAU_ATTACK) : 1
    const alphaRelease = delta > 0 ? 1 - Math.exp(-delta / TAU_RELEASE) : 1
    const m = mouthRef.current
    const channels: (keyof MouthValues)[] = ['aa', 'ih', 'ou', 'ee', 'oh']
    for (const ch of channels) {
      const cur = m[ch]
      const tgt = target[ch]
      const alpha = cur < tgt ? alphaAttack : alphaRelease
      m[ch] = cur + (tgt - cur) * alpha
      if (Math.abs(m[ch]) < 1e-4) m[ch] = 0
    }

    rafRef.current = requestAnimationFrame(tick)
  }

  const ensureLoop = () => {
    if (rafRef.current === null && !disposedRef.current) {
      lastTickMsRef.current = null
      rafRef.current = requestAnimationFrame(tick)
    }
  }

  const attachAudio = (audio: HTMLAudioElement) => {
    audioRef.current = audio
    if (audioCtxRef.current) {
      ensureLoop()
      return
    }
    try {
      const Ctor: typeof AudioContext =
        window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return
      const ctx = new Ctor()
      const source = ctx.createMediaElementSource(audio)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.5
      source.connect(analyser)
      // 解析だけして音は止めないように destination にも繋ぐ。
      source.connect(ctx.destination)
      audioCtxRef.current = ctx
      sourceNodeRef.current = source
      analyserRef.current = analyser
      analyserBufRef.current = new Uint8Array(new ArrayBuffer(analyser.fftSize))
    } catch (error) {
      console.warn('[useLipSync] AudioContext setup failed:', error)
    }
    ensureLoop()
  }

  const setSegment = (segment: PoseSegment | null) => {
    if (!segment) {
      timelineRef.current = []
      return
    }
    timelineRef.current = segment.audioQuery ? buildTimeline(segment.audioQuery) : []
    ensureLoop()
  }

  const resumeContext = () => {
    const ctx = audioCtxRef.current
    if (ctx && ctx.state === 'suspended') {
      void ctx.resume().catch(() => {
        // autoplay policy で失敗した場合は次のジェスチャで再試行されるので無視。
      })
    }
  }

  const setMoraTimingOffsetMs = (offsetMs: number) => {
    moraTimingOffsetMsRef.current = Number.isFinite(offsetMs) ? Math.min(200, Math.max(-200, offsetMs)) : 0
  }

  const dispose = () => {
    disposedRef.current = true
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    const ctx = audioCtxRef.current
    if (ctx) {
      ctx.close().catch(() => {
        // 既に閉じている場合のエラーは無視。
      })
    }
    audioCtxRef.current = null
    sourceNodeRef.current = null
    analyserRef.current = null
    analyserBufRef.current = null
    audioRef.current = null
    lastTickMsRef.current = null
  }

  // React 18 StrictMode の二重 mount で dispose 済みフラグが残らないようにリセットする。
  useEffect(() => {
    disposedRef.current = false
    return () => {
      // 親 effect の cleanup から dispose() が呼ばれるが、保険として停止。
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [])

  // useRef を直接返すため毎レンダで同一インスタンスになる。
  const controllerRef = useRef<LipSyncController | null>(null)
  if (!controllerRef.current) {
    controllerRef.current = {
      mouthRef,
      attachAudio,
      setSegment,
      resumeContext,
      setMoraTimingOffsetMs,
      dispose,
    }
  }
  return controllerRef.current
}
