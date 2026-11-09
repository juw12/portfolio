# Townsquare 3D: design notes

The HUD should read like a calm game interface, not a chat app. The world (low-poly town, sky,
characters) carries the colour and personality; the HUD stays quiet, legible and consistent.

## Facts

- Audience: players on desktop (keyboard and mouse) and phones (touch, about 390 px wide).
- Surface: a full-screen three.js canvas with HUD pills, a build bar, slide-in panels (market,
  account, friends) and canvas-drawn labels over plots and producers.
- Brand: teal accent `#00758f`, dark translucent pills `rgba(20, 24, 32, 0.6-0.78)` with
  `backdrop-filter: blur(6px)`, white text, coin gold `#e9c46a`.
- Type: the system UI stack (`system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`),
  600 weight for pills, tabular numbers for money.

## References

- Lucide / Feather line icons: one 24 px grid, 2 px round stroke, `currentColor`.
- Townscaper and Animal Crossing: New Horizons HUDs: few elements, generous rounding, the
  world stays the hero.
- Apple HIG and Material guidance on icon buttons: every icon-only button has an accessible name.

## Rules

1. **No emoji anywhere in the UI, server messages or docs.** Emoji render differently per OS,
   ignore the text colour and read as placeholder design.
2. **Icons come only from `icons.js`.** Use `setLabel(element, name, text)` for icon + text and
   `icon(name)` for a bare glyph. Static markup uses `data-icon="name"`. Never build icons
   with `innerHTML`; player names stay text nodes.
3. **One style.** 24 px viewBox, stroke 2, round caps and joins, no fills. The only exceptions
   are the filled star for a starred plot and the gold coin.
4. **Icon-only buttons need `aria-label` and `title`** (sound, share, close, rotate, remove, undo).
5. **Canvas text (plot labels, producer badges, floating numbers) uses words**, for example
   "3 wheat", "needs wheat", "+20 coins", "Star from Rosa".
6. **Money is "coins"** in sentences and the gold coin icon in compact HUD spots.

## Banned defaults

- Emoji used as icons or decoration, including in toasts, feed rows and chat system names.
- Emoji fonts in `--ui-font`.
- Mixed icon sources (unicode symbols such as arrows or check marks next to SVG icons).
- Icon-only buttons without an accessible name.

## Icon set

key, user, users, volume, volume-off, news, hammer, link, star (and star-fill), trash, rotate,
undo, cart, x, check, chair, stand, coin, wheat, wood, stone, bread, planks, box, pin, basket,
load, block, slab, wall, glass, lamp, tree, pine, flower, pickaxe, oven, sawmill, home,
landmark, sprout, target, trophy, info.

Add new icons to `PATHS` in `icons.js` in the same style rather than importing another set.
