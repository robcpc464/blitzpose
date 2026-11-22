import type { FaceLandmarker } from '@mediapipe/tasks-vision'
import { VISION_WASM } from './visionWasm'

const MODEL_PATH = '/mediapipe/face_landmarker.task'

export type ProgressFn = (fraction: number) => void

// Dynamic import keeps MediaPipe in its own chunk so the page renders at once.
export async function createLandmarker(onProgress?: ProgressFn): Promise<FaceLandmarker> {
  const vision = await import('@mediapipe/tasks-vision')

  // Fetched ourselves because `modelAssetPath` reports no progress.
  const modelAssetBuffer = await fetchModel(onProgress)

  return vision.FaceLandmarker.createFromOptions(VISION_WASM, {
    baseOptions: { modelAssetBuffer, delegate: 'GPU' },
    outputFaceBlendshapes: true,
    outputFacialTransformationMatrixes: true,
    runningMode: 'VIDEO',
    numFaces: 1,
  })
}

async function fetchModel(onProgress?: ProgressFn): Promise<Uint8Array> {
  const response = await fetch(MODEL_PATH)
  if (!response.ok) {
    throw new Error(`${MODEL_PATH} → HTTP ${response.status}. Run \`npm run assets\`.`)
  }

  const total = Number(response.headers.get('content-length'))
  if (!onProgress || !total || !response.body) {
    return new Uint8Array(await response.arrayBuffer())
  }

  // Not preallocated: with Content-Encoding the length is the compressed size.
  const reader = response.body.getReader()
  const chunks: Uint8Array<ArrayBuffer>[] = []
  let loaded = 0

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    loaded += value.length
    onProgress(Math.min(loaded / total, 1))
  }

  return new Uint8Array(await new Blob(chunks).arrayBuffer())
}
