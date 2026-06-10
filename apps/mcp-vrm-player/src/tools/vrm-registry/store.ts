import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { unlink } from 'node:fs/promises'
import { join } from 'node:path'
import {
  DebouncedJsonFile,
  decodeAndValidateGlbBase64,
  normalizeOwnerUserId,
  writeBinaryAtomic,
} from '../persistence.js'
import { createDefaultBuiltinAttachments, isBuiltinPoseResourceId } from '../pose-registry/types.js'
import { extractVrmThumbnail } from './thumbnail.js'
import type { VrmModel } from './types.js'

const REGISTRY_FILE_NAME = 'vrm-registry.json'
const VRM_DIR_NAME = 'vrms'
export const MAX_VRM_BYTES = 100 * 1024 * 1024

export interface VrmRegistryStoreOptions {
  cacheDir: string
  registryFilePath?: string
}

export interface RegisterVrmInput {
  ownerUserId?: string
  name: string
  speakerId: number
  isDefault?: boolean
  isPublic?: boolean
  poses?: VrmModel['poses']
  emotionBindings?: VrmModel['emotionBindings']
  vrmBase64: string
}

export interface UpdateVrmInput {
  name?: string
  speakerId?: number
  isDefault?: boolean
  isPublic?: boolean
  poses?: VrmModel['poses']
  emotionBindings?: VrmModel['emotionBindings']
}

export interface VrmVisibilityOptions {
  userId: string
  usePublicVrms: boolean
}

/**
 * VRM 登録ストア。メタデータは JSON で永続化、VRM バイナリは個別ファイル保存。
 *
 * 永続化は SessionStateStore と同じく mkdir → atomic rename → デバウンス保存。
 * isDefault は所有者ごとに同時に true となるエントリが 1 件になるよう排他制御する。
 */
export class VrmRegistryStore {
  private readonly registry = new Map<string, VrmModel>()
  private readonly file: DebouncedJsonFile
  private readonly vrmDir: string

