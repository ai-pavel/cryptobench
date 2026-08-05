# [ai-pavel.github.io](https://ai-pavel.github.io/)

Local-first browser tools — everyday, dev & crypto. Nothing leaves your device.

## Toolboxes

<!-- toolboxes:start -->
| Toolbox | What's inside | Tools | Folder |
|---|---|---|---|
| [🪄 Utilities](https://ai-pavel.github.io/utilities/) | Everyday utilities: time, text, files and media | 17 | [`src/utilities/`](src/utilities/) |
| [🧑‍💻 Developer](https://ai-pavel.github.io/dev/) | Developer utilities: JSON, encoding, tokens, regex, diffs, bits and bytes | 21 | [`src/dev/`](src/dev/) |
| [🔐 Cryptography](https://ai-pavel.github.io/crypto/) | Hashes, HMAC, key derivation, encryption, keys, signatures, certificates and secrets | 16 | [`src/crypto/`](src/crypto/) |
| [🪙 Bitcoin](https://ai-pavel.github.io/bitcoin/) | Bitcoin: blocks, transactions, PSBTs, keys, addresses and HD wallets | 18 | [`src/bitcoin/`](src/bitcoin/) |
| [💠 EVM](https://ai-pavel.github.io/evm/) | Ethereum and EVM: units, addresses, ABI, transactions and signatures | 2 | [`src/evm/`](src/evm/) |
<!-- toolboxes:end -->

Everything runs client-side in the browser: files and keys never leave the device.
The site is an installable app (PWA) and works offline once it has been opened.

## Structure

- `src/` is the published site: the home page, `assets/`, and one folder per toolbox. GitHub Actions (`.github/workflows/pages.yml`) deploys `src/` as the site root on every push to `master`, so URLs don't include `src/`.
- Each tool is a page at `src/<toolbox>/<tool>/index.html` with its code in `src/<toolbox>/<tool>/<tool>.js`.
- All pages share `src/assets/style.css`.
- The list of toolboxes and tools lives in `src/assets/tools.json`. After changing it (or finishing a tool page), run `python3 scripts/generate.py` to rebuild the home page, toolbox pages, search index and the table above. New tools get a placeholder page.
- Third-party libraries are vendored in `src/assets/vendor/` (see `src/assets/vendor/VENDOR.md`). To add or upgrade one, edit the list in `scripts/vendor.py` and run `python3 scripts/vendor.py`; it downloads the files and points pages at the local copies.
- `src/sw.js` is the service worker. It is generated from `scripts/sw.template.js` by `generate.py`, which precaches every site file and bumps the cache version whenever a file changes. Heavy assets loaded on demand (the ffmpeg core, the OCR engine and its language data) are cached on first use.
- There is no build step on deploy: the workflow publishes `src/` as-is.

## Tests

Unit tests live in `tests/`, one file per tool at `tests/<toolbox>/<tool>.test.js`. They use Node's built-in test runner, so there is nothing to install (Node 22 or newer).

```sh
cd tests
npm test                               # everything
node --test bitcoin/                   # one toolbox
node --test bitcoin/psbt-decoder.test.js   # one tool
```

Each tool page keeps its markup in `index.html` and its code in `<tool>.js` next to it. The module exports the tool's logic as plain functions, which the tests import, and wires up the page only when it runs in a browser.
