import type { Person } from './matting'
import type { Contours } from './facemesh'

// Landmarks are only read to mask areas, never moved, so identity is untouched (AGENTS.md).
// Runs once per image, not per frame, which is why it may take its time.

// Medians of the five reference portraits, measured through this file's own skin mask (2026-08-08);
// a centre box gave b 0.245 and a warm cast. The portraits are not in the repository.
//   ergebnis-1   r 0.4218   g 0.3158   b 0.2624   Y 0.520
//   ergebnis-2   r 0.4418   g 0.3226   b 0.2357   Y 0.480
//   ergebnis-3   r 0.4368   g 0.3155   b 0.2477   Y 0.522
//   ergebnis-5   r 0.4271   g 0.3204   b 0.2525   Y 0.527
//   ergebnis-6   r 0.4184   g 0.3221   b 0.2594   Y 0.568
const SKIN_TARGET = [0.427, 0.32, 0.253]
const SKIN_LUMA = 0.522

// Half the range of those portraits, used as a dead zone: inside it the offset is the person, not
// the light, and is left alone.
const SKIN_SPREAD = [0.012, 0.004, 0.013]
const LUMA_SPREAD = 0.045

// Even a strong cast is damped, not replaced.
const WHITE_BALANCE_MAX = 0.12

// Beyond these a correction turns into noisy brightening.
const GAMMA_MIN = 0.72
const GAMMA_MAX = 1.4

const CONTRAST_FULL = 0.2

// Guessed by eye; balance and exposure only scale corrections toward measured targets.
// When in doubt, too little.
export const DEFAULT_STRENGTH: Strengths = {
  // Below 1 because the dead zone rests on only five portraits.
  balance: 0.8,
  exposure: 0.8,
  shine: 0.45,
  skin: 0.45,
  eyes: 0.55,
  backdrop: 0.6,
}

// 40 px at 800: an office blurs into planes, yet the person does not look cut out.
const BACKDROP_MAX = 0.05

// Masks are blurred anyway; 320 instead of 800 costs a sixth.
const MASK_SIZE = 320
// About 13 image pixels; much wider and it eats the cut-out eyes and lips again.
const MASK_FEATHER = 5
// In face heights, like the radii and bands below.
const FEATURE_RADIUS = 0.04
// Wider than FEATURE_RADIUS so the lashes are included.
const EYE_RADIUS = 0.05
// Guessed: about 1.4 px at 800; smaller does nothing visible, larger halos the lashes.
const SHARPEN_RADIUS = 0.004

// Smoothed band: pores below and facial modelling above stay (about 6 and 21 px on a 355 px face).
const SKIN_DETAIL = 0.017
const SKIN_BLOTCH = 0.06

// In running order; the single source for the sliders, their texts and the branches below.
export const STEPS = [
  'balance',
  'exposure',
  'shine',
  'skin',
  'eyes',
  'backdrop',
] as const

export type StepId = (typeof STEPS)[number]

/** 0 to 1; 0 skips the step entirely. */
export type Strengths = Record<StepId, number>

export const DEFAULT_ON: Record<StepId, boolean> = Object.fromEntries(
  STEPS.map((it) => [it, true]),
) as Record<StepId, boolean>

