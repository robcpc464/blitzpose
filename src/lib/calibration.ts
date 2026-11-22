import type { Category, NormalizedLandmark } from '@mediapipe/tasks-vision'
import { mouthMetrics } from './facemesh'
import { recallJson, remember } from './storage'
import type { HeadPose } from './pose'
import type { RoiStats } from './roi'
import type { ScoreSignals } from './scoring'

export type Span = { min: number; max: number; mean: number }

export type Snapshot = {
  id: string
  label: string
  frames: number
  /** Frames without a face; above 0 the snapshot is suspect. */
  dropped: number
  /** Flat, prefixed keys (`bs.`, `pose.`, `sig.`, `roi.`) keep the analysis greppable. */
  spans: Record<string, Span>
}

export type Calibration = {
  recordedAt: string
  camera: { width?: number; height?: number; frameRate?: number } | null
  snapshots: Snapshot[]
}

const STORAGE_KEY = 'blitzpose.calibration'

export type FrameSample = {
  landmarks: NormalizedLandmark[] | undefined
  blendshapes: Category[]
  pose: HeadPose | null
  signals: ScoreSignals
  stats: RoiStats
}

function flatten({
  landmarks,
  blendshapes,
  pose,
  signals,
  stats,
}: FrameSample): Record<string, number> {
  const flat: Record<string, number> = {}
  for (const { categoryName, score } of blendshapes) flat[`bs.${categoryName}`] = score
  if (landmarks) {
    for (const [key, value] of Object.entries(mouthMetrics(landmarks))) flat[`mouth.${key}`] = value
  }
  if (pose) {
    flat['pose.yaw'] = pose.yaw
    flat['pose.pitch'] = pose.pitch
    flat['pose.roll'] = pose.roll
  }
  for (const [key, value] of Object.entries(signals)) flat[`sig.${key}`] = value
  flat['roi.sharpness'] = stats.sharpness
  flat['roi.luminance'] = stats.luminance
  return flat
}

export function createSampler() {
  const totals = new Map<string, { min: number; max: number; sum: number }>()
  let frames = 0
  let dropped = 0

  return {
    get frames() {
      return frames
    },

    get dropped() {
      return dropped
    },

    // Faceless frames are counted, not measured, or they drag zeros into the spans.
    add(sample: FrameSample) {
      if (!sample.blendshapes.length || !sample.pose) {
        dropped++
        return
      }
      frames++
      for (const [key, value] of Object.entries(flatten(sample))) {
        const seen = totals.get(key)
        if (!seen) {
          totals.set(key, { min: value, max: value, sum: value })
          continue
        }
        if (value < seen.min) seen.min = value
        if (value > seen.max) seen.max = value
        seen.sum += value
      }
    },

    spans(): Record<string, Span> {
      const result: Record<string, Span> = {}
      for (const [key, { min, max, sum }] of totals) {
        result[key] = { min, max, mean: sum / frames }
      }
      return result
    },
  }
}

const round = (value: number): number => Math.round(value * 1000) / 1000

/** Compact for sharing: three decimals suffice for blendshapes and degrees. */
export function toCompact(calibration: Calibration) {
  const keys = [...new Set(calibration.snapshots.flatMap((it) => Object.keys(it.spans)))].sort()
  const silent = new Set(
    keys.filter((key) =>
      calibration.snapshots.every(
        (it) => !it.spans[key] || (it.spans[key].min === 0 && it.spans[key].max === 0),
      ),
    ),
  )

  return {
    format: 'spans are [min, max, mean]; keys in "silent" were exactly 0 in every snapshot',
    recordedAt: calibration.recordedAt,
    camera: calibration.camera,
    silent: [...silent],
    snapshots: calibration.snapshots.map(({ label, frames, dropped, spans }) => ({
      label,
      frames,
      dropped,
      spans: Object.fromEntries(
        keys
          .filter((key) => !silent.has(key) && spans[key])
          .map((key) => [key, [round(spans[key].min), round(spans[key].max), round(spans[key].mean)]]),
      ),
    })),
  }
}

export const loadCalibration = (): Calibration | null =>
  recallJson<Calibration | null>(STORAGE_KEY, null)

export const saveCalibration = (calibration: Calibration) => remember(STORAGE_KEY, calibration)
