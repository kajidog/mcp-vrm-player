import { describe, expect, it } from 'vitest'
import { REGISTRATION_GUIDE_SHORT, getRegistrationGuide } from '../tools/guidance'

describe('getRegistrationGuide', () => {
  it('open_model_manager が有効ならツール案内ステップを含む', () => {
    const guide = getRegistrationGuide(new Set(), false)
    expect(guide).toContain('open_model_manager')
  })

  it('open_model_manager が無効ならツール案内ステップを落とす', () => {
    const guide = getRegistrationGuide(new Set(['open_model_manager']), false)
    expect(guide).not.toContain('open_model_manager')
    // 残りの手順は引き続き案内される
    expect(guide).toContain('No VRM model is registered yet.')
  })

  it('プレフィックス付きの無効化指定でもツール案内ステップを落とす', () => {
    const guide = getRegistrationGuide(new Set(['vrm_open_model_manager']), false)
    expect(guide).not.toContain('open_model_manager')
  })

  it('knowsHowToUse=true なら短縮ガイドを返す', () => {
    expect(getRegistrationGuide(new Set(), true)).toBe(REGISTRATION_GUIDE_SHORT)
  })
})
