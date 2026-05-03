import type { App } from '@modelcontextprotocol/ext-apps'
import type { VrmPayload, VrmSource } from '../types'
import { isRecord, readString } from './vrmPayload'

export interface ResolvedVrmSource {
  source: VrmSource | null
  error?: string
  // 生成した blob URL は使い終わったら revoke させるために返す。
  revokeUrl?: string
}

interface ResolveOptions {
  isDefault?: boolean
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes.buffer
}

// iframe からそのまま `<img>` や fetch で読める URL かどうかの粗い判定。
function isLikelyBrowserLoadableUrl(value: string): boolean {
  return /^(https?:|blob:|data:|\.{1,2}\/|\/@fs\/|\/assets\/)/.test(value)
}

// OS のローカルパス（unix 絶対パス・Windows ドライブ・file://）に見える文字列か。
// iframe からは直接読めないので、こうしたパスは弾いてエラーにする。
function isLikelyLocalPath(value: string): boolean {
  return (
    value.startsWith('file://') ||
    value.startsWith('/home/') ||
    value.startsWith('/Users/') ||
    value.startsWith('/tmp/') ||
    value.startsWith('/var/') ||
    value.startsWith('/private/') ||
    value.startsWith('/Volumes/') ||
    /^[A-Za-z]:[\\/]/.test(value)
  )
}

// MCP の `resources/read` レスポンスから VRM データ部分を取り出す。
// blob は base64 とみなして ArrayBuffer 化、text は Blob URL に包む。
function getResourceSource(readResult: unknown): Pick<VrmSource, 'data' | 'src'> | null {
  if (!isRecord(readResult)) return null
  const contents = readResult.contents
  if (!Array.isArray(contents) || contents.length === 0) return null

  const first = contents[0]
  if (!isRecord(first)) return null

  const blob = readString(first, 'blob')
  if (blob) {
    return { data: base64ToArrayBuffer(blob) }
  }

  const text = readString(first, 'text')
  if (text) {
    const mimeType = readString(first, 'mimeType') ?? 'model/gltf-binary'
    return { src: URL.createObjectURL(new Blob([text], { type: mimeType })) }
  }

  return null
}

// 同一フィールドの「デフォルト/通常」のラベルを毎回三項演算子で書くのを避ける小さなヘルパ。
function decorate(value: string, options: ResolveOptions, prefix = 'default: '): string {
  return options.isDefault ? `${prefix}${value}` : value
}

/**
 * `VrmPayload` を実際に three.js が読める `VrmSource` まで解決する。
 * 解決順は url → base64 → resourceUri → path（path は iframe で読めないのでエラー）。
 * 何も指定が無ければ `{ source: null }` を返し、UI 側で空表示にする。
 */
export async function resolveVrmSource(
  app: App,
  payload: VrmPayload | null,
  options: ResolveOptions = {}
): Promise<ResolvedVrmSource> {
  if (!payload) {
    return { source: null }
  }

  // 1. 直接 URL（http(s) / data / blob / 相対パス等）。
  if (payload.vrmUrl) {
    const directUrl = payload.vrmUrl
    if (isLikelyLocalPath(directUrl) && !isLikelyBrowserLoadableUrl(directUrl)) {
      return {
        source: null,
        error:
          '生のローカルパスは iframe から直接読めません。vrmBase64 か vrmResourceUri、または host から配信された URL を渡してください。',
      }
    }

    return {
      source: {
        src: directUrl,
        label: decorate(directUrl, options),
        note: options.isDefault ? 'デフォルト VRM を表示中' : directUrl.startsWith('data:') ? 'data URL' : undefined,
        isDefault: options.isDefault,
      },
    }
  }

  // 2. インライン base64（VRM バイナリを丸ごと埋め込んだケース）。
  if (payload.vrmBase64) {
    return {
      source: {
        data: base64ToArrayBuffer(payload.vrmBase64),
        label: options.isDefault ? 'default inline base64 VRM' : 'inline base64 VRM',
        note: options.isDefault ? 'デフォルト VRM を表示中' : 'inline VRM を表示中',
        isDefault: options.isDefault,
      },
    }
  }

  // 3. MCP リソース URI（サーバ側 `resources/read` 経由で取得）。
  if (payload.vrmResourceUri) {
    const resource = await app.readServerResource({ uri: payload.vrmResourceUri })
    const resourceSource = getResourceSource(resource)
    if (!resourceSource) {
      return {
        source: null,
        error: `resources/read で VRM データを取得できませんでした: ${payload.vrmResourceUri}`,
      }
    }

    return {
      source: {
        ...resourceSource,
        label: decorate(payload.vrmResourceUri, options),
        note: options.isDefault ? 'デフォルト server resource から読み込み' : 'server resource から読み込み',
        isDefault: options.isDefault,
      },
      revokeUrl: resourceSource.src,
    }
  }

  // 4. 生ローカルパスはサンドボックスの iframe からは開けないので明示エラー。
  if (payload.vrmPath) {
    return {
      source: null,
      error: `ローカルパス "${payload.vrmPath}" は iframe から直接開けません。server resource か base64 に変換して UI に渡してください。`,
    }
  }

  return { source: null }
}
