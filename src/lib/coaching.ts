import { firstProblem, type Check } from './checks'

// Without a minimum hold the hint flickers with every head movement.
export const HOLD_MS = 1200

export type HintId =
  | 'ready'
  | 'noFace'
  | 'closer'
  | 'backUp'
  | 'cameraLow'
  | 'straighten'
  | 'uncover'
  | 'gaze'
  | 'brighter'
  | 'darker'
  | 'holdStill'
  | 'openEyes'
  | 'moveLeft'
  | 'moveRight'
  | 'sitUp'
  | 'sitLower'
  | 'smile'

// Short-lived but never dropped: it confirms all is well and signals the shot.
export const isAnnouncement = (id: HintId): boolean => id === 'ready'

// Guessed: well beyond a blink, which lasts 100-400 ms.
const BLINK_MS = 1000

export function createCoach(holdMs = HOLD_MS) {
  let current: HintId | null = null
  // Not 0, so the first hint comes at once regardless of the clock.
  let since = -Infinity
  let shutSince: number | null = null

  return function coach(checks: Check[], announcing: boolean, now: number): HintId | null {
    const shut = checks.find((it) => it.id === 'eyes' && it.state === 'bad')
    if (shut) {
      shutSince ??= now
      // During a blink the eye signals measure the lid, not the gaze: hold, leave `since` alone.
      if (now - shutSince < BLINK_MS) return current
    } else {
      shutSince = null
    }

    // The announcement is an event and bypasses the hold.
    if (announcing && !shut) {
      if (current !== 'ready') {
        current = 'ready'
        since = now
      }
      return current
    }

    // Shut eyes first: whoever keeps them closed can only hear the hint.
    const next = shut ? shut.hint : firstProblem(checks)

    // Silence holds too. `since` stays put while nothing changes, so a hint after calm is immediate.
    if (next === current) return current
    if (now - since < holdMs) return current

    current = next
    since = now
    return current
  }
}

