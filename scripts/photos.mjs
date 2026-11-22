// Generates images once via the xAI image API. Dev time only, never at runtime.
//
//   src/assets/start/  start screen images, bundled by Vite
//   testdata/probes/   background removal test images (`?testbilder`), marked as AI-generated
//   testdata/faces/    face detection test images, marked as AI-generated
//
//   XAI_API_KEY=... npm run photos              missing ones only
//   XAI_API_KEY=... npm run photos -- --force   all
//   XAI_API_KEY=... npm run photos -- camera    just one
//
// Without a key it only lists what would be generated. Environment:
//   PHOTO_MODEL  default `grok-imagine-image-2.0`, the newest (2026-08); `grok-imagine-image` is cheaper
//   PHOTO_KEEP   1 skips cropping (the ratio is then whatever the model returned)

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const START = 'src/assets/start'
const force = process.argv.includes('--force')
const only = process.argv.slice(2).filter((it) => !it.startsWith('--'))

const envFile = join(root, '.env')
if (!process.env.XAI_API_KEY && existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][\w-]*)\s*=\s*(.*)$/)
    if (!match) continue
    // Accept names copied from the dashboard with dashes.
    const name = match[1].replaceAll('-', '_').toUpperCase()
    process.env[name] ??= match[2].trim().replace(/^["']|["']$/g, '')
  }
}

const ENDPOINT = 'https://api.x.ai/v1/images/generations'
const MODEL = process.env.PHOTO_MODEL ?? 'grok-imagine-image-2.0'
const KEEP = process.env.PHOTO_KEEP === '1'

const STYLE = 'Photographic, natural available light, warm neutral colour grading, candid, shallow depth of field. No text, no logos, no watermark.'

// No people: a generated face would contradict the promise not to generate faces.
const GLASS = 'Minimalist product still life, high-key studio light, soft shadows, white with faint ice-blue and lilac tints, crisp detail, shallow depth of field. No metal, no people, no text, no logos, no watermark.'

// Outside public/, so no build ships them; the dev server still serves them.
const PROBES = 'testdata/probes'
const FACES = 'testdata/faces'

const WEBCAM = 'Seen from a laptop webcam at desk height, slightly wide angle, in a home office. Photographic, natural indoor light, realistic skin texture, candid. No text, no logos, no watermark.'

