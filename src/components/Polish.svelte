<script lang="ts">
  import { getContext, onDestroy, tick, untrack } from 'svelte'
  import { Download, RotateCcw } from '@lucide/svelte'
  import { createMatting, type Matte, type Person } from '../lib/matting'
  import { createMulticlass } from '../lib/multiclass'
  import { downloadPng, mirrorOf, pngUrl, type Capture } from '../lib/capture'
  import { loadContours } from '../lib/facemesh'
  import { EXPORT_SIZE } from '../lib/framing'
  import { I18N, type Texts } from '../lib/i18n'
  import {
    DEFAULT_ON,
    DEFAULT_STRENGTH,
    retouch,
    STEPS,
    type StepId,
    type Strengths,
  } from '../lib/retouch'
  import { recallJson, remember } from '../lib/storage'

  let {
    shot,
    mirrored,
  }: {
    shot: Capture
    /** Read-only: toggled one view earlier, which everyone passes. */
    mirrored: boolean
  } = $props()

  const i18n = getContext<{ t: Texts }>(I18N)

  const ON_KEY = 'blitzpose.polish.on'
  const STRENGTH_KEY = 'blitzpose.polish.strength'

  type Switches = Record<StepId, boolean>

  let on = $state<Switches>({
    ...DEFAULT_ON,
    ...recallJson<Partial<Switches>>(ON_KEY, {}),
  })
  let strength = $state<Strengths>({
    ...DEFAULT_STRENGTH,
    ...Object.fromEntries(
      Object.entries(recallJson<Partial<Strengths> | null>(STRENGTH_KEY, null) ?? {}).filter(
        ([, value]) => Number.isFinite(value),
      ),
    ),
  })

  const applied = $derived(
    Object.fromEntries(STEPS.map((it) => [it, on[it] ? strength[it] : 0])) as Strengths,
  )

  // One pass takes 150 ms (measured, 800 px), so recompute only once the slider rests.
  const SETTLE_MS = 120

  let settled = $state.raw<Strengths>(untrack(() => applied))
  let firstPass = true

  $effect(() => {
    const next = applied
    // `settled` already holds the first pass; skip it so opening does not compute twice.
    if (firstPass) {
      firstPass = false
      return
    }
    const timer = setTimeout(() => (settled = next), SETTLE_MS)
    return () => clearTimeout(timer)
  })

  let matte = $state.raw<Matte | null>(null)
  let person = $state.raw<Person | null>(null)

  // Not tied to the effect's cleanup: any switch toggle reruns it and would drop the loading model.
  let pending: Promise<Matte> | null = null

  // Comparison tool under `?matte`, not a user control: the hairline is judged by eye.
  const WEGE = {
    matting: { name: 'MODNet', laden: createMatting },
    multiclass: { name: 'MediaPipe', laden: createMulticlass },
  } as const
  type Weg = keyof typeof WEGE

  const vergleicht = new URLSearchParams(location.search).has('matte')
  let quelle = $state<Weg>('matting')

  const GRUENDE = {
    unschaerfe: { name: 'Unschärfe', farben: null },
    hell: { name: 'Hell', farben: ['#f2f3f5', '#d6d9de'] },
    warm: { name: 'Warm', farben: ['#efe9e1', '#cfc5b8'] },
    dunkel: { name: 'Dunkel', farben: ['#3a3f47', '#191c21'] },
  } as const
  type Grund = keyof typeof GRUENDE

  let grund = $state<Grund>('unschaerfe')

  const backdrop = $derived.by(() => {
    const farben = GRUENDE[grund].farben
    if (!farben) return null
    const canvas = document.createElement('canvas')
    canvas.width = EXPORT_SIZE
    canvas.height = EXPORT_SIZE
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    // A gradient like a studio backdrop: a flat fill makes the person look cut out.
    const licht = ctx.createRadialGradient(
      EXPORT_SIZE * 0.5,
      EXPORT_SIZE * 0.35,
      EXPORT_SIZE * 0.08,
      EXPORT_SIZE * 0.5,
      EXPORT_SIZE * 0.35,
      EXPORT_SIZE * 0.85,
    )
    licht.addColorStop(0, farben[0])
    licht.addColorStop(1, farben[1])
    ctx.fillStyle = licht
    ctx.fillRect(0, 0, EXPORT_SIZE, EXPORT_SIZE)
    return canvas
  })

  $effect(() => {
    const gewaehlt = quelle
    if (!on.backdrop || pending) return
    const started: Promise<Matte> = untrack(() => WEGE[gewaehlt].laden())
    pending = started
    started.then(
      (it) => {
        if (pending === started) matte = it
      },
      (cause) => {
        if (pending !== started) return
        // Switch off rather than show "loading" forever.
        console.error(cause)
        pending = null
        on = { ...on, backdrop: false }
      },
    )
  })

  $effect(() => {
    const ready = matte
    const source = shot
    if (!ready) return
    let cancelled = false
    ready.of(source.canvas).then(
      (found) => !cancelled && (person = found),
      (cause) => console.error(cause),
    )
    return () => {
      cancelled = true
    }
  })

  function waehle(next: Weg) {
    if (next === quelle) return
    pending?.then(
      (it) => it.close(),
      () => {},
    )
    pending = null
    matte = null
    person = null
    quelle = next
  }

  onDestroy(() => {
    // Also closes a model that arrives after teardown.
    pending?.then(
      (it) => it.close(),
      () => {},
    )
    if (preview) URL.revokeObjectURL(preview)
  })

  let polished = $state.raw<HTMLCanvasElement | null>(null)

  // The timeout covers background tabs, where `requestAnimationFrame` never fires.
  function nachDemBild(run: () => void) {
    let erledigt = false
    const einmal = () => {
      if (erledigt) return
      erledigt = true
      run()
    }
    requestAnimationFrame(einmal)
    setTimeout(einmal, 50)
  }

  // Wait for a paint, not just `tick`, so the placeholder shows during the 150 ms pass.
  $effect(() => {
    const source = shot
    const settings = settled
    const cutout = person
    const dahinter = backdrop
    let cancelled = false
    tick().then(() =>
      nachDemBild(async () => {
        const contours = await loadContours().catch((cause) => {
          console.error(cause)
          return null
        })
        if (cancelled || !contours) return
        polished = retouch(source.canvas, source.mesh, contours, settings, cutout, dahinter)
      }),
    )
    return () => {
      cancelled = true
    }
  })

  let preview = $state.raw<string | null>(null)

  $effect(() => {
    const canvas = polished
    const flipped = mirrored
    if (!canvas) return

    let cancelled = false
    // Keep the old URL until the new one exists, or image and download point to a dead blob.
    const previous = untrack(() => preview)

    pngUrl(flipped ? mirrorOf(canvas) : canvas).then((made) => {
      if (!made) return
      if (cancelled) {
        URL.revokeObjectURL(made)
        return
      }
      preview = made
      if (previous) URL.revokeObjectURL(previous)
    })

    return () => {
      cancelled = true
    }
  })

  function toggle(id: StepId) {
    on = { ...on, [id]: !on[id] }
    remember(ON_KEY, on)
  }

  function setStrength(id: StepId, value: number) {
    strength = { ...strength, [id]: value }
    remember(STRENGTH_KEY, strength)
  }

  // Reset disables itself on click, so focus moves here instead of dropping to `<body>`.
  let downloadButton = $state.raw<HTMLButtonElement | null>(null)

  function reset() {
    remember(ON_KEY, (on = { ...DEFAULT_ON }))
    remember(STRENGTH_KEY, (strength = { ...DEFAULT_STRENGTH }))
    tick().then(() => untrack(() => downloadButton)?.focus())
  }

  const untouched = $derived(
    STEPS.every((it) => on[it] === DEFAULT_ON[it] && strength[it] === DEFAULT_STRENGTH[it]),
  )

  const download = () => preview && downloadPng(preview)
