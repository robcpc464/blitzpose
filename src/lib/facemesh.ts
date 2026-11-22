import type { NormalizedLandmark } from '@mediapipe/tasks-vision'

// Left and right follow the canonical face mesh, not the image.
export const POINT = {
  /** Hairline, not crown, hence the hair allowance in framing. */
  brow: 10,
  chin: 152,
  cheekLeft: 234,
  cheekRight: 454,
  irisLeft: 468,
  irisRight: 473,
  mouthLeft: 61,
  mouthRight: 291,
  lipUpperInner: 13,
  lipLowerInner: 14,
} as const

export const eyeLine = (landmarks: NormalizedLandmark[]): number =>
  (landmarks[POINT.irisLeft].y + landmarks[POINT.irisRight].y) / 2

export const eyeCentre = (landmarks: NormalizedLandmark[]): number =>
  (landmarks[POINT.irisLeft].x + landmarks[POINT.irisRight].x) / 2

export const faceHeight = (landmarks: NormalizedLandmark[]): number =>
  Math.abs(landmarks[POINT.brow].y - landmarks[POINT.chin].y)

export type MouthMetrics = {
  width: number
  cornerLift: number
  opening: number
}

// Geometry, not the `mouthSmile` blendshape, which tracks opening: 0.00 neutral, 0.16 closed
// smile, 0.81-0.94 grin (measured 2026-08-08). Scaled by face size to cancel camera distance.
export function mouthMetrics(landmarks: NormalizedLandmark[]): MouthMetrics {
  const width = distance(landmarks[POINT.cheekLeft], landmarks[POINT.cheekRight])
  const height = faceHeight(landmarks)
  if (!width || !height) return { width: 0, cornerLift: 0, opening: 0 }

  const left = landmarks[POINT.mouthLeft]
  const right = landmarks[POINT.mouthRight]
  const upper = landmarks[POINT.lipUpperInner]
  const lower = landmarks[POINT.lipLowerInner]
  const centreY = (upper.y + lower.y) / 2

  return {
    width: distance(left, right) / width,
    // Positive means raised: y grows downwards.
    cornerLift: (centreY - (left.y + right.y) / 2) / height,
    opening: Math.abs(upper.y - lower.y) / height,
  }
}

const distance = (a: NormalizedLandmark, b: NormalizedLandmark): number =>
  Math.hypot(a.x - b.x, a.y - b.y)

// MediaPipe does not export this type.
type Connection = { start: number; end: number }

// MediaPipe's contour edges are unordered and not consistently directed; filling needs a ring.
function ring(connections: readonly Connection[]): number[] {
  const neighbours = new Map<number, number[]>()
  const link = (from: number, to: number) => {
    const known = neighbours.get(from)
    if (known) known.push(to)
    else neighbours.set(from, [to])
  }
  for (const { start, end } of connections) {
    link(start, end)
    link(end, start)
  }

  const first = connections[0].start
  const path = [first]
  const seen = new Set(path)
  for (let node = first; ; ) {
    const step = neighbours.get(node)?.find((it) => !seen.has(it))
    if (step === undefined) return path
    path.push(step)
    seen.add(step)
    node = step
  }
}

const points = (...lists: readonly Connection[][]): number[] => [
  ...new Set(lists.flat().flatMap(({ start, end }) => [start, end])),
]

export type Contours = {
  oval: readonly number[]
  /** Loose points, not rings, because the brows are open arcs. */
  features: readonly number[]
  eyes: readonly number[]
}

let geladen: Contours | null = null

// Lazy, so the start screen does not wait for the ~200 kB MediaPipe chunk.
export async function loadContours(): Promise<Contours> {
  if (geladen) return geladen
  const { FaceLandmarker } = await import('@mediapipe/tasks-vision')
  return (geladen = {
    oval: ring(FaceLandmarker.FACE_LANDMARKS_FACE_OVAL),
    features: points(
      FaceLandmarker.FACE_LANDMARKS_LEFT_EYE,
      FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE,
      FaceLandmarker.FACE_LANDMARKS_LEFT_EYEBROW,
      FaceLandmarker.FACE_LANDMARKS_RIGHT_EYEBROW,
      FaceLandmarker.FACE_LANDMARKS_LIPS,
    ),
    eyes: points(
      FaceLandmarker.FACE_LANDMARKS_LEFT_EYE,
      FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE,
      FaceLandmarker.FACE_LANDMARKS_LEFT_IRIS,
      FaceLandmarker.FACE_LANDMARKS_RIGHT_IRIS,
    ),
  })
}
