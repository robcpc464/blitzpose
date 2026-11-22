<script lang="ts">
  import type { FaceLandmarker } from '@mediapipe/tasks-vision'
  import { setContext, tick } from 'svelte'
  import { ArrowLeft, CircleDot, Languages, SlidersHorizontal, Volume2, VolumeX, Zap } from '@lucide/svelte'
  import GitHubMark from './components/GitHubMark.svelte'
  import Live from './components/Live.svelte'
  import Setup from './components/Setup.svelte'
  import { detectLang, I18N, LANG_NAMES, LANGS, other, TEXTS, type Lang } from './lib/i18n'
  import { createCoverMeter, type CoverMeter } from './lib/cover'
  import { createLandmarker } from './lib/landmarker'
  import { PUBLIC_SITE, REPO_URL } from './lib/site'
  import { recallJson, remember } from './lib/storage'

  const MUTED_KEY = 'blitzpose.muted'
  const LANG_KEY = 'blitzpose.lang'

  type Phase = 'setup' | 'live' | 'choosing' | 'polish'

  let lang = $state<Lang>(loadLang())

  function loadLang(): Lang {
    const saved = recallJson<Lang | null>(LANG_KEY, null)
    return saved && LANGS.includes(saved) ? saved : detectLang()
  }

  function toggleLang() {
    lang = other(lang)
    remember(LANG_KEY, lang)
  }

  // A getter, so the context is set once yet follows `lang`.
  setContext(I18N, {
    get t() {
      return TEXTS[lang]
    },
  })

  const t = $derived(TEXTS[lang])

  // Phases are browser history entries: everyone reaches for Back, and uncaught it would end the
  // session and lose the shots.
  let phase = $state<Phase>('setup')

  let visitedLive = $state(false)
  let hasShots = $state(false)

  function show(next: Phase) {
    phase = next
    if (next !== 'setup') visitedLive = true
  }

  function go(next: Phase) {
    if (next === phase) return
    show(next)
    history.pushState({ phase: next }, '')
  }

  // Focus the new view's heading on phase change: the triggering button vanishes, focus would drop
  // to <body>, and screen readers would not announce the switch.
  let entered = false

  $effect(() => {
    const current = phase
    if (!entered) {
      entered = true
      return
    }
    // After `tick`: the headings in Live and Shots depend on props arriving in this pass.
    tick().then(() => document.querySelector<HTMLElement>(`[data-view="${current}"]`)?.focus())
  })

  // The first history entry belongs to setup, or the first Back leaves the app.
  history.replaceState({ phase: 'setup' }, '')

  // Load at once so the 3.7 MB model arrives while the start screen is read.
  let landmarker = $state.raw<FaceLandmarker | null>(null)
  let progress = $state(0)
  let modelError = $state(false)

  $effect(() => {
    let cancelled = false
    let created: FaceLandmarker | null = null

    createLandmarker((fraction) => {
      if (!cancelled) progress = fraction
    })
      .then((it) => {
        created = it
        if (cancelled) it.close()
        else landmarker = it
      })
      .catch((cause) => {
        console.error(cause)
        if (!cancelled) modelError = true
      })

    return () => {
      cancelled = true
      created?.close()
      landmarker = null
    }
  })

  // After the landmarker, so the 15.6 MB do not slow its download; nothing waits for them.
  let cover = $state.raw<CoverMeter | null>(null)

  $effect(() => {
    if (!landmarker) return
    let cancelled = false
    let created: CoverMeter | null = null

    createCoverMeter()
      .then((it) => {
        created = it
        if (cancelled) it.close()
        else cover = it
      })
      .catch((cause) => console.error(cause))

    return () => {
      cancelled = true
      created?.close()
      cover = null
    }
  })

  // Voice on by default: for accessibility it is the primary channel, text the fallback.
  let muted = $state(recallJson(MUTED_KEY, false))

  let canSpeak = $state(false)
  let showDebug = $state(false)
  let showRecorder = $state(false)

  // Measurement tools, not user controls, so only on explicit request.
  const suche = new URLSearchParams(location.search)
  const recording = suche.has('record')
  const probing = suche.has('testbilder')

  // The AI-voice disclosure is shown on the start screen.
  function toggleVoice() {
    remember(MUTED_KEY, (muted = !muted))
  }

  // Without it, screen readers read German text with English pronunciation.
  $effect(() => {
    document.documentElement.lang = lang
  })
</script>

<svelte:window
  onpopstate={(event) => {
    const next = event.state?.phase
    show(next === 'live' || next === 'choosing' || next === 'polish' ? next : 'setup')
  }}
  onbeforeunload={(event) => {
    // Reloading discards the shots by design, but never unasked.
    if (hasShots) event.preventDefault()
  }}
/>

