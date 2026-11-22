import type { Category, NormalizedLandmark } from '@mediapipe/tasks-vision'
import type { HeadPose } from './pose'
import type { Check } from './checks'
import { eyeLine } from './facemesh'
import type { Box, RoiStats } from './roi'
import { BLUR_AT, SHARP_AT } from './sharpness'

// Technical usability only: flattering poses were not measurable from blendshapes (2026-08-08).
export type ScoreComponentId = 'gaze' | 'sharpness' | 'exposure' | 'framing'

export type ScoreComponent = {
  id: ScoreComponentId
  weight: number
  value: number
}

export type ScoreSignals = {
  gaze: number
  sharpness: number
}

export const COMPONENT_OK = 0.8

export type Score = {
  total: number
  components: ScoreComponent[]
  signals: ScoreSignals
}

export type Detection = {
  input: FrameInput
  checks: Check[]
  /** Raw: triggers capture, where the instant counts. */
  score: Score
  /** Smoothed (trend.ts): drives the lights and the coaching. */
  shown: Score
}

export type FrameInput = {
  landmarks: NormalizedLandmark[] | undefined
  bounds: Box | undefined
  blendshapes: Category[]
  pose: HeadPose | null
  /** Of the face, or of the frame centre while there is none. */
  stats: RoiStats
  /** Relative to the session's best (sharpness.ts), passed in because this file keeps no state. */
  sharpness: number
  /** Share of mouth and nose hidden (cover.ts); null until measured. */
  covered: number | null
}

type Band = { min: number; max: number; falloff: number }

export const GATE_LIMITS = {
  // Measured: a broad smile narrows the eyes to 0.29–0.33, closed eyes read 0.66–0.79.
  maxBlink: 0.45,
  minFaceHeight: 0.25,
  // Plausibility only, not a matter of taste.
  maxYaw: 25,
  maxPitch: 15,
  maxRoll: 12,
}

export const SCORE_TARGETS = {
  // Measured over three sessions: the face sits at 0.33–0.44, mostly around 0.36.
  luminance: { min: 0.3, max: 0.65, falloff: 0.15 },
  centerX: { min: 0.45, max: 0.55, falloff: 0.15 },
  eyeLine: { min: 0.35, max: 0.5, falloff: 0.2 },
  // Measured: lens 0.13–0.16, screen 0.48–0.53; the falloff reaches zero at the screen.
  gaze: { min: 0, max: 0.25, falloff: 0.25 },
}

// Holding the lens while the head turns needs counter-rolled eyes: measured about 0.030 per degree.
const EYE_LOOK_PER_DEGREE = 0.03

export const SCORE_WEIGHTS: Record<ScoreComponentId, number> = {
  gaze: 0.4,
  sharpness: 0.3,
  exposure: 0.2,
  framing: 0.1,
}

export function scoreFrame({
  landmarks,
  bounds,
  blendshapes,
  pose,
  stats,
  sharpness,
}: FrameInput): Score {
  const gaze = gazeOffTarget(blendshapes, pose)

  const components: ScoreComponent[] = [
    component('gaze', inBand(gaze, SCORE_TARGETS.gaze)),
    component('sharpness', ramp(sharpness, BLUR_AT, SHARP_AT)),
    component('exposure', inBand(stats.luminance, SCORE_TARGETS.luminance)),
    component('framing', framingScore(landmarks, bounds)),
  ]

  return {
    total: components.reduce((sum, it) => sum + it.weight * it.value, 0),
    components,
    signals: { gaze, sharpness },
  }
}

export function blendshape(blendshapes: Category[], name: string): number {
  return blendshapes.find((it) => it.categoryName === name)?.score ?? 0
}

// Minimum, not mean: centring and eye height must both hold.
function framingScore(
  landmarks: NormalizedLandmark[] | undefined,
  bounds: Box | undefined,
): number {
  if (!landmarks || !bounds) return 0
  return Math.min(
    inBand(bounds.x + bounds.width / 2, SCORE_TARGETS.centerX),
    inBand(eyeLine(landmarks), SCORE_TARGETS.eyeLine),
  )
}

// ARKit `Out` means away from the nose. Signed, so eyes turned along with the head earn no credit.
// No vertical part: eyeLookDown measured 0.367 into the lens, 0.155 at the screen, 0.89 blinking.
function gazeOffTarget(blendshapes: Category[], pose: HeadPose | null): number {
  const toOwnLeft =
    (blendshape(blendshapes, 'eyeLookOutLeft') + blendshape(blendshapes, 'eyeLookInRight')) / 2
  const toOwnRight =
    (blendshape(blendshapes, 'eyeLookInLeft') + blendshape(blendshapes, 'eyeLookOutRight')) / 2

  const expected = -EYE_LOOK_PER_DEGREE * (pose?.yaw ?? 0)
  return Math.abs(toOwnLeft - toOwnRight - expected)
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value))

function inBand(value: number, { min, max, falloff }: Band): number {
  if (value >= min && value <= max) return 1
  return clamp01(1 - (value < min ? min - value : value - max) / falloff)
}

const ramp = (value: number, min: number, good: number): number =>
  clamp01((value - min) / (good - min))

const component = (id: ScoreComponentId, value: number): ScoreComponent => ({
  id,
  weight: SCORE_WEIGHTS[id],
  value: clamp01(value),
})
