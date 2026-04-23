#!/usr/bin/env python3
"""Copy third-party libraries from jsDelivr into assets/vendor/ and point pages at them.

Each entry below is a pinned jsDelivr URL. ESM bundles served by jsDelivr's
"/+esm" endpoint import other "/npm/...+esm" bundles by absolute path; those are
fetched too and their imports rewritten to relative paths, so the vendored copy
is self-contained. Files are saved with a .js extension so GitHub Pages serves
them with a JavaScript MIME type (required for module scripts).

Afterwards every page and script that referenced one of these URLs is rewritten
to the local copy, and assets/vendor/VENDOR.md lists what was vendored.

Heavy assets loaded on demand (the ffmpeg core, the tesseract core and its
language data) are not vendored; the service worker caches them on first use.

Run from anywhere: python3 scripts/vendor.py [folder ...]
With folders given, only pages under them are rewritten (the libraries are still
all fetched), so sections that are still being edited are left alone.
"""
import hashlib
import os
import posixpath
import re
import sys
import urllib.request

# Vendored files and the pages that use them live in the published site folder, src/.
ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "src")
VENDOR = "assets/vendor"
CDN = "https://cdn.jsdelivr.net"

ENTRIES = [
    "/npm/@noble/curves@1.9.7/ed25519/+esm",
    "/npm/@noble/curves@1.9.7/secp256k1/+esm",
    "/npm/@noble/curves@2.4.0/ed25519.js/+esm",
    "/npm/@noble/hashes@1.8.0/sha2/+esm",
    "/npm/@noble/hashes@1.8.0/sha3/+esm",
    "/npm/@noble/hashes@1.8.0/blake2b/+esm",
    "/npm/@noble/hashes@1.8.0/hmac/+esm",
    "/npm/@noble/hashes@1.8.0/pbkdf2/+esm",
    "/npm/@noble/hashes@2.4.0/hmac.js/+esm",
    "/npm/@noble/hashes@2.4.0/sha2.js/+esm",
    "/npm/@scure/sr25519@2.4.0/index.js/+esm",
    "/npm/@noble/hashes@2.4.0/pbkdf2.js/+esm",
    "/npm/@noble/ciphers@2.4.0/aes.js/+esm",
    "/npm/@noble/ciphers@2.4.0/chacha.js/+esm",
    "/npm/@noble/hashes@2.4.0/hkdf.js/+esm",
    "/npm/@noble/hashes@2.4.0/sha3.js/+esm",
    "/npm/@noble/hashes@2.4.0/legacy.js/+esm",
    "/npm/@scure/base@2.4.0/index.js/+esm",
    "/npm/@noble/hashes@2.4.0/blake2.js/+esm",
    "/npm/@noble/curves@2.4.0/secp256k1.js/+esm",
    "/npm/@noble/curves@2.4.0/nist.js/+esm",
    "/npm/@scure/bip32@2.4.0/index.js/+esm",
    "/npm/@scure/bip32@1.7.0/+esm",
    "/npm/@noble/hashes@1.8.0/legacy/+esm",
    "/npm/@scure/base@1.2.6/+esm",
    "/npm/@scure/btc-signer@1.8.1/+esm",
    "/npm/js-yaml@4.1.0/+esm",
    "/npm/sql-formatter@15.9.0/dist/sql-formatter.min.js",
    "/npm/ua-parser-js@1.0.41/dist/ua-parser.min.js",
    "/npm/@scure/bip39@1.6.0/+esm",
    "/npm/@scure/bip39@1.6.0/wordlists/english/+esm",
    "/npm/@scure/bip39@2.4.0/index.js/+esm",
    "/npm/@scure/bip39@2.4.0/wordlists/english.js/+esm",
    "/npm/barcode-detector@3.2.3/dist/iife/ponyfill.js",
    "/npm/zxing-wasm@3.1.6/dist/reader/zxing_reader.wasm",
    "/npm/fflate@0.8.3/esm/browser.js",
    "/npm/fflate@0.8.3/umd/index.js",
    "/npm/gifenc@1.0.3/dist/gifenc.esm.js",
    "/npm/hash-wasm@4.12.0/dist/index.umd.min.js",
    "/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js",
    "/npm/qrcode-generator@1.4.4/qrcode.js",
    "/npm/tesseract.js@5.1.1/dist/tesseract.min.js",
    "/npm/tesseract.js@5.1.1/dist/worker.min.js",
]

