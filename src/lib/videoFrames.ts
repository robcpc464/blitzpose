// Fires per real video frame: a 30 fps camera on a 120 Hz display needs up to 4x less inference.
export function eachVideoFrame(video: HTMLVideoElement, onFrame: () => void): () => void {
  let cancelled = false

  if ('requestVideoFrameCallback' in video) {
    let id = video.requestVideoFrameCallback(function step() {
      if (cancelled) return
      id = video.requestVideoFrameCallback(step)
      onFrame()
    })
    return () => {
      cancelled = true
      video.cancelVideoFrameCallback(id)
    }
  }

  let id = requestAnimationFrame(function step() {
    if (cancelled) return
    id = requestAnimationFrame(step)
    onFrame()
  })
  return () => {
    cancelled = true
    cancelAnimationFrame(id)
  }
}
