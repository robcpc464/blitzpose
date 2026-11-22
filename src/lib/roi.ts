import type { NormalizedLandmark } from '@mediapipe/tasks-vision'

/** Normalized, 0..1 relative to the video frame. */
export type Box = { x: number; y: number; width: number; height: number }

export type RoiStats = {
  /** Raw Laplacian variance; low means blurry. */
  sharpness: number
  /** Mean, 0..1. */
  luminance: number
}

const ROI_SIZE = 128

export function faceBounds(landmarks: NormalizedLandmark[]): Box {
  let minX = 1
  let minY = 1
  let maxX = 0
  let maxY = 0

  for (const { x, y } of landmarks) {
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }

  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

// getImageData is a synchronous GPU readback, the project's worst performance trap:
// hence a small canvas of its own, and callers sample only every nth frame.
export function createRoiSampler(size = ROI_SIZE) {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  const gray = new Float32Array(size * size)

  return function sample(video: HTMLVideoElement, box: Box): RoiStats | null {
    if (!ctx) return null

    // Clamped, because drawImage clips the source and leaves stale pixels in the rest of the canvas.
    const left = Math.max(box.x, 0)
    const top = Math.max(box.y, 0)
    const sourceX = left * video.videoWidth
    const sourceY = top * video.videoHeight
    const sourceWidth = (Math.min(box.x + box.width, 1) - left) * video.videoWidth
    const sourceHeight = (Math.min(box.y + box.height, 1) - top) * video.videoHeight
    if (sourceWidth < 1 || sourceHeight < 1) return null

    ctx.drawImage(video, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, size, size)
    const { data } = ctx.getImageData(0, 0, size, size)

    let sum = 0
    for (let i = 0; i < gray.length; i++) {
      const p = i * 4
      gray[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2]
      sum += gray[i]
    }

    return { sharpness: laplacianVariance(gray, size), luminance: sum / gray.length / 255 }
  }
}

function laplacianVariance(gray: Float32Array, size: number): number {
  let sum = 0
  let sumOfSquares = 0
  const count = (size - 2) * (size - 2)

  for (let y = 1; y < size - 1; y++) {
    for (let x = 1; x < size - 1; x++) {
      const i = y * size + x
      const value = gray[i - size] + gray[i + size] + gray[i - 1] + gray[i + 1] - 4 * gray[i]
      sum += value
      sumOfSquares += value * value
    }
  }

  const mean = sum / count
  return sumOfSquares / count - mean * mean
}
