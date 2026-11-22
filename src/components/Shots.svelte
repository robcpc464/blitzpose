<script lang="ts">
  import { getContext, tick, untrack } from 'svelte'
  import { Check, Download, FlipHorizontal2, RotateCcw, Sparkles, Trash2 } from '@lucide/svelte'
  import { downloadPng, mirrorOf, pngUrl, type Capture } from '../lib/capture'
  import { EXPORT_SIZE } from '../lib/framing'
  import { I18N, type Texts } from '../lib/i18n'
  import type { Shot } from '../lib/shortlist'

  let {
    shots,
    ondelete,
    onpolish,
    mirrored = $bindable(),
  }: {
    shots: Shot<Capture>[]
    ondelete: (at: number) => void
    onpolish: () => void
    /** Off by default, since others see you unmirrored. Applies to preview and export. */
    mirrored: boolean
  } = $props()

  const i18n = getContext<{ t: Texts }>(I18N)

  let at = $state(0)

  // The fallback keeps `{#if current}` from remounting, which would drop focus to `<body>`.
  const current = $derived(shots[at] ?? shots[0] ?? null)
  const last = $derived(shots.length === 1)

  $effect(() => {
    if (at >= shots.length) at = 0
  })

  let preview = $state.raw<string | null>(null)

  $effect(() => {
    const shot = current
    const flipped = mirrored
    if (!shot) return

    const canvas = flipped ? mirrorOf(shot.frame.canvas) : shot.frame.canvas
    let url: string | null = null
    let cancelled = false

    pngUrl(canvas).then((made) => {
      if (!made) return
      if (cancelled) URL.revokeObjectURL(made)
      else preview = url = made
    })

    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
      preview = null
    }
  })

  // At the last image the focused discard button vanishes, so focus moves to download.
  let downloadButton = $state.raw<HTMLButtonElement | null>(null)
  let warLetztes = untrack(() => last)

  $effect(() => {
    const jetzt = last
    if (jetzt === warLetztes) return
    warLetztes = jetzt
    if (jetzt) tick().then(() => untrack(() => downloadButton)?.focus())
  })

  function keep() {
    if (shots.length > 1) at = (at + 1) % shots.length
  }

  function discard() {
    if (current) ondelete(current.at)
  }

  const download = () => preview && downloadPng(preview)

  const SWIPE_MIN = 72
  const FLY_OUT = 480
  const LEAVE_MS = 180

  let startX: number | null = null
  let dx = $state(0)
  // Off while dragging, or the card lags behind the finger.
  let gliding = $state(false)

  const calm =
    typeof matchMedia === 'undefined' ? false : matchMedia('(prefers-reduced-motion: reduce)').matches

  const pull = $derived(Math.min(Math.abs(dx) / SWIPE_MIN, 1))

  function down(event: PointerEvent) {
    if (last) return
    startX = event.clientX
    gliding = false
    event.currentTarget instanceof Element && event.currentTarget.setPointerCapture(event.pointerId)
  }

  function move(event: PointerEvent) {
    if (startX === null) return
    dx = event.clientX - startX
  }

  function up() {
    if (startX === null) return
    startX = null

    const decided = Math.abs(dx) >= SWIPE_MIN
    const toKeep = dx > 0
    gliding = true

    if (!decided) {
      dx = 0
      return
    }

    if (calm) {
      dx = 0
      gliding = false
      toKeep ? keep() : discard()
      return
    }

    dx = toKeep ? FLY_OUT : -FLY_OUT
    setTimeout(() => {
      // Reset without transition, or the next image would fly in.
      gliding = false
      dx = 0
      toKeep ? keep() : discard()
    }, LEAVE_MS)
  }
</script>