const IMAGES = [
  {
    id: 'camera',
    ratio: '4:3',
    prompt: 'A small webcam made entirely of clear and frosted glass, sitting on the top edge of a thin frosted glass panel, on a white surface. ' + GLASS,
  },
  {
    id: 'voice',
    ratio: '4:3',
    prompt: 'An abstract audio waveform built from a row of thin vertical frosted glass fins of varying height, standing on a glossy white surface. ' + GLASS,
  },
  {
    id: 'selection',
    ratio: '4:3',
    prompt: 'A row of square frosted glass tiles standing upright on a white surface, slightly fanned, the front tile crisp and softly glowing from within, the others blurred behind it. ' + GLASS,
  },
  {
    // An alien, not a person: a generated human face would pose as a result the app never makes.
    id: 'alien',
    ratio: '1:1',
    prompt: 'A friendly classic grey extraterrestrial with a large smooth-domed hairless head and big glossy black almond-shaped eyes, wearing a crisp white business shirt, sitting for a professional profile picture, gentle closed-mouth smile, looking straight into the lens. Shot on a real camera: finely textured skin with visible pores, subtle mottling, fine wrinkles around the eyes and mouth, slight facial asymmetry, soft subsurface scattering, natural specular highlights. Not smooth, not glossy, not CG-rendered, not plastic, no airbrushing. Medium shot, square head-and-shoulders portrait with generous headroom: the head from the top of the skull to the chin fills only about 55 percent of the frame height, both shoulders fully visible. Soft frontal high-key light, plain bright background in soft white with faint ice-blue and lilac tints, softly blurred. No text, no logos, no watermark.',
  },
  // Background removal probes: segmenter and matting differ where loose hair meets the background.
  // Generated images are easier than real webcam frames, so they narrow the choice, not settle it.
  ...[
    {
      id: 'probe-offen',
      hair: 'Long loose straight fine hair falling over the shoulders, lit from behind so that individual strands separate and glow against a plain bright wall, many fine flyaway hairs standing out from the silhouette',
    },
    {
      id: 'probe-lockig',
      hair: 'Voluminous curly frizzy hair with a wide halo of loose strands, in front of a cluttered mid-tone office background with clear contrast to the hair',
    },
    {
      id: 'probe-hell',
      hair: 'Fine blonde hair, partly loose, in front of a dark wooden bookshelf, so that light strands stand against a dark background',
    },
    {
      id: 'probe-webcam',
      hair: 'Loose shoulder-length hair, filmed by a cheap laptop webcam in a dim room: visible sensor noise, low contrast, slight motion blur, compression artefacts, mixed daylight and screen glow',
    },
  ].map(({ id, hair }) => ({
    id,
    ratio: '1:1',
    folder: PROBES,
    prompt: `Head-and-shoulders view of a woman at her desk, looking into a laptop webcam. ${hair}. ${STYLE}`,
  })),
  // Face detection: `none-` must find no face, `face-` must find one, `edge-` must not pass the checks.
  ...[
    ['none-empty-chair', 'An empty office chair at the desk, nobody in the room.'],
    ['none-back-of-head', 'A person sitting with their back to the camera, only the back of the head, hair and shoulders visible, facing a window.'],
    ['none-hand', 'A hand held close in front of the lens, palm towards the camera, covering most of the frame, the room blurred behind it.'],
    ['none-dog', 'A dog sitting on the office chair at the desk, looking into the camera, no person in the room.'],
    ['none-cat', 'A cat sitting on the desk right in front of the camera, looking into the lens, no person in the room.'],
    ['none-mannequin', 'A bald white display mannequin head with painted features standing on the desk, facing the camera, no person in the room.'],
    ['none-teddy', 'A teddy bear sitting on the office chair at the desk, facing the camera, no person in the room.'],
    ['none-drawing', 'A hand holds a sheet of paper with a simple hand-drawn smiley face close to the camera, no person visible.'],
    ['none-chin', 'The camera is tilted down too far: only the chin, neck and chest of a person are visible, everything above the chin is cut off by the top edge of the frame.'],
    ['edge-half-left', 'A person sitting so far to the left that the left edge of the frame cuts vertically through the middle of the face; only the right half of the face is visible.'],
    ['edge-forehead', 'The camera is tilted up too far: the top edge of the frame cuts through the eyes of the person, only nose, mouth and chin are visible.'],
    ['edge-profile', 'A person at the desk turned 90 degrees to the side, seen in strict profile, looking at a second monitor.'],
    ['edge-hand-mouth', 'A person looking into the camera with one hand over mouth and nose, chin resting on the palm.'],
    ['edge-eyes-closed', 'A person facing the camera with both eyes calmly closed, relaxed face.'],
    ['edge-mask', 'A person wearing a light blue medical face mask, looking into the camera.'],
    ['edge-phone', 'A person looking down at a smartphone in their lap, head bowed, eyes not visible.'],
    ['edge-background', 'An empty office chair in front; far in the background a person walks through a doorway, small and slightly blurred.'],
    ['face-dark-beard', 'A man in his forties with dark brown skin and a short black beard, looking straight into the camera, evening, lit from the side by a warm desk lamp.'],
    ['face-hijab', 'A young woman wearing a navy hijab and thin metal glasses, looking straight into the camera, soft daylight from a window.'],
    ['face-senior', 'An elderly man with white hair, deep wrinkles and bushy eyebrows, looking straight into the camera in a dim living room.'],
    ['face-screen-glow', 'A young person with thick-rimmed glasses in a dark room, lit only by the cold blue glow of the screen, reflections on the lenses, looking into the camera.'],
    ['face-far', 'A person sitting about two metres back from the desk, face small in the frame, whole upper body and the room visible, looking at the camera.'],
    ['face-fringe', 'An East Asian woman with straight black hair and a heavy fringe covering her eyebrows, looking straight into the camera, bright office light.'],
    ['face-beanie', 'A man with a full ginger beard and a knitted beanie pulled low, looking into the camera; cheap webcam with visible noise and low contrast.'],
    ['face-dark-dim', 'A woman with very dark skin and short natural hair in a dim room at night, lit only by a small warm lamp, looking straight into the camera.'],
    ['face-tinted', 'A man with tinted brown sunglasses and a grey stubble beard, looking into the camera.'],
    ['face-overexposed', 'A young man with pale skin, the webcam overexposes his face in harsh midday sun from a window, highlights blown out, looking into the camera.'],
    ['face-curly-dim', 'A teenager with dark curly hair and medium-brown skin in a dim bedroom, lit by a desk lamp, looking into the camera.'],
    ['face-backlit', 'A woman sitting in front of a bright window, strongly backlit so that her face is dark, looking into the camera.'],
  ].map(([id, scene]) => ({ id, ratio: '16:9', folder: FACES, prompt: `${scene} ${WEBCAM}` })),
]

