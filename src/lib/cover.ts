import type { NormalizedLandmark } from '@mediapipe/tasks-vision'
import { fetchMulticlassModel } from './multiclass'
import type { Box } from './roi'
import { VISION_WASM } from './visionWasm'

// Lip contour and nose: what a hand or a mask hides first.
const LOWER_FACE = [
  61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185, 1, 2,
  4, 5, 98, 327, 195, 164,
]

// Labels of selfie_multiclass_256x256. A beard counts as hair.
const HAIR = 1
const FACE_SKIN = 3

// The model's input size.
const SIDE = 256

// Times the face box. 2.2 still caught a hand on a 320 px frame where 1.6 missed it (measured).
const CONTEXT = 2.2

export type CoverMeter = {
  /** Share of lip and nose points the segmenter sees as neither face skin nor hair. */
  measure(video: HTMLVideoElement, landmarks: NormalizedLandmark[], face: Box, now: number): number
  close(): void
}

/** Segments a crop around the face: on the whole frame a bare face read as covered (measured). */
export async function createCoverMeter(): Promise<CoverMeter> {
  const vision = await import('@mediapipe/tasks-vision')
  const segmenter = await vision.ImageSegmenter.createFromOptions(VISION_WASM, {
    baseOptions: { modelAssetBuffer: await fetchMulticlassModel(), delegate: 'GPU' },
    runningMode: 'VIDEO',
    outputCategoryMask: true,
    outputConfidenceMasks: false,
  })

  const crop = document.createElement('canvas')
  crop.width = SIDE
  crop.height = SIDE
  const ctx = crop.getContext('2d')

  return {
    measure(video, landmarks, face, now) {
      if (!ctx) return 0
      const width = video.videoWidth
      const height = video.videoHeight
      const side = Math.max(face.width * width, face.height * height) * CONTEXT
      const left = (face.x + face.width / 2) * width - side / 2
      const top = (face.y + face.height / 2) * height - side / 2

      // Black where the crop leaves the frame; drawImage would keep the last crop there.
      ctx.fillRect(0, 0, SIDE, SIDE)
      ctx.drawImage(video, left, top, side, side, 0, 0, SIDE, SIDE)

      let hidden = 0
      segmenter.segmentForVideo(crop, now, ({ categoryMask }) => {
        if (!categoryMask) return
        const labels = categoryMask.getAsUint8Array()
        const { width: columns, height: rows } = categoryMask
        for (const i of LOWER_FACE) {
          const column = clamp(Math.floor(((landmarks[i].x * width - left) / side) * columns), columns)
          const row = clamp(Math.floor(((landmarks[i].y * height - top) / side) * rows), rows)
          const label = labels[row * columns + column]
          if (label !== FACE_SKIN && label !== HAIR) hidden++
        }
      })
      return hidden / LOWER_FACE.length
    },

    close() {
      segmenter.close()
      crop.width = 0
      crop.height = 0
    },
  }
}

const clamp = (index: number, size: number): number => Math.min(Math.max(index, 0), size - 1)
