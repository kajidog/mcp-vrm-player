import type { AudioQuery } from './types.js'

/**
 * マルチスピーカーテキスト "1:Hello\n2:World" をパースする
 */
export const parseStringInput = (input: string): Array<{ text: string; speaker?: number }> => {
  // \n と \\n の両方に対応するため、まず \\n を \n に変換してから分割
  const normalizedInput = input.replace(/\\n/g, '\n')
  const lines = normalizedInput.split('\n').filter((line) => line.trim())
  return lines.map((line) => {
    const match = line.match(/^(\d+):(.*)$/)
    if (match) {
      return { text: match[2].trim(), speaker: Number.parseInt(match[1], 10) }
    }
    return { text: line }
  })
}

/**
 * JSON 文字列を AudioQuery にパースする
 */
export const parseAudioQuery = (query: string, speedScale?: number): AudioQuery => {
  const audioQuery = JSON.parse(query) as AudioQuery
  if (speedScale !== undefined) {
    audioQuery.speedScale = speedScale
  }
  return audioQuery
}

/**
 * ブラウザ環境かどうかを判定します
 * @returns ブラウザ環境の場合はtrue、それ以外の場合はfalse
 */
export function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined'
}

/**
 * IE用の拡張Navigatorインターフェース
 */
interface IENavigator extends Navigator {
  msSaveOrOpenBlob?: (blob: Blob, fileName: string) => boolean
}

/**
 * ブラウザ環境でバイナリデータをダウンロードさせる
 * @param data バイナリデータ
 * @param filename ダウンロード時のファイル名
 * @param mimeType MIMEタイプ（デフォルトはaudio/wav）
 * @returns ダウンロードしたファイル名
 */
export function downloadBlob(data: ArrayBuffer | Blob, filename: string, mimeType = 'audio/wav'): Promise<string> {
  if (!isBrowser()) {
    return Promise.reject(new Error('この関数はブラウザ環境でのみ使用できます'))
  }

  return new Promise<string>((resolve, reject) => {
    try {
      // Blobオブジェクトを作成（既にBlobなら変換しない）
      const blob = data instanceof Blob ? data : new Blob([data], { type: mimeType })

      // URLを作成
      const url = URL.createObjectURL(blob)

      // IE11用のMS独自オブジェクトのチェック
      const ieNavigator = window.navigator as IENavigator
      if (ieNavigator.msSaveOrOpenBlob) {
        ieNavigator.msSaveOrOpenBlob(blob, filename)
        resolve(filename)
        return
      }

      // a要素を作成
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.style.display = 'none'

      // ダウンロード完了を検知するためのイベントリスナー
      const cleanup = () => {
        window.removeEventListener('focus', cleanup)
        if (document.body.contains(a)) {
          document.body.removeChild(a)
        }
        URL.revokeObjectURL(url)
        resolve(filename)
      }

      // Safari用の対応
      window.addEventListener('focus', cleanup)

      // bodyに追加してクリック
      document.body.appendChild(a)
      a.click()

      // フォールバックタイマー
      setTimeout(cleanup, 1000)
    } catch (error) {
      reject(error)
    }
  })
}
