// Procedural textures (no downloads): every surface is painted on a canvas once,
// then a matching normal map is derived from its brightness so light catches
// mortar lines, tile edges and paving joints.
import * as THREE from 'three';

let maxAnisotropy = 1;
const cache = new Map();

export function setMaxAnisotropy(value) {
  maxAnisotropy = value;
}

function mulberry32(seed) {
  return function next() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(text) {
  let hash = 2166136261;
  for (const char of text) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

// Tangent-space normal map from the canvas brightness (Sobel filter, wraps at edges).
function normalMapFromCanvas(source, strength) {
  const size = source.width;
  const input = source.getContext('2d').getImageData(0, 0, size, size).data;
  const height = new Float32Array(size * size);
  for (let i = 0; i < size * size; i++) {
    height[i] = (input[i * 4] * 0.299 + input[i * 4 + 1] * 0.587 + input[i * 4 + 2] * 0.114) / 255;
  }
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  const output = context.createImageData(size, size);
  const at = (x, y) => height[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
      const dy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));
      let nx = -dx * strength;
      let ny = dy * strength;
      let nz = 1;
      const length = Math.hypot(nx, ny, nz);
      nx /= length;
      ny /= length;
      nz /= length;
      const index = (y * size + x) * 4;
      output.data[index] = (nx * 0.5 + 0.5) * 255;
      output.data[index + 1] = (ny * 0.5 + 0.5) * 255;
      output.data[index + 2] = (nz * 0.5 + 0.5) * 255;
      output.data[index + 3] = 255;
    }
  }
  context.putImageData(output, 0, 0);
  return canvas;
}

function finishTexture(canvas, colorSpace) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = maxAnisotropy;
  texture.colorSpace = colorSpace;
  return texture;
}

function makeSurface(key, size, draw, normalStrength) {
  if (cache.has(key)) {
    return cache.get(key);
  }
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  draw(canvas.getContext('2d'), size, mulberry32(hashString(key)));
  const surface = {
    map: finishTexture(canvas, THREE.SRGBColorSpace),
    normalMap: normalStrength > 0 ? finishTexture(normalMapFromCanvas(canvas, normalStrength), THREE.NoColorSpace) : null,
  };
  cache.set(key, surface);
  return surface;
}

// Returns an independent copy of a surface with its own repeat (shares the image data).
export function repeatedSurface(surface, repeatX, repeatY) {
  const copy = { map: surface.map.clone(), normalMap: surface.normalMap ? surface.normalMap.clone() : null };
  for (const texture of [copy.map, copy.normalMap]) {
    if (texture) {
      texture.repeat.set(repeatX, repeatY);
      texture.needsUpdate = true;
    }
  }
  return copy;
}

const hsl = (h, s, l) => `hsl(${h}, ${s}%, ${l}%)`;

function speckle(ctx, size, random, count, colorFn, maxRadius = 1.5) {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colorFn(random);
    ctx.beginPath();
    ctx.arc(random() * size, random() * size, 0.4 + random() * maxRadius, 0, Math.PI * 2);
    ctx.fill();
  }
}

