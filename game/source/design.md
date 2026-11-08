# Cozy Island - design spec

The interface is a quiet frame around a warm low-poly island. It should feel like a
well-made indie game (Dorfromantik, A Short Hike): few elements, warm material, clear
type, nothing that shouts.

## Principles
- The island is the hero. Panels sit in corners, stay small and get out of the way.
- One icon language: the inline SVG line sprite (`#icon-sprite`, 1.75 stroke, round caps).
- No emoji anywhere: not in markup, not in strings built at runtime.
- Plain, calm voice. Sentence case. Short verbs ("Cast", "Water", "Back").

## Tokens (`:root` in `app/index.html`; a theme only changes tokens)

Current theme: **Paper** - warm light panels `rgba(255, 252, 246, 0.86)` with a 14 px frosted blur,
ink text `#1F2A2E`, one terracotta accent `#C8643F` on white, radius 16 px.
Chosen from four judged directions (Linen, Slate glass, Dusk teal, Paper).
| token | role |
|---|---|
| `--panel`, `--panel-strong` | panel material, frosted |
| `--panel-border` | hairline edge |
| `--cream` | text on panels |
| `--ink-rgb` | tint for hovers, chips, dividers: `rgba(var(--ink-rgb), a)` |
| `--accent`, `--accent-fg` | the one active colour (current activity, primary button) |
| `--radius` | panel radius; chips are pill shaped, rows 8 px |
| `--font-ui`, `--font-display` | system UI text and display headings |

Alpha steps for tints: 0.08 (rest), 0.12 (chip), 0.16 (hover / bar track), 0.18 (divider).

## Type
- UI text: system UI (Segoe UI Variable, -apple-system, system-ui). No Inter, no web font download.
- Display headings: Avenir Next / Segoe UI Variable Display, 700. Sizes 12.5 / 13 / 15 / 21 / 24 px.
- Live state values (season, time, weather) are set in 600 weight so they read as values, not actions.

## Spacing
4 px grid: 4, 8, 12, 16, 24. Panels pad 14x18 on desktop, 10x12 on phones.

## Touch
Every control is at least 44x44 px on touch screens. Phones keep the island visible:
a slim activity strip on top (portrait) or a narrow rail (landscape) and a short bottom sheet.
In landscape the sheet keeps places and tools on one short row each, labels beside icons (about 38 % of the height).
Steppers use chevron icons with plain labels ("Previous", "Next"); the menu toggle is "Hide" / "Menu" with a chevron.

## Banned
Emoji, gradient text, neon glow, purple-blue gradients, Inter, drop shadows heavier than
0 10px 30px at 0.22, more than one accent colour.