async function generate(prompt, ratio) {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.XAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: MODEL, prompt, n: 1, response_format: 'b64_json', aspect_ratio: ratio }),
  })
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${await response.text()}`)
  }
  const { data } = await response.json()
  const image = data?.[0]
  if (!image) throw new Error('Response without an image')
  return image.b64_json
    ? Buffer.from(image.b64_json, 'base64')
    : Buffer.from(await (await fetch(image.url)).arrayBuffer())
}

// In case the model ignores `aspect_ratio`: crop centrally instead of stretching.
function crop(file, ratio) {
  if (KEEP) return
  const [w, h] = ratio.split(':').map(Number)
  const cropped = `${file}.crop.jpg`
  try {
    execFileSync(
      'ffmpeg',
      ['-y', '-loglevel', 'error', '-i', file,
       '-vf', `crop='min(iw,ih*${w}/${h})':'min(ih,iw*${h}/${w})'`,
       '-q:v', '3', cropped],
      { stdio: 'inherit' },
    )
    renameSync(cropped, file)
  } catch {
    console.warn('  (ffmpeg missing, raw image kept; its aspect ratio is wrong)')
  }
}

// Test data says what it is, visibly and in the file's metadata.
function mark(file) {
  const marked = `${file}.mark.jpg`
  execFileSync(
    'ffmpeg',
    ['-y', '-loglevel', 'error', '-i', file,
     '-vf', "drawtext=text='AI-generated':font=Sans:fontsize=28:fontcolor=white:box=1:boxcolor=black@0.55:boxborderw=8:x=16:y=16",
     '-metadata', `comment=AI-generated with xAI ${MODEL}`, '-q:v', '3', marked],
    { stdio: 'inherit' },
  )
  renameSync(marked, file)
}

const pending = IMAGES.filter((it) => !only.length || only.includes(it.id))

if (!process.env.XAI_API_KEY) {
  console.error('XAI_API_KEY missing. Would generate:\n')
  for (const { id, ratio, folder = START } of pending) console.error(`  ${folder}/${id}.jpg  ${ratio}`)
  console.error('\n  XAI_API_KEY=... npm run photos')
  process.exit(1)
}

let written = 0

for (const { id, ratio, prompt, folder = START } of pending) {
  const file = join(root, folder, `${id}.jpg`)
  if (existsSync(file) && !force) {
    console.log(`  skipped  ${folder}/${id}.jpg`)
    continue
  }
  mkdirSync(join(root, folder), { recursive: true })
  writeFileSync(file, await generate(prompt, ratio))
  crop(file, ratio)
  if (folder !== START) mark(file)
  written++
  console.log(
    `  ${(statSync(file).size / 1024).toFixed(0).padStart(5)} kB  ${folder}/${id}.jpg  ${ratio}`,
  )
}

console.log(`\n${written} image(s) written, model ${MODEL}.`)
