#!/usr/bin/env python3
"""Regenerate the site's index pages from assets/tools.json.

Writes the home page, each toolbox's index page, the search index used by
the home page, and the toolbox table in README.md. Creates a placeholder page
for any tool listed in tools.json that has no page yet. A tool counts as
ready once its page no longer contains the placeholder marker.

Run from anywhere: python3 scripts/generate.py
While some sections are still being written, pass them as --wip a,b: their tool
pages are left untouched and shown as not ready.
"""
import argparse
import hashlib
import html
import json
import os
import re
import subprocess
import urllib.parse

# The repository holds tooling (scripts/, tests/); the published site itself lives in src/.
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROOT = os.path.join(REPO, "src")
PLACEHOLDER_MARKER = 'class="placeholder"'


def path(*parts):
    return os.path.join(ROOT, *parts)


def esc(s):
    return html.escape(s, quote=True)


def favicon(emoji):
    svg = ("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'>"
           f"<text y='.9em' font-size='90'>{emoji}</text></svg>")
    return "data:image/svg+xml," + urllib.parse.quote(svg, safe=" =:/'<>")


# Tags every page needs for the installable, offline-capable app (PWA).
PWA_HEAD = """  <link rel="manifest" href="/manifest.webmanifest">
  <link rel="apple-touch-icon" href="/assets/icons/apple-touch-icon.png">
  <meta name="theme-color" content="#f7f7f5" media="(prefers-color-scheme: light)">
  <meta name="theme-color" content="#161615" media="(prefers-color-scheme: dark)">
  <script src="/assets/pwa.js" defer></script>
"""


def head(title, emoji, css):
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{esc(title)}</title>
  <link rel="icon" href="{favicon(emoji)}">
  <link rel="stylesheet" href="{css}">
{PWA_HEAD}</head>
<body>
<main>
"""


TAGLINE = "Local-first browser tools — everyday, dev & crypto. Nothing leaves your device."
ON_DEMAND_NOTE = "Not counting the video converter and OCR engines, which download on first use."


def set_footer(size_label):
    """Build the footer shown on every page; it includes the size of the whole site."""
    global FOOTER, FOOT
    FOOTER = f"""<footer class="site-footer">
  <span>Runs entirely in your browser and works offline · <span title="{ON_DEMAND_NOTE}">Whole site: {size_label}</span></span>
  <a href="https://github.com/ai-pavel/ai-pavel.github.io">Source on GitHub</a>
</footer>
"""
    FOOT = "</main>\n" + FOOTER + "</body>\n</html>\n"


set_footer("…")


def write(rel, content):
    with open(path(rel), "w", encoding="utf-8") as f:
        f.write(content)


def ensure_page_chrome(rel):
    """Give a hand-written tool page the shared footer and PWA tags if it lacks them."""
    with open(path(rel), encoding="utf-8") as f:
        page = f.read()
    new = re.sub(r'<footer class="site-footer">.*?</footer>\n', FOOTER, page, count=1, flags=re.S)
    if 'class="site-footer"' not in new and "</main>\n" in new:
        new = new.replace("</main>\n", "</main>\n" + FOOTER, 1)
    if 'rel="manifest"' not in new:
        new = new.replace("</head>", PWA_HEAD + "</head>", 1)
    if new != page:
        write(rel, new)


def is_ready(toolbox_id, slug):
    page = path(toolbox_id, slug, "index.html")
    with open(page, encoding="utf-8") as f:
        return PLACEHOLDER_MARKER not in f.read()


def ensure_placeholder(tb, tool):
    page = path(tb["id"], tool["slug"], "index.html")
    if os.path.exists(page):
        return
    os.makedirs(os.path.dirname(page), exist_ok=True)
    title = f'{tool["emoji"]} {tool["name"]}'
    write(os.path.relpath(page, ROOT), head(tool["name"], tool["emoji"], "../../assets/style.css") + f"""  <a class="back" href="../">← {esc(tb["name"])}</a>
  <h1>{esc(title)}</h1>
  <p class="lead">{esc(tool["description"])}.</p>
  <p {PLACEHOLDER_MARKER}>Coming soon.</p>
""" + FOOT)


def toolbox_page(tb):
    title = f'{tb["emoji"]} {tb["name"]}'
    out = head(tb["name"], tb["emoji"], "../assets/style.css") + f"""  <a class="back" href="../">← Home</a>
  <h1>{esc(title)}</h1>
  <p class="lead">{esc(tb["lead"])}</p>
