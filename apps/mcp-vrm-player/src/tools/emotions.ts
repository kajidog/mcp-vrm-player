export const EMOTION_NAMES = ['neutral', 'happy', 'angry', 'sad', 'relaxed', 'surprised', 'serious'] as const

export type EmotionName = (typeof EMOTION_NAMES)[number]

export interface EmotionBinding {
  emotion: EmotionName
  expressionName?: string
  speakerId?: number
  weight?: number
}

export function isEmotionName(value: string): value is EmotionName {
  return (EMOTION_NAMES as readonly string[]).includes(value)
}

export function normalizeEmotion(value: string | undefined): EmotionName {
  return value && isEmotionName(value) ? value : 'neutral'
}

/** 指定の感情にバインドされた表情/話者設定を返す。 */
export function resolveEmotionBinding(
  bindings: EmotionBinding[] | undefined,
  emotion: EmotionName
): EmotionBinding | undefined {
  return bindings?.find((binding) => binding.emotion === emotion)
}

/**
 * 感情バインディング配列を検証する。zod スキーマを通らない経路
 * （ストアへの直接書き込み等）でも同じ制約を保証するための共通バリデータ。
 */
export function validateEmotionBindings(bindings: EmotionBinding[] | undefined): void {
  if (bindings === undefined) return
  const seen = new Set<string>()
  for (const binding of bindings) {
    if (!isEmotionName(binding.emotion)) throw new Error(`Unknown emotion: ${binding.emotion}`)
    if (seen.has(binding.emotion)) throw new Error(`Duplicate emotion binding: ${binding.emotion}`)
    seen.add(binding.emotion)
    if (binding.expressionName !== undefined && !binding.expressionName.trim()) {
      throw new Error('emotionBindings[].expressionName must not be empty')
    }
    if (binding.weight !== undefined && (binding.weight < 0 || binding.weight > 1)) {
      throw new Error('emotionBindings[].weight must be between 0 and 1')
    }
  }
}
