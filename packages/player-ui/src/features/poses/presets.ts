import { type VRM, VRMHumanBoneName } from '@pixiv/three-vrm'
import { Euler, Quaternion } from 'three'

// 各プリセットは毎フレーム呼ばれて関与ボーンのみ書き換える。
// 切替時に前ポーズの残骸を残さないよう、apply* の冒頭で関与する全ボーンを identity に戻す。
// 正規化ボーン（getNormalizedBoneNode）を使うことでモデル間の bind pose 差を吸収する。

// 関与ボーン一覧（リセット対象）。指は動かさない（多くの VRM で精度が低いため）。
const POSE_BONES: VRMHumanBoneName[] = [
  VRMHumanBoneName.Spine,
  VRMHumanBoneName.Chest,
  VRMHumanBoneName.UpperChest,
  VRMHumanBoneName.Neck,
  VRMHumanBoneName.Head,
  VRMHumanBoneName.LeftShoulder,
  VRMHumanBoneName.LeftUpperArm,
  VRMHumanBoneName.LeftLowerArm,
  VRMHumanBoneName.LeftHand,
  VRMHumanBoneName.RightShoulder,
  VRMHumanBoneName.RightUpperArm,
  VRMHumanBoneName.RightLowerArm,
  VRMHumanBoneName.RightHand,
]

// 毎フレーム new しないように使い回す。
const _euler = new Euler()
const _quat = new Quaternion()

function resetBones(vrm: VRM): void {
  for (const name of POSE_BONES) {
    const bone = vrm.humanoid.getNormalizedBoneNode(name)
    if (bone) bone.quaternion.identity()
  }
}

function setRot(vrm: VRM, name: VRMHumanBoneName, x: number, y: number, z: number): void {
  const bone = vrm.humanoid.getNormalizedBoneNode(name)
  if (!bone) return
  _euler.set(x, y, z, 'XYZ')
  _quat.setFromEuler(_euler)
  bone.quaternion.copy(_quat)
}

// 自然な腕下げ角度（T-pose から肩を下方向に倒す）。VRM 1.0 正規化ボーンでは Z 回転で arms-down になる。
const ARM_DOWN_Z = Math.PI / 2.6

function applyIdle(vrm: VRM, t: number): void {
  resetBones(vrm)
  // 腕を体側へ降ろす（A-pose 寄り）。
  setRot(vrm, VRMHumanBoneName.LeftUpperArm, 0, 0, ARM_DOWN_Z)
  setRot(vrm, VRMHumanBoneName.RightUpperArm, 0, 0, -ARM_DOWN_Z)
  // 呼吸：胸を ±2.5 度の sin で揺らす。0.6 Hz 程度（period ≈ 1.6 s）。
  const breath = Math.sin(t * Math.PI * 1.2) * 0.04
  const sway = Math.sin(t * Math.PI * 0.5) * 0.015
  setRot(vrm, VRMHumanBoneName.Chest, breath, 0, 0)
  setRot(vrm, VRMHumanBoneName.Spine, breath * 0.5, sway, 0)
  // 頭の小さなノイズ（覗き込みすぎないよう微小）。
  setRot(vrm, VRMHumanBoneName.Head, 0, sway * 0.6, 0)
}

export interface PosePreset {
  readonly kind: 'preset'
  readonly label: string
  readonly applyToVrm: (vrm: VRM, t: number) => void
}

export const POSE_PRESETS = {
  idle: { kind: 'preset', label: '待機', applyToVrm: applyIdle },
} as const satisfies Record<string, PosePreset>

export type PosePresetId = keyof typeof POSE_PRESETS

export const DEFAULT_POSE_ID: PosePresetId = 'idle'

export const BUILTIN_POSE_RESOURCE_IDS = Object.keys(POSE_PRESETS).map(
  (id) => `builtin:${id}`
) as Array<`builtin:${PosePresetId}`>

export function isBuiltinPoseResourceId(value: string): value is `builtin:${PosePresetId}` {
  return BUILTIN_POSE_RESOURCE_IDS.includes(value as `builtin:${PosePresetId}`)
}

export function posePresetIdFromResourceId(value: string): PosePresetId | null {
  if (!isBuiltinPoseResourceId(value)) return null
  const presetId = value.slice('builtin:'.length) as PosePresetId
  return presetId in POSE_PRESETS ? presetId : null
}
