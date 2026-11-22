import type { Check } from './checks'

// Long enough to speak the line (900 ms felt abrupt), short enough for a real smile to hold.
export const ANNOUNCE_MS = 1500

export type Phase = 'idle' | 'announcing' | 'collecting' | 'done'

// Driven by checks and clock only, never by speech, which some browsers lack.
export function createSession(announceMs = ANNOUNCE_MS) {
  let phase: Phase = 'idle'
  let until = 0

  return {
    remaining(now: number): number {
      return phase === 'announcing' ? Math.max(0, until - now) / 1000 : 0
    },

    update(clear: boolean, now: number): Phase {
      switch (phase) {
        case 'idle':
          if (clear) {
            phase = 'announcing'
            until = now + announceMs
          }
          break

        case 'announcing':
          if (!clear) phase = 'idle'
          else if (now >= until) phase = 'collecting'
          break

        case 'collecting':
          // Ends only via `finish` (user or shot cap); unclear frames are just not taken.
          break

        case 'done':
          // Final, so deleting a shot afterwards does not restart the camera.
          break
      }
      return phase
    },

    finish() {
      phase = 'done'
    },

    reset() {
      phase = 'idle'
      until = 0
    },
  }
}

// An empty list means nothing blocks, not "never shoot". A blink must not cancel the announcement.
export const readyToShoot = (checks: Check[]): boolean =>
  checks.every((it) => it.id === 'eyes' || it.state === 'good')

export const frameUsable = (checks: Check[]): boolean =>
  checks.every((it) => it.state === 'good')
