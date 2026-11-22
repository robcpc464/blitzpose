// `<lang>/<HintId>.mp3`; a missing file falls back to speech synthesis in speech.ts.
// In src/assets rather than public so the build knows the set and nothing requests a missing file.
const files = import.meta.glob('../assets/voice/*/*.mp3', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

export const VOICE_CLIPS: Record<string, Record<string, string>> = {}

for (const [path, url] of Object.entries(files)) {
  const [lang, file] = path.split('/').slice(-2)
  ;(VOICE_CLIPS[lang] ??= {})[file.slice(0, -'.mp3'.length)] = url
}
