import type { Score, ScoreComponentId } from "./scoring";

// Tried: shorter lets two quick glances trigger a hint, longer only gets sluggish.
export const FALL_MS = 2500;

// Improvements are nearly always real, so they show within about 0.6 s.
export const RISE_MS = 300;

// Until then checks stay grey instead of green from no data.
export const WARMUP_MS = 1000;

// Smooths what the user sees and hears; the raw score still triggers the shutter.
export function createTrend(
  fallMs = FALL_MS,
  riseMs = RISE_MS,
  warmupMs = WARMUP_MS,
) {
  const values = new Map<ScoreComponentId, number>();
  let lastAt: number | null = null;
  let firstAt: number | null = null;
  let settled = false;

  function update(score: Score, now: number): Score {
    const elapsed = lastAt === null ? Infinity : Math.max(0, now - lastAt);
    lastAt = now;
    firstAt ??= now;
    settled = now - firstAt >= warmupMs;

    const components = score.components.map((it) => {
      const previous = values.get(it.id);
      if (previous === undefined) {
        values.set(it.id, it.value);
        return it;
      }
      // Higher is better: rise fast, fall slow.
      const tau = it.value > previous ? riseMs : fallMs;
      const value =
        previous + (it.value - previous) * (1 - Math.exp(-elapsed / tau));
      values.set(it.id, value);
      return { ...it, value };
    });

    return {
      ...score,
      components,
      total: components.reduce((sum, it) => sum + it.weight * it.value, 0),
    };
  }

  return {
    update,

    get settled() {
      return settled;
    },

    reset() {
      values.clear();
      lastAt = null;
      firstAt = null;
      settled = false;
    },
  };
}
