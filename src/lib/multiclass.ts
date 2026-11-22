import type { Matte, Person } from './matting'
import { VISION_WASM } from './visionWasm'

const MODEL_PATH = '/mediapipe/selfie_multiclass.tflite'

export async function fetchMulticlassModel(): Promise<Uint8Array> {
  const response = await fetch(MODEL_PATH)
  if (!response.ok) throw new Error(`${MODEL_PATH} → HTTP ${response.status}`)
  return new Uint8Array(await response.arrayBuffer())
}

/**
 * Multiclass, not binary: the binary model cut off hair strands. Cheaper than MODNet (15.6 MB on
 * the already loaded runtime vs 24.7 + 13 MB); compare both under `?matte`.
 */
export async function createMulticlass(): Promise<Matte> {
  const vision = await import('@mediapipe/tasks-vision')

  const modelAssetBuffer = await fetchMulticlassModel()

  const segmenter = await vision.ImageSegmenter.createFromOptions(VISION_WASM, {
    baseOptions: { modelAssetBuffer, delegate: 'GPU' },
    runningMode: 'IMAGE',
    outputCategoryMask: false,
    outputConfidenceMasks: true,
  })

  return {
    async of(canvas) {
      let found: Person | null = null
      // The masks are freed after this synchronous callback, so copy them here.
      segmenter.segment(canvas, (result) => {
        const masks = result.confidenceMasks
        if (!masks?.length) return

        // Mask 0 is background; the six classes sum to 1, so the person is its complement.
        const hintergrund = masks[0]
        const roh = hintergrund.getAsFloat32Array()
        const data = new Float32Array(roh.length)
        for (let i = 0; i < roh.length; i++) data[i] = 1 - roh[i]

        found = { data, width: hintergrund.width, height: hintergrund.height }
      })
      return found
    },

    close() {
      segmenter.close()
    },
  }
}
