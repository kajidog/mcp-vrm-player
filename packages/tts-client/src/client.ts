import { createEngine } from './engines/index.js'
import type { TtsEngine } from './engines/types.js'
import { handleError } from './error.js'
import { AudioFileManager } from './services/file-manager.js'
import { SpeechService } from './services/speech-service.js'
import type { AudioQuery, TtsConfig } from './types.js'

export class TtsClient {
  private readonly engine: TtsEngine
  private readonly fileManager: AudioFileManager
  private readonly speechService: SpeechService

  constructor(config: TtsConfig) {
    this.validateConfig(config)

    const defaultSpeaker = config.defaultSpeaker ?? 1
    const defaultSpeedScale = config.defaultSpeedScale ?? 1.0

    this.engine =
      config.ttsEngine ??
      createEngine({
        engine: config.engine,
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
      })

    this.fileManager = new AudioFileManager()

    this.speechService = new SpeechService(this.engine, this.fileManager, {
      defaultSpeaker,
      defaultSpeedScale,
      defaultVolumeScale: config.defaultVolumeScale,
      defaultPitchScale: config.defaultPitchScale,
      defaultPrePhonemeLength: config.defaultPrePhonemeLength,
      defaultPostPhonemeLength: config.defaultPostPhonemeLength,
    })
  }

  public async generateQuery(text: string, speaker?: number, speedScale?: number): Promise<AudioQuery> {
    return this.speechService.generateQuery(text, speaker, speedScale)
  }

  public async generateAudioFile(
    textOrQuery: string | AudioQuery,
    outputPath?: string,
    speaker?: number,
    speedScale?: number
  ): Promise<string> {
    return this.speechService.generateAudioFile(textOrQuery, outputPath, speaker, speedScale)
  }

  private validateConfig(config: TtsConfig): void {
    // TODO:engin側でするべき？
    if (config.baseUrl) {
      try {
        new URL(config.baseUrl)
      } catch {
        throw new Error('無効なTTS Engine URLです')
      }
    }
  }

  public async getSpeakers() {
    try {
      return await this.engine.getSpeakers()
    } catch (error) {
      throw handleError('スピーカー一覧取得中にエラーが発生しました', error)
    }
  }

  public async getSpeakerInfo(uuid: string) {
    try {
      if (!this.engine.getSpeakerInfo) {
        throw new Error(`${this.engine.displayName} does not support speaker info`)
      }
      return await this.engine.getSpeakerInfo(uuid)
    } catch (error) {
      throw handleError('スピーカー情報取得中にエラーが発生しました', error)
    }
  }

  public async checkHealth(): Promise<{ connected: boolean; version?: string; url: string }> {
    return this.engine.checkHealth()
  }

  public getEngine(): TtsEngine {
    return this.engine
  }
}
