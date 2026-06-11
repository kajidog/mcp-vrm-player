import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PoseRegistryStore } from '../pose-registry/store.js'

const TMP = join(process.cwd(), '__test_pose_registry_tmp__')
const SAMPLE_VRMA_BYTES = Buffer.from([0x67, 0x6c, 0x54, 0x46, 0x02, 0x00, 0x00, 0x00, 0x0c, 0x00, 0x00, 0x00])
const SAMPLE_VRMA_BASE64 = SAMPLE_VRMA_BYTES.toString('base64')

function createStore() {
  return new PoseRegistryStore({ cacheDir: TMP })
}

describe('PoseRegistryStore', () => {
  beforeEach(() => {
    rmSync(TMP, { recursive: true, force: true })
    mkdirSync(TMP, { recursive: true })
  })

  afterEach(() => {
    rmSync(TMP, { recursive: true, force: true })
  })

  it('VRMA poseを登録するとメタとバイナリが保存される', async () => {
    const store = createStore()
    const pose = await store.register({ id: 'wave_alt', name: 'wave', loop: true, vrmaBase64: SAMPLE_VRMA_BASE64 })

    expect(pose.id).toBe('wave_alt')
    expect(pose.name).toBe('wave')
    expect(pose.loop).toBe(true)
    expect(pose.vrmaSizeBytes).toBe(SAMPLE_VRMA_BYTES.byteLength)
    expect(existsSync(pose.vrmaFilePath)).toBe(true)
    expect(readFileSync(pose.vrmaFilePath)).toEqual(SAMPLE_VRMA_BYTES)
  })

  it('重複IDとbuiltin prefixを拒否する', async () => {
    const store = createStore()
    await store.register({ id: 'wave_alt', loop: true, vrmaBase64: SAMPLE_VRMA_BASE64 })
    await expect(store.register({ id: 'wave_alt', loop: true, vrmaBase64: SAMPLE_VRMA_BASE64 })).rejects.toThrow(
      /already exists/
    )
    await expect(store.register({ id: 'builtin:wave', loop: true, vrmaBase64: SAMPLE_VRMA_BASE64 })).rejects.toThrow(
      /Pose ID/
    )
  })

  it('永続化したJSONを別インスタンスで読み戻せる', async () => {
    const store = createStore()
    await store.register({ id: 'bow_v2', loop: false, vrmaBase64: SAMPLE_VRMA_BASE64 })
    await store.flush()

    const reloaded = createStore()
    expect(reloaded.get('bow_v2')?.loop).toBe(false)
    expect(reloaded.readVrmaBase64('bow_v2')).toBe(SAMPLE_VRMA_BASE64)
  })

  it('同じIDの並行登録は片方だけ成功し、ファイルは成功した側の内容になる', async () => {
    const store = createStore()
    const otherBytes = Buffer.concat([SAMPLE_VRMA_BYTES, Buffer.from([0x00, 0x00, 0x00, 0x00])])
    const results = await Promise.allSettled([
      store.register({ id: 'race', loop: true, vrmaBase64: SAMPLE_VRMA_BASE64 }),
      store.register({ id: 'race', loop: false, vrmaBase64: otherBytes.toString('base64') }),
    ])

    const fulfilled = results.filter((result) => result.status === 'fulfilled')
    const rejected = results.filter((result) => result.status === 'rejected')
    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
      message: expect.stringMatching(/already exists/),
    })

    // メタデータが指すサイズと実ファイルの内容が一致する（敗者がファイルを上書きしていない）。
    const winner = (fulfilled[0] as PromiseFulfilledResult<Awaited<ReturnType<typeof store.register>>>).value
    const onDisk = readFileSync(winner.vrmaFilePath)
    expect(onDisk.byteLength).toBe(winner.vrmaSizeBytes)
  })

  it('ポーズ一覧と更新はユーザーごとに分離される', async () => {
    const store = createStore()
    const a = await store.register({
      ownerUserId: 'user-a',
      id: 'wave_a',
      loop: true,
      vrmaBase64: SAMPLE_VRMA_BASE64,
    })
    const b = await store.register({
      ownerUserId: 'user-b',
      id: 'wave_b',
      loop: true,
      vrmaBase64: SAMPLE_VRMA_BASE64,
    })

    expect(store.listOwned('user-a').map((pose) => pose.id)).toEqual([a.id])
    expect(store.listOwned('user-b').map((pose) => pose.id)).toEqual([b.id])
    expect(() => store.update(a.id, { name: 'blocked' }, 'user-b')).toThrow(/Pose not found/)
    await expect(store.delete(a.id, 'user-b')).rejects.toThrow(/Pose not found/)
    expect(store.get(a.id)).toBeDefined()
  })
})
