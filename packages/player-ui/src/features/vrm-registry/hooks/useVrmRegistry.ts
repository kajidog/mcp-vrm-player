import type { App } from '@modelcontextprotocol/ext-apps'
import { useCallback, useEffect, useRef, useState } from 'react'
import { parseToolJson } from '~/lib/toolJson'
import type { RegisterVrmRequest, ReplaceVrmBinaryRequest, UpdateVrmRequest, VrmMetadata } from '../types'

export interface UseVrmRegistry {
  vrms: VrmMetadata[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  register: (input: RegisterVrmRequest) => Promise<VrmMetadata>
  update: (modelId: string, fields: UpdateVrmRequest) => Promise<VrmMetadata>
  replaceBinary: (modelId: string, input: ReplaceVrmBinaryRequest) => Promise<VrmMetadata>
  remove: (modelId: string) => Promise<void>
  setDefault: (modelId: string) => Promise<VrmMetadata>
}

/**
 * `_list_vrms_for_player` などレジストリ系ツールを叩く React フック。
 * - リスト取得は初回マウントで一度走る
 * - register / update / remove / setDefault のあとは自動で `refresh` してリストを揃える
 */
export function useVrmRegistry(app: App | null): UseVrmRegistry {
  const [vrms, setVrms] = useState<VrmMetadata[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const appRef = useRef(app)
  appRef.current = app

  const refresh = useCallback(async () => {
    const currentApp = appRef.current
    if (!currentApp) return
    setLoading(true)
    setError(null)
    try {
      const result = await currentApp.callServerTool({
        name: '_list_vrms_for_player',
        arguments: {},
      })
      const parsed = parseToolJson<{ vrms: VrmMetadata[] }>(result)
      setVrms(parsed.vrms ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  const register = useCallback(
    async (input: RegisterVrmRequest): Promise<VrmMetadata> => {
      const currentApp = appRef.current
      if (!currentApp) throw new Error('App is not ready')
      const result = await currentApp.callServerTool({
        name: '_register_vrm_for_player',
        arguments: { ...input },
      })
      const parsed = parseToolJson<{ vrm: VrmMetadata }>(result)
      await refresh()
      return parsed.vrm
    },
    [refresh]
  )

  const update = useCallback(
    async (modelId: string, fields: UpdateVrmRequest): Promise<VrmMetadata> => {
      const currentApp = appRef.current
      if (!currentApp) throw new Error('App is not ready')
      const result = await currentApp.callServerTool({
        name: '_update_vrm_for_player',
        arguments: { modelId, ...fields },
      })
      const parsed = parseToolJson<{ vrm: VrmMetadata }>(result)
      await refresh()
      return parsed.vrm
    },
    [refresh]
  )

  const remove = useCallback(
    async (modelId: string): Promise<void> => {
      const currentApp = appRef.current
      if (!currentApp) throw new Error('App is not ready')
      const result = await currentApp.callServerTool({
        name: '_delete_vrm_for_player',
        arguments: { modelId },
      })
      // 結果ボディは捨ててよいが isError 判定はする。
      parseToolJson<{ deleted: string }>(result)
      await refresh()
    },
    [refresh]
  )

  const replaceBinary = useCallback(
    async (modelId: string, input: ReplaceVrmBinaryRequest): Promise<VrmMetadata> => {
      const currentApp = appRef.current
      if (!currentApp) throw new Error('App is not ready')
      const result = await currentApp.callServerTool({
        name: '_replace_vrm_binary_for_player',
        arguments: { modelId, ...input },
      })
      const parsed = parseToolJson<{ vrm: VrmMetadata }>(result)
      await refresh()
      return parsed.vrm
    },
    [refresh]
  )

  const setDefault = useCallback((modelId: string) => update(modelId, { isDefault: true }), [update])

  useEffect(() => {
    if (app) {
      void refresh()
    }
  }, [app, refresh])

  return { vrms, loading, error, refresh, register, update, replaceBinary, remove, setDefault }
}
