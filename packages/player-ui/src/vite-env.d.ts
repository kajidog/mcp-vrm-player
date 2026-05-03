/// <reference types="vite/client" />

declare module 'three/examples/jsm/loaders/GLTFLoader.js' {
  import type { Object3D } from 'three'

  export interface GLTF {
    scene: Object3D
    userData: Record<string, unknown>
  }

  export interface GLTFParser {}

  export class GLTFLoader {
    register(callback: (parser: GLTFParser) => unknown): this
    load(
      url: string,
      onLoad: (gltf: GLTF) => void,
      onProgress?: (event: ProgressEvent) => void,
      onError?: (error: unknown) => void
    ): void
    parse(
      data: ArrayBuffer | string,
      path: string,
      onLoad: (gltf: GLTF) => void,
      onError?: (error: unknown) => void
    ): void
  }
}
