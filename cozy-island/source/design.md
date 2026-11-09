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

Current theme: **Paper** - warm light panels `rgba(255, 251, 245, 0.93)` with a 14 px frosted blur and a soft
two-layer warm shadow, ink text `#1F2A2E`, one terracotta accent `#C8643F`, radius 16 px. Tiles sit on the panel as
warm cream cards (`--tile`) with a hairline (`--tile-line`); icons on tiles are a deep clay `#8A4A2E`.
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
- Display headings: a warm book serif (Iowan Old Style, Palatino Linotype, Georgia), 600. Used only for the
  panel title and the activity card title, so it reads as the game's voice. Sizes 12.5 / 13 / 15 / 21 / 24 px.
- The panel title carries a small line island mark in the accent colour.
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

## Behaviour notes (round 4)
- Phone landscape: the island sheet shows one row of places; **More** opens the tool row. Activity panels sit
  bottom-right (max 420 px wide) so the scene stays in view.
- One panel per activity: the activity hint is a quiet last line inside its HUD, not a separate toast.
- Tool chips show values as words ("Autumn", "Day", "Clear"); exact values live in the tooltip.
  Focus looks pressed while a session runs; Sound dims when muted. Desk mode spans two cells.
- Key badges (1-7, Esc) are outlined and quiet: present for keyboard users, not shouting.

## Behaviour notes (round 5)
- One tile language everywhere: the seven places plus the island Journal are eight equal tiles (icon above a
  short name). Desktop and phone portrait lay them out 4 x 2; phone landscape puts all eight on one row with the
  icon beside the name. Number keys (1-7, J) sit faintly in the tile corner on desktop only.
- The same short names are used in every list: Fishing, Garden, Tea, Birds, Sunset, Village, Cooking.
  Full names stay in tooltips and accessible names.
- Tools are a quieter second tier under a hairline: no fill until hovered. Desktop shows them as a 3 x 2 grid of
  icon + word (Focus, season, time, weather, Sound, Desk mode); phones show one plain row of five.
- Activity switcher on phones (portrait): icons only, the current place keeps its name, back is a plain arrow;
  all eight fit on screen without scrolling. Desktop rail drops the key badges (they live in tooltips).
- Copy: sentences, not dashes ("Plant something now. It grows while you work.").

## Behaviour notes (round 6, URL /cozy-island/)
- The game, its source and screenshots live under /cozy-island/; /game/ is a redirect stub that keeps query and hash.
- Phones fold the settings row behind one Settings button (Settings / Done) so the scene stays open; the
  activity tiles stay a 4 x 2 grid (a single cramped row lost the pairwise council 0-2).
- Settings read as name + value: Season [Autumn], Time [Day], Weather [Clear], Sound [On], Focus [Off].
  Sound On and a running Focus use a filled terracotta pill, so state is never colour-only guesswork.
- No shortcut badges on tiles or the rail; shortcuts live in tooltips and the intro line ("press 1-7").
- Phone activity tabs show a short label under every icon, not only the current one.
- Fishing card: one progress line (Caught, Journal, biting now); the rain cue only appears while it rains.
- Focus pill: only shown while a session runs (it used to lose its panel class and sit invisible under the
  scene, intercepting taps). Landscape activity cards are slimmer (no hint line, 38 px chips).
