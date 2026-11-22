/** Person coverage 0..1 at model resolution; `retouch.ts` scales it up with the face masks. */
export type Person = {
  data: Float32Array
  width: number
  height: number
}

export type Matte = {
  of(canvas: HTMLCanvasElement): Promise<Person | null>
  close(): void
}

const WASM_PATH = '/onnx/'
const MODEL_PATH = '/onnx/modnet.onnx'

// Model card: 512 on the short side, a multiple of 32; our crop is square.
const SIDE = 512

/**
 * MODNet (Apache 2.0) estimates partial coverage, which hair needs: 36 503 vs 8 157 partially
 * covered pixels against the segmenter on the same crop (measured).
 */
export async function createMatting(): Promise<Matte> {
  const ort = await import('onnxruntime-web/wasm')
  ort.env.wasm.wasmPaths = WASM_PATH
  // Threads need cross-origin isolation headers, which an intranet server may not send.
  ort.env.wasm.numThreads = 1

  const session = await ort.InferenceSession.create(MODEL_PATH, {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
  })
  const [input] = session.inputNames
  const [output] = session.outputNames

  // Reused across calls: 3 MB each.
  const kanaele = new Float32Array(SIDE * SIDE * 3)
  const klein = document.createElement('canvas')
  klein.width = SIDE
  klein.height = SIDE
  const ctx = klein.getContext('2d', { willReadFrequently: true })

  return {
    async of(canvas): Promise<Person | null> {
      if (!ctx) return null
      ctx.drawImage(canvas, 0, 0, SIDE, SIDE)
      const { data } = ctx.getImageData(0, 0, SIDE, SIDE)

      // Planar channels normalised to -1..1 (mean 0.5, std 0.5 per model card).
      const flaeche = SIDE * SIDE
      for (let p = 0, i = 0; i < flaeche; i++, p += 4) {
        kanaele[i] = data[p] / 127.5 - 1
        kanaele[flaeche + i] = data[p + 1] / 127.5 - 1
        kanaele[flaeche * 2 + i] = data[p + 2] / 127.5 - 1
      }

      const ergebnis = await session.run({
        [input]: new ort.Tensor('float32', kanaele, [1, 3, SIDE, SIDE]),
      })
      const alpha = ergebnis[output].data
      if (!(alpha instanceof Float32Array)) return null

      // Copied: the runtime reuses its buffer.
      return { data: Float32Array.from(alpha), width: SIDE, height: SIDE }
    },

    close() {
      void session.release()
      klein.width = 0
      klein.height = 0
    },
  }
}