/** Returns a new canvas, keeping `source` for the before/after toggle, or `source` on failure. */
export function retouch(
  source: HTMLCanvasElement,
  mesh: Float32Array,
  contours: Contours,
  strength: Strengths,
  person?: Person | null,
  /** Must match the image size; without it the real background is blurred instead. */
  backdrop?: HTMLCanvasElement | null,
): HTMLCanvasElement {
  const width = source.width
  const height = source.height
  if (!width || !height || mesh.length < 2) return source

  const target = document.createElement('canvas')
  target.width = width
  target.height = height
  const ctx = target.getContext('2d')
  if (!ctx) return source

  ctx.drawImage(source, 0, 0)

  const image = ctx.getImageData(0, 0, width, height)
  const pixels = image.data

  // Float between steps: rounding after each one added up visibly.
  const work = new Float32Array(width * height * 3)
  for (let p = 0, q = 0; q < work.length; p += 4, q += 3) {
    work[q] = pixels[p]
    work[q + 1] = pixels[p + 1]
    work[q + 2] = pixels[p + 2]
  }

  const faceHeight = spanOf(mesh)
  const skin = skinMask(contours, mesh, faceHeight, width, height)

  if (strength.balance > 0 || strength.exposure > 0) tone(work, skin, strength)
  if (strength.shine > 0) shine(work, skin, strength.shine)
  if (strength.skin > 0) smoothSkin(work, skin, width, height, faceHeight, strength.skin)
  // Built only on demand: the mask costs a full pass over the image.
  if (strength.eyes > 0) {
    const eyes = eyeMask(contours, mesh, faceHeight, width, height)
    sharpenEyes(work, eyes, contours, mesh, width, height, faceHeight, strength.eyes)
  }
  // Last, so the background shares the person's exposure.
  if (strength.backdrop > 0 && person) {
    const matte = spread(person.data, person.width, person.height, width, height)
    if (backdrop) swapBackdrop(work, matte, backdrop, width, height)
    else blurBackdrop(work, matte, width, height, strength.backdrop)
  }

  for (let p = 0, q = 0; q < work.length; p += 4, q += 3) {
    pixels[p] = work[q]
    pixels[p + 1] = work[q + 1]
    pixels[p + 2] = work[q + 2]
  }
  ctx.putImageData(image, 0, 0)
  return target
}

function spanOf(mesh: Float32Array): number {
  let top = 1
  let bottom = 0
  for (let i = 1; i < mesh.length; i += 2) {
    if (mesh[i] < top) top = mesh[i]
    if (mesh[i] > bottom) bottom = mesh[i]
  }
  return Math.max(bottom - top, 0.05)
}

function skinMask(
  contours: Contours,
  mesh: Float32Array,
  face: number,
  width: number,
  height: number,
): Uint8Array {
  const oval = new Float32Array(MASK_SIZE * MASK_SIZE)
  fillPolygon(oval, mesh, contours.oval)

  const features = new Float32Array(MASK_SIZE * MASK_SIZE)
  stampDiscs(features, mesh, contours.features, FEATURE_RADIUS * face * MASK_SIZE)

  for (let i = 0; i < oval.length; i++) oval[i] *= 1 - features[i]
  blurMask(oval, MASK_SIZE, MASK_SIZE, MASK_FEATHER)
  return spread(oval, MASK_SIZE, MASK_SIZE, width, height)
}

function eyeMask(
  contours: Contours,
  mesh: Float32Array,
  face: number,
  width: number,
  height: number,
): Uint8Array {
  const mask = new Float32Array(MASK_SIZE * MASK_SIZE)
  stampDiscs(mask, mesh, contours.eyes, EYE_RADIUS * face * MASK_SIZE)
  blurMask(mask, MASK_SIZE, MASK_SIZE, MASK_FEATHER)
  return spread(mask, MASK_SIZE, MASK_SIZE, width, height)
}

// Expects the ring already in order (facemesh.ts).
function fillPolygon(mask: Float32Array, mesh: Float32Array, ring: readonly number[]) {
  const xs = ring.map((it) => mesh[it * 2] * MASK_SIZE)
  const ys = ring.map((it) => mesh[it * 2 + 1] * MASK_SIZE)
  const top = Math.max(0, Math.floor(Math.min(...ys)))
  const bottom = Math.min(MASK_SIZE - 1, Math.ceil(Math.max(...ys)))
  const crossings: number[] = []

  for (let y = top; y <= bottom; y++) {
    const line = y + 0.5
    crossings.length = 0
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      if (ys[i] < line === ys[j] < line) continue
      crossings.push(xs[i] + ((line - ys[i]) / (ys[j] - ys[i])) * (xs[j] - xs[i]))
    }
    crossings.sort((a, b) => a - b)
    for (let k = 0; k + 1 < crossings.length; k += 2) {
      const from = Math.max(0, Math.ceil(crossings[k] - 0.5))
      const to = Math.min(MASK_SIZE - 1, Math.floor(crossings[k + 1] - 0.5))
      for (let x = from; x <= to; x++) mask[y * MASK_SIZE + x] = 1
    }
  }
}

