// Synthesized DSLR shutter; a recording in src/assets/shutter/ wins. The mirror's second
// snap 85 ms later is what makes it sound mechanical rather than like a UI click.
type Snap = { at: number; gain: number; frequency: number; q: number; duration: number }
type Body = { at: number; gain: number; from: number; to: number; duration: number }

const SNAPS: Snap[] = [
  { at: 0, gain: 0.5, frequency: 5200, q: 0.7, duration: 0.014 },
  { at: 0.012, gain: 0.2, frequency: 2100, q: 1.4, duration: 0.032 },
  { at: 0.085, gain: 0.3, frequency: 3800, q: 0.9, duration: 0.016 },
]

// Without this falling sine body the snaps alone sound like a ballpoint pen.
const BODIES: Body[] = [
  { at: 0, gain: 0.36, from: 220, to: 120, duration: 0.075 },
  { at: 0.085, gain: 0.22, from: 170, to: 95, duration: 0.095 },
]

export function createShutter(clips: Record<string, string> = {}) {
  let ctx: AudioContext | null = null
  let noise: AudioBuffer | null = null
  const players = new Map<string, HTMLAudioElement>()

  function play(id: string): boolean {
    const url = clips[id]
    if (!url) return false

    let audio = players.get(id)
    if (!audio) {
      audio = new Audio(url)
      audio.preload = 'auto'
      players.set(id, audio)
    }
    audio.currentTime = 0
    // Rejected without a user gesture; starting the camera is one.
    void audio.play().catch(() => {})
    return true
  }

  function context(): AudioContext | null {
    if (typeof AudioContext === 'undefined') return null
    // Created lazily: the browser won't start a context before a user gesture.
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()

    if (!noise) {
      const length = Math.ceil(ctx.sampleRate * 0.2)
      noise = ctx.createBuffer(1, length, ctx.sampleRate)
      const data = noise.getChannelData(0)
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1
    }
    return ctx
  }

  function snap(audio: AudioContext, { at, gain, frequency, q, duration }: Snap) {
    if (!noise) return
    const start = audio.currentTime + at

    const source = audio.createBufferSource()
    source.buffer = noise

    const filter = audio.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = frequency
    filter.Q.value = q

    const envelope = audio.createGain()
    envelope.gain.setValueAtTime(gain, start)
    // Exponential, otherwise it crackles instead of clicking.
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration)

    source.connect(filter).connect(envelope).connect(audio.destination)
    source.start(start)
    source.stop(start + duration)
  }

  function body(audio: AudioContext, { at, gain, from, to, duration }: Body) {
    const start = audio.currentTime + at

    const osc = audio.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(from, start)
    osc.frequency.exponentialRampToValueAtTime(to, start + duration)

    const envelope = audio.createGain()
    envelope.gain.setValueAtTime(gain, start)
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration)

    osc.connect(envelope).connect(audio.destination)
    osc.start(start)
    osc.stop(start + duration)
  }

  return {
    // Someone looking into the lens reads nothing, so this cue works without screen or voice.
    ready() {
      if (play('ready')) return
      const audio = context()
      if (!audio || !noise) return
      snap(audio, { at: 0, gain: 0.12, frequency: 700, q: 1, duration: 0.06 })
    },

    click() {
      if (play('click')) return
      const audio = context()
      if (!audio || !noise) return

      for (const spec of SNAPS) snap(audio, spec)
      for (const spec of BODIES) body(audio, spec)
    },

    close() {
      for (const audio of players.values()) audio.pause()
      players.clear()
      void ctx?.close()
      ctx = null
      noise = null
    },
  }
}
