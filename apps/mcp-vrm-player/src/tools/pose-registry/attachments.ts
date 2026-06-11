import type { PoseRegistryStore } from './store.js'
import type { ModelPoseAttachment } from './types.js'
import { isBuiltinPoseResourceId } from './types.js'

/**
 * モデルへのポーズ添付（poses[]）の共通バリデーション。
 * builtin 以外は呼び出しユーザーが所有するポーズのみ参照できる。
 */
export function validatePoseAttachments(
  poseRegistry: PoseRegistryStore,
  userId: string,
  poses: ModelPoseAttachment[] | undefined
): void {
  if (poses === undefined) return
  for (const pose of poses) {
    if (!pose.poseId.trim()) throw new Error('poses[].poseId is required')
    if (!pose.name.trim()) throw new Error('poses[].name is required')
    if (isBuiltinPoseResourceId(pose.poseId)) continue
    if (!poseRegistry.getOwned(pose.poseId, userId)) throw new Error(`Pose not found: ${pose.poseId}`)
  }
}

/**
 * 添付のうち実際に解決可能（builtin またはレジストリに実在）なポーズ名だけを返す。
 * ツールのレスポンスで「指定可能なポーズ名」を案内するための共通ヘルパ。
 */
export function resolvePoseNames(poses: ModelPoseAttachment[] | undefined, poseRegistry: PoseRegistryStore): string[] {
  const names = new Set<string>()
  for (const attachment of poses ?? []) {
    if (!isBuiltinPoseResourceId(attachment.poseId) && !poseRegistry.get(attachment.poseId)) continue
    names.add(attachment.name)
  }
  return [...names]
}
