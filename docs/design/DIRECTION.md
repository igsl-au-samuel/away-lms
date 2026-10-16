# Design direction — DRAFT (finalise in Phase 1)

## Concept: "Postcards from time off"
Leave is time *away*, so every request is a postcard and every approval gets a postmark.
The same motif carries the project story: the docs and presentation are "the journey".
One visual system is used for the app, documentation and presentation.

## Palette (tokens)
| Token | Light | Dark | Use |
|---|---|---|---|
| `--paper` | #F6F1E7 | #14161F | background |
| `--card` | #FFFDF8 | #1C1F2B | surfaces |
| `--ink` | #1E2A3A | #E9E4D8 | text |
| `--line` | #D9CFBE | #2E3242 | borders, perforations |
| `--tangerine` | #E8643A | #F07A52 | primary action (fills / large text only) |
| `--tangerine-ink` | #B8461F | #F59A78 | small accent text on paper |
| `--sea` | #2F8F83 | #4FB3A6 | approved |
| `--sun` | #E3A63B | #F0BE5E | pending |
| `--clay` | #B4483C | #D9695C | declined |

Contrast: tangerine (#E8643A) on paper is about 3:1, so it's only used for fills
with ink text or for large type. Status is never shown by colour alone: always a
label plus an icon.

## Type (Google Fonts, free)
- Headings: **Fraunces** (soft variable serif, optical sizing)
- Body/UI: **Instrument Sans**
- Dates, IDs, numbers: **JetBrains Mono**

## Motifs (use sparingly)
- Perforated "stamp" edge on status badges and leave cards
- Circular postmark for approved requests (date inside)
- Dashed airmail stripe as a section accent, not everywhere
- Calendar month as a grid of postcards; 14px radius; generous whitespace

## Avoid
Purple SaaS gradients, glassmorphism, stock illustrations, emoji as UI icons.
