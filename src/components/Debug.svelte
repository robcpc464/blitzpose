<script lang="ts">
  import { COVERED_MAX } from '../lib/checks'
  import { mouthMetrics } from '../lib/facemesh'
  import { COMPONENT_OK, SCORE_TARGETS, type Detection } from '../lib/scoring'
  import { SHARP_AT } from '../lib/sharpness'

  let {
    detection,
    settings,
    timing,
  }: {
    detection: Detection | null
    settings: MediaTrackSettings | null
    timing: { inferenceMs: number; roiMs: number; fps: number }
  } = $props()

  const pose = $derived(detection?.input.pose)
  const landmarks = $derived(detection?.input.landmarks)

  const mouth = $derived(landmarks && mouthMetrics(landmarks))
  const stats = $derived(detection?.input.stats)

  const angles = $derived([
    { label: 'yaw', value: pose?.yaw, hint: '+ turned to your left' },
    { label: 'pitch', value: pose?.pitch, hint: '+ chin up' },
    { label: 'roll', value: pose?.roll, hint: '+ tilted to your left' },
  ])

  const measured = $derived([
    {
      label: 'sharpness',
      value: stats?.sharpness.toFixed(0),
      // Laplace variance falls with the light, so it is judged against the session peak.
      target: `${(detection?.input.sharpness ?? 0).toFixed(2)} of peak, good > ${SHARP_AT}`,
    },
    {
      label: 'luminance',
      value: stats?.luminance.toFixed(2),
      target: `${SCORE_TARGETS.luminance.min}–${SCORE_TARGETS.luminance.max}`,
    },
    {
      label: 'covered',
      value: detection?.input.covered?.toFixed(2),
      target: `≤ ${COVERED_MAX.toFixed(2)}`,
    },
    {
      label: 'gaze off',
      value: detection?.score.signals.gaze.toFixed(3),
      // Derived from the band, so it cannot drift from the real gate.
      target: `band < ${SCORE_TARGETS.gaze.max}, light < ${(
        SCORE_TARGETS.gaze.max +
        SCORE_TARGETS.gaze.falloff * (1 - COMPONENT_OK)
      ).toFixed(2)}`,
    },
  ])
</script>

<section class="glass w-full rounded-2xl p-4 font-mono text-xs">
  <div class="grid grid-cols-3 gap-3">
    {#each angles as { label, value, hint } (label)}
      <div>
        <div class="text-fg-2">{label}</div>
        <div class="text-xl tabular-nums">
          {value === undefined ? '—' : `${value >= 0 ? '+' : ''}${value.toFixed(1)}°`}
        </div>
        <div class="text-[10px] text-fg-2">{hint}</div>
      </div>
    {/each}
  </div>

  <div class="mt-3 flex flex-wrap gap-x-4 border-t border-slate-900/10 pt-3 text-fg-2 tabular-nums">
    {#if settings}
      <span>
        {settings.width}x{settings.height}
        {settings.frameRate ? `@ ${Math.round(settings.frameRate)}` : ''}
      </span>
    {/if}
    <span>{timing.inferenceMs.toFixed(1)} ms inference</span>
    <span>{timing.roiMs.toFixed(1)} ms roi</span>
  </div>

  {#if mouth}
    <div class="mt-3 flex flex-wrap gap-x-4 border-t border-slate-900/10 pt-3 tabular-nums text-fg-2">
      <span>mouth width <span class="text-fg">{mouth.width.toFixed(3)}</span></span>
      <span>corner lift <span class="text-fg">{mouth.cornerLift.toFixed(4)}</span></span>
      <span>opening <span class="text-fg">{mouth.opening.toFixed(4)}</span></span>
    </div>
  {/if}

  <div class="mt-3 flex flex-wrap gap-x-4 border-t border-slate-900/10 pt-3 tabular-nums">
    {#each measured as { label, value, target } (label)}
      <span class="text-fg-2">
        {label}
        <span class="text-fg">{value ?? '—'}</span>
        <span class="text-[10px]">({target})</span>
      </span>
    {/each}
  </div>

  {#if detection}
    <div class="mt-3 border-t border-slate-900/10 pt-3">
      <div class="mb-2 flex items-baseline gap-2">
        <span class="text-fg-2">technical score</span>
        <span class="text-xl tabular-nums">{detection.shown.total.toFixed(3)}</span>
        <span class="text-fg-2">raw {detection.score.total.toFixed(3)}</span>
      </div>

      {#each detection.shown.components as { id, weight, value } (id)}
        <div class="flex items-center gap-2 py-px">
          <span class="w-20 shrink-0 truncate text-fg-2">{id}</span>
          <span class="w-8 shrink-0 text-right text-fg-2 tabular-nums">{weight.toFixed(2)}</span>
          <span class="h-1.5 flex-1 rounded-full bg-slate-900/10">
            <span class="block h-full rounded-full bg-ok" style="width: {value * 100}%"></span>
          </span>
          <span class="w-8 shrink-0 text-right tabular-nums">{value.toFixed(2)}</span>
        </div>
      {/each}
    </div>

    <div
      class="mt-3 grid max-h-64 grid-cols-2 gap-x-4 overflow-y-auto border-t border-slate-900/10 pt-3"
    >
      {#each detection.input.blendshapes as { categoryName, score } (categoryName)}
        <div class="flex items-center gap-2 py-px">
          <span class="w-32 shrink-0 truncate text-fg-2">{categoryName}</span>
          <span class="h-1.5 flex-1 rounded-full bg-slate-900/10">
            <span class="block h-full rounded-full bg-slate-500" style="width: {score * 100}%"></span>
          </span>
          <span class="w-8 shrink-0 text-right tabular-nums">{score.toFixed(2)}</span>
        </div>
      {/each}
    </div>
  {/if}
</section>