  constructor(options: VrmRegistryStoreOptions) {
    this.file = new DebouncedJsonFile(
      options.registryFilePath || join(options.cacheDir, REGISTRY_FILE_NAME),
      'VRM registry',
      () => ({ version: 1, savedAt: Date.now(), entries: [...this.registry.values()] })
    )
    this.vrmDir = join(options.cacheDir, VRM_DIR_NAME)

    try {
      mkdirSync(this.vrmDir, { recursive: true })
    } catch (error) {
      console.warn('Warning: failed to prepare VRM registry directory:', error)
    }

    this.loadFromDisk()
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  list(): VrmModel[] {
    return [...this.registry.values()].sort((a, b) => b.updatedAt - a.updatedAt)
  }

  listVisible(options: VrmVisibilityOptions): VrmModel[] {
    return this.list().filter((model) => isVisibleToUser(model, options))
  }

  get(id: string): VrmModel | undefined {
    return this.registry.get(id)
  }

  getVisible(id: string, options: VrmVisibilityOptions): VrmModel | undefined {
    const model = this.registry.get(id)
    return model && isVisibleToUser(model, options) ? model : undefined
  }

  getDefault(userId?: string): VrmModel | undefined {
    for (const model of this.registry.values()) {
      if (model.isDefault && (userId === undefined || model.ownerUserId === userId)) return model
    }
    return undefined
  }

  async register(input: RegisterVrmInput): Promise<VrmModel> {
    const id = randomUUID()
    const vrmFilePath = join(this.vrmDir, `${id}.vrm`)
    const buffer = decodeAndValidateVrmBase64(input.vrmBase64)

    await writeBinaryAtomic(vrmFilePath, buffer)
    const thumbnail = extractVrmThumbnail(buffer)

    const now = Date.now()
    const ownerUserId = normalizeOwnerUserId(input.ownerUserId)
    const model: VrmModel = {
      id,
      ownerUserId,
      name: input.name,
      speakerId: input.speakerId,
      isDefault: input.isDefault === true || !this.hasOwnedModel(ownerUserId),
      isPublic: input.isPublic === true,
      poses: input.poses ?? createDefaultBuiltinAttachments(),
      ...(input.emotionBindings !== undefined ? { emotionBindings: input.emotionBindings } : {}),
      vrmFilePath,
      vrmSizeBytes: buffer.byteLength,
      ...(thumbnail
        ? { thumbnailBase64: thumbnail.thumbnailBase64, thumbnailMimeType: thumbnail.thumbnailMimeType }
        : {}),
      createdAt: now,
      updatedAt: now,
    }

    this.registry.set(id, model)
    if (model.isDefault) {
      this.clearDefaultExcept(id, model.ownerUserId)
    }
    this.ensureDefaultForOwner(model.ownerUserId, model.isDefault ? id : undefined)
    this.file.scheduleSave()
    return model
  }

  update(id: string, fields: UpdateVrmInput, ownerUserId?: string): VrmModel {
    const existing = this.registry.get(id)
    if (!existing) throw new Error(`VRM not found: ${id}`)
    assertOwner(existing, ownerUserId)

    const next: VrmModel = {
      ...existing,
      ...(fields.name !== undefined ? { name: fields.name } : {}),
      ...(fields.speakerId !== undefined ? { speakerId: fields.speakerId } : {}),
      ...(fields.isDefault !== undefined ? { isDefault: fields.isDefault } : {}),
      ...(fields.isPublic !== undefined ? { isPublic: fields.isPublic } : {}),
      ...(fields.poses !== undefined ? { poses: fields.poses } : {}),
      ...(fields.emotionBindings !== undefined ? { emotionBindings: fields.emotionBindings } : {}),
      updatedAt: Date.now(),
    }

    this.registry.set(id, next)
    if (fields.isDefault === true) {
      this.clearDefaultExcept(id, next.ownerUserId)
    }
    this.ensureDefaultForOwner(next.ownerUserId, fields.isDefault === true ? id : undefined)
    this.file.scheduleSave()
    return this.registry.get(id) ?? next
  }

  async replaceBinary(id: string, vrmBase64: string, ownerUserId?: string): Promise<VrmModel> {
    const existing = this.registry.get(id)
    if (!existing) throw new Error(`VRM not found: ${id}`)
    assertOwner(existing, ownerUserId)

    const buffer = decodeAndValidateVrmBase64(vrmBase64)
    await writeBinaryAtomic(existing.vrmFilePath, buffer)
    const thumbnail = extractVrmThumbnail(buffer)

    const next: VrmModel = {
      ...existing,
      vrmSizeBytes: buffer.byteLength,
      thumbnailBase64: thumbnail?.thumbnailBase64,
      thumbnailMimeType: thumbnail?.thumbnailMimeType,
      updatedAt: Date.now(),
    }
    this.registry.set(id, next)
    this.file.scheduleSave()
    return next
  }

  async delete(id: string, ownerUserId?: string): Promise<void> {
    const existing = this.registry.get(id)
    if (!existing) return
    assertOwner(existing, ownerUserId)

    this.registry.delete(id)
    this.ensureDefaultForOwner(existing.ownerUserId)
    this.file.scheduleSave()

    try {
      if (existsSync(existing.vrmFilePath)) {
        await unlink(existing.vrmFilePath)
      }
    } catch (error) {
      console.warn(`Warning: failed to delete VRM file ${existing.vrmFilePath}:`, error)
    }
  }

  setDefault(id: string, ownerUserId?: string): VrmModel {
    return this.update(id, { isDefault: true }, ownerUserId)
  }

  readVrmBase64(id: string): string {
    const model = this.registry.get(id)
    if (!model) throw new Error(`VRM not found: ${id}`)
    if (!existsSync(model.vrmFilePath)) {
      throw new Error(`VRM file missing on disk: ${model.vrmFilePath}`)
    }
    return readFileSync(model.vrmFilePath).toString('base64')
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private clearDefaultExcept(keepId: string, ownerUserId: string): void {
    for (const [id, model] of this.registry) {
      if (id !== keepId && model.ownerUserId === ownerUserId && model.isDefault) {
        this.registry.set(id, { ...model, isDefault: false, updatedAt: Date.now() })
      }
    }
  }

  private hasOwnedModel(ownerUserId: string): boolean {
    for (const model of this.registry.values()) {
      if (model.ownerUserId === ownerUserId) return true
    }
    return false
  }

  private ensureDefaultForOwner(ownerUserId: string, preferredId?: string): void {
    const owned = [...this.registry.values()].filter((model) => model.ownerUserId === ownerUserId)
    if (owned.length === 0) return

    const defaults = owned.filter((model) => model.isDefault)
    const keep =
      (preferredId ? owned.find((model) => model.id === preferredId) : undefined) ??
      defaults.sort((a, b) => b.updatedAt - a.updatedAt)[0] ??
      owned.sort((a, b) => b.updatedAt - a.updatedAt)[0]
    if (!keep) return

    const now = Date.now()
    for (const model of owned) {
      const shouldBeDefault = model.id === keep.id
      if (model.isDefault !== shouldBeDefault) {
        this.registry.set(model.id, { ...model, isDefault: shouldBeDefault, updatedAt: now })
      }
    }
  }

  private loadFromDisk(): void {
    const parsed = this.file.load<{ entries?: VrmModel[] }>()
    if (!parsed || !Array.isArray(parsed.entries)) return

    for (const entry of parsed.entries) {
      if (!entry || typeof entry.id !== 'string') continue
      if (!existsSync(entry.vrmFilePath)) {
        // バイナリが消えているエントリは無視（DB だけ残った状態を救う）
        continue
      }
      const poses = entry.poses?.filter(
        (pose) => !pose.poseId.startsWith('builtin:') || isBuiltinPoseResourceId(pose.poseId)
      )
      this.registry.set(entry.id, {
        ...entry,
        ownerUserId: normalizeOwnerUserId(entry.ownerUserId),
        ...(poses ? { poses } : {}),
      })
    }
    const ownerIds = new Set([...this.registry.values()].map((entry) => entry.ownerUserId))
    for (const ownerUserId of ownerIds) this.ensureDefaultForOwner(ownerUserId)
  }

  // テスト用: デバウンス完了を待つ
  async flush(): Promise<void> {
    await this.file.flush()
  }
}

function isVisibleToUser(model: VrmModel, options: VrmVisibilityOptions): boolean {
  return model.ownerUserId === options.userId || (options.usePublicVrms && model.isPublic)
}

function assertOwner(model: VrmModel, ownerUserId: string | undefined): void {
  if (ownerUserId === undefined) return
  if (model.ownerUserId !== ownerUserId) {
    throw new Error(`VRM not found: ${model.id}`)
  }
}

function decodeAndValidateVrmBase64(value: string): Buffer {
  return decodeAndValidateGlbBase64(value, {
    fieldName: 'vrmBase64',
    fileLabel: 'VRM file',
    magicLabel: 'GLB/VRM',
    maxBytes: MAX_VRM_BYTES,
  })
}