"""
    for cat in tb["categories"]:
        out += f'  <h2>{esc(cat["name"])}</h2>\n  <div class="grid">\n'
        for t in cat["tools"]:
            cls = "card" if t["ready"] else "card soon"
            out += (f'    <a class="{cls}" href="{t["slug"]}/"><strong>{esc(t["emoji"])} {esc(t["name"])}</strong>'
                    f'<span>{esc(t["description"])}</span></a>\n')
        out += "  </div>\n"
    write(os.path.join(tb["id"], "index.html"), out + FOOT)


def count_label(tools):
    ready = sum(t["ready"] for t in tools)
    return f"{len(tools)} tools" if ready == len(tools) else f"{ready} of {len(tools)} tools ready"


def home_page(toolboxes, total):
    out = head("AI Pavel", "🤖", "assets/style.css") + f"""  <h1>🤖 AI Pavel</h1>
  <p class="lead">{esc(TAGLINE)}</p>

  <div class="search" id="search">
    <input id="search-input" type="search" placeholder="Search {total} tools…" autocomplete="off" spellcheck="false"
      role="combobox" aria-expanded="false" aria-controls="search-results" aria-autocomplete="list" aria-label="Search tools">
    <kbd class="search-hint">/</kbd>
    <ul id="search-results" class="search-results" role="listbox" hidden></ul>
  </div>

  <div class="grid grid-large">
"""
    for tb in toolboxes:
        tools = [t for c in tb["categories"] for t in c["tools"]]
        out += f"""    <a class="card card-large" href="{tb["id"]}/">
      <span class="card-emoji">{tb["emoji"]}</span>
      <strong>{esc(tb["name"])}</strong>
      <span>{esc(tb["summary"])}</span>
      <span class="card-meta">{count_label(tools)}</span>
    </a>
"""
    out += """  </div>
