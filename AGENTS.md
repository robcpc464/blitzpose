# BlitzPose

Browser app for profile photos: webcam portrait, taken at the best moment, with
voice coaching. Svelte 5, TypeScript, Tailwind 4, Vite. Everything runs locally.

`npm run dev` · `npm run check` · `npm run build` · `npm run deploy`

## Non-negotiable

- **No backend, no login, no API key.**
- **Nothing leaves the device.** The app serves its own models and WASM
  (`npm run assets`, checksums in `scripts/assets.mjs`), never via CDN. The
  `connect-src 'self'` line in `index.html` enforces this and stays: otherwise
  MediaPipe sends telemetry to Google. The rejected attempts in the console are
  intended.
- **No generative change to the face.** No landmark ever moves, or the identity
  is gone. Background, colour, sharpness yes; img2img no.
- **`src/lib/` stays framework-free** (plain TS); Svelte only does the UI.

## Structure

`App.svelte` holds the phases, `Live.svelte` orchestrates the capture, the
domain logic lives in `src/lib/`. Not obvious from the names:

- `checks.ts` is the *one* list of checks. Lights, voice and shutter all read
  it, so they cannot contradict each other.
- `scoring.ts` only rates whether a frame is technically usable, not whether it
  is flattering.
- `trend.ts` smooths asymmetrically: the raw score triggers the shutter, the
  smoothed one drives display and instructions.
- `imprint.html` and `privacy.html` belong to the public site only
  (`npm run deploy`, mode `public`), not to the intranet build. Whoever
  changes storage, network or hosting updates the privacy policy.

## Language

Code, comments, commit messages and this file are in English. The UI is
bilingual (German/English) via `src/lib/i18n.ts`. Existing German comments and
names get translated when touched.

## Rules

- **Constants are measured, not guessed.** Measure with the recorder
  (`?record`) or on the AI-generated test images in `testdata/probes/`
  (`?testbilder`, dev server only). Where that is impossible, the value says it
  is a guess.
- **Comments only when absolutely necessary, and short.** A comment is a code
  smell: if code needs explaining, first make the code clearer (names,
  structure). Allowed is one short sentence on the *why* the code cannot say,
  such as a measured constant or a workaround. No *what*, no backstory.
- Implement only what was asked.
- **Before every commit, review your own diff:**
  1. Boy scout rule in touched code: dead code, unclear names, duplicated
     logic, missing types, superfluous comments. Leave untouched code alone.
  2. Simplify: less code, less abstraction, reuse what exists.
  3. `npm run check` green and verified in the browser.
- **Commit messages as semantic commits, exactly one line:**
  `type(scope): description`, e.g. `fix(live): make hint above video readable`.
  Types: `feat`, `fix`, `refactor`, `style`, `perf`, `docs`, `test`, `build`,
  `chore`. No body, nothing else, no `Co-Authored-By`.