function stampDiscs(
  mask: Float32Array,
  mesh: Float32Array,
  indices: readonly number[],
  radius: number,
) {
  for (const index of indices) {
    const cx = mesh[index * 2] * MASK_SIZE
    const cy = mesh[index * 2 + 1] * MASK_SIZE
    const from = Math.max(0, Math.floor(cy - radius))
    const to = Math.min(MASK_SIZE - 1, Math.ceil(cy + radius))

    for (let y = from; y <= to; y++) {
      const dy = y + 0.5 - cy
      const half = Math.sqrt(Math.max(radius * radius - dy * dy, 0))
      const left = Math.max(0, Math.floor(cx - half))
      const right = Math.min(MASK_SIZE - 1, Math.ceil(cx + half))
      for (let x = left; x <= right; x++) {
        const value = Math.min(1, Math.max(0, radius - Math.hypot(x + 0.5 - cx, dy)))
        const at = y * MASK_SIZE + x
        if (value > mask[at]) mask[at] = value
      }
    }
  }
}

// In place; two box passes approximate a Gaussian. Mask and image versions stay separate:
// merged, a full retouch measured 220–260 ms instead of 150.
function blurMask(data: Float32Array, width: number, height: number, radius: number) {
  const scratch = new Float32Array(data.length)
  for (let pass = 0; pass < 2; pass++) {
    boxMask(data, scratch, width, height, radius, 1, width)
    boxMask(scratch, data, height, width, radius, width, 1)
  }
}

function blurImage(data: Float32Array, width: number, height: number, radius: number) {
  const scratch = new Float32Array(data.length)
  const row = width * 3
  for (let pass = 0; pass < 2; pass++) {
    boxImage(data, scratch, width, height, radius, 3, row)
    boxImage(scratch, data, height, width, radius, row, 3)
  }
}

function boxMask(
  src: Float32Array,
  dst: Float32Array,
  along: number,
  across: number,
  radius: number,
  step: number,
  jump: number,
) {
  const span = radius * 2 + 1
  const edge = (i: number) => Math.min(Math.max(i, 0), along - 1)

  for (let line = 0; line < across; line++) {
    const base = line * jump
    let sum = 0
    for (let i = -radius; i <= radius; i++) sum += src[base + edge(i) * step]
    for (let i = 0; i < along; i++) {
      dst[base + i * step] = sum / span
      sum += src[base + edge(i + radius + 1) * step] - src[base + edge(i - radius) * step]
    }
  }
}

function boxImage(
  src: Float32Array,
  dst: Float32Array,
  along: number,
  across: number,
  radius: number,
  step: number,
  jump: number,
) {
  const span = radius * 2 + 1
  const edge = (i: number) => Math.min(Math.max(i, 0), along - 1)

  for (let line = 0; line < across; line++) {
    const base = line * jump
    let r = 0
    let g = 0
    let b = 0
    for (let i = -radius; i <= radius; i++) {
      const at = base + edge(i) * step
      r += src[at]
      g += src[at + 1]
      b += src[at + 2]
    }
    for (let i = 0; i < along; i++) {
      const at = base + i * step
      dst[at] = r / span
      dst[at + 1] = g / span
      dst[at + 2] = b / span
      const add = base + edge(i + radius + 1) * step
      const sub = base + edge(i - radius) * step
      r += src[add] - src[sub]
      g += src[add + 1] - src[sub + 1]
      b += src[add + 2] - src[sub + 2]
    }
  }
}

