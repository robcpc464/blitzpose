import type { NormalizedLandmark } from '@mediapipe/tasks-vision'
import { cropAnchors, cropRect, EXPORT_SIZE } from './framing'

// `mesh` is normalised to the crop and kept so post-processing need not re-run detection.
export type Capture = {
  canvas: HTMLCanvasElement
  mesh: Float32Array
}

// Crops straight from the source, so no 8.3 MB full frame is kept. Unmirrored, as others
// see the user; mirroring is opt-in (Shots.svelte).
export function captureFrame(
  // A canvas when test images replace the camera (`?testbilder`).
  source: HTMLVideoElement | HTMLCanvasElement,
  landmarks: NormalizedLandmark[],
  reuse?: HTMLCanvasElement,
): Capture | null {
  const video = source instanceof HTMLVideoElement
  const width = video ? source.videoWidth : source.width
  const height = video ? source.videoHeight : source.height
  if (!width || !height) return null

  const rect = cropRect(cropAnchors(landmarks), width, height)

  const canvas = reuse ?? document.createElement('canvas')
  canvas.width = EXPORT_SIZE
  canvas.height = EXPORT_SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, rect.x, rect.y, rect.size, rect.size, 0, 0, EXPORT_SIZE, EXPORT_SIZE)

  const mesh = new Float32Array(landmarks.length * 2)
  for (let i = 0; i < landmarks.length; i++) {
    mesh[i * 2] = (landmarks[i].x * width - rect.x) / rect.size
    mesh[i * 2 + 1] = (landmarks[i].y * height - rect.y) / rect.size
  }

  return { canvas, mesh }
}

// The mesh is not mirrored: mirroring comes last, after post-processing.
export function mirrorOf(source: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = source.width
  canvas.height = source.height
  const ctx = canvas.getContext('2d')
  if (!ctx) return source

  ctx.translate(source.width, 0)
  ctx.scale(-1, 1)
  ctx.drawImage(source, 0, 0)
  return canvas
}

// PNG because LinkedIn recompresses, and an already lossy image visibly degrades further.
// The caller revokes the URL.
export function pngUrl(canvas: HTMLCanvasElement): Promise<string | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob && URL.createObjectURL(blob)), 'image/png')
  })
}

export function downloadPng(url: string) {
  const link = document.createElement('a')
  link.href = url
  link.download = 'blitzpose.png'
  link.click()
}
