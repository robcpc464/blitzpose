<script lang="ts">
  import {
    createSampler,
    loadCalibration,
    saveCalibration,
    toCompact,
    type Calibration,
    type Snapshot,
  } from '../lib/calibration'
  import type { Detection } from '../lib/scoring'

  let {
    detection,
    settings,
  }: {
    detection: Detection | null
    settings: MediaTrackSettings | null
  } = $props()

  // Time to look away from the button, since that glance would spoil a gaze measurement.
  const LEAD_IN_MS = 1500
  const CAPTURE_MS = 1500

  let label = $state('')
  let phase = $state<'idle' | 'leadIn' | 'capturing'>('idle')
  let remaining = $state(0)
  let snapshots = $state.raw<Snapshot[]>(loadCalibration()?.snapshots ?? [])
  let copied = $state('')

  // `detection` is also set for frames without a face, so check the landmarks.
  const hasFace = $derived(Boolean(detection?.input.landmarks))

  let copiedTimer: ReturnType<typeof setTimeout>
  let sampler = createSampler()
  let startedAt = 0
  // Plain `let`: if the effect tracked it, a phase change would add the same frame twice.
  let active = false

  function record() {
    sampler = createSampler()
    startedAt = performance.now()
    remaining = LEAD_IN_MS + CAPTURE_MS
    phase = 'leadIn'
    active = true
  }

  function finish() {
    active = false
    phase = 'idle'
    if (!sampler.frames) return

    snapshots = [
      ...snapshots,
      {
        id: `${snapshots.length + 1}`,
        label: label.trim() || `snapshot ${snapshots.length + 1}`,
        frames: sampler.frames,
        dropped: sampler.dropped,
        spans: sampler.spans(),
      },
    ]
    label = ''
    saveCalibration(snapshot())
  }

  const snapshot = (): Calibration => ({
    recordedAt: new Date().toISOString(),
    camera: settings
      ? { width: settings.width, height: settings.height, frameRate: settings.frameRate }
      : null,
    snapshots,
  })

  async function copy() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(toCompact(snapshot())))
      copied = 'Copied'
    } catch {
      copied = 'Clipboard blocked'
    }
    clearTimeout(copiedTimer)
    copiedTimer = setTimeout(() => (copied = ''), 2500)
  }

  function reset() {
    snapshots = []
    saveCalibration(snapshot())
  }

  const summary = (it: Snapshot) =>
    `gaze ${it.spans['sig.gaze']?.mean.toFixed(3) ?? '—'}   yaw ${
      it.spans['pose.yaw']?.mean.toFixed(1) ?? '—'
    }°`

  $effect(() => {
    const current = detection?.input.landmarks ? detection : null
    if (!current) {
      // Abort rather than keep half a recording.
      if (active) {
        active = false
        phase = 'idle'
      }
      return
    }
    if (!active) return

    const elapsed = performance.now() - startedAt
    remaining = Math.max(0, LEAD_IN_MS + CAPTURE_MS - elapsed)

    if (elapsed >= LEAD_IN_MS + CAPTURE_MS) {
      finish()
      return
    }
    if (elapsed < LEAD_IN_MS) {
      phase = 'leadIn'
      return
    }
    phase = 'capturing'
    sampler.add({
      landmarks: current.input.landmarks,
      blendshapes: current.input.blendshapes,
      pose: current.input.pose,
      signals: current.score.signals,
      stats: current.input.stats,
    })
  })
</script>

<section
  class="glass w-full rounded-2xl p-4"
>
  <p class="text-sm text-fg-2">
    Type what you are about to do, press Record, then hold that pose. The first
    {LEAD_IN_MS / 1000} s are not measured, so you have time to look away from this panel.
    Taking shots is paused while this panel is open.
  </p>

  <div class="mt-3 flex flex-wrap items-center gap-2">
    <input
      bind:value={label}
      placeholder="e.g. straight into the lens"
      disabled={phase !== 'idle'}
      class="min-w-0 flex-1 rounded-full bg-white/70 px-4 py-2 text-sm ring-1 ring-slate-900/10
             placeholder:text-fg-2 focus:outline-2 focus:outline-offset-2 focus:outline-fg
             disabled:opacity-40"
    />

    <button
      onclick={record}
      disabled={!hasFace || phase !== 'idle'}
      class="btn-primary px-5 py-2"
    >
      {#if phase === 'leadIn'}
        Get ready… {(remaining / 1000).toFixed(1)} s
      {:else if phase === 'capturing'}
        Recording… {(remaining / 1000).toFixed(1)} s
      {:else}
        Record
      {/if}
    </button>
  </div>

  {#if snapshots.length}
    <ul class="mt-3 flex flex-col gap-1 border-t border-slate-900/10 pt-3 font-mono text-xs">
      {#each snapshots as it (it.id)}
        <li class="flex flex-wrap items-baseline gap-x-3">
          <span class="text-fg">{it.label}</span>
          <span class="text-fg-2 tabular-nums">{summary(it)}</span>
          <span class="text-fg-2 tabular-nums">{it.frames} frames</span>
          {#if it.dropped}
            <span class="text-warn tabular-nums">{it.dropped} without a face</span>
          {/if}
        </li>
      {/each}
    </ul>

    <div class="mt-3 flex flex-wrap items-center gap-2">
      {#if copied}
        <span class="font-mono text-xs text-ok">{copied}</span>
      {/if}
      <span class="flex-1"></span>
      <button
        onclick={copy}
        class="touch-manipulation rounded-full bg-fg/15 px-4 py-2 text-sm font-medium transition
               hover:bg-fg/25 focus-visible:outline-2 focus-visible:outline-offset-2
               focus-visible:outline-fg"
      >
        Copy JSON
      </button>
      <button
        onclick={reset}
        disabled={phase !== 'idle'}
        class="touch-manipulation rounded-full px-4 py-2 text-sm text-fg-2 transition
               hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2
               focus-visible:outline-fg disabled:opacity-30"
      >
        Reset
      </button>
    </div>
  {/if}

  {#if !hasFace}
    <p class="mt-3 font-mono text-xs text-warn">
      No face detected — start the camera and sit in frame.
    </p>
  {/if}
</section>
