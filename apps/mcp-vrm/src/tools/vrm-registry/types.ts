export interface VrmModel {
  id: string
  name: string
  speakerId: number
  isDefault: boolean
  isPublic: boolean
  vrmFilePath: string
  vrmSizeBytes: number
  createdAt: number
  updatedAt: number
}

export type VrmModelMetadata = Omit<VrmModel, 'vrmFilePath'> & {
  vrmFilePath?: string
}