export const surfaces = {
  grass: () => makeSurface('grass', 512, (ctx, size, random) => {
    ctx.fillStyle = '#5b8a3c';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 26; i++) {
      // soft patches of lighter and darker turf
      const x = random() * size;
      const y = random() * size;
      const radius = 40 + random() * 90;
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
      const tone = random() < 0.5 ? 'rgba(40, 70, 25, 0.25)' : 'rgba(150, 175, 80, 0.18)';
      gradient.addColorStop(0, tone);
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, size, size);
    }
    ctx.lineCap = 'round';
    for (let i = 0; i < 9000; i++) {
      const x = random() * size;
      const y = random() * size;
      const length = 3 + random() * 7;
      ctx.strokeStyle = hsl(78 + random() * 30, 35 + random() * 25, 22 + random() * 26);
      ctx.lineWidth = 0.8 + random() * 1.2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (random() - 0.5) * 3, y - length);
      ctx.stroke();
    }
  }, 0),

  dirt: () => makeSurface('dirt', 512, (ctx, size, random) => {
    ctx.fillStyle = '#9c8662';
    ctx.fillRect(0, 0, size, size);
    speckle(ctx, size, random, 7000, (r) => hsl(30 + r * 15, 20 + r * 20, 35 + r * 30), 1.4);
    for (let i = 0; i < 160; i++) {
      // pebbles with a shadowed lower edge
      const x = random() * size;
      const y = random() * size;
      const radius = 2 + random() * 4;
      ctx.fillStyle = 'rgba(60, 45, 30, 0.45)';
      ctx.beginPath();
      ctx.ellipse(x + 1, y + 1.5, radius, radius * 0.75, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = hsl(35, 10, 55 + random() * 25);
      ctx.beginPath();
      ctx.ellipse(x, y, radius, radius * 0.75, random() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
  }, 2.5),

  pavers: () => makeSurface('pavers', 512, (ctx, size, random) => {
    ctx.fillStyle = '#6f675c'; // grout
    ctx.fillRect(0, 0, size, size);
    const rows = 8;
    const rowHeight = size / rows;
    for (let row = 0; row < rows; row++) {
      const columns = 4;
      const width = size / columns;
      const offset = row % 2 ? width / 2 : 0;
      for (let column = -1; column < columns; column++) {
        const x = column * width + offset;
        const y = row * rowHeight;
        ctx.fillStyle = hsl(35 + random() * 10, 10 + random() * 10, 62 + random() * 14);
        ctx.fillRect(x + 3, y + 3, width - 6, rowHeight - 6);
        const gradient = ctx.createLinearGradient(x, y, x, y + rowHeight);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 0.12)');
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0.12)');
        ctx.fillStyle = gradient;
        ctx.fillRect(x + 3, y + 3, width - 6, rowHeight - 6);
      }
    }
    speckle(ctx, size, random, 5000, (r) => `rgba(${r < 0.5 ? '40,35,30' : '255,250,240'}, ${0.08 + r * 0.1})`, 1.2);
  }, 3),

  stone: () => makeSurface('stone', 256, (ctx, size, random) => {
    ctx.fillStyle = '#b9b2a6';
    ctx.fillRect(0, 0, size, size);
    speckle(ctx, size, random, 3500, (r) => hsl(40, 6, 45 + r * 40), 1.6);
  }, 2),

  // Light, near-neutral surfaces are tinted by material.color.
  plaster: () => makeSurface('plaster', 256, (ctx, size, random) => {
    ctx.fillStyle = '#ececec';
    ctx.fillRect(0, 0, size, size);
    speckle(ctx, size, random, 4000, (r) => `rgba(${r < 0.5 ? '120,120,120' : '255,255,255'}, ${0.06 + r * 0.08})`, 1.8);
    for (let i = 0; i < 14; i++) {
      ctx.fillStyle = 'rgba(90, 90, 90, 0.035)';
      ctx.fillRect(random() * size, 0, 4 + random() * 18, size);
    }
  }, 1.2),

  roofTiles: () => makeSurface('roofTiles', 256, (ctx, size, random) => {
    ctx.fillStyle = '#5a5a5a';
    ctx.fillRect(0, 0, size, size);
    const rows = 8;
    const rowHeight = size / rows;
    const tileWidth = size / 8;
    for (let row = 0; row < rows; row++) {
      const offset = row % 2 ? tileWidth / 2 : 0;
      for (let column = -1; column < 9; column++) {
        const x = column * tileWidth + offset;
        const y = row * rowHeight;
        const light = 72 + random() * 18;
        const gradient = ctx.createLinearGradient(0, y, 0, y + rowHeight);
        gradient.addColorStop(0, hsl(0, 0, light - 18));
        gradient.addColorStop(0.75, hsl(0, 0, light));
        gradient.addColorStop(1, hsl(0, 0, light - 28));
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.moveTo(x + 1, y);
        ctx.lineTo(x + tileWidth - 1, y);
        ctx.lineTo(x + tileWidth - 1, y + rowHeight - 3);
        ctx.quadraticCurveTo(x + tileWidth / 2, y + rowHeight + 2, x + 1, y + rowHeight - 3);
        ctx.closePath();
        ctx.fill();
      }
    }
  }, 4),

  brick: () => makeSurface('brick', 256, (ctx, size, random) => {
    ctx.fillStyle = '#e6e2dc'; // mortar
    ctx.fillRect(0, 0, size, size);
    const rows = 8;
    const rowHeight = size / rows;
    const brickWidth = size / 4;
    for (let row = 0; row < rows; row++) {
      const offset = row % 2 ? brickWidth / 2 : 0;
      for (let column = -1; column < 5; column++) {
        ctx.fillStyle = hsl(0, 0, 70 + random() * 22);
        ctx.fillRect(column * brickWidth + offset + 2, row * rowHeight + 2, brickWidth - 4, rowHeight - 4);
      }
    }
    speckle(ctx, size, random, 2500, (r) => `rgba(${r < 0.5 ? '60,60,60' : '255,255,255'}, ${0.08 + r * 0.1})`, 1.2);
  }, 3),

  wood: () => makeSurface('wood', 256, (ctx, size, random) => {
    const planks = 4;
    const width = size / planks;
    for (let plank = 0; plank < planks; plank++) {
      ctx.fillStyle = hsl(0, 0, 66 + random() * 16);
      ctx.fillRect(plank * width, 0, width, size);
      for (let line = 0; line < 22; line++) {
        ctx.strokeStyle = `rgba(40, 40, 40, ${0.05 + random() * 0.1})`;
        ctx.lineWidth = 0.5 + random();
        const x = plank * width + random() * width;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.bezierCurveTo(x + (random() - 0.5) * 8, size / 3, x + (random() - 0.5) * 8, (size * 2) / 3, x, size);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(30, 30, 30, 0.5)';
      ctx.fillRect(plank * width, 0, 2, size);
    }
  }, 2),

  water: () => makeSurface('water', 256, (ctx, size, random) => {
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 260; i++) {
      // overlapping soft ripples, used only for its normal map
      const x = random() * size;
      const y = random() * size;
      const radius = 6 + random() * 26;
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
      const light = random() < 0.5;
      gradient.addColorStop(0, light ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.18)');
      gradient.addColorStop(1, 'rgba(128,128,128,0)');
      ctx.fillStyle = gradient;
      for (const dx of [-size, 0, size]) {
        for (const dy of [-size, 0, size]) {
          ctx.save();
          ctx.translate(dx, dy);
          ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
          ctx.restore();
        }
      }
    }
  }, 6),

  cloud: () => makeSurface('cloud', 256, (ctx, size, random) => {
    ctx.clearRect(0, 0, size, size);
    for (let i = 0; i < 26; i++) {
      const x = size * (0.2 + random() * 0.6);
      const y = size * (0.35 + random() * 0.3);
      const radius = size * (0.08 + random() * 0.16);
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, 'rgba(255, 255, 255, 0.55)');
      gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, size, size);
    }
  }, 0),
};
