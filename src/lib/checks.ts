import type { NormalizedLandmark } from '@mediapipe/tasks-vision'
import { eyeLine, faceHeight, mouthMetrics } from './facemesh'
import type { HintId } from './coaching'
import type { HeadPose } from './pose'
import type { Box } from './roi'
import {
  blendshape,
  COMPONENT_OK,
  GATE_LIMITS,
  SCORE_TARGETS,
  type FrameInput,
  type Score,
  type ScoreComponentId,
} from './scoring'

export type CheckId =
  | 'face'
  | 'distance'
  | 'position'
  | 'head'
  | 'uncovered'
  | 'light'
  | 'gaze'
  | 'sharpness'
  | 'eyes'
  | 'smile'

// No warning state: whatever blocks is either red with a hint or grey (not measured yet).
export type CheckState = 'good' | 'bad' | 'off'

// The one list that lights, coach and shutter all read, so they cannot disagree.
export type Check = {
  id: CheckId
  state: CheckState
  hint: HintId | null
}

// Judged on smoothed components, so a 33 ms saccade cannot turn a check red. On gaze,
// 0.8 is a deviation of 0.30 (measured: lens 0.13-0.18, screen 0.48-0.54).
const OK = COMPONENT_OK

// Beyond this the square crop with shoulders no longer fits (crop maths in framing.ts).
const MAX_FACE_HEIGHT = 0.45

// Wider than the framing score's band on purpose: only catches hopeless framing.
// Large raw x is the user's own left, hence 'moveRight'.
const CENTERED = { x: { min: 0.35, max: 0.65 }, eyeLine: { min: 0.25, max: 0.6 } }

// Relaxed in front of a too-low camera measures about +8.5 degrees.
const PITCH_TOO_LOW = 12

// Midway between neutral (-0.016..-0.015) and a closed smile (0.003..0.004), measured 2026-08-08.
const SMILE_MIN = -0.006

// AI test images in four light and webcam conditions: bare faces 0.00, hand or mask 0.64-1.00.
export const COVERED_MAX = 1 / 3

// Frame centre without a face, darkened test images: missed faces mostly 0.06-0.23, lit empty
// rooms 0.27 and up. Below it more light helps more than "come back".
const SCENE_DARK = 0.25

/** Order is priority: the coach names the first red check. */
export function assess(input: FrameInput, score: Score, settled = true): Check[] {
  const { landmarks, bounds, blendshapes, pose, stats, covered } = input
  const hasFace = Boolean(landmarks && bounds)

  const face = hasFace
    ? check('face', 'good', null)
    : check('face', 'bad', stats.luminance < SCENE_DARK ? 'brighter' : 'noFace')
  if (!hasFace || !landmarks || !bounds) {
    // Grey, not green: missing blendshapes read as 0, which looks like perfect gaze.
    return [face, ...REST.map((id) => check(id, 'off', null))]
  }

  if (!settled) return [face, ...REST.map((id) => check(id, 'off', null))]

  const value = (id: ScoreComponentId) => score.components.find((it) => it.id === id)?.value ?? 0

  return [
    face,
    distance(landmarks),
    position(landmarks, bounds),
    head(pose),
    uncovered(covered),
    light(stats.luminance, value('exposure')),
    gaze(value('gaze')),
    sharpness(value('sharpness')),
    eyes(blendshapes),
    smile(landmarks),
  ]
}

const REST: CheckId[] = [
  'distance',
  'position',
  'head',
  'uncovered',
  'light',
  'gaze',
  'sharpness',
  'eyes',
  'smile',
]

function distance(landmarks: NormalizedLandmark[]): Check {
  const height = faceHeight(landmarks)
  if (height < GATE_LIMITS.minFaceHeight) return check('distance', 'bad', 'closer')
  if (height > MAX_FACE_HEIGHT) return check('distance', 'bad', 'backUp')
  return check('distance', 'good', null)
}

