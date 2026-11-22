<script lang="ts" module>
  import {
    Axis3d,
    Crosshair,
    Eye,
    Focus,
    Hand,
    Move,
    ScanFace,
    Scaling,
    Smile,
    Sun,
    type LucideIcon,
  } from '@lucide/svelte'
  import type { CheckId } from '../lib/checks'

  // Icons, not names: ten words fit no width. The start screen reuses them.
  export const ICONS: Record<CheckId, LucideIcon> = {
    face: ScanFace,
    distance: Scaling,
    position: Move,
    head: Axis3d,
    uncovered: Hand,
    light: Sun,
    gaze: Crosshair,
    sharpness: Focus,
    eyes: Eye,
    smile: Smile,
  }
</script>

<script lang="ts">
  import { getContext } from 'svelte'
  import type { Check } from '../lib/checks'
  import { I18N, type Texts } from '../lib/i18n'

  let {
    checks,
    enabled,
    ontoggle,
  }: {
    checks: Check[]
    enabled: Record<CheckId, boolean>
    ontoggle: (id: CheckId) => void
  } = $props()

  const i18n = getContext<{ t: Texts }>(I18N)

  // Dimmed by color, not opacity: `text-fg-2/50` measured 2.47:1, below the 3:1 icons need.
  // Disabled tiles on #e4e8f2, grey/red/green: opacity 1 → 6.75/4.35/3.93,
  // 0.85 → 4.75/3.79/3.15, 0.75 → 3.81/3.32/2.71.
  const TILE: Record<Check['state'], string> = {
    good: 'border-ok/40 bg-ok/10 text-ok',
    bad: 'border-bad/50 bg-bad/10 text-bad',
    off: 'border-white/80 bg-white/50 text-fg-2',
  }
</script>

<div class="flex w-full flex-wrap justify-center gap-1.5 sm:gap-2">
  {#each checks as { id, state }, i (id)}
    {@const Glyph = ICONS[id]}
    <button
      onclick={() => ontoggle(id)}
      aria-pressed={enabled[id]}
      aria-label={i18n.t.lights.state(i18n.t.checks[id], i18n.t.states[state])}
      data-tip="{i18n.t.checks[id]}
{enabled[id] ? i18n.t.lights.required : i18n.t.lights.ignored}"
      data-tip-align={i === 0 ? 'start' : i === checks.length - 1 ? 'end' : undefined}
      class="grid size-10 touch-manipulation place-items-center rounded-xl border transition-all
             duration-300 hover:brightness-125 focus-visible:outline-2 focus-visible:outline-offset-2
             focus-visible:outline-fg sm:size-12 {TILE[state]}
             {enabled[id] ? '' : 'border-dashed opacity-85'}"
    >
      <Glyph class="size-[1.15rem] sm:size-[1.375rem]" strokeWidth={1.7} />
    </button>
  {/each}
</div>