function spread(
  mask: Float32Array,
  from: number,
  fromHeight: number,
  width: number,
  height: number,
): Uint8Array {
  const out = new Uint8Array(width * height)

  // The segmenter's map is already full size; interpolating it cost 40 of 190 ms per slider move.
  if (from === width && fromHeight === height) {
    for (let i = 0; i < out.length; i++) out[i] = mask[i] * 255
    return out
  }

  for (let y = 0; y < height; y++) {
    const my = ((y + 0.5) / height) * fromHeight - 0.5
    const y0 = clamp(Math.floor(my), 0, fromHeight - 1)
    const y1 = Math.min(y0 + 1, fromHeight - 1)
    const fy = clamp(my - y0, 0, 1)

    for (let x = 0; x < width; x++) {
      const mx = ((x + 0.5) / width) * from - 0.5
      const x0 = clamp(Math.floor(mx), 0, from - 1)
      const x1 = Math.min(x0 + 1, from - 1)
      const fx = clamp(mx - x0, 0, 1)

      const top = mask[y0 * from + x0] * (1 - fx) + mask[y0 * from + x1] * fx
      const bottom = mask[y1 * from + x0] * (1 - fx) + mask[y1 * from + x1] * fx
      out[y * width + x] = (top * (1 - fy) + bottom * fy) * 255
    }
  }
  return out
}

const luma = (r: number, g: number, b: number) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255

// Gains peak at 1 so balancing never clips; exposure restores the brightness.
// Curves run on luminance: per channel they raise saturation and turn skin red.
function tone(work: Float32Array, skin: Uint8Array, strength: Strengths) {
  let r = 0
  let g = 0
  let b = 0
  let weight = 0
  for (let i = 0, q = 0; i < skin.length; i++, q += 3) {
    const w = skin[i] / 255
    if (w < 0.5) continue
    // The oval reaches the hairline, where a fringe would skew the measurement.
    const brightness = luma(work[q], work[q + 1], work[q + 2])
    if (brightness < 0.15 || brightness > 0.92) continue
    r += work[q] * w
    g += work[q + 1] * w
    b += work[q + 2] * w
    weight += w
  }
  if (weight < 200) return

  r /= weight
  g /= weight
  b /= weight
  const sum = r + g + b
  if (sum < 1) return

  const gains =
    strength.balance > 0 ? [r, g, b].map((it, c) => gain(it / sum, c, strength.balance)) : [1, 1, 1]
  const highest = Math.max(...gains)
  for (let c = 0; c < 3; c++) gains[c] /= highest

  const after = luma(r * gains[0], g * gains[1], b * gains[2])
  const goal = after - excess(after, SKIN_LUMA, LUMA_SPREAD)
  const wanted = after > 0.01 ? Math.log(goal) / Math.log(after) : 1
  const gamma = clamp(1 + strength.exposure * (wanted - 1), GAMMA_MIN, GAMMA_MAX)
  const contrast = CONTRAST_FULL * strength.exposure
  // SKIN_TARGET and SKIN_LUMA were read from this log on the reference portraits.
  if (import.meta.env.DEV)
    console.log(
      `[retouch] haut=${[r, g, b].map((it) => Math.round(it)).join()} ` +
        `farbort=${[r / sum, g / sum, b / sum].map((it) => it.toFixed(4)).join()} ` +
        `helligkeit=${luma(r, g, b).toFixed(3)} ` +
        `verstaerkung=${gains.map((it) => it.toFixed(3)).join()} gamma=${gamma.toFixed(3)}`,
    )

  for (let q = 0; q < work.length; q += 3) {
    const red = work[q] * gains[0]
    const green = work[q + 1] * gains[1]
    const blue = work[q + 2] * gains[2]

    const before = luma(red, green, blue)
    if (before < 0.001) {
      work[q] = red
      work[q + 1] = green
      work[q + 2] = blue
      continue
    }
    const lifted = Math.pow(before, gamma)
    // v² (3 − 2v) keeps 0, 0.5 and 1 fixed and bends only in between.
    const shaped = lifted + contrast * (lifted * lifted * (3 - 2 * lifted) - lifted)
    const factor = clamp(shaped, 0, 1) / before

    work[q] = Math.min(red * factor, 255)
    work[q + 1] = Math.min(green * factor, 255)
    work[q + 2] = Math.min(blue * factor, 255)
  }
}