<script src="assets/search-index.js"></script>
<script src="assets/search.js"></script>
"""
    write("index.html", out + FOOT)


def search_index(toolboxes):
    entries = []
    for tb in toolboxes:
        for cat in tb["categories"]:
            for t in cat["tools"]:
                entries.append({
                    "url": f'{tb["id"]}/{t["slug"]}/',
                    "emoji": t["emoji"],
                    "name": t["name"],
                    "description": t["description"],
                    "keywords": t.get("keywords", ""),
                    "category": cat["name"],
                    "toolbox": tb["name"],
                    "toolboxEmoji": tb["emoji"],
                    "ready": t["ready"],
                })
    body = json.dumps(entries, ensure_ascii=False, indent=0).replace("\n", "")
    write(os.path.join("assets", "search-index.js"),
          "// Generated by scripts/generate.py from assets/tools.json. Do not edit.\n"
          f"window.TOOLS = {body};\n")


def readme_table(toolboxes):
    rows = ["| Toolbox | What's inside | Tools | Folder |", "|---|---|---|---|"]
    for tb in toolboxes:
        tools = [t for c in tb["categories"] for t in c["tools"]]
        summary = tb["summary"].rstrip(".")
        rows.append(f'| [{tb["emoji"]} {tb["name"]}](https://ai-pavel.github.io/{tb["id"]}/) | {summary} '
                    f'| {count_label(tools).replace(" tools", "")} | [`src/{tb["id"]}/`](src/{tb["id"]}/) |')
    with open(os.path.join(REPO, "README.md"), encoding="utf-8") as f:
        readme = f.read()
    new = re.sub(r"(<!-- toolboxes:start -->\n)(?:.*?\n)?(<!-- toolboxes:end -->)",
                 lambda m: m.group(1) + "\n".join(rows) + "\n" + m.group(2), readme, flags=re.S)
    with open(os.path.join(REPO, "README.md"), "w", encoding="utf-8") as f:
        f.write(new)


# Files the service worker should not precache.
PRECACHE_SKIP_DIRS = ()
PRECACHE_SKIP_FILES = {"README.md", "sw.js", ".gitignore", ".nojekyll", "VENDOR.md", "LICENSE", "LICENSE.md"}


COMMITTED_SIZES = {}


def committed_files(folder):
    """Files under folder as committed to git (ignores uncommitted work in progress)."""
    out = subprocess.run(["git", "ls-tree", "-r", "-l", "HEAD", "--", folder],
                         cwd=ROOT, capture_output=True, text=True, check=True)
    files = []
    for line in out.stdout.splitlines():
        meta, name = line.split("\t", 1)
        COMMITTED_SIZES[name] = int(meta.split()[3])
        files.append(name)
    return files


def site_files(wip=()):
    """Every file the site serves (and the service worker precaches), relative to ROOT.

    For sections still being written only committed files count, so the service
    worker never lists a file that isn't deployed yet.
    """
    files = []
    for d, dirs, names in os.walk(ROOT):
        rel_dir = os.path.relpath(d, ROOT)
        top = rel_dir.split(os.sep)[0]
        if top in PRECACHE_SKIP_DIRS:
            dirs[:] = []
            continue
        if top in wip:
            if rel_dir == top:
                files += [f for f in committed_files(top)
                          if os.path.basename(f) not in PRECACHE_SKIP_FILES and not f.endswith(".md")]
            dirs[:] = []
            continue
        dirs.sort()
        for name in sorted(names):
            if name in PRECACHE_SKIP_FILES or name.startswith(".") or name.endswith(".md"):
                continue
            files.append(os.path.normpath(os.path.join(rel_dir, name)).replace(os.sep, "/"))
    return files


def size_label(files):
    total = sum(COMMITTED_SIZES.get(r) or os.path.getsize(path(r)) for r in files)
    return f"{total / 1e6:.1f} MB"


def service_worker(wip=()):
    """Write sw.js with the list of site files to precache and a content-based version."""
    files = site_files(wip)
    digest = hashlib.sha256()
    urls = []
    for rel in files:
        with open(path(rel), "rb") as f:
            digest.update(rel.encode() + b"\0" + f.read())
        # Pages are linked as directories ("evm/"), so cache them under that URL.
        url = "/" + (rel[: -len("index.html")] if rel.endswith("index.html") else rel)
        urls.append(url)
    with open(os.path.join(REPO, "scripts", "sw.template.js"), encoding="utf-8") as f:
        template = f.read()
    sw = (template.replace("__VERSION__", digest.hexdigest()[:12])
                  .replace("__PRECACHE__", json.dumps(urls, indent=2)))
    write("sw.js", sw)
    print(f"sw.js: {len(urls)} files precached, {size_label(files)}")


def build_pages(toolboxes, wip=()):
    for tb in toolboxes:
        os.makedirs(path(tb["id"]), exist_ok=True)
        for cat in tb["categories"]:
            for t in cat["tools"]:
                ensure_placeholder(tb, t)
                if tb["id"] in wip:
                    t["ready"] = False
                    continue
                ensure_page_chrome(os.path.join(tb["id"], t["slug"], "index.html"))
                t["ready"] = is_ready(tb["id"], t["slug"])
        toolbox_page(tb)
    total = sum(len(c["tools"]) for tb in toolboxes for c in tb["categories"])
    home_page(toolboxes, total)
    search_index(toolboxes)
    readme_table(toolboxes)


# Sections whose tools must each offer an "Example" button that fills in sample input.
EXAMPLE_EXEMPT = {"utilities", "dev"}
EXAMPLE_RE = re.compile(r"<button[^>]*>\s*Example\b")


def check_examples(toolboxes, wip=()):
    """Warn about ready tool pages in crypto sections that lack an Example button."""
    missing = []
    for tb in toolboxes:
        if tb["id"] in EXAMPLE_EXEMPT or tb["id"] in wip:
            continue
        for cat in tb["categories"]:
            for t in cat["tools"]:
                rel = os.path.join(tb["id"], t["slug"], "index.html")
                with open(path(rel), encoding="utf-8") as f:
                    page = f.read()
                if PLACEHOLDER_MARKER not in page and not EXAMPLE_RE.search(page):
                    missing.append(rel)
    for rel in missing:
        print(f"warning: no Example button in {rel}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--wip", default="", help="comma-separated sections still being written")
    wip = {x for x in parser.parse_args().wip.split(",") if x}
    with open(path("assets", "tools.json"), encoding="utf-8") as f:
        toolboxes = json.load(f)["toolboxes"]
    # The footer shows the site's size, and the footer is part of every page, so
    # rebuild until the rounded size stops changing (normally one extra pass).
    label = size_label(site_files(wip))
    for _ in range(5):
        set_footer(label)
        build_pages(toolboxes, wip)
        new_label = size_label(site_files(wip))
        if new_label == label:
            break
        label = new_label
    service_worker(wip)
    check_examples(toolboxes, wip)
    for tb in toolboxes:
        tools = [t for c in tb["categories"] for t in c["tools"]]
        print(f'{tb["id"]}: {count_label(tools)}')


if __name__ == "__main__":
    main()
