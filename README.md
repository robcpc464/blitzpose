# BlitzPose

Webcam profile photos with voice coaching. 100% local.

BlitzPose tells you how to hold your head, takes the shot when everything fits, and lets you keep
the best one, optionally retouched. Face detection, background removal and retouching all run in
your browser; no picture is uploaded, and no AI redraws your face.

## Run it

```sh
npm install      # also fetches the models and WASM runtimes into public/
npm run dev
```

- `npm run check`: type and Svelte checks
- `npm run build`: the app alone, e.g. for an intranet
- `npm run deploy`: public site with legal pages, to Cloudflare Pages

`?testbilder` runs the app on the AI-generated test images in `testdata/probes/` instead of the
camera; `?record` opens a recorder for measuring thresholds.

## Privacy

The app serves its own models and makes no requests to other servers; a Content Security Policy in
`index.html` enforces this. Settings are kept in the browser's local storage.

## Built with

Svelte 5, TypeScript, Tailwind CSS 4 and Vite. MediaPipe Face Landmarker and Selfie Multiclass,
MODNet via ONNX Runtime Web (models under Apache 2.0, fetched by `npm run assets`). The voice
clips and the images on the start screen are AI-generated.

## License

[MIT](LICENSE.md). Contributions are not accepted, see [CONTRIBUTING.md](CONTRIBUTING.md).
