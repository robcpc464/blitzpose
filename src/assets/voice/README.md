# Voice clips

One `.mp3` per instruction and language. The file name without extension is the `HintId` from
`src/lib/coaching.ts`, e.g. `de/holdStill.mp3`. `src/lib/voiceClips.ts` picks them up; a missing clip
falls back to the browser's speech synthesis.

Generated once with `npm run voice` (xAI TTS), mono 48 kbps. Nothing is fetched at runtime.
