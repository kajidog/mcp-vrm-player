import { useRef, useState } from 'react'

interface UseVrmFileDropArgs {
  onFile: (file: File) => Promise<void>
}

/**
 * D&D / ファイル選択のどちらでも 1 ファイル目を `onFile` に渡すフック。
 * 呼び出し側は `dropHandlers` をドロップ領域の div に、`inputProps` を
 * 隠し input に展開すればよい。
 */
export function useVrmFileDrop({ onFile }: UseVrmFileDropArgs) {
  const [isDragging, setIsDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)

  // 複数ファイルが渡されても先頭のみ採用する（VRM は単一表示のため）。
  const loadFirstFile = async (files: FileList | null) => {
    const file = files?.[0]
    if (!file) return
    await onFile(file)
  }

  return {
    isDragging,
    inputRef,
    openFilePicker: () => inputRef.current?.click(),
    dropHandlers: {
      onDragEnter: (event: React.DragEvent) => {
        event.preventDefault()
        setIsDragging(true)
      },
      onDragOver: (event: React.DragEvent) => {
        // dropEffect を明示しないとブラウザが drop を拒否することがある。
        event.preventDefault()
        event.dataTransfer.dropEffect = 'copy'
      },
      onDragLeave: (event: React.DragEvent) => {
        event.preventDefault()
        // 子要素に出入りしただけのイベントを無視（`relatedTarget` が領域内なら継続中）。
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
        setIsDragging(false)
      },
      onDrop: async (event: React.DragEvent) => {
        event.preventDefault()
        setIsDragging(false)
        await loadFirstFile(event.dataTransfer.files)
      },
    },
    inputProps: {
      ref: inputRef,
      type: 'file',
      accept: '.vrm,model/gltf-binary,application/octet-stream',
      className: 'hidden',
      onChange: async (event: React.ChangeEvent<HTMLInputElement>) => {
        // await 後は React が event.currentTarget を null 化するため、先に要素を捕捉する。
        const input = event.currentTarget
        await loadFirstFile(input.files)
        // 同じファイルを連続選択しても onChange が発火するように value をリセット。
        input.value = ''
      },
    },
  }
}