{#if current}

  <div class="flex w-full flex-col items-center gap-4">
    <h2 class="sr-only" data-view="choosing" tabindex="-1">{i18n.t.views.choosing}</h2>

    <p class="sr-only" aria-live="polite" aria-atomic="true">
      {i18n.t.shots.position(at + 1, shots.length)}
    </p>

    <p class="text-center text-sm text-fg-2">
      {last ? i18n.t.shots.remaining(1) : i18n.t.shots.lead}
    </p>

    <!-- Unnamed group: a label would repeat the lead above; the photo carries the name. -->
    <div
      role="group"
      onpointerdown={down}
      onpointermove={move}
      onpointerup={up}
      onpointercancel={up}
      class="relative aspect-square w-[90%] max-w-[26rem] touch-pan-y select-none
             {last ? '' : 'cursor-grab active:cursor-grabbing'}"
    >
      <div
        aria-hidden="true"
        class="absolute inset-0 rounded-2xl transition-colors {dx > 0 ? 'bg-ok' : 'bg-bad'}"
        style="opacity: {pull * 0.9}"
      ></div>

      {#if preview}
        <img
          src={preview}
          alt={i18n.t.shots.photo}
          draggable="false"
          class="relative size-full rounded-2xl shadow-[0_30px_60px_-30px_rgb(15_23_42/0.5)]
                 ring-[6px] ring-white/70 {gliding ? 'transition-transform duration-200' : ''}"
          style="transform: translateX({dx}px) rotate({dx * 0.02}deg)"
        />
      {/if}
    </div>

    {#if !last}
      <span class="text-xs tabular-nums text-fg-2">{i18n.t.shots.remaining(shots.length)}</span>
    {/if}

    <div class="flex w-[90%] max-w-[26rem] items-center gap-2.5">
      {#if last}
        <!-- Icon only, or the row wraps on phones. Discarding the last one restarts the camera. -->
        <button
          onclick={discard}
          aria-label={i18n.t.shots.reject}
          data-tip={i18n.t.shots.rejectTip}
          data-tip-align="start"
          class="btn-icon size-11 shrink-0 hover:bg-bad/15 hover:text-bad hover:border-bad/30"
        >
          <RotateCcw class="size-5" strokeWidth={1.7} />
        </button>

        <button
          bind:this={downloadButton}
          onclick={download}
          data-tip={i18n.t.shots.downloadTip(EXPORT_SIZE)}
          class="btn-primary flex min-w-0 flex-1 items-center justify-center gap-2.5 px-4 py-3"
        >
          <Download class="size-4 shrink-0" strokeWidth={2} />
          <span class="truncate">{i18n.t.shots.download}</span>
        </button>

        <button
          onclick={onpolish}
          aria-label={i18n.t.polish.open}
          data-tip={i18n.t.polish.open}
          class="btn-icon size-11 shrink-0 hover:bg-ok/15 hover:text-ok hover:border-ok/30"
        >
          <Sparkles class="size-5" strokeWidth={1.7} />
        </button>

        <!-- Only at the end: flipping every image while culling makes comparing harder. -->
        <button
          onclick={() => (mirrored = !mirrored)}
          aria-pressed={mirrored}
          aria-label={mirrored ? i18n.t.shots.mirrorOn : i18n.t.shots.mirror}
          data-tip={mirrored ? i18n.t.shots.mirrorOn : i18n.t.shots.mirror}
          data-tip-align="end"
          class="btn-icon size-11 shrink-0"
        >
          <FlipHorizontal2 class="size-5" strokeWidth={1.6} />
        </button>
      {:else}
        <button
          onclick={discard}
          class="btn-icon flex min-w-0 flex-1 items-center justify-center gap-2.5 px-4 py-3
                 text-sm font-medium hover:bg-bad/15 hover:text-bad hover:border-bad/30"
        >
          <Trash2 class="size-4 shrink-0" strokeWidth={1.8} />
          <span class="truncate">{i18n.t.shots.discard}</span>
        </button>

        <button
          onclick={keep}
          class="btn-primary flex min-w-0 flex-1 items-center justify-center gap-2.5 px-4 py-3"
        >
          <Check class="size-4 shrink-0" strokeWidth={2.2} />
          <span class="truncate">{i18n.t.shots.keep}</span>
        </button>
      {/if}
    </div>
  </div>
{/if}
