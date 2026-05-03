import { useEffect, useRef } from 'react'

/**
 * `URL.createObjectURL` で作った blob URL の寿命を管理するフック。
 * 直前に保持していた URL を必ず revoke してから差し替えるので、
 * 連続して VRM を切り替えてもメモリリークしない。
 */
export function useRevokableObjectUrl() {
  const objectUrlRef = useRef<string | null>(null)

  // 新しい URL に差し替える前に古い URL を解放する。null を渡せば解放のみ。
  const replaceObjectUrl = (nextUrl: string | null) => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
    }
    objectUrlRef.current = nextUrl
  }

  // アンマウント時にも残った URL を解放する。
  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current)
      }
      objectUrlRef.current = null
    }
  }, [])

  return { replaceObjectUrl }
}