# Imports inside jsDelivr +esm bundles: from"/npm/...", import"/npm/...", import("/npm/...")
IMPORT_RE = re.compile(r'''((?:from|import)\s*\(?\s*)(["'])(/npm/[^"']+)\2''')
SOURCEMAP_RE = re.compile(r"\n?//# sourceMappingURL=\S+\s*$")


def local_path(npm_path):
    """Map '/npm/pkg@ver/sub/+esm' to 'assets/vendor/pkg@ver/sub.esm.js'."""
    p = npm_path[len("/npm/"):]
    if p.endswith("/+esm"):
        p = p[: -len("/+esm")]
        # '@scure/bip32@1.7.0' (package root) -> '@scure/bip32@1.7.0/index'
        if re.fullmatch(r"(@[^/]+/)?[^/@]+@[^/]+", p):
            p += "/index"
        p = re.sub(r"\.js$", "", p) + ".esm.js"
    return posixpath.join(VENDOR, p)


def fetch(npm_path):
    with urllib.request.urlopen(CDN + npm_path, timeout=60) as r:
        return r.read()


def vendor_all():
    done = {}  # npm path -> local path
    queue = list(ENTRIES)
    while queue:
        npm_path = queue.pop()
        if npm_path in done:
            continue
        dest = local_path(npm_path)
        data = fetch(npm_path)
        if npm_path.endswith("+esm"):
            text = data.decode("utf-8")
            text = SOURCEMAP_RE.sub("\n", text)

            def rewrite(m):
                dep = m.group(3)
                queue.append(dep)
                rel = posixpath.relpath(local_path(dep), posixpath.dirname(dest))
                if not rel.startswith("."):
                    rel = "./" + rel
                return f"{m.group(1)}{m.group(2)}{rel}{m.group(2)}"

            data = IMPORT_RE.sub(rewrite, text).encode("utf-8")
        os.makedirs(os.path.join(ROOT, os.path.dirname(dest)), exist_ok=True)
        with open(os.path.join(ROOT, dest), "wb") as f:
            f.write(data)
        done[npm_path] = dest
    return done


def site_files(only=()):
    for d, dirs, files in os.walk(ROOT):
        rel = os.path.relpath(d, ROOT)
        if rel.startswith("assets/vendor"):
            dirs[:] = []
            continue
        if only and rel != "." and rel.split(os.sep)[0] not in only:
            dirs[:] = []
            continue
        if only and rel == ".":
            continue
        for name in files:
            if name.endswith((".html", ".js", ".mjs")):
                yield os.path.join(rel, name) if rel != "." else name


def rewrite_references(done, only=()):
    changed = []
    for rel in site_files(only):
        full = os.path.join(ROOT, rel)
        with open(full, encoding="utf-8") as f:
            text = f.read()
        new = text
        for npm_path, dest in done.items():
            url = CDN + npm_path
            if url in new:
                target = posixpath.relpath(dest, posixpath.dirname(rel.replace(os.sep, "/")))
                if not target.startswith("."):
                    target = "./" + target
                new = new.replace(url, target)
        if new != text:
            with open(full, "w", encoding="utf-8") as f:
                f.write(new)
            changed.append(rel)
    return changed


def write_manifest(done):
    lines = ["# Vendored libraries", "",
             "Copied from jsDelivr by `scripts/vendor.py`. Do not edit by hand; rerun the script.", "",
             "| Source | Local file | SHA-256 |", "|---|---|---|"]
    for npm_path, dest in sorted(done.items(), key=lambda kv: kv[1]):
        with open(os.path.join(ROOT, dest), "rb") as f:
            digest = hashlib.sha256(f.read()).hexdigest()[:16]
        lines.append(f"| `{CDN}{npm_path}` | `{dest[len(VENDOR) + 1:]}` | `{digest}…` |")
    with open(os.path.join(ROOT, VENDOR, "VENDOR.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")


def main():
    only = tuple(a.strip("/") for a in sys.argv[1:])
    done = vendor_all()
    changed = rewrite_references(done, only)
    write_manifest(done)
    print(f"vendored {len(done)} files, rewrote references in {len(changed)} files")


if __name__ == "__main__":
    main()
