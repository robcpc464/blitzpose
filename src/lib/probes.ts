import type { FaceLandmarker } from '@mediapipe/tasks-vision'
import { captureFrame, type Capture } from './capture'

/**
 * AI-generated test images for `?testbilder` (testdata/probes, dev server only): cutouts are judged
 * on loose hair, which one webcam never varies. They go through `captureFrame` to test the real path.
 */
const PROBES = ['probe-offen', 'probe-lockig', 'probe-hell', 'probe-webcam']

export async function loadProbes(landmarker: FaceLandmarker): Promise<Capture[]> {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return []

  const captures: Capture[] = []
  for (const name of PROBES) {
    const image = new Image()
    image.src = `/testdata/probes/${name}.jpg`
    // Not `decode()`: it hangs in background tabs, while `onload` still fires.
    const loaded = await new Promise<boolean>((done) => {
      image.onload = () => done(true)
      image.onerror = () => done(false)
    })
    if (!loaded) {
      console.warn(`Test image missing: ${name}. npm run photos`)
      continue
    }

    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    ctx.drawImage(image, 0, 0)

    const landmarks = landmarker.detectForVideo(canvas, performance.now()).faceLandmarks[0]
    if (!landmarks) {
      console.warn(`No face in ${name}`)
      continue
    }
    const capture = captureFrame(canvas, landmarks)
    if (capture) captures.push(capture)
  }

  canvas.width = 0
  canvas.height = 0
  return captures
}
