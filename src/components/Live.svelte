<script lang="ts">
  import type { FaceLandmarker, NormalizedLandmark } from '@mediapipe/tasks-vision'
  import { getContext, onDestroy, tick, untrack } from 'svelte'
  import { cameraErrorKind, startCamera, stopCamera, type CameraErrorKind } from '../lib/camera'
  import { captureFrame, type Capture } from '../lib/capture'
  import { loadProbes } from '../lib/probes'
  import { cropAnchors } from '../lib/framing'
  import { assess, DEFAULT_ENABLED, type Check, type CheckId } from '../lib/checks'
  import { createCoach, isAnnouncement, type HintId } from '../lib/coaching'
  import type { CoverMeter } from '../lib/cover'
  import { clear, drawCropCircle, drawLandmarks } from '../lib/overlay'
  import { headPose } from '../lib/pose'
  import { createRoiSampler, faceBounds, type Box, type RoiStats } from '../lib/roi'
  import { createSharpnessScale } from '../lib/sharpness'
  import { createShortlist, MAX_SHOTS, MIN_GAP_MS, type Shot } from '../lib/shortlist'
  import {
    ANNOUNCE_MS,
    createSession,
    frameUsable,
    readyToShoot,
    type Phase,
  } from '../lib/session'
  import { scoreFrame, type Detection } from '../lib/scoring'
  import { createShutter } from '../lib/shutter'
  import { SHUTTER_CLIPS } from '../lib/shutterClips'
  import { createSpeaker } from '../lib/speech'
  import { BCP47, I18N, type Lang, type Texts } from '../lib/i18n'
  import { recallJson, remember } from '../lib/storage'
  import { createTrend } from '../lib/trend'
  import { VOICE_CLIPS } from '../lib/voiceClips'
  import { eachVideoFrame } from '../lib/videoFrames'
  import { Camera, Pause, Play } from '@lucide/svelte'
  import Recorder from './Recorder.svelte'
  import Lights from './Lights.svelte'
  import Polish from './Polish.svelte'
  import Shots from './Shots.svelte'
  import Debug from './Debug.svelte'

  // The readback is expensive, and sharpness and light change slower than expression.
  const ROI_EVERY = 3
  const NO_STATS: RoiStats = { sharpness: 0, luminance: 0 }
  // Where a face belongs; its light is measured while none is found (SCENE_DARK in checks.ts).
  const SCENE: Box = { x: 0.3, y: 0.1, width: 0.4, height: 0.6 }

  let {
    landmarker,
    cover,
    active,
    choosing,
    polishing,
    probing,
    onfinish,
    onpolish,
    lang,
    muted,
    showDebug,
    showRecorder,
    canSpeak = $bindable(false),
    hasShots = $bindable(false),
  }: {
    landmarker: FaceLandmarker
    /** Loads after the landmarker; without it the cover check holds nothing up. */
    cover: CoverMeter | null
    /** Stays mounted while hidden, because the shots live only in memory. */
    active: boolean
    /** Owned by the parent, like `polishing`, because each step is a history entry. */
    choosing: boolean
    polishing: boolean
    /** Probe images instead of the camera (`?testbilder`). */
    probing: boolean
    onfinish: () => void
    onpolish: () => void
    lang: Lang
    muted: boolean
    showDebug: boolean
    showRecorder: boolean
    /** The mute button sits in the header, but only this page knows the voices. */
    canSpeak: boolean
    hasShots: boolean
  } = $props()

  const i18n = getContext<{ t: Texts }>(I18N)

  // Declared before `enabled`, whose initializer reads it via `loadEnabled()`.
  const ENABLED_KEY = 'blitzpose.checks'

  let video!: HTMLVideoElement
  let canvas!: HTMLCanvasElement
  let ctx: CanvasRenderingContext2D | null = null

  let stream = $state<MediaStream | null>(null)
  let starting = $state(false)
  let error = $state<CameraErrorKind | null>(null)

  let voiceCount = $state(0)
  let paused = $state(false)
  let detection = $state.raw<Detection | null>(null)
  let hint = $state.raw<HintId | null>(null)
  let checks = $state.raw<Check[]>([])
  let enabled = $state<Record<CheckId, boolean>>(loadEnabled())
  let settled = $state(false)
  let shots = $state.raw<Shot<Capture>[]>([])
  // Shared by culling and polishing so both downloads match.
  let mirrored = $state(false)
  let countdown = $state(0)
  let phase = $state<Phase>('idle')
  let flashing = $state(false)
  let settings = $state.raw<MediaTrackSettings | null>(null)
  let timing = $state.raw({ inferenceMs: 0, roiMs: 0, fps: 0 })

  // Bridges single detection dropouts during head turns without a new warm-up.
  const FACE_GRACE_MS = 800

  let facelessSince: number | null = null
  // Held between frames because the ROI is sampled only every ROI_EVERY frames.
  let stats: RoiStats = NO_STATS
  let covered: number | null = null
  let hadFace = false
  // Updated only with `stats`, so the reference does not decay between samples.
  let relativeSharpness = 0
  let lastFrameAt = 0
  let frame = 0

  function loadEnabled(): Record<CheckId, boolean> {
    return { ...DEFAULT_ENABLED, ...recallJson<Partial<Record<CheckId, boolean>>>(ENABLED_KEY, {}) }
  }

  function toggle(id: CheckId) {
    enabled = { ...enabled, [id]: !enabled[id] }
    remember(ENABLED_KEY, enabled)
  }

  const away = $derived(choosing || polishing)

  $effect(() => {
    if (!probing || !active) return
    let cancelled = false
    loadProbes(landmarker).then((geladen) => {
      if (cancelled || !geladen.length) return
      // Spaced beyond MIN_GAP_MS, or they count as one moment and replace each other.
      geladen.forEach((it, i) => shortlist.add(1, i * MIN_GAP_MS * 2, it))
      shots = shortlist.best()
      onfinish()
    })
    return () => {
      cancelled = true
    }
  })

  const sampleRoi = createRoiSampler()
  const sharpnessScale = createSharpnessScale()
  const coach = createCoach()
  const shortlist = createShortlist<Capture>()
  const shutter = createShutter(SHUTTER_CLIPS)
  const trend = createTrend()
  const session = createSession()

  let flashTimer: ReturnType<typeof setTimeout>

  // Reused instead of leaving 2.6 MB per canvas to the garbage collector.
  const spare: HTMLCanvasElement[] = []

  function release(shot: Shot<Capture> | null) {
    if (shot) spare.push(shot.frame.canvas)
  }

  function discard() {
    for (const canvas of spare) {
      canvas.width = 0
      canvas.height = 0
    }
    spare.length = 0
  }

  function collect(now: number, total: number, landmarks: NormalizedLandmark[]) {
    if (!shortlist.accepts(total, now)) return

    const frame = captureFrame(video, landmarks, spare.pop())
    if (!frame) return

    const replaced = shortlist.add(total, now, frame)
    release(replaced)
    shots = shortlist.best()

    // A replacement within MIN_GAP_MS is the same moment improved, not a new shot.
    if (replaced) return

    shutter.click()
    flashing = true
    clearTimeout(flashTimer)
    flashTimer = setTimeout(() => (flashing = false), 120)
  }
  const buildSpeaker = (code: Lang) =>
    createSpeaker({
      lang: BCP47[code],
      clips: VOICE_CLIPS[code] ?? {},
      onVoice: (_, count) => (voiceCount = count),
    })

  // This page outlives a language switch on the start screen, so the speaker is rebuilt.
  let builtFor = untrack(() => lang)
  let speaker = $state.raw(buildSpeaker(builtFor))

  $effect(() => {
    const code = lang
    if (code === builtFor) return
    untrack(() => {
      speaker.dispose()
      builtFor = code
      speaker = buildSpeaker(code)
    })
  })

  $effect(() => {
    canSpeak = speaker.hasClips || (speaker.supported && voiceCount > 0)
  })

  const smooth = (previous: number, next: number) =>
    previous ? previous * 0.9 + next * 0.1 : next

  // `getUserMedia` can wait seconds on the permission prompt while the phase changes.
  let wanted = false

  async function start() {
    wanted = true
    if (starting || stream) return
    starting = true
    error = null
    try {
      const started = await startCamera()
      if (!wanted) {
        stopCamera(started)
        return
      }
      stream = started
      const track = started.getVideoTracks()[0]
      settings = track?.getSettings() ?? null
      track?.addEventListener('ended', () => {
        if (stream !== started) return
        stop()
        error = 'ended'
      })
    } catch (cause) {
      error = cameraErrorKind(cause)
    } finally {
      starting = false
    }
  }

  // Keeps the shots: whoever stops or steps back wants to find them again.
  function stop() {
    wanted = false
    if (!stream) return
    stopCamera(stream)
    stream = null

    session.reset()
    phase = 'idle'
    speaker.stop()
    lastFrameAt = 0
    detection = null
    hint = null
    checks = []
    settled = false
    trend.reset()
    sharpnessScale.reset()
    stats = NO_STATS
    covered = null
    hadFace = false
    frame = 0
    relativeSharpness = 0
    settings = null
    timing = { inferenceMs: 0, roiMs: 0, fps: 0 }
    if (ctx) clear(ctx)
    discard()
  }

  function detect() {
    if (video.readyState < video.HAVE_CURRENT_DATA) return

    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
    }
    ctx ??= canvas.getContext('2d')
    if (!ctx) return

    const startedAt = performance.now()
    const result = landmarker.detectForVideo(video, startedAt)
    const inferenceMs = smooth(timing.inferenceMs, performance.now() - startedAt)
    const fps = lastFrameAt ? smooth(timing.fps, 1000 / (startedAt - lastFrameAt)) : timing.fps
    let roiMs = timing.roiMs
    lastFrameAt = startedAt

    const landmarks = result.faceLandmarks[0]
    const bounds = landmarks && faceBounds(landmarks)

    clear(ctx)
    if (landmarks) {
      // Circle after the points so its dimming covers them too.
      drawLandmarks(ctx, landmarks)
      drawCropCircle(ctx, cropAnchors(landmarks), phase !== 'idle')
    }
    const pose = headPose(result.facialTransformationMatrixes[0]?.data)
    const blendshapes = result.faceBlendshapes[0]?.categories ?? []

    // Sample at once when a face comes or goes; stale zero sharpness would pin "Hold still".
    if (Boolean(bounds) !== hadFace) {
      hadFace = Boolean(bounds)
      frame = 0
      relativeSharpness = 0
      covered = null
    }
    if (frame % ROI_EVERY === 0) {
      const roiStartedAt = performance.now()
      const sampled = sampleRoi(video, bounds ?? SCENE)
      if (sampled) {
        stats = sampled
        if (bounds) relativeSharpness = sharpnessScale.update(sampled.sharpness, startedAt)
      }
      if (cover && landmarks && bounds) covered = cover.measure(video, landmarks, bounds, startedAt)
      roiMs = smooth(roiMs, performance.now() - roiStartedAt)
    }
    frame++
    timing = { inferenceMs, roiMs, fps }

    const input = {
      landmarks,
      bounds,
      blendshapes,
      pose,
      stats,
      sharpness: relativeSharpness,
      covered,
    }
    const score = scoreFrame(input)
    // Missing blendshapes read as 0 and look perfect, so a longer absence resets the trend.
    let shown = score
    if (bounds) {
      facelessSince = null
      shown = trend.update(score, startedAt)
    } else {
      facelessSince ??= startedAt
      if (startedAt - facelessSince > FACE_GRACE_MS) trend.reset()
    }
    settled = trend.settled

    checks = assess(input, shown, settled)
    detection = { input, checks, score, shown }

    // Without its model the cover check measures nothing and must not hold up every shot.
    const blocking = checks.filter((it) => enabled[it.id] && (cover || it.id !== 'uncovered'))

    // Pausing stops the coaching too; measuring goes on so the lights show when it fits.
    if (showRecorder || paused) {
      session.reset()
      phase = 'idle'
      countdown = 0
      hint = null
      return
    }

    const before = phase
    phase = session.update(readyToShoot(blocking), startedAt)
    countdown = session.remaining(startedAt)

    // Audible cue for someone looking into the lens who cannot read the hint.
    if (phase === 'announcing' && before !== 'announcing') shutter.ready()

    const spoken = coach(blocking, phase === 'announcing', startedAt)
    hint = phase === 'done' ? null : spoken

    // No extra score threshold: all green must mean a shot, and the shortlist ranks by score.
    if (phase === 'collecting' && frameUsable(blocking) && landmarks) {
      collect(startedAt, score.total, landmarks)
      if (shortlist.size >= MAX_SHOTS) onfinish()
    }
  }

  // The setup button already was the user gesture `getUserMedia` needs.
  $effect(() => {
    const visible = active
    // `untrack`, or the effect would also depend on `stream` through `start()`.
    untrack(() => (visible && !probing ? void start() : stop()))
  })

  $effect(() => {
    hasShots = shots.length > 0
  })

  // The start button disables and vanishes on click, so focus moves to the view heading.
  let hatteStream = untrack(() => Boolean(stream))

  $effect(() => {
    const jetzt = Boolean(stream)
    if (jetzt === hatteStream) return
    hatteStream = jetzt
    if (jetzt) tick().then(() => document.querySelector<HTMLElement>('[data-view="live"]')?.focus())
  })

  $effect(() => {
    if (away && shots.length === 0) history.back()
  })

  // Nobody expects the camera to keep running once shooting is over.
  $effect(() => {
    if (away) {
      untrack(() => {
        stop()
        session.finish()
        phase = 'done'
        hint = null
      })
    } else {
      session.reset()
      untrack(() => (phase = 'idle'))
    }
  })

  // Reads `hint` and `muted` on purpose: unmuting repeats the current hint.
  $effect(() => {
    speaker.setMuted(muted)
    // `idle`, not `stop`: a sentence already begun may finish.
    if (hint) speaker.say(hint, i18n.t.hints[hint], isAnnouncement(hint))
    else speaker.idle()
  })

  $effect(() => {
    video.srcObject = stream
    if (!stream) return
    // Some browsers ignore `autoplay` when `srcObject` changes later and stay black.
    void video.play().catch(() => {})
    return eachVideoFrame(video, detect)
  })

  // Free the camera before HMR remounts; some drivers give a second request a black track.
  import.meta.hot?.dispose(() => stop())

  onDestroy(() => {
    stop()
    speaker.dispose()
    shutter.close()
    shortlist.clear().forEach(release)
    discard()
  })
