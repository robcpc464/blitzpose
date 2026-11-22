// Records the coaching hints once as mp3 to src/assets/voice/<lang>/<HintId>.mp3.
// Dev time only; the app ships the files and makes no network calls.
//
//   XAI_API_KEY=... npm run voice              missing ones only
//   XAI_API_KEY=... npm run voice -- --force   all
//   XAI_API_KEY=... npm run voice -- --lang de one language
//
// Without a key it only lists what would be generated. Environment:
//   VOICE_NAME     default `eve` (also: ara, leo, rex, sal)
//   VOICE_SPEED    0.7 to 1.5, default 0.95: a photographer doesn't rush
//   VOICE_BITRATE  mp3 bitrate after shrinking, default 48k
//   VOICE_KEEP_RAW 1 keeps the file as delivered (128 kbps)

import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync, statSync, renameSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'src/assets/voice')
const force = process.argv.includes('--force')
const langAt = process.argv.indexOf('--lang')
const onlyLang = langAt === -1 ? null : process.argv[langAt + 1]

const ENDPOINT = 'https://api.x.ai/v1/tts'
const VOICE = process.env.VOICE_NAME ?? 'eve'
const SPEED = Number(process.env.VOICE_SPEED ?? '0.95')
const BITRATE = process.env.VOICE_BITRATE ?? '48k'
const KEEP_RAW = process.env.VOICE_KEEP_RAW === '1'

// Bundles i18n.ts with esbuild so the spoken sentences have no second copy to drift.
async function hintTexts() {
  const dir = mkdtempSync(join(tmpdir(), 'blitzpose-voice-'))
  process.on('exit', () => rmSync(dir, { recursive: true, force: true }))

  const bundle = join(dir, 'i18n.mjs')
  execFileSync(
    join(root, 'node_modules/.bin/esbuild'),
    [
      join(root, 'src/lib/i18n.ts'),
      '--bundle',
      '--platform=node',
      '--format=esm',
      `--outfile=${bundle}`,
      '--log-level=error',
    ],
    { stdio: 'inherit' },
  )
  const { TEXTS } = await import(pathToFileURL(bundle).href)
  return Object.fromEntries(
    Object.entries(TEXTS)
      .filter(([lang]) => !onlyLang || lang === onlyLang)
      .map(([lang, texts]) => [lang, texts.hints]),
  )
}

async function speak(text, lang) {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.XAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text, language: lang, voice_id: VOICE, speed: SPEED }),
  })
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${await response.text()}`)
  }
  return Buffer.from(await response.arrayBuffer())
}

// xAI delivers 128 kbps stereo; 48 kbps mono sounds no worse for speech and saves two thirds.
function shrink(file) {
  if (KEEP_RAW) return
  try {
    const small = `${file}.small.mp3`
    execFileSync(
      'ffmpeg',
      ['-y', '-loglevel', 'error', '-i', file, '-ac', '1', '-b:a', BITRATE, small],
      { stdio: 'inherit' },
    )
    renameSync(small, file)
  } catch {
    console.warn('  (ffmpeg nicht verfuegbar, Rohdatei behalten)')
  }
}

const byLang = await hintTexts()

if (!process.env.XAI_API_KEY) {
  console.error('XAI_API_KEY fehlt. Zu erzeugen waeren:\n')
  for (const [lang, texts] of Object.entries(byLang)) {
    for (const [id, text] of Object.entries(texts)) console.error(`  ${lang}/${id}.mp3  "${text}"`)
  }
  console.error('\n  XAI_API_KEY=... npm run voice')
  process.exit(1)
}

let written = 0

for (const [lang, texts] of Object.entries(byLang)) {
  mkdirSync(join(outDir, lang), { recursive: true })

  for (const [id, text] of Object.entries(texts)) {
    const file = join(outDir, lang, `${id}.mp3`)
    if (existsSync(file) && !force) {
      console.log(`  uebersprungen  ${lang}/${id}.mp3`)
      continue
    }
    writeFileSync(file, await speak(text, lang))
    shrink(file)
    written++
    console.log(
      `  ${(statSync(file).size / 1024).toFixed(1).padStart(6)} kB  ${lang}/${id}.mp3  "${text}"`,
    )
  }
}

console.log(`\n${written} Datei(en) geschrieben, Stimme ${VOICE}, Tempo ${SPEED}.`)
console.log('Die App muss offenlegen, dass die Stimme KI-generiert ist. Das tut sie.')
