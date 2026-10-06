# Grand Secretary — National Grand Lodge of Greece

The way in to the work of the Secretariat. Everything opens at one address: the **Ψηφιακή Μεγάλη Γραμματεία** app, with the portal of all other sections inside it (menu «🏛 Πύλη»). Runs on GitHub Pages only.

**Portal:** https://nglg-gsec.github.io/NGLG-Grand-Secretary/

## 🔑 Ψηφιακή Μεγάλη Γραμματεία

### 👉 [Άνοιγμα της εφαρμογής](https://nglg-gsec.github.io/NGLG-Grand-Secretary/)

`https://nglg-gsec.github.io/NGLG-Grand-Secretary/`

Τρέχει **μόνο στο GitHub** (χωρίς Render, χωρίς κόστος)· τα δεδομένα φυλάσσονται στο ιδιωτικό αποθετήριο
`NGLG-GSEC/nglg-grammateia-data`. Πρώτη χρήση και μεταφορά δεδομένων: [docs/ΕΦΑΡΜΟΓΗ.md](docs/ΕΦΑΡΜΟΓΗ.md).

Απευθείας σύνδεσμοι:
[Νέα Επιστολή](https://nglg-gsec.github.io/NGLG-Grand-Secretary/#/letters/new) · [Νέο Διάταγμα](https://nglg-gsec.github.io/NGLG-Grand-Secretary/#/decrees/new) · [Επισκέψεις Στοών](https://nglg-gsec.github.io/NGLG-Grand-Secretary/#/visits) ·
[Εορτολόγιο](https://nglg-gsec.github.io/NGLG-Grand-Secretary/#/namedays) · [Πρότζεκτ ΜΔ](https://nglg-gsec.github.io/NGLG-Grand-Secretary/#/projects) · [Κατάλογος](https://nglg-gsec.github.io/NGLG-Grand-Secretary/#/directory) · [Μητρώο Μελών](https://nglg-gsec.github.io/NGLG-Grand-Secretary/#/members) ·
[Βάση Δεδομένων](https://nglg-gsec.github.io/NGLG-Grand-Secretary/#/database)

## Main sections

| Section | Where it lives | Opens |
| --- | --- | --- |
| **Ψηφιακή Μεγάλη Γραμματεία** | root of this repository (`index.html`, `core/`, `modules/`) — guide and code map in [`docs/ΕΦΑΡΜΟΓΗ.md`](docs/ΕΦΑΡΜΟΓΗ.md) | one app for the whole Secretariat: letters & decrees with protocol numbers, lodge visits & Grand Master's representatives, name days & greetings, Grand Master's projects, directory of provinces & lodges, member registry, Epeteirida |
| **Ψηφιακό Έντυπο Διατάγματος** | `diatagma/` in this repository | decree form with live preview, PNG / A4 PDF export, automatic background removal for emblem and signature |
| Registration forms | [`dskiad/nglg-registration-forms`](https://github.com/dskiad/nglg-registration-forms) | the register, with the live forms linked from it |
| Τεκτονικές Ομιλίες | [`dskiad/nglg-tektonikes-omilies`](https://github.com/dskiad/nglg-tektonikes-omilies) | [the library](https://dskiad.github.io/nglg-tektonikes-omilies/) |
| Bear Bell Ritual | [`dskiad/bear-bell-ritual`](https://github.com/dskiad/bear-bell-ritual) | restricted application |

## Παλιά έκδοση (letter-manager, Render)

Ο φάκελος `letter-manager/` και το `render.yaml` είναι η παλιά έκδοση με διακομιστή στο Render. Αντικαταστάθηκαν από την
νέα εφαρμογή (ρίζα του αποθετηρίου), που τρέχει μόνο στο GitHub Pages. Διατηρούνται προσωρινά, μόνο για τη μεταφορά των δεδομένων
(βλ. [docs/ΕΦΑΡΜΟΓΗ.md](docs/ΕΦΑΡΜΟΓΗ.md)). Μετά τη μεταφορά διαγράφονται μαζί με την υπηρεσία στο Render.

## The three offices

| Office | Body | Repository |
| --- | --- | --- |
| Grand Chancellor | National Grand Lodge of Greece | [`Grand-Chancellor`](https://github.com/dskiad/Grand-Chancellor) |
| Grand Secretary | National Grand Lodge of Greece | this repository |
| Grand Secretary | Masonic Order of Athelstan | [`ATHELSTAN-GRAND-SECRETARY`](https://github.com/dskiad/ATHELSTAN-GRAND-SECRETARY) |

## GitHub Pages

The workflow in `.github/workflows/pages.yml` publishes the static portal on every push to `main`.

---

**National Grand Lodge of Greece — Grand Secretariat**
