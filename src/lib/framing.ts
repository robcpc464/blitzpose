import type { NormalizedLandmark } from '@mediapipe/tasks-vision'
import { CONFIG } from './config'
import { eyeCentre, eyeLine, POINT } from './facemesh'

// 800 px PNG survives LinkedIn's recompression better than JPG; LinkedIn itself asks for 400×400.
export const EXPORT_SIZE = CONFIG.exportSize

const { hair: HAIR, faceShare: FACE_SHARE, eyesAboveCentre: EYES_ABOVE_CENTRE } = CONFIG

/** Normalized image coordinates. */
export type CropAnchors = {
  top: number
  chin: number
  eyeX: number
  eyeY: number
}

export function cropAnchors(landmarks: NormalizedLandmark[]): CropAnchors {
  return {
    top: landmarks[POINT.brow].y,
    chin: landmarks[POINT.chin].y,
    eyeX: eyeCentre(landmarks),
    eyeY: eyeLine(landmarks),
  }
}

export type CropRect = { x: number; y: number; size: number }

// Clamped to the image: LinkedIn shows it round, which hides a cut corner but not a black wedge.
export function cropRect({ top, chin, eyeX, eyeY }: CropAnchors, width: number, height: number): CropRect {
  const face = Math.abs(top - chin) * HAIR * height
  const size = Math.min(face / FACE_SHARE, width, height)

  const centreX = eyeX * width
  const centreY = eyeY * height + EYES_ABOVE_CENTRE * size

  return {
    x: clamp(centreX - size / 2, 0, width - size),
    y: clamp(centreY - size / 2, 0, height - size),
    size,
  }
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), Math.max(min, max))
