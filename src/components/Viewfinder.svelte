<script lang="ts">
  import type { FaceLandmarker } from '@mediapipe/tasks-vision'
  import { getContext } from 'svelte'
  import { AudioLines, Camera } from '@lucide/svelte'
  import alien from '../assets/start/alien.jpg'
  import type { HintId } from '../lib/coaching'
  import { I18N, type Texts } from '../lib/i18n'
  import { MAX_SHOTS } from '../lib/shortlist'
  import { ICONS } from './Lights.svelte'

  let { landmarker }: { landmarker: FaceLandmarker | null } = $props()

  const i18n = getContext<{ t: Texts }>(I18N)

  const GLYPHS = Object.values(ICONS)
  const TICK_MS = 420
  const FLASH_AT = GLYPHS.length + 2
  const CYCLE = FLASH_AT + 4

  // One hint per few checks, or the text changes faster than it can be read.
  const HINTS: HintId[] = ['closer', 'cameraLow', 'smile']

  let photo: HTMLImageElement
  let points = $state<number[][]>([])

  // The real detector on the portrait: its mesh appears once the local model has loaded.
  $effect(() => {
    const detector = landmarker
    if (!detector) return
    let cancelled = false
    ;(async () => {
      if (!photo.complete) {
        await new Promise((done) => (photo.onload = photo.onerror = done))
      }
      if (cancelled || !photo.naturalWidth) return
      const face = detector.detectForVideo(photo, performance.now()).faceLandmarks[0]
      if (face) points = face.map(({ x, y }) => [x, y])
    })()
    return () => (cancelled = true)
  })

  let tick = $state(0)
  let shots = $state(0)

  $effect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      tick = FLASH_AT
      shots = 1
      return
    }
    const timer = setInterval(() => {
      tick = (tick + 1) % CYCLE
      if (tick === FLASH_AT) shots = (shots % MAX_SHOTS) + 1
    }, TICK_MS)
    return () => clearInterval(timer)
  })

  const good = $derived(Math.min(tick, GLYPHS.length))
  const ready = $derived(good === GLYPHS.length)
  const hint = $derived<HintId>(
    ready ? 'ready' : HINTS[Math.floor((good * HINTS.length) / GLYPHS.length)],
  )
</script>

<!-- Decorative; the text beside it says the same. -->
<div aria-hidden="true" class="glass mx-auto w-full max-w-md rounded-[2rem] p-5 sm:p-6">
  <div class="flex items-center justify-between gap-3">
    <div
      class="flex min-w-0 items-center gap-2 rounded-full bg-white/60 py-1.5 pr-4 pl-1.5 text-sm
             font-medium ring-1 ring-white/80"
    >
      <span class="ink grid size-7 shrink-0 place-items-center rounded-full">
        <AudioLines class="size-3.5" strokeWidth={2} />
      </span>
      {#key hint}
        <span class="fade truncate">{i18n.t.hints[hint]}</span>
      {/key}
    </div>
    <div class="flex shrink-0 items-center gap-1.5 text-xs font-semibold tabular-nums text-fg-2">
      <Camera class="size-3.5" strokeWidth={2} />
      {shots}/{MAX_SHOTS}
    </div>
  </div>

  <div class="relative mx-auto mt-8 mb-2 aspect-square w-full max-w-[17rem]">
    <div
      class="absolute -inset-4 animate-[spin_28s_linear_infinite] rounded-full border border-dashed
             border-slate-500/35"
    ></div>
    <div class="glass absolute -inset-2 rounded-full"></div>

    <img
      bind:this={photo}
      src={alien}
      alt=""
      class="absolute inset-0 size-full rounded-full object-cover"
    />
    <svg
      viewBox="0 0 1 1"
      class="absolute inset-0 size-full transition-opacity duration-700
             {points.length ? 'opacity-100' : 'opacity-0'}
             {ready ? 'fill-emerald-300' : 'fill-sky-300'}"
    >
      {#each points as [cx, cy], i (i)}
        <circle {cx} {cy} r="0.0024" />
      {/each}
    </svg>

    <div
      class="absolute inset-0 rounded-full ring-2 transition-[box-shadow] duration-500
             {ready ? 'ring-ok' : 'ring-white/70'}"
    ></div>

    {#if shots > 0}
      {#key shots}
        <div class="blitz absolute inset-0 rounded-full bg-white opacity-0"></div>
      {/key}
    {/if}
  </div>

  <div class="mt-8 grid grid-cols-10 gap-1 sm:gap-1.5">
    {#each GLYPHS as Glyph, i (i)}
      <div
        class="grid aspect-square place-items-center rounded-lg border transition-colors duration-300
               {i < good ? 'border-ok/35 bg-ok/10 text-ok' : 'border-white/80 bg-white/45 text-fg-2'}"
      >
        <Glyph class="size-3.5 sm:size-4" strokeWidth={1.8} />
      </div>
    {/each}
  </div>
</div>

<style>
  .fade {
    animation: fade 300ms ease-out;
  }

  @keyframes fade {
    from {
      opacity: 0;
      translate: 0 0.25rem;
    }
  }

  .blitz {
    animation: blitz 700ms ease-out;
  }

  @keyframes blitz {
    12% {
      opacity: 0.95;
    }
  }
</style>
