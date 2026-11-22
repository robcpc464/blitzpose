// File names are the sound ids in shutter.ts (`click`, `ready`); a file replaces the synthesis.
const files = import.meta.glob('../assets/shutter/*.mp3', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

export const SHUTTER_CLIPS: Record<string, string> = Object.fromEntries(
  Object.entries(files).map(([path, url]) => [
    path.slice(path.lastIndexOf('/') + 1, -'.mp3'.length),
    url,
  ]),
)
