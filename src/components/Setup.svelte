<script lang="ts">
  import type { FaceLandmarker } from '@mediapipe/tasks-vision'
  import { getContext } from 'svelte'
  import {
    ArrowUpRight,
    AudioLines,
    Camera,
    Check,
    Cpu,
    Images,
    ShieldCheck,
    Sparkles,
    Zap,
    type LucideIcon,
  } from '@lucide/svelte'
  import camera from '../assets/start/camera.jpg'
  import selection from '../assets/start/selection.jpg'
  import voice from '../assets/start/voice.jpg'
  import { I18N, type IntroStepId, type Texts } from '../lib/i18n'
  import { PUBLIC_SITE, REPO_URL } from '../lib/site'
  import GitHubMark from './GitHubMark.svelte'
  import Viewfinder from './Viewfinder.svelte'

  let {
    progress,
    landmarker,
    error,
    onstart,
  }: {
    progress: number
    landmarker: FaceLandmarker | null
    error: string | null
    onstart: () => void
  } = $props()

  const ready = $derived(Boolean(landmarker))

  const i18n = getContext<{ t: Texts }>(I18N)

  // Image prompts live in scripts/photos.mjs.
  const STEPS: { id: IntroStepId; icon: LucideIcon; image: string }[] = [
    { id: 'camera', icon: Camera, image: camera },
    { id: 'voice', icon: AudioLines, image: voice },
    { id: 'keep', icon: Images, image: selection },
  ]
</script>

