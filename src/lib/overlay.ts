import type { NormalizedLandmark } from '@mediapipe/tasks-vision'
import { cropRect, type CropAnchors } from './framing'

const DOT_COLOR = '#7dd3fc'
const DOT_SIZE = 2

// Fraction of the crop size.
const RING_WIDTH = 0.006

export function clear(ctx: CanvasRenderingContext2D): void {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
}

// Rects instead of arc(): 478 points per frame, and nobody sees the difference.
export function drawLandmarks(
  ctx: CanvasRenderingContext2D,
  landmarks: NormalizedLandmark[],
): void {
  const { width, height } = ctx.canvas
  ctx.fillStyle = DOT_COLOR
  const offset = DOT_SIZE / 2
  for (const { x, y } of landmarks) {
    ctx.fillRect(x * width - offset, y * height - offset, DOT_SIZE, DOT_SIZE)
  }
}

// A circle because LinkedIn shows profile photos round. Same `cropRect` as the export,
// so the preview matches the result by construction.
export function drawCropCircle(
  ctx: CanvasRenderingContext2D,
  anchors: CropAnchors,
  tight: boolean,
): void {
  const { width, height } = ctx.canvas
  const { x, y, size } = cropRect(anchors, width, height)
  const radius = size / 2
  const centreX = x + radius
  const centreY = y + radius

  ctx.save()
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)'
  ctx.beginPath()
  ctx.rect(0, 0, width, height)
  ctx.arc(centreX, centreY, radius, 0, Math.PI * 2, true)
  ctx.fill('evenodd')
  ctx.restore()

  ctx.beginPath()
  ctx.arc(centreX, centreY, radius, 0, Math.PI * 2)
  ctx.lineWidth = Math.max(2, size * RING_WIDTH)
  ctx.strokeStyle = tight ? 'rgba(52, 211, 153, 0.9)' : 'rgba(255, 255, 255, 0.35)'
  ctx.stroke()
}