function gain(share: number, channel: number, strength: number): number {
  const goal = share - excess(share, SKIN_TARGET[channel], SKIN_SPREAD[channel])
  const raw = share > 0.01 ? goal / share : 1
  return clamp(1 + strength * (raw - 1), 1 - WHITE_BALANCE_MAX, 1 + WHITE_BALANCE_MAX)
}

function excess(value: number, target: number, dead: number): number {
  const off = value - target
  return Math.sign(off) * Math.max(Math.abs(off) - dead, 0)
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

// Threshold is the 95th percentile, since shine depends on the light. Only the part above it is
// compressed; scaling the whole value made the highlight's core darker than the cheek.
function shine(work: Float32Array, skin: Uint8Array, strength: number) {
  const histogram = new Uint32Array(256)
  let count = 0
  for (let i = 0, q = 0; i < skin.length; i++, q += 3) {
    if (skin[i] < 128) continue
    histogram[Math.min(255, (luma(work[q], work[q + 1], work[q + 2]) * 255) | 0)]++
    count++
  }
  if (count < 200) return

  let seen = 0
  let threshold = 255
  for (let v = 0; v < 256; v++) {
    seen += histogram[v]
    if (seen >= count * 0.95) {
      threshold = v
      break
    }
  }
  if (255 - threshold < 8) return

  for (let i = 0, q = 0; i < skin.length; i++, q += 3) {
    // Act only where measured (mask ≥ 0.5); from 0.02 on it darkened a 22 px seam around the head.
    const mask = Math.max((skin[i] / 255 - 0.5) * 2, 0)
    if (mask <= 0) continue
    const value = luma(work[q], work[q + 1], work[q + 2]) * 255
    const above = value - threshold
    if (above <= 0) continue
    const factor = (threshold + (1 - strength * mask) * above) / value
    work[q] *= factor
    work[q + 1] *= factor
    work[q + 2] *= factor
  }
}

// Band-stop rather than blur, so skin keeps its pores. Half resolution still holds the whole band.
function smoothSkin(
  work: Float32Array,
  skin: Uint8Array,
  width: number,
  height: number,
  face: number,
  strength: number,
) {
  const w = width >> 1
  const h = height >> 1
  if (w < 8 || h < 8) return

  const small = Math.max(1, Math.round((SKIN_DETAIL * face * width) / 2))
  const large = Math.max(small + 1, Math.round((SKIN_BLOTCH * face * width) / 2))

  const fine = new Float32Array(w * h * 3)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const out = (y * w + x) * 3
      const a = (y * 2 * width + x * 2) * 3
      const b = a + 3
      const c = a + width * 3
      const d = c + 3
      for (let ch = 0; ch < 3; ch++)
        fine[out + ch] = (work[a + ch] + work[b + ch] + work[c + ch] + work[d + ch]) / 4
    }

  blurImage(fine, w, h, small)
  const coarse = Float32Array.from(fine)
  // Blurs add in quadrature, so the second radius is √(large² − small²).
  blurImage(coarse, w, h, Math.max(1, Math.round(Math.sqrt(large * large - small * small))))

  // From here `fine` holds the band.
  for (let i = 0; i < fine.length; i++) fine[i] = coarse[i] - fine[i]

  for (let y = 0; y < height; y++) {
    const sy = clamp((y - 0.5) / 2, 0, h - 1)
    const y0 = Math.floor(sy)
    const y1 = Math.min(y0 + 1, h - 1)
    const fy = sy - y0

    for (let x = 0; x < width; x++) {
      const mask = skin[y * width + x] / 255
      if (mask < 0.02) continue
      const sx = clamp((x - 0.5) / 2, 0, w - 1)
      const x0 = Math.floor(sx)
      const x1 = Math.min(x0 + 1, w - 1)
      const fx = sx - x0

      const out = (y * width + x) * 3
      const amount = strength * mask
      for (let ch = 0; ch < 3; ch++) {
        const top =
          fine[(y0 * w + x0) * 3 + ch] * (1 - fx) + fine[(y0 * w + x1) * 3 + ch] * fx
        const bottom =
          fine[(y1 * w + x0) * 3 + ch] * (1 - fx) + fine[(y1 * w + x1) * 3 + ch] * fx
        work[out + ch] = clamp(work[out + ch] + amount * (top * (1 - fy) + bottom * fy), 0, 255)
      }
    }
  }
}