</script>

<!-- Image and download stay put while the list scrolls, so you see what you adjust. -->
<div class="flex min-h-0 w-full flex-1 flex-col items-center gap-4">
  <h2 class="sr-only" data-view="polish" tabindex="-1">{i18n.t.views.polish}</h2>

  <div class="flex w-full shrink-0 flex-col items-center gap-4">
    <div class="relative aspect-square w-full max-w-[min(24rem,40vh)]">
      {#if preview}
        <img
          src={preview}
          alt={i18n.t.shots.photo}
          draggable="false"
          class="size-full rounded-2xl shadow-[0_30px_60px_-30px_rgb(15_23_42/0.5)] ring-[6px]
                 ring-white/70"
        />
      {:else}
        <div class="glass size-full animate-pulse rounded-2xl"></div>
      {/if}
    </div>

    <div class="flex w-full max-w-[26rem] items-center gap-2.5">
      <button
        bind:this={downloadButton}
        onclick={download}
        disabled={!preview}
        data-tip={i18n.t.shots.downloadTip(EXPORT_SIZE)}
        class="btn-primary flex min-w-0 flex-1 items-center justify-center gap-2.5 px-4 py-3"
      >
        <Download class="size-4 shrink-0" strokeWidth={2} />
        <span class="truncate">{i18n.t.shots.download}</span>
      </button>

      <button
        onclick={reset}
        disabled={untouched}
        aria-label={i18n.t.polish.reset}
        data-tip={i18n.t.polish.reset}
        data-tip-align="end"
        class="btn-icon size-11 shrink-0"
      >
        <RotateCcw class="size-5" strokeWidth={1.7} />
      </button>
    </div>
  </div>

  <div class="min-h-0 w-full max-w-[26rem] flex-1 overflow-y-auto pb-2">
    <p class="pb-3 text-balance text-center text-xs text-fg-2">{i18n.t.polish.lead}</p>

    {#if vergleicht}
      <div class="glass mb-3 flex gap-1.5 rounded-2xl p-1">
        {#each Object.entries(WEGE) as [id, { name }] (id)}
          <button
            onclick={() => waehle(id as Weg)}
            aria-pressed={quelle === id}
            class="flex-1 touch-manipulation rounded-xl px-3 py-2 text-xs font-medium transition
                   focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg
                   {quelle === id ? 'bg-white/85 text-fg shadow-sm' : 'text-fg-2 hover:bg-white/60'}"
          >
            {name}{quelle === id && !person ? ' …' : ''}
          </button>
        {/each}
      </div>
    {/if}

    <div class="flex flex-col gap-1.5">
      {#each STEPS as id (id)}
        <div class="glass rounded-2xl px-3.5 py-2.5">
          <button
            role="switch"
            aria-checked={on[id]}
            onclick={() => toggle(id)}
            class="flex w-full touch-manipulation items-center gap-3 text-left
                   focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg"
          >
            <span class="min-w-0 flex-1">
              <span class="block text-sm font-medium">{i18n.t.polish.steps[id]}</span>
              <span class="block text-xs text-fg-2">
                {id === 'backdrop' && on.backdrop && !person
                  ? i18n.t.polish.loading
                  : i18n.t.polish.about[id]}
              </span>
            </span>

            <span
              aria-hidden="true"
              class="relative h-6 w-11 shrink-0 rounded-full transition-colors
                     {on[id] ? 'bg-ok' : 'bg-slate-900/15'}"
            >
              <span
                class="absolute top-0.5 size-5 rounded-full bg-white shadow-sm transition-all
                       {on[id] ? 'left-[1.375rem]' : 'left-0.5'}"
              ></span>
            </span>
          </button>

          {#if id === 'backdrop' && on[id]}
            <div class="mt-2 flex gap-1.5">
              {#each Object.entries(GRUENDE) as [id, { name, farben }] (id)}
                <button
                  onclick={() => (grund = id as Grund)}
                  aria-pressed={grund === id}
                  class="flex-1 touch-manipulation rounded-lg px-2 py-1.5 text-[11px] font-medium
                         ring-1 transition focus-visible:outline-2 focus-visible:outline-offset-2
                         focus-visible:outline-fg
                         {grund === id ? 'ring-2 ring-ok text-fg' : 'ring-slate-900/10 text-fg-2 hover:bg-white/60'}"
                  style={farben
                    ? `background: linear-gradient(140deg, ${farben[0]}, ${farben[1]}); color: ${id === 'dunkel' ? '#fff' : '#111'}`
                    : ''}
                >
                  {name}
                </button>
              {/each}
            </div>
          {/if}

          {#if on[id] && !(id === 'backdrop' && grund !== 'unschaerfe')}
            <!-- Only where it has an effect: a replaced backdrop ignores the strength. -->
            <label class="mt-2 flex items-center gap-3">
              <span class="sr-only">{i18n.t.polish.strength(i18n.t.polish.steps[id])}</span>
              <input
                type="range"
                min="0.05"
                max="1"
                step="0.05"
                value={strength[id]}
                oninput={(event) => setStrength(id, Number(event.currentTarget.value))}
                class="h-1.5 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-slate-900/15
                       accent-ok focus-visible:outline-2 focus-visible:outline-offset-4
                       focus-visible:outline-fg"
              />
              <!-- aria-hidden, or the label adds the number to the slider's accessible name. -->
              <span aria-hidden="true" class="w-8 shrink-0 text-right text-xs tabular-nums text-fg-2">
                {strength[id].toFixed(2)}
              </span>
            </label>
          {/if}
        </div>
      {/each}
    </div>
  </div>
</div>
