export type CameraErrorKind =
  | 'insecure-context'
  | 'unsupported'
  | 'denied'
  | 'not-found'
  | 'in-use'
  | 'ended'
  | 'unknown'

class CameraError extends Error {
  readonly kind: CameraErrorKind

  constructor(kind: CameraErrorKind, cause?: unknown) {
    super(kind, { cause })
    this.name = 'CameraError'
    this.kind = kind
  }
}

// `ideal`, not required: the export is an 800 px crop, so any lower resolution still works.
const CONSTRAINTS: MediaStreamConstraints = {
  video: {
    facingMode: 'user',
    width: { ideal: 1920 },
    height: { ideal: 1080 },
  },
  audio: false,
}

export async function startCamera(): Promise<MediaStream> {
  if (!window.isSecureContext) throw new CameraError('insecure-context')
  if (!navigator.mediaDevices?.getUserMedia) throw new CameraError('unsupported')

  try {
    return await navigator.mediaDevices.getUserMedia(CONSTRAINTS)
  } catch (cause) {
    throw new CameraError(kindOf(cause), cause)
  }
}

export function cameraErrorKind(cause: unknown): CameraErrorKind {
  return cause instanceof CameraError ? cause.kind : 'unknown'
}

export function stopCamera(stream: MediaStream): void {
  for (const track of stream.getTracks()) track.stop()
}

function kindOf(cause: unknown): CameraErrorKind {
  if (!(cause instanceof DOMException)) return 'unknown'

  switch (cause.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'denied'
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'not-found'
    case 'NotReadableError':
      return 'in-use'
    default:
      return 'unknown'
  }
}
