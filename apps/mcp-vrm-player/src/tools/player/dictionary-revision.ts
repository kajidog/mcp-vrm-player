import { DebouncedJsonFile } from '../persistence.js'

// 再起動でリビジョンが 0 に戻ると、辞書編集前に生成された古いキャッシュ音声が
// 同じキーで復活してしまうため、ファイルに永続化する。

let revision = 0
let file: DebouncedJsonFile | null = null

export function initPlayerDictionaryRevision(filePath: string): void {
  file = new DebouncedJsonFile(filePath, 'dictionary revision', () => ({ version: 1, revision }))
  const loaded = file.load<{ revision?: number }>()
  if (typeof loaded?.revision === 'number' && Number.isFinite(loaded.revision)) {
    revision = loaded.revision
  }
}

export function bumpPlayerDictionaryRevision(): void {
  revision += 1
  file?.scheduleSave()
}

export function getPlayerDictionaryRevision(): number {
  return revision
}

export async function flushPlayerDictionaryRevision(): Promise<void> {
  await file?.flush()
}
