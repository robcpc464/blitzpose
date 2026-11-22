import type { CameraErrorKind } from "./camera";
import type { CheckId } from "./checks";
import type { HintId } from "./coaching";
import type { StepId } from "./retouch";
import { MAX_SHOTS } from "./shortlist";

export type Lang = "en" | "de";

export type IntroStepId = "camera" | "voice" | "keep";

export const LANGS: Lang[] = ["en", "de"];

export const I18N = Symbol("i18n");

export const BCP47: Record<Lang, string> = { en: "en-US", de: "de-DE" };

export const LANG_NAMES: Record<Lang, string> = {
  en: "English",
  de: "Deutsch",
};

export const other = (lang: Lang): Lang => (lang === "de" ? "en" : "de");

// `languages` first: it holds the user's preferred order, `language` only the UI's.
export function detectLang(): Lang {
  const wanted =
    typeof navigator === "undefined"
      ? []
      : (navigator.languages ?? [navigator.language]);
  for (const tag of wanted) {
    const base = tag?.split("-")[0]?.toLowerCase();
    if (base && LANGS.includes(base as Lang)) return base as Lang;
  }
  return "en";
}

export type Texts = {
  tagline: string;
  language: string;
  /** Screen readers only: one heading per view, focused on phase change. */
  views: { live: string; choosing: string; polish: string };
  tools: {
    voiceOn: string;
    voiceOff: string;
    voiceNone: string;
    voiceTurnOn: string;
    voiceMute: string;
    debug: string;
    recorder: string;
    back: string;
    backToShots: string;
  };
  setup: {
    eyebrow: string;
    headline: string;
    lede: string;
    claims: string[];
    imprint: string;
    privacyPolicy: string;
    openSource: string;
    source: string;
    start: string;
    loading: (percent: number) => string;
    permission: string;
    stepsTitle: string;
    steps: Record<IntroStepId, { title: string; text: string }>;
    privacyTitle: string;
    privacy: string;
    techTitle: string;
    tech: string;
    voice: string;
  };
  live: {
    cameraOff: string;
    starting: string;
    pause: string;
    resume: string;
    start: string;
    finish: string;
    collecting: (taken: number, max: number) => string;
  };
  shots: {
    remaining: (count: number) => string;
    lead: string;
    photo: string;
    position: (at: number, total: number) => string;
    keep: string;
    discard: string;
    reject: string;
    rejectTip: string;
    download: string;
    downloadTip: (size: number) => string;
    mirror: string;
    mirrorOn: string;
  };
  polish: {
    open: string;
    lead: string;
    reset: string;
    loading: string;
    strength: (step: string) => string;
    steps: Record<StepId, string>;
    about: Record<StepId, string>;
  };
  lights: {
    required: string;
    ignored: string;
    state: (label: string, state: string) => string;
  };
  states: { good: string; bad: string; off: string };
  checks: Record<CheckId, string>;
  hints: Record<HintId, string>;
  camera: Record<CameraErrorKind, string>;
  modelError: string;
};

