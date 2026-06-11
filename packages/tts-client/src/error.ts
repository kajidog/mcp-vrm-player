/**
 * エラーハンドリングを行い、適切なエラーメッセージとともに例外をスローします
 * @param message エラーメッセージのプレフィックス
 * @param error 発生したエラー
 * @returns never（常に例外をスロー）
 */
export function handleError(message: string, error: unknown): never {
  // VoicevoxError はコード・detail・スタックを保ったまま伝搬させる。
  // ここで再ラップ＋ログすると engine → service → client の各層で三重に
  // ラップ・出力されるため、ログは消費側（境界）に任せる。
  if (error instanceof VoicevoxError) throw error
  const errorMsg = error instanceof Error ? error.message : String(error)
  throw new VoicevoxError(`${message}: ${errorMsg}`, VoicevoxErrorCode.UNKNOWN_ERROR, error)
}

/**
 * VOICEVOX関連のエラーコード
 */
export enum VoicevoxErrorCode {
  API_CONNECTION_ERROR = 'api_connection_error',
  SYNTHESIS_ERROR = 'synthesis_error',
  FILE_OPERATION_ERROR = 'file_operation_error',
  UNKNOWN_ERROR = 'unknown_error',
}

/**
 * VOICEVOXエラークラス
 */
export class VoicevoxError extends Error {
  code: VoicevoxErrorCode
  originalError?: unknown

  constructor(message: string, code: VoicevoxErrorCode = VoicevoxErrorCode.UNKNOWN_ERROR, originalError?: unknown) {
    super(message)
    this.name = 'VoicevoxError'
    this.code = code
    this.originalError = originalError
    // Error.cause としても連鎖させ、標準のエラー連鎖表示（Node の出力等）で原因を辿れるようにする。
    if (originalError !== undefined) (this as Error & { cause?: unknown }).cause = originalError
  }

  /**
   * エラー発生箇所とスタックトレースを含むエラーの詳細情報を取得
   */
  getDetailedMessage(): string {
    let details = `${this.message} [${this.code}]`

    if (this.originalError instanceof Error) {
      details += `\nOriginal Error: ${this.originalError.message}`
      if (this.originalError.stack) {
        details += `\nStack: ${this.originalError.stack}`
      }
    }

    return details
  }
}
