import wasmLoaderPath from '@mediapipe/tasks-vision/vision_wasm_internal.js?url'
import wasmBinaryPath from '@mediapipe/tasks-vision/vision_wasm_internal.wasm?url'

// Content-hashed: under fixed names a cached old loader met a newer binary after an upgrade.
export const VISION_WASM = { wasmLoaderPath, wasmBinaryPath }