const en: Texts = {
  tagline: "Profile photo with maximum privacy",
  language: "Sprache auf Deutsch umstellen",
  views: { live: "Shooting", choosing: "Picking your photo", polish: "Retouching" },
  tools: {
    voiceOn: "Coaching voice is on",
    voiceOff: "Coaching voice is off",
    voiceNone: "No voice available in this browser",
    voiceTurnOn: "Turn the coaching voice on",
    voiceMute: "Mute the coaching voice",
    debug: "Measurements and thresholds",
    recorder: "Record labelled snapshots of every signal",
    back: "Back to shooting",
    backToShots: "Back to picking your photo",
  },
  setup: {
    eyebrow: "Profile photo, right in your browser",
    headline: "Your digital photographer.",
    lede: "BlitzPose tells you out loud how to hold your head and releases the shutter the moment everything fits. In the end, you keep the shot you like.",
    claims: ["100% local", "No account", "No upload", "Free", "No tracking"],
    imprint: "Legal notice",
    privacyPolicy: "Privacy policy",
    openSource: "Open source",
    source: "Source code on GitHub",
    start: "Start camera",
    loading: (percent) => `Loading the face detector, ${percent}%`,
    permission: "Your browser will ask for permission.",
    stepsTitle: "How it works",
    steps: {
      camera: {
        title: "Allow the camera",
        text: "One click on “Start camera”, then your browser asks for permission. Nothing gets installed.",
      },
      voice: {
        title: "The voice guides you",
        text: `It tells you how to sit and where to look. Once everything fits, the app takes the shot, up to ${MAX_SHOTS} times.`,
      },
      keep: {
        title: "Keep the best one",
        text: "Throw out what you do not like until one is left, then download it, retouched first if you want.",
      },
    },
    privacyTitle: "No picture leaves your device",
    privacy:
      "The face detection runs inside this browser, so your camera image stays on this machine and no picture of you is ever transmitted. Unlike AI headshot services, nothing is uploaded and nothing is redrawn: it stays a photo, and your face stays the way it is.",
    techTitle: "Local AI only",
    tech: "BlitzPose works with local AI only. Face detection is a MediaPipe model that finds 478 points and 52 expression values in every frame; cutting you out for a new background is a second model that runs in the browser via ONNX Runtime. The app ships both as files of its own, and a browser security rule forbids it any connection to the outside. No server, no cloud, so it even works in an intranet without internet access. There is no generative AI that redraws your face.",
    voice:
      "The coaching voice is AI-pre-generated and ships with the app as audio files. Nothing you say or do is sent to a speech service.",
  },
  live: {
    cameraOff: "Camera is off",
    starting: "Starting…",
    pause: "Pause. The camera keeps running, the shutter does not.",
    resume: "Shoot again",
    start: "Start camera",
    finish: "Done",
    collecting: (taken, max) => `Shooting ${taken} of ${max}`,
  },
  shots: {
    remaining: (count) => `${count} left`,
    lead: "Throw out what you do not like until one is left.",
    photo: "Your shot",
    position: (at, total) => `Shot ${at} of ${total}`,
    keep: "Keep",
    discard: "Throw out",
    reject: "Discard",
    rejectTip: "Throw this one out too and go back to the camera",
    download: "Download",
    downloadTip: (size) =>
      `${size}×${size} PNG. LinkedIn recompresses uploads, and PNG survives that better than JPG.`,
    mirror: "Mirror it, the way you see yourself",
    mirrorOn: "Mirrored. Click for how others see you.",
  },
  polish: {
    open: "Retouch this photo",
    lead: "All of it runs on this device, and not one point of the face is moved.",
    reset: "Back to the default settings",
    loading: "Loading the model, 0.2 MB…",
    strength: (step: string) => `Strength of ${step}`,
    steps: {
      balance: "White balance",
      exposure: "Exposure",
      shine: "Shine",
      skin: "Skin",
      eyes: "Eyes",
      backdrop: "Background",
    },
    about: {
      balance: "Take the colour cast of the room out",
      exposure: "Brightness and contrast",
      shine: "Damp the highlights on forehead and nose",
      skin: "Blotches out, pores stay",
      eyes: "Sharpen",
      backdrop: "Blur what is behind you",
    },
  },
  lights: {
    required: "Required. Click to ignore.",
    ignored:
      "Ignored: still measured, but never holds up a shot. Click to require it.",
    state: (label, state) => `${label}: ${state}`,
  },
  states: { good: "ok", bad: "needs attention", off: "unknown" },
  checks: {
    face: "Face",
    distance: "Distance",
    position: "Position",
    head: "Head angle",
    uncovered: "Face uncovered",
    light: "Lighting",
    gaze: "Eye contact",
    sharpness: "Sharpness",
    eyes: "Eyes open",
    smile: "Smile",
  },
  hints: {
    ready: "Perfect, hold it",
    noFace: "Come back into the frame",
    closer: "Come closer",
    backUp: "Back up a bit",
    cameraLow: "Chin down, or raise your camera",
    straighten: "Straighten your head",
    uncover: "Uncover your mouth and nose",
    gaze: "Look at the camera",
    brighter: "Turn towards the window",
    darker: "Less light on your face",
    holdStill: "Hold still",
    openEyes: "Open your eyes",
    moveLeft: "A little to your left",
    moveRight: "A little to your right",
    sitUp: "Sit up",
    sitLower: "Sit lower",
    smile: "Give me a smile",
  },
  camera: {
    "insecure-context":
      "The camera needs a secure connection. Open this page over https:// or on localhost.",
    unsupported:
      "This browser has no camera API. Try Chrome, Edge, Firefox or Safari.",
    denied:
      "Camera access was blocked. Allow it via the icon in the address bar, then start again.",
    "not-found": "No camera found. Connect one and start again.",
    "in-use":
      "The camera is in use by another app or tab. Close it, then start again.",
    ended: "The camera was disconnected. Reconnect it and start again.",
    unknown: "The camera could not be started.",
  },
  modelError: "Face detection could not be started. Reload the page.",
};

