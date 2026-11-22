export type HeadPose = {
  /** Degrees, > 0 = turned toward one's own left shoulder */
  yaw: number
  /** Degrees, > 0 = chin up */
  pitch: number
  /** Degrees, > 0 = tilted toward one's own left shoulder */
  roll: number
}

// Signs measured on a real camera (Gesang04, 2026-08-07). MediaPipe reports a lowered
// head as positive pitch and a tilt toward the left shoulder as negative roll.
export const YAW_SIGN = 1
export const PITCH_SIGN = -1
export const ROLL_SIGN = -1

const RAD_TO_DEG = 180 / Math.PI

// Takes `facialTransformationMatrixes[0].data`, a column-major 4x4 matrix.
export function headPose(data: readonly number[] | undefined): HeadPose | null {
  if (!data || data.length < 16) return null

  const R = (row: number, col: number) => data[col * 4 + row]
  const sy = Math.hypot(R(0, 0), R(1, 0))

  return {
    pitch: PITCH_SIGN * Math.atan2(R(2, 1), R(2, 2)) * RAD_TO_DEG,
    yaw: YAW_SIGN * Math.atan2(-R(2, 0), sy) * RAD_TO_DEG,
    roll: ROLL_SIGN * Math.atan2(R(1, 0), R(0, 0)) * RAD_TO_DEG,
  }
}
