# Design direction — "Ledger"

Professional, business-grade, and calm. It should feel like trusted HR or finance
software. **One system is used for the app, the documentation and the presentation.**
Decided 2026-10-16. See `docs/decisions/0002-visual-direction-ledger.md`.

## Principles
- Clarity over decoration: borders and spacing, not shadows or gradients.
- Data first: tables, balances and calendars must scan quickly.
- One accent (teal) for actions; navy is brand and structure; status colours are only for status.
- Status is never shown by colour alone: always a text label (plus an icon where useful).

## Colour tokens
| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | #F5F7FA | #0E1420 | page background |
| `--surface` | #FFFFFF | #151D2B | cards, tables, panels |
| `--surface-sunken` | #EEF1F5 | #1B2535 | stat tiles, table header, inputs |
| `--border` | #E1E5EB | #2A3547 | hairlines, dividers |
| `--text` | #1B2433 | #E6EAF0 | body text |
| `--text-muted` | #5B6676 | #9AA5B5 | labels, metadata |
| `--brand` | #13294B | #0B1A30 | sidebar/top bar, headings accent |
| `--on-brand` | #FFFFFF | #E6EAF0 | text on brand |
| `--accent` | #0E7C7B | #2FA3A1 | primary buttons, links, focus ring |
| `--accent-hover` | #0B6867 | #45B5B3 | hover |
| `--on-accent` | #FFFFFF | #0E1420 | text on accent |

Status (badge background / text):
| Status | Light | Dark |
|---|---|---|
| Approved | #E3F2EE / #0B5E4F | #12352F / #7FD3C1 |
| Pending | #FBF0DC / #7A4E06 | #3A2C10 / #F2C772 |
| Declined | #FBE6E4 / #9B2C22 | #3D1A17 / #F19A90 |
| Cancelled | #EEF1F5 / #5B6676 | #1B2535 / #9AA5B5 |

Chart series (docs and presentation): teal #0E7C7B · navy #13294B · slate #8A96A8 · amber #C98A1B.
Keep these away from status meanings.

## Typography (Google Fonts, free)
- **IBM Plex Sans** for everything (400 body, 500 labels/buttons, 600 headings)
- **IBM Plex Mono** for dates, request IDs, day counts (tabular figures)
- Scale: 12 · 14 (base UI) · 16 (body) · 20 · 24 · 32. Sentence case for all labels and buttons.

## Shape, space, icons
- 4px spacing grid · radius 6px (controls), 8px (cards) · 1px borders
- Table rows 44px; touch targets ≥ 40px
- Icons: Lucide (MIT) outline, 1.5px stroke, 16–20px

## Layout
- Desktop: navy left sidebar (logo "Away", nav), content on `--bg`, max width 1200px.
- Mobile: navy top bar plus bottom tab bar; tables collapse to stacked rows.
- Key screens: Dashboard (balances, upcoming leave, pending approvals), Request leave
  (form + balance preview), Team calendar (month grid, people as rows), Approvals
  (manager queue), Admin (leave types, policies, users).

## Documentation and presentation
Navy title bands, white body, teal for highlights and links, Plex throughout.
Use the same status badges and chart palette in screenshots and diagrams.

## Avoid
Gradients, glassmorphism, heavy shadows, illustrations or mascots, emoji in UI,
more than one accent colour, playful copy.
