import { describe, expect, it } from 'vitest'
import { buildNext, composeDescription, filterToolRefs, isToolEnabled } from '../tools/guidance-refs'

describe('guidance-refs', () => {
  describe('isToolEnabled', () => {
    it('無効化指定が無ければ有効と判定する', () => {
      expect(isToolEnabled(new Set(), 'speak_player')).toBe(true)
    })

    it('未プレフィックスの無効化指定を反映する', () => {
      // ヘルパは未プレフィックス名で問い合わせる前提（addToolPrefix が内部で付与する）
      const disabled = new Set(['speak_player'])
      expect(isToolEnabled(disabled, 'speak_player')).toBe(false)
    })

    it('プレフィックス付きの無効化指定も反映する', () => {
      // --disable-tools vrm_speak_player のようにプレフィックス付きで指定された場合
      const disabled = new Set(['vrm_speak_player'])
      expect(isToolEnabled(disabled, 'speak_player')).toBe(false)
    })

    it('別ツールの無効化は影響しない', () => {
      const disabled = new Set(['speak_player'])
      expect(isToolEnabled(disabled, 'find_models')).toBe(true)
    })
  })

  describe('filterToolRefs', () => {
    it('有効なツールを参照するスニペットだけ残す', () => {
      const disabled = new Set(['speak_player'])
      const result = filterToolRefs(disabled, [
        { tool: 'speak_player', text: 'A' },
        { tool: 'find_models', text: 'B' },
      ])
      expect(result).toEqual(['B'])
    })
  })

  describe('buildNext', () => {
    it('一部無効化では有効分のみ連結する', () => {
      const disabled = new Set(['open_model_manager'])
      const next = buildNext(disabled, [
        { tool: 'open_model_manager', text: 'Call vrm_open_model_manager.' },
        { tool: 'speak_player', text: 'Use vrm_speak_player.' },
      ])
      expect(next).toBe('Use vrm_speak_player.')
    })

    it('全候補が無効化されたら undefined を返す', () => {
      const disabled = new Set(['open_model_manager', 'speak_player'])
      const next = buildNext(disabled, [
        { tool: 'open_model_manager', text: 'Call vrm_open_model_manager.' },
        { tool: 'speak_player', text: 'Use vrm_speak_player.' },
      ])
      expect(next).toBeUndefined()
    })
  })

  describe('composeDescription', () => {
    it('無効ツールを参照する文を落とす', () => {
      const disabled = new Set(['speak_player'])
      const description = composeDescription(disabled, 'Base sentence.', [
        { tool: 'speak_player', text: 'Use this before speak_player.' },
      ])
      expect(description).toBe('Base sentence.')
    })

    it('有効ツールを参照する文は連結する', () => {
      const description = composeDescription(new Set(), 'Base sentence.', [
        { tool: 'speak_player', text: 'Use this before speak_player.' },
      ])
      expect(description).toBe('Base sentence. Use this before speak_player.')
    })
  })
})
