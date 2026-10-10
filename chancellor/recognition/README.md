# NGLG Recognition

Two standalone HTML files — no build step, no dependencies.

| File | What it is |
|---|---|
| [`builder.html`](builder.html) | **NGLG Recognition Builder** — the authoring tool. |
| [`regularity-2026august.html`](regularity-2026august.html) | **NGLG Regularity.0** — the rendered August 2026 edition (preview). |
| [`index.html`](index.html) | Landing page linking to both. |

## Live preview

Published with GitHub Pages:

- Landing: `https://nglg-gsec.github.io/Grand-Chancellor/recognition/`
- Builder: `https://nglg-gsec.github.io/Grand-Chancellor/recognition/builder.html`
- Preview: `https://nglg-gsec.github.io/Grand-Chancellor/recognition/regularity-2026august.html`

## Running locally

Just open the files in a browser, or serve the folder:

```bash
python3 -m http.server 8000
```

Then visit http://localhost:8000

## Publishing an update

Export from the builder with **⬇ Download HTML**, then:

Double-click **`publish.command`** in Finder, or from a terminal:

```bash
cd ~/Grand-Chancellor && ./recognition/publish.sh
```

It picks up the newest `.html` in `~/Downloads`, shows you what it found, asks
for confirmation, then commits, pushes, and waits for the Pages build.

```bash
./publish.sh path/to/file.html                 # publish a specific file
./publish.sh file.html regularity-2026sep.html # publish as a new edition
./publish.sh -y                                # skip the confirmation
```

Note: the builder's **Save** button stores versions in your browser (IndexedDB)
only — they are not in this repo. **Download HTML** is the portable copy.

## Linking a line in the builder

In **Cities — one per line** and **Appendant bodies — one per line**, a line that
starts with `http://` or `https://` renders as a blue underlined link. Add an
optional display phrase after `::`:

```
Athens
https://nglgreece.org/el/lodge-buildings/ :: View all Lodge Buildings
https://example.org/report
```

Link lines are not click-to-editable in the preview — edit them in the field on
the left, so the URL is never overwritten by the visible text.

## Publishing straight from the builder

The builder has an **⬆ Publish to GitHub** button that commits the current
version directly to `recognition/regularity-2026august.html` — no download/upload step.

It needs a **fine-grained personal access token**, created once at
[github.com/settings/personal-access-tokens/new](https://github.com/settings/personal-access-tokens/new):

- **Repository access:** Only select repositories → `Grand-Chancellor`
- **Permissions:** Repository permissions → **Contents: Read and write**

Paste it into the dialog the first time. It is stored in that browser's
IndexedDB only — never in the repo, never in an exported file, never in a
saved version. Use **Forget it** in the dialog to remove it, and revoke the
token on GitHub if a browser is lost.