<div class="flex w-full flex-col gap-12 pb-4 sm:gap-16 lg:gap-20">
  <section class="grid items-center gap-12 lg:grid-cols-2 lg:gap-10">
    <div class="flex flex-col items-start gap-6">
      <p
        class="glass inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-semibold
               text-fg-2"
      >
        <Sparkles class="size-3.5" strokeWidth={2} />
        {i18n.t.setup.eyebrow}
      </p>

      <h2
        data-view="setup"
        tabindex="-1"
        class="text-5xl leading-[1.05] font-semibold tracking-tight text-balance sm:text-6xl"
      >
        {i18n.t.setup.headline}
      </h2>

      <p class="max-w-xl text-lg leading-relaxed text-pretty text-fg-2">
        {i18n.t.setup.lede}
      </p>

      <ul class="flex flex-wrap gap-2">
        {#each i18n.t.setup.claims as claim (claim)}
          <li
            class="glass flex items-center gap-2 rounded-full py-1.5 pr-4 pl-1.5 text-sm font-semibold"
          >
            <span class="grid size-6 place-items-center rounded-full bg-ok/12 text-ok">
              <Check class="size-3.5" strokeWidth={2.75} />
            </span>
            {claim}
          </li>
        {/each}
        {#if PUBLIC_SITE}
          <li>
            <a
              href={REPO_URL}
              class="glass flex items-center gap-2 rounded-full py-1.5 pr-4 pl-1.5 text-sm font-semibold
                     transition hover:bg-white/75"
            >
              <span class="grid size-6 place-items-center rounded-full bg-ok/12 text-ok">
                <Check class="size-3.5" strokeWidth={2.75} />
              </span>
              {i18n.t.setup.openSource}
              <ArrowUpRight class="size-3.5 text-fg-2" strokeWidth={2.25} />
            </a>
          </li>
        {/if}
      </ul>

      <div class="mt-2 flex w-full flex-col gap-3">
        <button
          onclick={onstart}
          disabled={!ready}
          class="btn-primary flex w-full items-center justify-center gap-2.5 px-9 py-4 text-base"
        >
          <Camera class="size-5" strokeWidth={1.9} />
          {i18n.t.setup.start}
        </button>

        <!-- Fixed height, so the button does not jump once the model is ready. -->
        <div class="flex h-9 items-center justify-center">
          {#if error}
            <p role="alert" class="text-sm text-bad">{error}</p>
          {:else if !ready}
            <div class="flex flex-col items-center gap-1.5">
              <div class="h-1 w-44 overflow-hidden rounded-full bg-slate-900/10">
                <div
                  class="h-full origin-left bg-fg transition-transform duration-200"
                  style="transform: scaleX({progress})"
                ></div>
              </div>
              <p class="text-xs tabular-nums text-fg-2">
                {i18n.t.setup.loading(Math.round(progress * 100))}
              </p>
            </div>
          {:else}
            <p class="text-sm text-fg-2">{i18n.t.setup.permission}</p>
          {/if}
        </div>
      </div>
    </div>

    <Viewfinder {landmarker} />
  </section>

  <section class="flex flex-col gap-5">
    <h3 class="pl-1 text-sm font-semibold tracking-wide text-fg-2 uppercase">
      {i18n.t.setup.stepsTitle}
    </h3>
    <ol class="grid gap-4 md:grid-cols-3">
      {#each STEPS as { id, icon: Icon, image }, i (id)}
        {@const step = i18n.t.setup.steps[id]}
        <li class="glass flex flex-col rounded-3xl p-2.5">
          <img
            src={image}
            alt=""
            loading="lazy"
            decoding="async"
            class="aspect-[4/3] w-full rounded-[1.25rem] object-cover"
          />
          <div class="flex flex-col gap-2 px-3.5 pb-4">
            <div class="-mt-6 mb-1 flex items-end justify-between">
              <span class="ink grid size-12 place-items-center rounded-2xl ring-4 ring-white/70">
                <Icon class="size-5" strokeWidth={1.8} />
              </span>
              <span aria-hidden="true" class="text-sm font-semibold tabular-nums text-fg-2">
                0{i + 1}
              </span>
            </div>
            <h4 class="text-lg font-semibold tracking-tight">{step.title}</h4>
            <p class="text-sm leading-relaxed text-pretty text-fg-2">{step.text}</p>
          </div>
        </li>
      {/each}
    </ol>
  </section>

  <div class="flex flex-col gap-4">
    <section class="glass flex flex-col gap-5 rounded-3xl p-6 sm:flex-row sm:gap-6 sm:p-8">
      <span class="ink grid size-12 shrink-0 place-items-center rounded-2xl">
        <ShieldCheck class="size-6" strokeWidth={1.7} />
      </span>
      <div class="flex flex-col gap-2">
        <h3 class="text-xl font-semibold tracking-tight">{i18n.t.setup.privacyTitle}</h3>
        <p class="max-w-3xl leading-relaxed text-pretty text-fg-2">{i18n.t.setup.privacy}</p>
      </div>
    </section>

    <section class="glass flex flex-col gap-5 rounded-3xl p-6 sm:flex-row sm:gap-6 sm:p-8">
      <span class="ink grid size-12 shrink-0 place-items-center rounded-2xl">
        <Cpu class="size-6" strokeWidth={1.7} />
      </span>
      <div class="flex flex-col gap-2">
        <h3 class="text-xl font-semibold tracking-tight">{i18n.t.setup.techTitle}</h3>
        <p class="max-w-3xl leading-relaxed text-pretty text-fg-2">{i18n.t.setup.tech}</p>
      </div>
    </section>
  </div>

  <!-- The TTS provider's terms require this AI-voice disclosure; keep it always visible. -->
  <footer class="flex flex-col gap-6">
    <p class="flex items-start gap-2.5 px-1 text-xs leading-relaxed text-fg-2">
      <AudioLines class="mt-0.5 size-3.5 shrink-0" strokeWidth={2} />
      {i18n.t.setup.voice}
    </p>

    {#if PUBLIC_SITE}
      <div
        class="glass flex flex-col gap-4 rounded-3xl px-6 py-5 sm:flex-row sm:items-center
               sm:justify-between"
      >
        <div class="flex items-center gap-3">
          <span class="ink grid size-8 shrink-0 place-items-center rounded-lg">
            <Zap class="size-4" strokeWidth={1.8} />
          </span>
          <span class="text-sm font-semibold tracking-tight">Blitz<span class="text-fg-2">Pose</span></span>
          <span class="text-xs text-fg-2">MIT</span>
        </div>

        <nav class="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm font-medium text-fg-2">
          <a href={REPO_URL} class="flex items-center gap-2 transition hover:text-fg">
            <GitHubMark class="size-4" />GitHub
          </a>
          <a href="/imprint.html" class="transition hover:text-fg">{i18n.t.setup.imprint}</a>
          <a href="/privacy.html" class="transition hover:text-fg">{i18n.t.setup.privacyPolicy}</a>
        </nav>
      </div>
    {/if}
  </footer>
</div>
