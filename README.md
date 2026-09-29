# Grand Secretary — National Grand Lodge of Greece

The way in to the work of the Secretariat. This repository holds the main portal and the new **NGLG Letter Manager**.

**Portal:** https://dskiad.github.io/NGLG-GRAND-SECRETARY/

## Main sections

| Section | Where it lives | Opens |
| --- | --- | --- |
| **NGLG Letter Manager** | `letter-manager/` in this repository | secure letter creation, protocol numbering, templates, archive, OTP access and final Gmail hand-off |
| **Ψηφιακό Έντυπο Διατάγματος** | `diatagma/` in this repository | decree form with live preview, PNG / A4 PDF export, automatic background removal for emblem and signature |
| Registration forms | [`dskiad/nglg-registration-forms`](https://github.com/dskiad/nglg-registration-forms) | the register, with the live forms linked from it |
| Τεκτονικές Ομιλίες | [`dskiad/nglg-tektonikes-omilies`](https://github.com/dskiad/nglg-tektonikes-omilies) | [the library](https://dskiad.github.io/nglg-tektonikes-omilies/) |
| Bear Bell Ritual | [`dskiad/bear-bell-ritual`](https://github.com/dskiad/bear-bell-ritual) | restricted application |

## NGLG Letter Manager

**Live application:** https://nglg-letter-manager.onrender.com

The secure Secretariat application is in:

```
letter-manager/
```

It provides:

- automatic protocol number and date,
- official letterhead, signature and seal,
- subject, recipient, email and body fields,
- reusable letter templates,
- archive and search,
- “New from this letter” workflow,
- access by approved email + OTP,
- per-user template permissions,
- “Ready to send” workflow,
- final Gmail hand-off using `grand.secretary@nglgreece.gr`.

Detailed documentation: [letter-manager/README.md](letter-manager/README.md)

## Live deployment

The repository includes a root-level `render.yaml` Blueprint for deploying the FastAPI application on Render with a persistent disk.

GitHub Pages continues to publish the static Secretariat portal. The Letter Manager itself needs a Python/Docker backend and persistent storage, so it is deployed separately.

Before production access, configure the SMTP secret for OTP delivery and keep:

```
DEV_SHOW_OTP=0
COOKIE_SECURE=1
```

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