function sharpenEyes(
  work: Float32Array,
  eyes: Uint8Array,
  contours: Contours,
  mesh: Float32Array,
  width: number,
  height: number,
  face: number,
  strength: number,
) {
  let left = 1
  let right = 0
  let top = 1
  let bottom = 0
  for (const index of contours.eyes) {
    const x = mesh[index * 2]
    const y = mesh[index * 2 + 1]
    if (x < left) left = x
    if (x > right) right = x
    if (y < top) top = y
    if (y > bottom) bottom = y
  }

  const pad = EYE_RADIUS * face * 2
  const x0 = Math.max(0, Math.floor((left - pad) * width))
  const x1 = Math.min(width - 1, Math.ceil((right + pad) * width))
  const y0 = Math.max(0, Math.floor((top - pad) * height))
  const y1 = Math.min(height - 1, Math.ceil((bottom + pad) * height))
  const w = x1 - x0 + 1
  const h = y1 - y0 + 1
  if (w < 8 || h < 8) return

  const patch = new Float32Array(w * h * 3)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const from = ((y + y0) * width + x + x0) * 3
      const to = (y * w + x) * 3
      patch[to] = work[from]
      patch[to + 1] = work[from + 1]
      patch[to + 2] = work[from + 2]
    }

  const soft = Float32Array.from(patch)
  blurImage(soft, w, h, Math.max(1, Math.round(SHARPEN_RADIUS * face * width)))

  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const mask = eyes[(y + y0) * width + x + x0] / 255
      if (mask < 0.02) continue
      const here = (y * w + x) * 3
      const out = ((y + y0) * width + x + x0) * 3
      for (let ch = 0; ch < 3; ch++)
        work[out + ch] = clamp(
          work[out + ch] + strength * mask * (patch[here + ch] - soft[here + ch]),
          0,
          255,
        )
    }
}

// Blurs only the background, divided by its own weight, so the person's colour cannot bleed into
// a halo. Half resolution suffices for a blur; callers composite at full size to keep the edge.
function estimateBackdrop(
  work: Float32Array,
  matte: Uint8Array,
  width: number,
  height: number,
  radius: number,
): { colour: Float32Array; weight: Float32Array; w: number; h: number } | null {
  const w = width >> 1
  const h = height >> 1
  if (w < 8 || h < 8) return null

  const colour = new Float32Array(w * h * 3)
  const weight = new Float32Array(w * h)

  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const out = (y * w + x) * 3
      let sum = 0
      for (let dy = 0; dy < 2; dy++)
        for (let dx = 0; dx < 2; dx++) {
          const at = (y * 2 + dy) * width + x * 2 + dx
          const back = 1 - matte[at] / 255
          sum += back
          for (let ch = 0; ch < 3; ch++) colour[out + ch] += work[at * 3 + ch] * back
        }
      weight[y * w + x] = sum / 4
      for (let ch = 0; ch < 3; ch++) colour[out + ch] /= 4
    }

  blurImage(colour, w, h, radius)
  blurMask(weight, w, h, radius)
  return { colour, weight, w, h }
}

