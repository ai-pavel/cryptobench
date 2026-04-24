# Vendored ffmpeg.wasm wrapper

The `@ffmpeg/ffmpeg` class starts its Web Worker from a URL relative to its own module,
and browsers only allow same-origin worker scripts, so the wrapper is served from this site.

| Folder | Package | Version | Source |
|---|---|---|---|
| `ffmpeg/` | `@ffmpeg/ffmpeg` | 0.12.15 | `https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.15/dist/esm/` |
| `util/` | `@ffmpeg/util` | 0.12.2 | `https://cdn.jsdelivr.net/npm/@ffmpeg/util@0.12.2/dist/esm/` |

Both are MIT licensed (see `LICENSE`). Files are copied unmodified.

The ~32 MB single-thread core (`@ffmpeg/core@0.12.10`, ESM build) is not vendored.
`loader.js` downloads it from jsDelivr at runtime and hands it to the worker as blob URLs.
The single-thread core is used because GitHub Pages cannot send the COOP/COEP headers
that the multi-thread core (`SharedArrayBuffer`) requires.

`loader.js` is our own code shared by `convert-audio/` and `convert-video/`.
