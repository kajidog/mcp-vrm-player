import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { unlink } from 'node:fs/promises'
import { join } from 'node:path'
import {
  DebouncedJsonFile,
  decodeAndValidateGlbBase64,
  normalizeOwnerUserId,
  writeBinaryAtomic,
} from '../persistence.js'
import type { VrmRegistryStore } from '../vrm-registry/store.js'
import type { PoseResource } from './types.js'

const REGISTRY_FILE_NAME = 'pose-registry.json'
const POSE_DIR_NAME = 'poses'
const POSE_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/
export const MAX_VRMA_BYTES = 10 * 1024 * 1024

export interface PoseRegistryStoreOptions {
  cacheDir: string
  registryFilePath?: string
}

export interface RegisterPoseInput {
  ownerUserId?: string
  id: string
  name?: string
  vrmaBase64: string
  loop: boolean
}

export interface PoseVisibilityOptions {
  userId: string
}

export interface UpdatePoseInput {
  name?: string
  loop?: boolean
}

export class PoseRegistryStore {
  private readonly registry = new Map<string, PoseResource>()
  private readonly file: DebouncedJsonFile
  private readonly poseDir: string

  constructor(options: PoseRegistryStoreOptions) {
    this.file = new DebouncedJsonFile(
      options.registryFilePath || join(options.cacheDir, REGISTRY_FILE_NAME),
      'pose registry',
      () => ({ version: 1, savedAt: Date.now(), entries: [...this.registry.values()] })
    )
    this.poseDir = join(options.cacheDir, POSE_DIR_NAME)

    try {
      mkdirSync(this.poseDir, { recursive: true })
    } catch (error) {
      console.warn('Warning: failed to prepare pose registry directory:', error)
    }

    this.loadFromDisk()
  }

  list(): PoseResource[] {
    return [...this.registry.values()].sort((a, b) => b.updatedAt - a.updatedAt)
  }

  listOwned(userId: string): PoseResource[] {
    return this.list().filter((pose) => pose.ownerUserId === userId)
  }

  get(id: string): PoseResource | undefined {
    return this.registry.get(id)
  }

  getOwned(id: string, userId: string): PoseResource | undefined {
    const pose = this.registry.get(id)
    return pose?.ownerUserId === userId ? pose : undefined
  }

  async register(input: RegisterPoseInput): Promise<PoseResource> {
    const id = validatePoseId(input.id)
    if (this.registry.has(id)) throw new Error(`Pose already exists: ${id}`)
    const buffer = decodeAndValidateVrmaBase64(input.vrmaBase64)
    const vrmaFilePath = join(this.poseDir, `${id}.vrma`)
    await writeBinaryAtomic(vrmaFilePath, buffer)
    // await中に同じIDが並行登録されている可能性があるため再確認する（TOCTOU対策）。
    if (this.registry.has(id)) throw new Error(`Pose already exists: ${id}`)

    const now = Date.now()
    const pose: PoseResource = {
      id,
      ownerUserId: normalizeOwnerUserId(input.ownerUserId),
      ...(input.name?.trim() ? { name: input.name.trim() } : {}),
      vrmaFilePath,
      vrmaSizeBytes: buffer.byteLength,
      loop: input.loop,
      createdAt: now,
      updatedAt: now,
    }
    this.registry.set(id, pose)
    this.file.scheduleSave()
    return pose
  }

  update(id: string, fields: UpdatePoseInput, ownerUserId?: string): PoseResource {
    const existing = this.registry.get(id)
    if (!existing) throw new Error(`Pose not found: ${id}`)
    assertOwner(existing, ownerUserId)
    const next: PoseResource = {
      ...existing,
      ...(fields.name !== undefined ? { name: fields.name.trim() || undefined } : {}),
      ...(fields.loop !== undefined ? { loop: fields.loop } : {}),
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
    this.file.scheduleSave()
    try {
      if (existsSync(existing.vrmaFilePath)) await unlink(existing.vrmaFilePath)
    } catch (error) {
      console.warn(`Warning: failed to delete VRMA file ${existing.vrmaFilePath}:`, error)
    }
  }

  readVrmaBase64(id: string): string {
    const pose = this.registry.get(id)
    if (!pose) throw new Error(`Pose not found: ${id}`)
    if (!existsSync(pose.vrmaFilePath)) throw new Error(`VRMA file missing on disk: ${pose.vrmaFilePath}`)
    return readFileSync(pose.vrmaFilePath).toString('base64')
  }

  private loadFromDisk(): void {
    const parsed = this.file.load<{ entries?: PoseResource[] }>()
    if (!parsed || !Array.isArray(parsed.entries)) return
    for (const entry of parsed.entries) {
      if (!entry || typeof entry.id !== 'string') continue
      if (!existsSync(entry.vrmaFilePath)) continue
      this.registry.set(entry.id, { ...entry, ownerUserId: normalizeOwnerUserId(entry.ownerUserId) })
    }
  }

  async flush(): Promise<void> {
    await this.file.flush()
  }
}

/**
 * 読み取り可能なポーズを解決する。
 * 所有しているか、公開VRMから参照されている場合のみ返す。
 */
export function getReadablePose(
  poseRegistry: PoseRegistryStore,
  vrmRegistry: VrmRegistryStore,
  poseId: string,
  userId: string,
  usePublicVrms: boolean
): PoseResource | undefined {
  const pose = poseRegistry.get(poseId)
  if (!pose) return undefined
  if (pose.ownerUserId === userId) return pose
  if (!usePublicVrms) return undefined
  const referencedByPublicVrm = vrmRegistry
    .listVisible({ userId, usePublicVrms })
    .some((model) => model.isPublic && model.poses?.some((attachment) => attachment.poseId === poseId))
  return referencedByPublicVrm ? pose : undefined
}

function assertOwner(pose: PoseResource, ownerUserId: string | undefined): void {
  if (ownerUserId === undefined) return
  if (pose.ownerUserId !== ownerUserId) throw new Error(`Pose not found: ${pose.id}`)
}

export function validatePoseId(value: string): string {
  const id = value.trim()
  if (!POSE_ID_PATTERN.test(id)) throw new Error('Pose ID must match /^[A-Za-z0-9_-]{1,64}$/')
  return id
}

function decodeAndValidateVrmaBase64(value: string): Buffer {
  return decodeAndValidateGlbBase64(value, {
    fieldName: 'vrmaBase64',
    fileLabel: 'VRMA file',
    magicLabel: 'GLB/VRMA',
    maxBytes: MAX_VRMA_BYTES,
  })
}
