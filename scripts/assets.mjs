// Copies runtimes and downloads models into public/ so the app never contacts another host.
// URLs are pinned and checksummed so what ships can't change when someone moves a branch upstream.
import { createWriteStream } from 'node:fs'
import { createHash } from 'node:crypto'
import { cp, mkdir, readFile, stat, unlink } from 'node:fs/promises'
import { basename } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

const MEDIAPIPE = 'public/mediapipe'
const ONNX = 'public/onnx'

const RUNTIMES = [
  // Not `jsep` (WebGPU, twice the size): matting runs once per photo. The .mjs loader is
  // required too; without it ONNX only reports "no available backend found".
  {
    from: 'node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm',
    to: `${ONNX}/ort-wasm-simd-threaded.wasm`,
  },
  {
    from: 'node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs',
    to: `${ONNX}/ort-wasm-simd-threaded.mjs`,
  },
]

const MODELS = [
  {
    file: `${MEDIAPIPE}/face_landmarker.task`,
    url: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
    sha256: '64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff',
  },
  {
    // Multiclass, not binary: hair is its own class. 15.6 MB vs 24.7 + 13 MB for the ONNX route.
    file: `${MEDIAPIPE}/selfie_multiclass.tflite`,
    url: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/1/selfie_multiclass_256x256.tflite',
    sha256: 'c6748b1253a99067ef71f7e26ca71096cd449baefa8f101900ea23016507e0e0',
  },
  {
    // MODNet, Apache 2.0 including weights (ZHKKKe/MODNet); URL pins a commit.
    // Full precision: the 6.3 MB quantized model is broken (mean coverage 0.202 vs 0.494,
    // segmenter 0.491).
    file: `${ONNX}/modnet.onnx`,
    url: 'https://huggingface.co/Xenova/modnet/resolve/fa2fa546052fba4c08921230a26cc69a333fca12/onnx/model.onnx',
    sha256: '07c308cf0fc7e6e8b2065a12ed7fc07e1de8febb7dc7839d7b7f15dd66584df9',
  },
]

async function exists(path) {
  try {
    return (await stat(path)).size > 0
  } catch {
    return false
  }
}

const digest = async (path) => createHash('sha256').update(await readFile(path)).digest('hex')

await mkdir(MEDIAPIPE, { recursive: true })
await mkdir(ONNX, { recursive: true })

for (const { from, to } of RUNTIMES) {
  await cp(from, to)
  console.log(`assets: ${from} → ${to}`)
}

for (const { file, url, sha256 } of MODELS) {
  if (await exists(file)) {
    if ((await digest(file)) === sha256) {
      console.log(`assets: ${file} liegt bereits vor`)
      continue
    }
    console.warn(`assets: ${file} hat die falsche Pruefsumme, wird neu geholt`)
    await unlink(file)
  }

  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url} → HTTP ${response.status}`)
  await pipeline(Readable.fromWeb(response.body), createWriteStream(file))

  const got = await digest(file)
  if (got !== sha256) {
    await unlink(file)
    throw new Error(`${file}: Pruefsumme ${got} statt ${sha256}`)
  }
  const { size } = await stat(file)
  console.log(`assets: ${basename(file)} geladen (${(size / 1e6).toFixed(1)} MB, Summe stimmt)`)
}
