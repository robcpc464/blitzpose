// Relative to the session's best, because Laplace variance follows the light: measured 997–1097
// in the afternoon and 450 in the evening on the same setup.

// Guessed: only still (1.0) and fast head movement (0.2) are measured; recheck via sig.sharpness.
export const BLUR_AT = 0.35

export const SHARP_AT = 0.75

// Forgets an outlier quickly, yet after 6 s of motion a blurred frame only reaches 0.4, still red.
export const PEAK_HALFLIFE_MS = 6000

export function createSharpnessScale() {
  let peak = 0
  let measuredAt = 0

  return {
    update(sharpness: number, now: number): number {
      if (peak > 0 && measuredAt) {
        peak *= 0.5 ** ((now - measuredAt) / PEAK_HALFLIFE_MS)
      }
      measuredAt = now
      if (sharpness > peak) peak = sharpness

      return peak > 0 ? Math.min(1, sharpness / peak) : 0
    },

    reset() {
      peak = 0
      measuredAt = 0
    },
  }
}
