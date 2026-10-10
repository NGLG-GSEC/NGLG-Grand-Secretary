# Grand Chancellor — National Grand Lodge of Greece

The documents of the Chancery, each one a form: open it, fill in what changes,
and take away a print-ready PDF. Everything else on a sheet — the wording, the
arms, the chain collar, the seal and both signatures — is fixed.

**https://nglg-gsec.github.io/Grand-Chancellor/**

> The link goes live once GitHub Pages is enabled for this repository:
> **Settings → Pages → Build and deployment → Source: _GitHub Actions_**.
> The workflow in `.github/workflows/pages.yml` publishes every push to `main`.

## Sections

| Section | What it holds |
| --- | --- |
| [`patents/`](patents/) | patents and certificates of appointment to grand rank |
| [`recognition/`](recognition/) | the recognition builder, NGLG Regularity, the Globe of Amity |
| `letters/` | correspondence of the Chancery — in preparation |

### Patents

| Document | State |
| --- | --- |
| [Past Grand Officer](patents/past-grand-officer.html) | ready |
| Honorary Grand Officer | in preparation |

**Past Grand Officer** takes these fields:

| Field | Fills |
| --- | --- |
| `HISRANK` | the honoree's rank and office, e.g. *The Grand Master of the Masonic Order of Athelstan in England, Wales and its Provinces Overseas* |
| `HISGL` | his Grand Lodge, e.g. *United Grand Lodge of England* |
| `NAME` | the honoree, e.g. *Paul W. Johnston* |
| `TYPE` | *Appointed* or *Honorary* — switches the wording between the two, and Honorary adds an entitlement line under the Grand Lodge name |
| `RANK` | the rank he is appointed to, e.g. *PAST GRAND MASTER* |
| `DATE` | typed as **day/month/year**, e.g. *24/10/2025* — fills `DAY` and `MONTH & YEAR` below in the right form |
| `DAY` | the day of the date, e.g. *24th* |
| `MONTH & YEAR` | the rest of the date, e.g. *October 2025* |

Every text field remembers what was last typed into it, in the browser's own
storage — a small picker appears under a field once it has past entries to
offer, so filling the same document again is a click, not retyping. The body
copy scales itself down if a long rank or Grand Lodge name needs the room, so
the text always sits inside the collar.

### Recognition

Moved here from `dskiad/nglg-recognition`, which is no longer the live copy.
Its own [README](recognition/README.md) covers the builder and how an edition
is published; the paths and the repository name in it now point here.

## How the forms are built

```
assets/
  gc.css        the chrome, the sheet, the patent layout
  gc.js         the engine: fields, dates, fitting, PDF, print
  artwork.js    arms, collar, seal, drop cap, both signatures
  fonts.css     Great Vibes and Cinzel Decorative (SIL OFL)
  lib/          html2canvas and jsPDF (MIT)
```

Nothing is fetched at run time except the interface fonts, so a document
renders and exports offline — opening a page straight off the disk works too.

A form page is markup only; the engine wires it up by convention:

```html
<body data-doc="Patent" data-file="f-name,f-rank">          <!-- names the PDF -->
<input id="f-name" data-field="name" value="Paul W. Johnston">
<input id="f-date" placeholder="DD/MM/YYYY" data-day="f-day" data-monthyear="f-monthyear">
<p class="name" data-out="name"></p>                        <!-- on the sheet -->
<img class="art-header" data-art="header" alt="">           <!-- from artwork.js -->
<div class="body-copy"><div class="copy"> … </div></div>    <!-- fitted to the sheet -->
```

To add a document: copy `patents/past-grand-officer.html`, change those five
things, and add a card to the section's `index.html`.

### The sheet

Sheets are laid out at the real size of the source documents — A3 portrait,
11.6963in × 16.5in — with the artwork at the coordinates of the originals. The
clear window inside the chain collar runs from 6.28in to 12.73in down the
sheet; `.body-copy` in `assets/gc.css` holds those measurements.

`Download PDF` renders the sheet at 250 dpi into an A3 PDF. `Print` hands the
same page to the browser, where *Save as PDF* gives a sharper, text-based file.
The italic lines want *Palatino Linotype* from the system, falling back to Book
Antiqua, Palatino, then a Garamond.
