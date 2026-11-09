// One line-icon set for the whole HUD (24px grid, 2px round stroke, currentColor).
// No emoji anywhere in the UI: every symbol is an inline SVG from this file, so it
// looks the same on every OS and follows the text colour. See design.md.
const SVG_NS = 'http://www.w3.org/2000/svg';

const circle = (cx, cy, r) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;

const STAR = 'M12 2.8l2.8 5.9 6.4.8-4.7 4.5 1.2 6.4L12 17.3l-5.7 3.1 1.2-6.4-4.7-4.5 6.4-.8z';
const SPEAKER = 'M11 5 6 9H2.5v6H6l5 4z';

const PATHS = {
  key: [circle(7.5, 15.5, 4.5), 'M10.7 12.3 20 3', 'M16 7l3 3', 'M18.5 4.5l2 2'],
  user: [circle(12, 8, 4), 'M4.5 21v-.5a6 6 0 0 1 6-6h3a6 6 0 0 1 6 6v.5'],
  users: [circle(9, 8, 3.5), 'M2.5 20.5v-.5a5.5 5.5 0 0 1 5.5-5.5h2a5.5 5.5 0 0 1 5.5 5.5v.5', 'M15.5 4.6a3.5 3.5 0 0 1 0 6.8', 'M21.5 20.5V20a5.5 5.5 0 0 0-3.5-5.1'],
  volume: [SPEAKER, 'M15.5 9a4.2 4.2 0 0 1 0 6', 'M18.5 6a8.5 8.5 0 0 1 0 12'],
  'volume-off': [SPEAKER, 'M16 9.5l5 5', 'M21 9.5l-5 5'],
  news: ['M4 4h12.5v14.5a2.5 2.5 0 0 0 2.5 2.5H6.5A2.5 2.5 0 0 1 4 18.5z', 'M16.5 8.5H20v10a2.5 2.5 0 0 1-2.5 2.5', 'M7.5 8h5.5', 'M7.5 12h5.5', 'M7.5 16h3.5'],
  hammer: ['M13 3l8 8-2.5 2.5-8-8z', 'M14.5 9.5 4 20'],
  link: ['M10 13.5a4.5 4.5 0 0 0 6.8.5l3-3a4.5 4.5 0 0 0-6.4-6.4l-1.6 1.6', 'M14 10.5a4.5 4.5 0 0 0-6.8-.5l-3 3a4.5 4.5 0 0 0 6.4 6.4l1.6-1.6'],
  star: [STAR],
  trash: ['M3.5 6.5h17', 'M9 6.5V4h6v2.5', 'M6 6.5l1 13.5h10l1-13.5', 'M10 11v5', 'M14 11v5'],
  rotate: ['M20 12a8 8 0 1 1-2.4-5.7', 'M20 3.5V9h-5.5'],
  undo: ['M9 14 4 9l5-5', 'M4 9h10.5a5.5 5.5 0 0 1 0 11H11'],
  cart: [circle(9.5, 20, 1.2), circle(17.5, 20, 1.2), 'M2.5 3.5h2.8l2.5 11.6a1.5 1.5 0 0 0 1.5 1.2h8.4a1.5 1.5 0 0 0 1.5-1.2L21 7.5H6.2'],
  x: ['M18 6 6 18', 'M6 6l12 12'],
  check: ['M20 6.5 9 17.5l-5-5'],
  chair: ['M7 3v18', 'M7 13h10v8'],
  stand: [circle(12, 4.5, 2), 'M12 8v7', 'M7.5 10.5h9', 'M12 15l-3 6', 'M12 15l3 6'],
  coin: [circle(12, 12, 9), circle(12, 12, 5)],
  wheat: ['M12 22V10', 'M12 10c-2.6 0-4.2-1.6-4.2-4.2 2.6 0 4.2 1.6 4.2 4.2z', 'M12 10c2.6 0 4.2-1.6 4.2-4.2-2.6 0-4.2 1.6-4.2 4.2z', 'M12 15.5c-2.6 0-4.2-1.6-4.2-4.2 2.6 0 4.2 1.6 4.2 4.2z', 'M12 15.5c2.6 0 4.2-1.6 4.2-4.2-2.6 0-4.2 1.6-4.2 4.2z', 'M12 5.8V2'],
  wood: [circle(17, 12, 4), circle(17, 12, 1.2), 'M17 8H7a4 4 0 0 0 0 8h10'],
  stone: ['M4 17.5l2-7 5-4 6.5 2 3 6.5-2.5 3.5z', 'M11 6.5l1 5 6 1'],
  bread: ['M6 20h12v-9a3.5 3.5 0 0 0 0-7H6a3.5 3.5 0 0 0 0 7z', 'M9.5 8l1.5 2', 'M13 8l1.5 2'],
  planks: ['M3 6.5h18v4.5H3z', 'M3 13h18v4.5H3z', 'M9 6.5V11', 'M15 13v4.5'],
  box: ['M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z', 'M3 7.5l9 4.5 9-4.5', 'M12 12v9'],
  pin: ['M12 21.5s-7-6.2-7-11.5a7 7 0 0 1 14 0c0 5.3-7 11.5-7 11.5z', circle(12, 10, 2.5)],
  basket: ['M3 10h18l-2.2 10H5.2z', 'M7.5 10l3-6', 'M16.5 10l-3-6', 'M9 14v2.5', 'M15 14v2.5'],
  load: ['M12 3.5v11', 'M7 10l5 5 5-5', 'M5 20.5h14'],
  block: ['M3 6h18v12H3z', 'M3 12h18', 'M9 6v6', 'M15 12v6'],
  slab: ['M3 10h18v5H3z'],
  wall: ['M8.5 3h7v18h-7z', 'M8.5 9h7', 'M8.5 15h7'],
  glass: ['M4 4h16v16H4z', 'M12 4v16', 'M4 12h16'],
  lamp: ['M12 21.5V10', 'M8.5 21.5h7', 'M8.5 10h7l-1.2-5.5H9.7z'],
  tree: [circle(12, 9, 6), 'M12 15v6.5'],
  pine: ['M12 2.5l5.5 8h-3l4 6h-13l4-6h-3z', 'M12 16.5v5'],
  flower: ['M12 13v8.5', 'M8 4.5v4.5a4 4 0 0 0 8 0V4.5l-2 2-2-3-2 3z', 'M12 18.5c-2.2 0-4-1-5-3'],
  pickaxe: ['M3 9.5a14 14 0 0 1 18 0', 'M12 5.6v16'],
  oven: ['M4 3.5h16v17H4z', 'M4 8.5h16', 'M8 12h8v5H8z', 'M8 6h.01', 'M12 6h.01'],
  sawmill: ['M3 21V10.5l5 3v-3l5 3v-3l5 3V4h3v17z'],
  home: ['M3 11 12 3.5l9 7.5', 'M5.5 9V21h13V9', 'M10 21v-6h4v6'],
  landmark: ['M3 21h18', 'M5 18h14', 'M6.5 18v-7', 'M10.2 18v-7', 'M13.8 18v-7', 'M17.5 18v-7', 'M3.5 9 12 4l8.5 5z'],
  sprout: ['M12 21v-9', 'M12 12c0-4-3-6.5-8-6.5 0 4 3 6.5 8 6.5z', 'M12 14.5c0-3 2.2-5.5 7.5-5.5 0 3-2.2 5.5-7.5 5.5z'],
  target: [circle(12, 12, 9), circle(12, 12, 5), circle(12, 12, 1)],
  trophy: ['M8 3.5h8V9a4 4 0 0 1-8 0z', 'M8 5.5H5a3 3 0 0 0 3 4', 'M16 5.5h3a3 3 0 0 1-3 4', 'M12 13v5', 'M8 21h8', 'M9.5 18h5'],
  info: [circle(12, 12, 9), 'M12 11v5.5', 'M12 7.8h.01'],
};

// Goods produced and traded in the economy, mapped to their icon.
export const GOOD_ICONS = { wheat: 'wheat', wood: 'wood', stone: 'stone', bread: 'bread', planks: 'planks' };

export function icon(name, extraClass = '') {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('class', `i i-${name}${extraClass ? ` ${extraClass}` : ''}`);
  const filled = name === 'star-fill';
  for (const d of PATHS[filled ? 'star' : name] || PATHS.box) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}

// Replace an element's content with [icon] text. Text is always a text node, never HTML,
// so player names stay safe. Pass text '' for an icon-only button (set aria-label too).
export function setLabel(element, name, text = '') {
  const children = name ? [icon(name)] : [];
  if (text) {
    children.push(document.createTextNode(text));
  }
  element.replaceChildren(...children);
}

// Static markup: <button data-icon="cart">Market</button> gets its icon prepended once.
export function hydrateIcons(root = document) {
  for (const element of root.querySelectorAll('[data-icon]')) {
    if (!element.querySelector(':scope > svg.i')) {
      element.prepend(icon(element.dataset.icon));
    }
  }
}