</script>

<div class="flex w-full flex-col items-center gap-5" class:min-h-0={polishing} class:flex-1={polishing}>
  <!-- Takes focus on phase changes, which would otherwise fall to `<body>` (see App.svelte). -->
  {#if !away}
    <h2 class="sr-only" data-view="live" tabindex="-1">{i18n.t.views.live}</h2>
  {/if}

  <!-- Square on phones (export is 1:1), so a Pixel 9 fits the controls without scrolling. -->
  <div
    class:hidden={away}
    class="relative mx-auto aspect-square w-full max-w-[50vh] overflow-hidden rounded-3xl bg-slate-900
           shadow-[0_40px_80px_-32px_rgb(15_23_42/0.55)] ring-[6px] ring-white/70
           sm:aspect-video sm:max-w-none sm:rounded-[1.75rem]"
  >
    <video
      bind:this={video}
      autoplay
      muted
      playsinline
      class="h-full w-full -scale-x-100 object-cover"
    ></video>
    <canvas
      bind:this={canvas}
      class="pointer-events-none absolute inset-0 h-full w-full -scale-x-100 object-cover"
    ></canvas>

    <!-- Nearest the lens. `aria-live` only when silent, or screen readers hear it twice. -->
    <div
      class="pointer-events-none absolute inset-x-0 top-0 flex justify-center px-4 pb-10 pt-4 sm:px-6 sm:pt-5
             bg-gradient-to-b from-black/75 via-black/35 to-transparent
             transition-opacity duration-300 {hint ? 'opacity-100' : 'opacity-0'}"
    >
      <p
        aria-live={muted || !canSpeak ? 'polite' : 'off'}
        class="text-balance text-center text-xl font-medium tracking-tight text-white
               drop-shadow-[0_2px_10px_rgb(0_0_0/0.85)] sm:text-2xl"
      >
        {hint ? i18n.t.hints[hint] : ''}
      </p>
    </div>

    {#if !stream}
      <div class="absolute inset-0 grid place-items-center">
        <div class="flex flex-col items-center gap-3 text-white/70">
          <Camera class="size-7" strokeWidth={1.6} />
          <p class="text-sm">{i18n.t.live.cameraOff}</p>
        </div>
      </div>
    {/if}

    {#if phase === 'announcing'}
      <div
        class="pointer-events-none absolute inset-x-0 top-0 h-1 origin-left bg-ok-bright"
        style="transform: scaleX({countdown / (ANNOUNCE_MS / 1000)})"
      ></div>
    {/if}

    <div
      class="pointer-events-none absolute inset-0 bg-white transition-opacity duration-100
             {flashing ? 'opacity-70' : 'opacity-0'}"
    ></div>

    {#if stream}
      <div class="absolute inset-x-3 bottom-3 flex items-end justify-between gap-2 sm:inset-x-4 sm:bottom-4">
        {#if phase === 'collecting'}
          <span
            aria-live="polite"
            aria-atomic="true"
            class="flex items-center gap-2 rounded-full bg-black/50 px-3 py-1.5 text-[11px]
                   font-medium tabular-nums text-white backdrop-blur-md"
          >
            <span class="size-1.5 animate-pulse rounded-full bg-ok-bright shadow-[0_0_8px_var(--color-ok-bright)]"
            ></span>
            {i18n.t.live.collecting(shots.length, MAX_SHOTS)}
          </span>
        {:else}
          <span></span>
        {/if}

        <span
          aria-hidden="true"
          class="flex items-center gap-2 rounded-full bg-black/50 px-3 py-1.5 text-[11px]
                 font-medium tabular-nums text-white/70 backdrop-blur-md"
        >
          <span class="size-1.5 rounded-full bg-bad-bright shadow-[0_0_8px_var(--color-bad-bright)]"></span>
          {timing.fps.toFixed(0)} fps
        </span>
      </div>
    {/if}
  </div>

  {#if stream && !away}
    <Lights {checks} {enabled} ontoggle={toggle} />
  {/if}

  {#if !away}
    <div class="flex flex-wrap items-center justify-center gap-2.5">
      {#if stream}
        <button
          onclick={() => (paused = !paused)}
          aria-pressed={paused}
          aria-label={paused ? i18n.t.live.resume : i18n.t.live.pause}
          data-tip={paused ? i18n.t.live.resume : i18n.t.live.pause}
          class="btn-icon size-12"
        >
          {#if paused}
            <Play class="size-5" strokeWidth={1.8} />
          {:else}
            <Pause class="size-5" strokeWidth={1.8} />
          {/if}
        </button>
      {/if}

      {#if shots.length}
        <button onclick={onfinish} class="btn-primary flex items-center gap-2.5 px-10 py-4 text-base">
          {i18n.t.live.finish}
        </button>
      {/if}

      {#if !stream}
        <!-- Fallback when the camera did not start on its own. -->
        <button
          onclick={() => start()}
          disabled={starting}
          class="btn-primary flex items-center gap-2.5 px-10 py-4 text-base"
        >
          {#if starting}
            {i18n.t.live.starting}
          {:else}
            <Camera class="size-4" strokeWidth={2} />{i18n.t.live.start}
          {/if}
        </button>
      {/if}
    </div>
  {/if}

  {#if choosing && shots.length}
    <Shots
      {shots}
      {onpolish}
      bind:mirrored
      ondelete={(at) => {
        release(shortlist.remove(at))
        shots = shortlist.best()
      }}
    />
  {/if}

  {#if polishing && shots.length}
    <!-- Culling leaves exactly one shot. -->
    <Polish shot={shots[0].frame} {mirrored} />
  {/if}

  {#if showRecorder}
    <Recorder {detection} {settings} />
  {/if}

  {#if showDebug}
    <Debug {detection} {settings} {timing} />
  {/if}

  {#if error}
    <p
      role="alert"
      class="max-w-prose rounded-2xl bg-bad/10 px-4 py-3 text-center text-sm text-bad
             ring-1 ring-bad/20"
    >
      {i18n.t.camera[error]}
    </p>
  {/if}
</div>