function position(landmarks: NormalizedLandmark[], bounds: Box): Check {
  const angeschnitten =
    bounds.x + bounds.width > 1
      ? 'moveRight'
      : bounds.x < 0
        ? 'moveLeft'
        : bounds.y < 0
          ? 'sitLower'
          : bounds.y + bounds.height > 1
            ? 'sitUp'
            : null
  if (angeschnitten) return check('position', 'bad', angeschnitten)

  const centerX = bounds.x + bounds.width / 2
  if (centerX > CENTERED.x.max) return check('position', 'bad', 'moveRight')
  if (centerX < CENTERED.x.min) return check('position', 'bad', 'moveLeft')

  const eyes = eyeLine(landmarks)
  if (eyes > CENTERED.eyeLine.max) return check('position', 'bad', 'sitUp')
  if (eyes < CENTERED.eyeLine.min) return check('position', 'bad', 'sitLower')

  return check('position', 'good', null)
}

function head(pose: HeadPose | null): Check {
  if (!pose) return check('head', 'off', null)
  // A low camera and a raised chin look the same, so the hint names both.
  if (pose.pitch > PITCH_TOO_LOW) return check('head', 'bad', 'cameraLow')
  if (Math.abs(pose.roll) > GATE_LIMITS.maxRoll) return check('head', 'bad', 'straighten')
  if (Math.abs(pose.yaw) > GATE_LIMITS.maxYaw) return check('head', 'bad', 'straighten')
  if (pose.pitch < -GATE_LIMITS.maxPitch) return check('head', 'bad', 'straighten')
  return check('head', 'good', null)
}

function uncovered(covered: number | null): Check {
  if (covered === null) return check('uncovered', 'off', null)
  return covered > COVERED_MAX
    ? check('uncovered', 'bad', 'uncover')
    : check('uncovered', 'good', null)
}

function light(luminance: number, graded: number): Check {
  if (graded >= OK) return check('light', 'good', null)
  // Band centre, not its bounds, or the hint flips to 'darker' while recovering from too dark.
  const mitte = (SCORE_TARGETS.luminance.min + SCORE_TARGETS.luminance.max) / 2
  const zuDunkel = luminance < mitte
  return check('light', 'bad', zuDunkel ? 'brighter' : 'darker')
}

function gaze(graded: number): Check {
  return graded >= OK
    ? check('gaze', 'good', null)
    : check('gaze', 'bad', 'gaze')
}

function sharpness(graded: number): Check {
  return graded >= OK
    ? check('sharpness', 'good', null)
    : check('sharpness', 'bad', 'holdStill')
}

// The coach keeps the hint back during a blink, when "open your eyes" would be silly.
function eyes(blendshapes: Parameters<typeof blendshape>[0]): Check {
  const shut =
    blendshape(blendshapes, 'eyeBlinkLeft') >= GATE_LIMITS.maxBlink ||
    blendshape(blendshapes, 'eyeBlinkRight') >= GATE_LIMITS.maxBlink
  return shut ? check('eyes', 'bad', 'openEyes') : check('eyes', 'good', null)
}

function smile(landmarks: NormalizedLandmark[]): Check {
  const { cornerLift } = mouthMetrics(landmarks)
  return cornerLift >= SMILE_MIN
    ? check('smile', 'good', null)
    : check('smile', 'bad', 'smile')
}

const check = (id: CheckId, state: CheckState, hint: HintId | null): Check => ({
  id,
  state,
  hint,
})

// Checks allowed to block the shutter, toggled on the lights. Light is on because face
// luminance measured 0.33-0.54 over four sessions, inside its band.
export const DEFAULT_ENABLED: Record<CheckId, boolean> = {
  face: true,
  distance: true,
  position: true,
  head: true,
  uncovered: true,
  light: true,
  smile: true,
  gaze: true,
  sharpness: true,
  eyes: true,
}

export const firstProblem = (checks: Check[]): HintId | null =>
  checks.find((it) => it.state === 'bad' && it.hint)?.hint ?? null
