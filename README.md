# Grand Secretary — National Grand Lodge of Greece

The way in to the work of the Secretariat. This repository holds the main portal and the **Ψηφιακή Μεγάλη Γραμματεία** app (`app/`, runs on GitHub Pages only).

**Portal:** https://nglg-gsec.github.io/NGLG-Grand-Secretary/

## 🔑 Ψηφιακή Μεγάλη Γραμματεία

### 👉 [Άνοιγμα της εφαρμογής](https://nglg-gsec.github.io/NGLG-Grand-Secretary/app/)

`https://nglg-gsec.github.io/NGLG-Grand-Secretary/app/`

Τρέχει **μόνο στο GitHub** (χωρίς Render, χωρίς κόστος)· τα δεδομένα φυλάσσονται στο ιδιωτικό αποθετήριο
`NGLG-GSEC/nglg-grammateia-data`. Πρώτη χρήση και μεταφορά δεδομένων: [app/README.md](app/README.md).

Απευθείας σύνδεσμοι:
[Νέα Επιστολή](https://nglg-gsec.github.io/NGLG-Grand-Secretary/app/#/letters/new) · [Νέο Διάταγμα](https://nglg-gsec.github.io/NGLG-Grand-Secretary/app/#/decrees/new) · [Επισκέψεις Στοών](https://nglg-gsec.github.io/NGLG-Grand-Secretary/app/#/visits) ·
[Εορτολόγιο](https://nglg-gsec.github.io/NGLG-Grand-Secretary/app/#/namedays) · [Πρότζεκτ ΜΔ](https://nglg-gsec.github.io/NGLG-Grand-Secretary/app/#/projects) · [Κατάλογος](https://nglg-gsec.github.io/NGLG-Grand-Secretary/app/#/directory) · [Μητρώο Μελών](https://nglg-gsec.github.io/NGLG-Grand-Secretary/app/#/members) ·
[Βάση Δεδομένων](https://nglg-gsec.github.io/NGLG-Grand-Secretary/app/#/database)

## Main sections

| Section | Where it lives | Opens |
| --- | --- | --- |
| **Ψηφιακή Μεγάλη Γραμματεία** | `app/` in this repository (GitHub Pages only) — guide and code map in [`app/README.md`](app/README.md) | one app for the whole Secretariat: letters & decrees with protocol numbers, lodge visits & Grand Master's representatives, name days & greetings, Grand Master's projects, directory of provinces & lodges, member registry, Epeteirida |
| **Ψηφιακό Έντυπο Διατάγματος** | `diatagma/` in this repository | decree form with live preview, PNG / A4 PDF export, automatic background removal for emblem and signature |
| Registration forms | [`dskiad/nglg-registration-forms`](https://github.com/dskiad/nglg-registration-forms) | the register, with the live forms linked from it |
| Τεκτονικές Ομιλίες | [`dskiad/nglg-tektonikes-omilies`](https://github.com/dskiad/nglg-tektonikes-omilies) | [the library](https://dskiad.github.io/nglg-tektonikes-omilies/) |
| Bear Bell Ritual | [`dskiad/bear-bell-ritual`](https://github.com/dskiad/bear-bell-ritual) | restricted application |

## Παλιά έκδοση (letter-manager, Render)

Ο φάκελος `letter-manager/` και το `render.yaml` είναι η παλιά έκδοση με διακομιστή στο Render. Αντικαταστάθηκαν από την
εφαρμογή `app/`, που τρέχει μόνο στο GitHub Pages. Διατηρούνται προσωρινά, μόνο για τη μεταφορά των δεδομένων
(βλ. [app/README.md](app/README.md)). Μετά τη μεταφορά διαγράφονται μαζί με την υπηρεσία στο Render.

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