// Hints stay as terse as in English: they're spoken while the user is already acting.
const de: Texts = {
  tagline: "Profilfoto mit maximalem Datenschutz",
  language: "Switch the language to English",
  views: { live: "Aufnahme", choosing: "Bildauswahl", polish: "Nachbearbeitung" },
  tools: {
    voiceOn: "Coaching-Stimme ist an",
    voiceOff: "Coaching-Stimme ist aus",
    voiceNone: "Keine Stimme in diesem Browser",
    voiceTurnOn: "Coaching-Stimme anschalten",
    voiceMute: "Coaching-Stimme stummschalten",
    debug: "Messwerte und Schwellen",
    recorder: "Beschriftete Momentaufnahmen aller Signale",
    back: "Zurück zur Aufnahme",
    backToShots: "Zurück zur Bildauswahl",
  },
  setup: {
    eyebrow: "Profilfoto direkt im Browser",
    headline: "Dein digitaler Fotograf.",
    lede: "BlitzPose sagt dir per Stimme, wie du den Kopf hältst, und löst aus, sobald alles passt. Am Ende behältst du das Bild, das dir gefällt.",
    claims: ["100\u00a0% lokal", "Kein Konto", "Kein Upload", "Kostenlos", "Kein Tracking"],
    imprint: "Impressum",
    privacyPolicy: "Datenschutz",
    openSource: "Open Source",
    source: "Quellcode auf GitHub",
    start: "Kamera starten",
    loading: (percent) => `Gesichtserkennung lädt, ${percent} %`,
    permission: "Dein Browser fragt gleich nach der Erlaubnis.",
    stepsTitle: "So geht es",
    steps: {
      camera: {
        title: "Kamera erlauben",
        text: "Ein Klick auf „Kamera starten“, dann fragt dein Browser nach der Erlaubnis. Installiert wird nichts.",
      },
      voice: {
        title: "Die Stimme führt",
        text: `Sie sagt dir, wie du dich hinsetzt und wohin du schaust. Stimmt alles, löst die App aus, bis zu ${MAX_SHOTS}-mal.`,
      },
      keep: {
        title: "Das Beste behalten",
        text: "Du wirfst raus, was dir nicht gefällt, bis eins übrig ist, und lädst es herunter, auf Wunsch vorher nachbearbeitet.",
      },
    },
    privacyTitle: "Kein Bild verlässt dein Gerät",
    privacy:
      "Die Gesichtserkennung läuft in diesem Browser, dein Kamerabild bleibt auf diesem Rechner, und kein Bild von dir wird übertragen. Anders als bei KI-Headshot-Diensten wird nichts hochgeladen und nichts neu gezeichnet: Es bleibt ein Foto, und dein Gesicht bleibt, wie es ist.",
    techTitle: "Nur lokale KI",
    tech: "BlitzPose arbeitet ausschließlich mit lokaler KI. Die Gesichtserkennung ist ein MediaPipe-Modell, das in jedem Bild 478 Punkte und 52 Ausdruckswerte findet; das Freistellen für einen neuen Hintergrund übernimmt ein zweites Modell, das per ONNX Runtime im Browser läuft. Beide liefert die App selbst als Dateien aus, und eine Sicherheitsregel im Browser verbietet ihr jede Verbindung nach draußen. Kein Server, keine Cloud, deshalb läuft sie auch im Intranet ohne Internetzugang. Eine generative KI, die dein Gesicht neu zeichnet, gibt es nicht.",
    voice:
      "Die Coaching-Stimme ist KI-vorerzeugt und liegt der App als Audiodateien bei. Nichts von dem, was du sagst oder tust, geht an einen Sprachdienst.",
  },
  live: {
    cameraOff: "Kamera ist aus",
    starting: "Startet…",
    pause: "Pause. Die Kamera läuft weiter, ausgelöst wird nicht.",
    resume: "Weiter fotografieren",
    start: "Kamera starten",
    finish: "Weiter",
    collecting: (taken, max) => `Nimmt auf, ${taken} von ${max}`,
  },
  shots: {
    remaining: (count) => `noch ${count}`,
    lead: "Wirf raus, was dir nicht gefällt, bis eins übrig ist.",
    photo: "Deine Aufnahme",
    position: (at, total) => `Aufnahme ${at} von ${total}`,
    keep: "Behalten",
    discard: "Rauswerfen",
    reject: "Verwerfen",
    rejectTip: "Auch dieses rauswerfen und zurück zur Aufnahme",
    download: "Download",
    downloadTip: (size) =>
      `${size}×${size} PNG. LinkedIn komprimiert Uploads nach, und PNG übersteht das besser als JPG.`,
    mirror: "Spiegeln, so wie du dich selbst siehst",
    mirrorOn: "Gespiegelt. Klick für die Sicht der anderen.",
  },
  polish: {
    open: "Foto nachbearbeiten",
    lead: "Alles rechnet auf diesem Gerät, und kein einziger Punkt im Gesicht wird verschoben.",
    reset: "Zurück auf die Voreinstellung",
    loading: "Modell wird geladen, 0,2 MB…",
    strength: (step: string) => `Stärke von ${step}`,
    steps: {
      balance: "Weißabgleich",
      exposure: "Belichtung",
      shine: "Glanz",
      skin: "Haut",
      eyes: "Augen",
      backdrop: "Hintergrund",
    },
    about: {
      balance: "Den Farbstich des Raumlichts herausrechnen",
      exposure: "Helligkeit und Kontrast",
      shine: "Lichter auf Stirn und Nase dämpfen",
      skin: "Flecken heraus, Poren bleiben",
      eyes: "Nachschärfen",
      backdrop: "Weichzeichnen, was hinter dir liegt",
    },
  },
  lights: {
    required: "Wird verlangt. Klick, um ihn zu ignorieren.",
    ignored:
      "Ignoriert: wird weiter gemessen, hält aber keine Aufnahme auf. Klick, um ihn zu verlangen.",
    state: (label, state) => `${label}: ${state}`,
  },
  states: { good: "in Ordnung", bad: "stimmt noch nicht", off: "unbestimmt" },
  checks: {
    face: "Gesicht",
    distance: "Abstand",
    position: "Position",
    head: "Kopfhaltung",
    uncovered: "Gesicht frei",
    light: "Licht",
    gaze: "Blick",
    sharpness: "Schärfe",
    eyes: "Augen offen",
    smile: "Lächeln",
  },
  hints: {
    ready: "Perfekt, so bleiben",
    noFace: "Komm zurück ins Bild",
    closer: "Komm näher",
    backUp: "Geh etwas zurück",
    cameraLow: "Kinn runter, oder Kamera höher",
    straighten: "Kopf gerade",
    uncover: "Gib Mund und Nase frei",
    gaze: "Schau in die Kamera",
    brighter: "Dreh dich zum Fenster",
    darker: "Weniger Licht ins Gesicht",
    holdStill: "Nicht bewegen",
    openEyes: "Augen auf",
    moveLeft: "Etwas nach links",
    moveRight: "Etwas nach rechts",
    sitUp: "Setz dich aufrecht",
    sitLower: "Setz dich tiefer",
    smile: "Lächle mal",
  },
  camera: {
    "insecure-context":
      "Die Kamera braucht eine sichere Verbindung. Öffne die Seite über https:// oder auf localhost.",
    unsupported:
      "Dieser Browser hat keine Kamera-Schnittstelle. Nimm Chrome, Edge, Firefox oder Safari.",
    denied:
      "Der Kamerazugriff wurde blockiert. Erlaube ihn über das Symbol in der Adressleiste und starte neu.",
    "not-found": "Keine Kamera gefunden. Schließ eine an und starte neu.",
    "in-use":
      "Die Kamera wird von einer anderen App oder einem anderen Tab benutzt. Schließ sie und starte neu.",
    ended: "Die Kamera wurde getrennt. Schließ sie wieder an und starte neu.",
    unknown: "Die Kamera konnte nicht gestartet werden.",
  },
  modelError:
    "Die Gesichtserkennung konnte nicht gestartet werden. Lade die Seite neu.",
};

export const TEXTS: Record<Lang, Texts> = { en, de };