<!-- Exactly screen-high in polish, so the slider list scrolls and the image above stays put. -->
<main
  class:h-dvh={phase === 'polish'}
  class="mx-auto flex min-h-dvh w-full max-w-4xl flex-col gap-5 px-4 py-5 sm:gap-8 sm:px-6 sm:py-10
         lg:px-8 lg:py-12 xl:max-w-5xl"
>
  <header class="flex items-center justify-between gap-4">
    <div class="flex items-center gap-3">
      <span class="ink grid size-10 shrink-0 place-items-center rounded-xl">
        <Zap class="size-5" strokeWidth={1.8} />
      </span>
      <div>
        <h1 class="text-lg leading-tight font-semibold tracking-tight">
          Blitz<span class="text-fg-2">Pose</span>
        </h1>
        <p class="text-xs text-fg-2">{t.tagline}</p>
      </div>
    </div>

    {#if phase === 'choosing' || phase === 'polish'}
      <button
        onclick={() => history.back()}
        aria-label={phase === 'polish' ? t.tools.backToShots : t.tools.back}
        data-tip={phase === 'polish' ? t.tools.backToShots : t.tools.back}
        data-tip-align="end"
        data-tip-below
        class="btn-icon size-11"
      >
        <ArrowLeft class="size-5" strokeWidth={1.7} />
      </button>
    {:else if phase === 'setup'}
      <div class="flex gap-2">
        {#if PUBLIC_SITE}
          <a
            href={REPO_URL}
            aria-label={t.setup.source}
            data-tip={t.setup.source}
            data-tip-align="end"
            data-tip-below
            class="glass flex h-11 items-center gap-2 rounded-full px-4 text-sm font-medium text-fg-2
                   transition hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2
                   focus-visible:outline-fg"
          >
            <GitHubMark class="size-4" />
            <span class="hidden sm:inline">GitHub</span>
          </a>
        {/if}

        <!-- Start screen only: clips are per language, so a later switch would swap the voice. -->
        <button
          onclick={toggleLang}
          aria-label={t.language}
          data-tip={t.language}
          data-tip-align="end"
          data-tip-below
          class="glass flex h-11 touch-manipulation items-center gap-2 rounded-full px-4 text-sm
                 font-medium text-fg-2 transition hover:text-fg active:scale-95
                 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg"
        >
          <Languages class="size-4" strokeWidth={1.7} />
          {LANG_NAMES[other(lang)]}
        </button>
      </div>
    {/if}

    <div class="flex gap-2" class:hidden={phase !== 'live'}>
      <button
        onclick={toggleVoice}
        disabled={!canSpeak}
        aria-pressed={!muted}
        aria-label={muted ? t.tools.voiceTurnOn : t.tools.voiceMute}
        data-tip={!canSpeak ? t.tools.voiceNone : muted ? t.tools.voiceOff : t.tools.voiceOn}
        data-tip-align="end"
        data-tip-below
        class="btn-icon size-11"
      >
        {#if muted || !canSpeak}<VolumeX class="size-5" strokeWidth={1.6} />{:else}<Volume2
            class="size-5"
            strokeWidth={1.6}
          />{/if}
      </button>

      <button
        onclick={() => (showDebug = !showDebug)}
        aria-pressed={showDebug}
        aria-label={t.tools.debug}
        data-tip={t.tools.debug}
        data-tip-align="end"
        data-tip-below
        class="btn-icon size-11"
      >
        <SlidersHorizontal class="size-5" strokeWidth={1.6} />
      </button>

      {#if recording}
        <button
          onclick={() => (showRecorder = !showRecorder)}
          aria-pressed={showRecorder}
          aria-label={t.tools.recorder}
          data-tip={t.tools.recorder}
          data-tip-align="end"
          data-tip-below
          class="btn-icon size-11"
        >
          <CircleDot class="size-5" strokeWidth={1.6} />
        </button>
      {/if}
    </div>
  </header>

  {#if visitedLive && landmarker}
    <!-- Hidden, not unmounted: the shots exist only in memory and must survive going back. -->
    <div
      class="flex w-full flex-col"
      class:hidden={phase === 'setup'}
      class:min-h-0={phase === 'polish'}
      class:flex-1={phase === 'polish'}
    >
      <Live
        {landmarker}
        {cover}
        {lang}
        active={phase === 'live'}
        choosing={phase === 'choosing'}
        polishing={phase === 'polish'}
        {probing}
        onfinish={() => go('choosing')}
        onpolish={() => go('polish')}
        bind:canSpeak
        bind:hasShots
        {muted}
        {showDebug}
        {showRecorder}
      />
    </div>
  {/if}

  {#if phase === 'setup'}
    <Setup
      {progress}
      {landmarker}
      error={modelError ? t.modelError : null}
      onstart={() => go('live')}
    />
  {/if}
</main>