function blurBackdrop(
  work: Float32Array,
  matte: Uint8Array,
  width: number,
  height: number,
  strength: number,
) {
  const radius = Math.max(1, Math.round((BACKDROP_MAX * strength * width) / 2))
  const geschaetzt = estimateBackdrop(work, matte, width, height, radius)
  if (!geschaetzt) return
  const { colour, weight, w, h } = geschaetzt

  for (let y = 0; y < height; y++) {
    const sy = clamp((y - 0.5) / 2, 0, h - 1)
    const y0 = Math.floor(sy)
    const y1 = Math.min(y0 + 1, h - 1)
    const fy = sy - y0

    for (let x = 0; x < width; x++) {
      const front = matte[y * width + x] / 255
      if (front > 0.998) continue

      const sx = clamp((x - 0.5) / 2, 0, w - 1)
      const x0 = Math.floor(sx)
      const x1 = Math.min(x0 + 1, w - 1)
      const fx = sx - x0

      // Scalars, not arrays: arrays here meant 1.3 million allocations per pass.
      const a = y0 * w + x0
      const b = y0 * w + x1
      const c = y1 * w + x0
      const d = y1 * w + x1
      const wa = (1 - fx) * (1 - fy)
      const wb = fx * (1 - fy)
      const wc = (1 - fx) * fy
      const wd = fx * fy

      // Safe to skip: where the weight vanishes, `front` is 1 anyway.
      const mass = weight[a] * wa + weight[b] * wb + weight[c] * wc + weight[d] * wd
      if (mass < 0.02) continue

      const at = (y * width + x) * 3
      for (let ch = 0; ch < 3; ch++) {
        const sum =
          colour[a * 3 + ch] * wa +
          colour[b * 3 + ch] * wb +
          colour[c * 3 + ch] * wc +
          colour[d * 3 + ch] * wd
        work[at + ch] = front * work[at + ch] + (1 - front) * (sum / mass)
      }
    }
  }
}

// Matte value up to which a pixel counts as background rather than hair fringe. Guessed.
const FRINGE = 0.25

// Subtracts the estimated old background before adding the new one; plain blending leaves a
// fringe of the old room in semi-transparent hair.
function swapBackdrop(
  work: Float32Array,
  matte: Uint8Array,
  backdrop: HTMLCanvasElement,
  width: number,
  height: number,
) {
  const ctx = backdrop.getContext('2d')
  if (!ctx || backdrop.width !== width || backdrop.height !== height) return

  // Wide enough for the estimate to bridge the person.
  const radius = Math.max(1, Math.round((BACKDROP_MAX * width) / 2))
  const geschaetzt = estimateBackdrop(work, matte, width, height, radius)
  if (!geschaetzt) return
  const { colour, weight, w, h } = geschaetzt

  const ersatz = ctx.getImageData(0, 0, width, height).data

  for (let y = 0; y < height; y++) {
    const sy = clamp((y - 0.5) / 2, 0, h - 1)
    const y0 = Math.floor(sy)
    const y1 = Math.min(y0 + 1, h - 1)
    const fy = sy - y0

    for (let x = 0; x < width; x++) {
      const front = matte[y * width + x] / 255
      if (front > 0.998) continue

      const sx = clamp((x - 0.5) / 2, 0, w - 1)
      const x0 = Math.floor(sx)
      const x1 = Math.min(x0 + 1, w - 1)
      const fx = sx - x0

      const a = y0 * w + x0
      const b = y0 * w + x1
      const c = y1 * w + x0
      const d = y1 * w + x1
      const wa = (1 - fx) * (1 - fy)
      const wb = fx * (1 - fy)
      const wc = (1 - fx) * fy
      const wd = fx * fy

      const mass = weight[a] * wa + weight[b] * wb + weight[c] * wc + weight[d] * wd
      const at = (y * width + x) * 3
      const bild = (y * width + x) * 4
      const rest = 1 - front
      const t = Math.min(front / FRINGE, 1)
      const smooth = t * t * (3 - 2 * t)

      for (let ch = 0; ch < 3; ch++) {
        if (mass < 0.02) {
          work[at + ch] = front * work[at + ch] + rest * ersatz[bild + ch]
          continue
        }
        const blurred =
          (colour[a * 3 + ch] * wa +
            colour[b * 3 + ch] * wb +
            colour[c * 3 + ch] * wc +
            colour[d * 3 + ch] * wd) /
          mass
        // Where the person is absent the pixel itself is the old background; the blurred
        // estimate alone would leave the room's edges as ghosts on the new backdrop.
        const alt = blurred * smooth + work[at + ch] * (1 - smooth)
        work[at + ch] = clamp(work[at + ch] - rest * alt + rest * ersatz[bild + ch], 0, 255)
      }
    }
  }
}
