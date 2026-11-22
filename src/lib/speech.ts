const DEFAULT_LANG = 'en-US'

// Without a pause, two instructions blur into one sentence.
export const GAP_MS = 400

export type SpeakerOptions = {
  gapMs?: number
  lang?: string
  /** Prerecorded per instruction id: same sound everywhere, no text sent to a cloud voice. */
  clips?: Record<string, string>
  onVoice?: (voice: SpeechSynthesisVoice | null, count: number) => void
}

/**
 * A started utterance always finishes, since cutting it off sounds broken; queued ones are dropped
 * once their cause is gone.
 */
export function createSpeaker({
  gapMs = GAP_MS,
  lang = DEFAULT_LANG,
  clips = {},
  onVoice,
}: SpeakerOptions = {}) {
  const synth = typeof speechSynthesis === 'undefined' ? null : speechSynthesis

  let muted = false
  let spoken: string | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  let quietUntil = 0
  let voices: SpeechSynthesisVoice[] = []
  // At most an acknowledgement plus the newest instruction.
  let queue: { id: string; text: string; keep: boolean }[] = []

  const players = new Map<string, HTMLAudioElement>()
  let playing: HTMLAudioElement | null = null

  const loadVoices = () => {
    voices = synth?.getVoices() ?? []
    onVoice?.(pickVoice(), voices.length)
  }

  loadVoices()
  // The voice list is often still empty at first.
  synth?.addEventListener('voiceschanged', loadVoices)

  // Local voices first: cloud voices send the text to a server.
  function pickVoice(): SpeechSynthesisVoice | null {
    const base = lang.split('-')[0]
    const matching = voices.filter((it) => it.lang.replace('_', '-').startsWith(base))
    const exact = matching.filter((it) => it.lang.replace('_', '-') === lang)

    return (
      exact.find((it) => it.localService) ??
      matching.find((it) => it.localService) ??
      exact[0] ??
      matching[0] ??
      null
    )
  }

  const rest = () => {
    quietUntil = performance.now() + gapMs
    playing = null
    pump()
  }

  function pump() {
    if (muted || !queue.length || timer || busy()) return
    const wait = Math.max(0, quietUntil - performance.now())
    timer = setTimeout(() => {
      timer = undefined
      const next = queue.shift()
      if (!next || muted) return
      spoken = next.id
      const url = clips[next.id]
      if (url) playClip(next.id, url)
      else utter(next.text)
    }, wait)
  }

  function playClip(id: string, url: string) {
    let audio = players.get(id)
    if (!audio) {
      audio = new Audio(url)
      audio.preload = 'auto'
      players.set(id, audio)
    }

    audio.onended = rest
    audio.onerror = rest
    audio.currentTime = 0
    playing = audio
    // Playback needs a user gesture; starting the camera is one.
    audio.play().catch(rest)
  }

  function utter(text: string) {
    if (!synth) return

    // Chrome sometimes leaves synthesis paused after `cancel` or in a background tab.
    synth.resume()

    // Linux Chrome lists no voices until speech-dispatcher starts, often on the first utterance.
    if (!voices.length) loadVoices()

    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = lang
    const voice = pickVoice()
    if (voice) utterance.voice = voice

    utterance.onend = rest
    utterance.onerror = rest

    synth.speak(utterance)
  }

  /** Cuts off mid-word, so only for mute and camera stop. */
  function silence() {
    clearTimeout(timer)
    timer = undefined
    queue = []
    synth?.cancel()
    if (playing) {
      playing.pause()
      playing = null
    }
  }

  const busy = () =>
    Boolean(synth?.speaking) ||
    Boolean(synth?.pending) ||
    Boolean(playing && !playing.paused && !playing.ended)

  return {
    get hasClips() {
      return Object.keys(clips).length > 0
    },

    get supported() {
      return synth !== null
    },

    /** `keep` stops the next instruction from overtaking an acknowledgement before it is heard. */
    say(id: string, text: string, keep = false) {
      if (muted) return
      if (!clips[id] && !synth) return

      // Prune before the early return, or a stale entry stays queued and is spoken later.
      if (!keep) queue = queue.filter((it) => it.keep)

      if (id === spoken || queue.some((it) => it.id === id)) return
      queue.push({ id, text, keep })
      pump()
    },

    idle() {
      clearTimeout(timer)
      timer = undefined
      queue = queue.filter((it) => it.keep)
      spoken = null
      pump()
    },

    setMuted(value: boolean) {
      muted = value
      // Reset `spoken` so the same instruction is repeated after unmuting.
      if (muted) {
        silence()
        spoken = null
      }
    },

    stop() {
      silence()
      spoken = null
    },

    dispose() {
      silence()
      synth?.removeEventListener('voiceschanged', loadVoices)
    },
  }
}
