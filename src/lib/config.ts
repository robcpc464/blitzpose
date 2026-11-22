// Baked in per deployment by vite.config.ts.
export type Config = {
  exportSize: number
  /** Face height including the hair allowance, as a share of the image height. */
  faceShare: number
  /** Landmark 10 sits at the hairline, so the hair needs an allowance on top. */
  hair: number
  eyesAboveCentre: number
}

declare const __CONFIG__: Config

export const CONFIG: Config = __CONFIG__
