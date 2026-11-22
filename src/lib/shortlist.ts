// Enough to choose from; twelve 800x800 crops take about 30 MB.
export const MAX_SHOTS = 12

// At 500 and 1200 ms shots were too alike to choose between.
export const MIN_GAP_MS = 2500

// Without it, score jitter caused 82 replacements (each a frame copy) in ten seconds.
export const IMPROVE_BY = 0.01

export type Shot<T> = {
  at: number
  score: number
  frame: T
}

type Slot = { kind: 'reject' } | { kind: 'append' } | { kind: 'replace'; index: number }

export function createShortlist<T>(
  max = MAX_SHOTS,
  minGapMs = MIN_GAP_MS,
  improveBy = IMPROVE_BY,
) {
  let shots: Shot<T>[] = []

  function slotFor(score: number, at: number): Slot {
    const near = shots.findIndex((it) => Math.abs(it.at - at) < minGapMs)
    if (near >= 0) {
      return score > shots[near].score + improveBy
        ? { kind: 'replace', index: near }
        : { kind: 'reject' }
    }

    // A full list rejects: culling is manual, and each deleted shot frees a slot.
    return shots.length < max ? { kind: 'append' } : { kind: 'reject' }
  }

  return {
    // Separate from `add` so the caller copies the frame only if it will be kept.
    accepts(score: number, at: number): boolean {
      return slotFor(score, at).kind !== 'reject'
    },

    /** Returns the replaced shot, if any. */
    add(score: number, at: number, frame: T): Shot<T> | null {
      const slot = slotFor(score, at)
      if (slot.kind === 'reject') return null

      const shot = { at, score, frame }
      if (slot.kind === 'append') {
        shots = [...shots, shot]
        return null
      }

      const replaced = shots[slot.index]
      shots = shots.map((it, i) => (i === slot.index ? shot : it))
      return replaced
    },

    /** Returns the removed shot so the caller can reuse its frame. */
    remove(at: number): Shot<T> | null {
      const found = shots.find((it) => it.at === at)
      if (!found) return null
      shots = shots.filter((it) => it !== found)
      return found
    },

    best(): Shot<T>[] {
      return [...shots].sort((a, b) => b.score - a.score)
    },

    get size() {
      return shots.length
    },

    clear(): Shot<T>[] {
      const dropped = shots
      shots = []
      return dropped
    },
  }
}
