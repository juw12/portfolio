import * as THREE from 'three';
import {
  BUILD_COLORS,
  CATALOG,
  CATALOG_KEYS,
  createObjectMesh,
  objectBounds,
  sharedMaterials,
} from './buildables.js';
import { createScenery, QUALITY_PRESETS } from './scenery.js';
import { createHumanoid, animateHumanoid, disposeHumanoid } from './avatar.js';
import { createEconomy } from './economy.js';
import { createAccountUI } from './account.js';
import { createSocialUI } from './social.js';
import { createTownFeed } from './feed.js';
import { createJuice } from './juice.js';
import { propsReady, createProp } from './props.js';
import { createInstancer } from './instancing.js';
import { hydrateIcons, icon as svgIcon, setLabel } from './icons.js';

hydrateIcons();

// =====================================================================
// Tunable parameters
// =====================================================================
const CONFIG = {
  worldSeed: 1234,          // same seed => every client sees the same town
  worldRadius: 70,          // walkable radius (m)
  plazaRadius: 14,
  pathHalfWidth: 1.6,
  treeCount: 110,
  walkSpeed: 5,             // m/s
  runSpeed: 10,
  jumpSpeed: 6.5,
  gravity: 18,
  playerRadius: 0.4,
  playerHeight: 1.7,
  camera: { distance: 8, minDistance: 3, maxDistance: 22, pitch: 0.35 },
  syncIntervalMs: 100,      // 10 network updates per second
  build: {
    radius: 70,             // must be <= BUILD_RADIUS in server.py
    reach: 14,              // how far from yourself you can build
    maxHeight: 24,
    stepHeight: 0.55,       // you walk up anything lower than this (slabs = stairs)
    maxOpsPerSync: 25,
  },
};

const AVATAR_COLORS = ['#e4572e', '#f3a712', '#29bf12', '#00a5cf', '#7e52a0', '#ff6fb5', '#2d3047', '#f0f0f0'];

// Land rules. The server is the source of truth and sends these on join ("rules").
const rules = {
  plotSize: 10,
  maxPlots: 4,
  plazaRadius: 16,
  pathHalfWidth: 2,
  buildRadius: 72,
  maxHeight: 24,
};
let economyUI = null; // created once networking is set up (see createEconomy below)
const urlParams = new URLSearchParams(location.search);
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (isTouch) {
  document.body.classList.add('touch');
}

// On phones the HUD row wraps to two lines, so the level chip and chat are
// positioned from the measured HUD height instead of a fixed offset.
function stackTopLeftPanels() {
  const hud = document.getElementById('hud');
  const chip = document.getElementById('levelChip');
  const hudBottom = hud && !hud.hidden ? hud.getBoundingClientRect().bottom : 0;
  const root = document.documentElement.style;
  root.setProperty('--hud-bottom', `${Math.round(hudBottom)}px`);
  // The goal pill is right-aligned but spans past the chat's right edge on narrow phones.
  const lowerEdges = [chip, document.getElementById('goalPill')]
    .filter((element) => element && !element.hidden)
    .map((element) => element.getBoundingClientRect())
    .filter((rect) => rect.height)
    .map((rect) => rect.bottom);
  root.setProperty('--stack-bottom', `${Math.round(Math.max(hudBottom, ...lowerEdges))}px`);
}
const panelObserver = new ResizeObserver(stackTopLeftPanels);
for (const id of ['hud', 'levelChip', 'goalPill']) {
  const element = document.getElementById(id);
  if (element) {
    panelObserver.observe(element);
    new MutationObserver(stackTopLeftPanels).observe(element, { attributes: true, attributeFilter: ['hidden'] });
  }
}
addEventListener('resize', stackTopLeftPanels);

const $ = (id) => document.getElementById(id);
const clamp = THREE.MathUtils.clamp;

// =====================================================================
// Renderer, scene, scenery (sky, terrain, town, nature live in scenery.js)
// =====================================================================
// ?quality=high|medium|low overrides the automatic choice (phones default to medium).
const quality = QUALITY_PRESETS[urlParams.get('quality')] ? urlParams.get('quality') : (isTouch ? 'medium' : 'high');
const preset = QUALITY_PRESETS[quality];
// Phones and ?quality=low ask the server for far-away people less often (?lite=0 / ?lite=1 to force).
const LITE_SYNC = urlParams.has('lite') ? urlParams.get('lite') !== '0' : (isTouch || quality === 'low');

const canvas = $('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: quality !== 'low', powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, preset.pixelRatio));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = preset.shadows;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 3000);

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setSize(width, height);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

const circleColliders = []; // fixed scenery: { x, z, r }
const boxColliders = [];    // fixed scenery: { minX, maxX, minZ, maxZ }
const scenery = createScenery({ scene, renderer, config: CONFIG, quality, circleColliders, boxColliders });

// Day / night follows the viewer's local clock (?hour=20 to override).
// Shared town clock from the server (townsfolk follow it too); local time while offline.
const townClock = { hour: null, at: 0 };

function currentHour() {
  const forcedHour = parseFloat(urlParams.get('hour'));
  if (!Number.isNaN(forcedHour)) {
    return forcedHour;
  }
  if (townClock.hour !== null) {
    return (townClock.hour + (performance.now() - townClock.at) / 3.6e6) % 24;
  }
  const now = new Date();
  return now.getHours() + now.getMinutes() / 60;
}

function updateSky() {
  scenery.updateTimeOfDay(currentHour());
}
updateSky();
setInterval(updateSky, 30000);

// The server owns the town layout so it knows which land is free to claim.
// Trees are placed after the houses so they never grow through a wall.
const townHouses = [];
async function loadTown() {
  try {
    const response = await fetch('api/town');
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const town = await response.json();
    townHouses.push(...town.houses);
    scenery.buildHouses(town.houses);
  } catch (error) {
    console.warn('Town layout unavailable, continuing without houses', error);
  }
  scenery.buildTrees();
}
loadTown();

// =====================================================================
// Avatars and floating name / chat labels
// =====================================================================
function roundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

function wrapText(ctx, text, maxWidth) {
  const lines = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) {
    lines.push(line);
  }
  if (lines.length > 2) {
    lines.length = 2;
    lines[1] = `${lines[1].slice(0, -1)}…`;
  }
  return lines;
}

function createLabel() {
  const labelCanvas = document.createElement('canvas');
  labelCanvas.width = 512;
  labelCanvas.height = 256;
  const texture = new THREE.CanvasTexture(labelCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.scale.set(2.6, 1.3, 1);
  sprite.position.y = 2.7;
  sprite.renderOrder = 10;
  return { sprite, canvas: labelCanvas, texture, name: null, bubble: null };
}

// Name tags carry the level once someone has one ("Mila · Lv 5").
function labelName(name, level) {
  return level ? `${name} · Lv ${level}` : name;
}

function drawLabel(label, name, bubble) {
  if (label.name === name && label.bubble === bubble) {
    return;
  }
  label.name = name;
  label.bubble = bubble;

  const ctx = label.canvas.getContext('2d');
  ctx.clearRect(0, 0, 512, 256);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.font = 'bold 40px system-ui, sans-serif';
  const nameWidth = Math.min(ctx.measureText(name).width + 40, 500);
  roundedRect(ctx, 256 - nameWidth / 2, 186, nameWidth, 60, 30);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.fillText(name, 256, 217);

  if (bubble) {
    ctx.font = '34px system-ui, sans-serif';
    const lines = wrapText(ctx, bubble, 440);
    const bubbleWidth = Math.min(Math.max(...lines.map((l) => ctx.measureText(l).width)) + 44, 500);
    const bubbleHeight = lines.length * 40 + 26;
    const top = 176 - bubbleHeight;
    roundedRect(ctx, 256 - bubbleWidth / 2, top, bubbleWidth, bubbleHeight, 22);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.fillStyle = '#222222';
    lines.forEach((line, i) => ctx.fillText(line, 256, top + 33 + i * 40));
  }
  label.texture.needsUpdate = true;
}

function createAvatar(color, name) {
  const humanoid = createHumanoid(color, name); // name picks a stable skin / hair / outfit
  const label = createLabel();
  drawLabel(label, name, '');
  label.sprite.position.y = 2.8;
  humanoid.root.add(label.sprite);
  scene.add(humanoid.root);
  // Keep the same object (no spread): the figure upgrades itself in place when the
  // Blender character model finishes loading.
  humanoid.label = label;
  return humanoid;
}

// speed in m/s drives the gait (idle, walk, run); airborne switches to the jump pose
function animateAvatar(avatar, speed, airborne, dt, pose = 'stand') {
  animateHumanoid(avatar, speed, airborne, dt, pose);
}

function lerpAngle(from, to, t) {
  let delta = (to - from) % (Math.PI * 2);
  if (delta > Math.PI) {
    delta -= Math.PI * 2;
  }
  if (delta < -Math.PI) {
    delta += Math.PI * 2;
  }
  return from + delta * t;
}

function disposeAvatar(avatar) {
  scene.remove(avatar.root);
  disposeHumanoid(avatar);
  avatar.label.texture.dispose();
  avatar.label.sprite.material.dispose();
}

// =====================================================================
// Built objects: the shared, persistent, player-made part of the world
// =====================================================================
const placedGroup = new THREE.Group();
scene.add(placedGroup);
// Builds are drawn as instanced batches: one draw call per shape + material, not per build.
const instancer = urlParams.get('instancing') === '0' ? null : createInstancer(scene, { castShadow: renderer.shadowMap.enabled });
const placed = new Map();     // id -> { data, def, root, bounds, pending }
const cellIndex = new Map();  // "x,z" -> Set(id) for fast physics / stacking lookups
const recentlyRemoved = new Map();
const cellKey = (x, z) => `${x},${z}`;

function addPlacedObject(data, pending = false) {
  const existing = placed.get(data.id);
  if (existing) {
    existing.pending = existing.pending && pending;
    if (data.owner) {
      existing.data.owner = data.owner;
    }
    return existing;
  }
  const def = CATALOG[data.type];
  if (!def) {
    return null;
  }
  const root = createObjectMesh(data.type, data.color);
  root.position.set(data.x, data.y, data.z);
  root.rotation.y = (data.rot * Math.PI) / 2;
  root.userData.objectId = data.id;
  root.traverse((node) => {
    if (node.isMesh) {
      node.castShadow = renderer.shadowMap.enabled;
      node.receiveShadow = true;
    }
  });
  placedGroup.add(root);
  root.updateMatrixWorld(true); // so it can be clicked before the next render
  instancer?.add(root);

  const entry = { data: { ...data }, def, root, bounds: objectBounds(data), pending };
  placed.set(data.id, entry);
  const key = cellKey(data.x, data.z);
  if (!cellIndex.has(key)) {
    cellIndex.set(key, new Set());
  }
  cellIndex.get(key).add(data.id);
  return entry;
}

// Producers built before /models/props.glb arrived used simple shapes: swap in the models,
// keeping position, rotation, ids and any "ready" badge.
function upgradeProducerMeshes() {
  for (const entry of placed.values()) {
    if (!entry.def.producer || entry.root.userData.model) {
      continue;
    }
    const fresh = createObjectMesh(entry.data.type, entry.data.color);
    if (!fresh.userData.model) {
      continue;
    }
    fresh.position.copy(entry.root.position);
    fresh.rotation.copy(entry.root.rotation);
    fresh.userData.objectId = entry.root.userData.objectId;
    fresh.traverse((node) => {
      if (node.isMesh) {
        node.castShadow = renderer.shadowMap.enabled;
        node.receiveShadow = true;
      }
    });
    if (entry.badge) {
      fresh.add(entry.badge);
    }
    instancer?.remove(entry.root);
    placedGroup.remove(entry.root);
    placedGroup.add(fresh);
    fresh.updateMatrixWorld(true);
    instancer?.add(fresh);
    entry.root = fresh;
  }
}

propsReady.then((loaded) => {
  if (!loaded) {
    return;
  }
  upgradeProducerMeshes();
  scenery.useMarketModel(createProp('market'));
});

function removePlacedObject(id) {
  const entry = placed.get(id);
  if (!entry) {
    return null;
  }
  instancer?.remove(entry.root);
  placedGroup.remove(entry.root);
  placed.delete(id);
  const key = cellKey(entry.data.x, entry.data.z);
  const ids = cellIndex.get(key);
  if (ids) {
    ids.delete(id);
    if (ids.size === 0) {
      cellIndex.delete(key);
    }
  }
  return entry;
}

function forEachNearbyPlaced(x, z, callback) {
  const cx = Math.round(x);
  const cz = Math.round(z);
  for (let dx = -2; dx <= 2; dx++) {
    for (let dz = -2; dz <= 2; dz++) {
      const ids = cellIndex.get(cellKey(cx + dx, cz + dz));
      if (!ids) {
        continue;
      }
      for (const id of ids) {
        const entry = placed.get(id);
        if (entry) {
          callback(entry);
        }
      }
    }
  }
}

function cellTop(x, z) {
  let top = 0;
  let blocked = false;
  const ids = cellIndex.get(cellKey(x, z));
  if (ids) {
    for (const id of ids) {
      const entry = placed.get(id);
      if (!entry) {
        continue;
      }
      if (!entry.def.standable) {
        blocked = true;
      }
      top = Math.max(top, entry.bounds.maxY);
    }
  }
  return { top, blocked };
}

// =====================================================================
// Land: claimable plots on a grid; plaza and paths stay public
// =====================================================================
const plotsGroup = new THREE.Group();
scene.add(plotsGroup);
const plots = new Map(); // key "px,pz" -> { data, group, label }

function plotKeyForCell(x, z) {
  return `${Math.floor(x / rules.plotSize)},${Math.floor(z / rules.plotSize)}`;
}

function plotBounds(key) {
  const [px, pz] = key.split(',').map(Number);
  const size = rules.plotSize;
  const minX = px * size - 0.5;
  const minZ = pz * size - 0.5;
  return { minX, maxX: minX + size, minZ, maxZ: minZ + size, centerX: minX + size / 2, centerZ: minZ + size / 2 };
}

function isPublicCell(x, z) {
  return Math.hypot(x, z) <= rules.plazaRadius
    || Math.abs(x) <= rules.pathHalfWidth
    || Math.abs(z) <= rules.pathHalfWidth;
}

function isClaimablePlot(key) {
  return plotBlockReason(key) === null;
}

// Mirrors is_claimable_plot() in server.py (the server has the final say).
function plotBlockReason(key) {
  const b = plotBounds(key);
  const distance = Math.hypot(b.centerX, b.centerZ);
  if (distance <= rules.plazaRadius || distance > rules.buildRadius - rules.plotSize / 2) {
    return 'Public land';
  }
  const underHouse = townHouses.some((h) =>
    b.minX < h.x + h.width / 2 && b.maxX > h.x - h.width / 2
    && b.minZ < h.z + h.depth / 2 && b.maxZ > h.z - h.depth / 2
  );
  return underHouse ? 'Town land (not for claiming)' : null;
}

function plotAtCell(x, z) {
  return plots.get(plotKeyForCell(x, z)) || null;
}

function canBuildOnPlot(plot) {
  if (!plot) {
    return false;
  }
  return plot.data.owner === ownerTag || Boolean(plot.data.builders?.some((b) => b.tag === ownerTag));
}

function myPlotCount() {
  let count = 0;
  for (const plot of plots.values()) {
    if (plot.data.owner === ownerTag) {
      count++;
    }
  }
  return count;
}

function rectangleOutline(bounds, y) {
  return new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(bounds.minX, y, bounds.minZ),
    new THREE.Vector3(bounds.maxX, y, bounds.minZ),
    new THREE.Vector3(bounds.maxX, y, bounds.maxZ),
    new THREE.Vector3(bounds.minX, y, bounds.maxZ),
  ]);
}

function removePlot(key) {
  const plot = plots.get(key);
  if (!plot) {
    return;
  }
  plotsGroup.remove(plot.group);
  plot.group.traverse((node) => {
    node.geometry?.dispose();
    node.material?.map?.dispose();
    node.material?.dispose();
  });
  plots.delete(key);
}

function upsertPlot(data) {
  removePlot(data.key);
  const bounds = plotBounds(data.key);
  const size = rules.plotSize;
  const group = new THREE.Group();

  const tint = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshBasicMaterial({ color: data.color, transparent: true, opacity: 0.18, depthWrite: false })
  );
  tint.rotation.x = -Math.PI / 2;
  tint.position.set(bounds.centerX, 0.03, bounds.centerZ);

  const border = new THREE.LineLoop(rectangleOutline(bounds, 0.06), new THREE.LineBasicMaterial({ color: data.color }));

  const label = createLabel();
  const mine = data.owner === ownerTag;
  const coBuilder = !mine && Boolean(data.builders?.some((b) => b.tag === ownerTag));
  const title = mine ? 'Your plot' : `${data.ownerName}'s plot`;
  const subtitle = [
    coBuilder ? 'you can build' : '',
    data.likes ? `${data.likes} ${data.likes === 1 ? 'star' : 'stars'}` : '',
  ].filter(Boolean).join(' · ');
  drawLabel(label, title, subtitle);
  label.sprite.position.set(bounds.centerX, 4.5, bounds.centerZ);
  label.sprite.scale.set(5.2, 2.6, 1);

  group.add(tint, border, label.sprite);
  plotsGroup.add(group);
  plots.set(data.key, { data: { ...data }, group, label });
}

function applyPlotSnapshot(list) {
  const keys = new Set(list.map((plot) => plot.key));
  for (const key of [...plots.keys()]) {
    if (!keys.has(key)) {
      removePlot(key);
    }
  }
  for (const plot of list) {
    upsertPlot(plot);
  }
}

// =====================================================================
// Local player + physics
// =====================================================================
function makeId() {
  // crypto.randomUUID is unavailable on plain-http LAN pages, so fall back.
  return (crypto.randomUUID && window.isSecureContext)
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// Private key that proves "I built this" across sessions (stays in this browser).
// Logging in (account.js) swaps in the key stored with the account.
const newGuestKey = () => `${makeId()}-${Math.random().toString(36).slice(2)}`;
let ownerKey = localStorage.getItem('townsquare-owner-key');
if (!ownerKey) {
  ownerKey = newGuestKey();
  localStorage.setItem('townsquare-owner-key', ownerKey);
}
function setOwnerKey(key) {
  ownerKey = key;
  localStorage.setItem('townsquare-owner-key', key);
}
// True while the player is typing into any text field (chat, account form...).
const isTyping = () => ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName);
let ownerTag = null; // public id the server derives from ownerKey

const spawnAngle = Math.random() * Math.PI * 2;
const spawnDistance = 6 + Math.random() * 5;
const startAt = (urlParams.get('at') || '').split(',').map(Number); // ?at=x,z — "meet me here" links
const hasStartAt = startAt.length === 2 && startAt.every(Number.isFinite);
const startX = hasStartAt ? startAt[0] : Math.cos(spawnAngle) * spawnDistance;
const startZ = hasStartAt ? startAt[1] : Math.sin(spawnAngle) * spawnDistance;
const player = {
  id: makeId(), // per tab, so two tabs are two people
  name: 'Guest',
  color: AVATAR_COLORS[3],
  position: new THREE.Vector3(startX, 0, startZ),
  velocityY: 0,
  onGround: true,
  yaw: Math.atan2(-startX, -startZ), // face the fountain
  moving: false,
  bubble: '',
  bubbleUntil: 0,
  avatar: null,
};

function pushOutOfBox(position, b, r) {
  const closestX = clamp(position.x, b.minX, b.maxX);
  const closestZ = clamp(position.z, b.minZ, b.maxZ);
  const dx = position.x - closestX;
  const dz = position.z - closestZ;
  const distanceSq = dx * dx + dz * dz;
  if (distanceSq >= r * r) {
    return;
  }
  if (distanceSq > 1e-8) {
    const distance = Math.sqrt(distanceSq);
    position.x = closestX + (dx / distance) * r;
    position.z = closestZ + (dz / distance) * r;
    return;
  }
  // Centre is inside the box: push out along the shallowest side.
  const exits = [
    { x: b.minX - r - position.x, z: 0 },
    { x: b.maxX + r - position.x, z: 0 },
    { x: 0, z: b.minZ - r - position.z },
    { x: 0, z: b.maxZ + r - position.z },
  ];
  exits.sort((a, c) => Math.abs(a.x + a.z) - Math.abs(c.x + c.z));
  position.x += exits[0].x;
  position.z += exits[0].z;
}

function resolveCollisions(position) {
  const r = CONFIG.playerRadius;
  for (const c of circleColliders) {
    const dx = position.x - c.x;
    const dz = position.z - c.z;
    const minDistance = c.r + r;
    const distanceSq = dx * dx + dz * dz;
    if (distanceSq < minDistance * minDistance) {
      const distance = Math.sqrt(distanceSq) || 1e-4;
      position.x = c.x + (dx / distance) * minDistance;
      position.z = c.z + (dz / distance) * minDistance;
    }
  }
  for (const b of boxColliders) {
    pushOutOfBox(position, b, r);
  }

  // Built objects only block you if they're above step height and overlap your body.
  forEachNearbyPlaced(position.x, position.z, (entry) => {
    const b = entry.bounds;
    if (!entry.def.solid) {
      return;
    }
    if (b.maxY <= position.y + CONFIG.build.stepHeight || b.minY >= position.y + CONFIG.playerHeight) {
      return;
    }
    pushOutOfBox(position, b, r);
  });

  const fromCentre = Math.hypot(position.x, position.z);
  if (fromCentre > CONFIG.worldRadius) {
    position.x *= CONFIG.worldRadius / fromCentre;
    position.z *= CONFIG.worldRadius / fromCentre;
  }
}

function floorHeightAt(position) {
  let floor = 0;
  const margin = 0.15;
  forEachNearbyPlaced(position.x, position.z, (entry) => {
    if (!entry.def.standable) {
      return;
    }
    const b = entry.bounds;
    const inside = position.x > b.minX - margin && position.x < b.maxX + margin
      && position.z > b.minZ - margin && position.z < b.maxZ + margin;
    if (inside && b.maxY <= position.y + CONFIG.build.stepHeight) {
      floor = Math.max(floor, b.maxY);
    }
  });
  return floor;
}

// =====================================================================
// Input: keyboard + mouse on desktop, joystick + drag + pinch on touch
// =====================================================================
const keys = new Set();
const joystick = { x: 0, y: 0, pointerId: null };
const requestedZoom = parseFloat(urlParams.get('zoom')); // ?zoom=4 - camera distance in metres
const cameraState = {
  yaw: player.yaw + Math.PI,
  pitch: CONFIG.camera.pitch,
  distance: Number.isFinite(requestedZoom)
    ? THREE.MathUtils.clamp(requestedZoom, CONFIG.camera.minDistance, CONFIG.camera.maxDistance)
    : CONFIG.camera.distance,
};
let jumpRequested = false;
let inWorld = false;

const build = {
  active: false,
  type: 'block',
  color: CATALOG.block.color,
  rotation: 0,
  deleteMode: false,
  pointer: new THREE.Vector2(0, 0.05), // where the ghost preview aims: just past your avatar (normalised screen coords)
  undoStack: [],
  counter: 0,
};

const chatInput = $('chatInput');

window.addEventListener('keydown', (event) => {
  if (!inWorld || isTyping()) {
    return;
  }
  if (event.key === 'Enter') {
    event.preventDefault();
    chatInput.focus();
    keys.clear();
    return;
  }
  if (event.code === 'KeyB') {
    toggleBuildMode();
    return;
  }
  if (build.active) {
    if (event.code === 'Escape') {
      toggleBuildMode(false);
      return;
    }
    if (event.code === 'KeyR') {
      rotateBuild();
      return;
    }
    if (event.code === 'KeyX') {
      toggleDeleteMode();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.code === 'KeyZ') {
      event.preventDefault();
      undoLastBuild();
      return;
    }
    const digit = event.code.match(/^Digit([1-9])$/);
    if (digit && CATALOG_KEYS[Number(digit[1]) - 1]) {
      selectBuildType(CATALOG_KEYS[Number(digit[1]) - 1]);
      return;
    }
  }
  if (event.code === 'KeyE' && !build.active) {
    toggleSit();
    return;
  }
  if (event.code === 'Space') {
    event.preventDefault();
  }
  keys.add(event.code);
});
window.addEventListener('keyup', (event) => keys.delete(event.code));
window.addEventListener('blur', () => keys.clear());

const lookPointers = new Map();
let previousPinchDistance = 0;
let tapCandidate = null; // a press that hasn't moved yet: treated as a click/tap

function pinchDistance() {
  const [a, b] = [...lookPointers.values()];
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function setBuildPointer(event) {
  build.pointer.set((event.clientX / window.innerWidth) * 2 - 1, -(event.clientY / window.innerHeight) * 2 + 1);
}

canvas.addEventListener('pointerdown', (event) => {
  canvas.setPointerCapture(event.pointerId);
  lookPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (lookPointers.size === 2) {
    previousPinchDistance = pinchDistance();
    tapCandidate = null;
  } else if (event.button === 0) {
    tapCandidate = { id: event.pointerId, x: event.clientX, y: event.clientY, at: performance.now() };
  }
  if (event.pointerType !== 'mouse') {
    setBuildPointer(event);
  }
  if (document.activeElement === chatInput) {
    chatInput.blur();
  }
});

canvas.addEventListener('pointermove', (event) => {
  if (event.pointerType === 'mouse') {
    setBuildPointer(event); // the ghost follows the mouse
  }
  if (tapCandidate && tapCandidate.id === event.pointerId
    && Math.hypot(event.clientX - tapCandidate.x, event.clientY - tapCandidate.y) > 8) {
    tapCandidate = null;
  }
  const pointer = lookPointers.get(event.pointerId);
  if (!pointer) {
    return;
  }
  const dx = event.clientX - pointer.x;
  const dy = event.clientY - pointer.y;
  pointer.x = event.clientX;
  pointer.y = event.clientY;

  if (lookPointers.size === 2) {
    const distance = pinchDistance();
    if (previousPinchDistance > 0) {
      cameraState.distance = clamp(
        cameraState.distance * (previousPinchDistance / distance),
        CONFIG.camera.minDistance,
        CONFIG.camera.maxDistance
      );
    }
    previousPinchDistance = distance;
    return;
  }
  const sensitivity = isTouch ? 0.008 : 0.005;
  cameraState.yaw -= dx * sensitivity;
  cameraState.pitch = clamp(cameraState.pitch + dy * sensitivity, 0.05, 1.3);
});

function releaseLookPointer(event) {
  lookPointers.delete(event.pointerId);
  previousPinchDistance = 0;
}
canvas.addEventListener('pointerup', (event) => {
  const wasTap = tapCandidate && tapCandidate.id === event.pointerId && performance.now() - tapCandidate.at < 500;
  tapCandidate = null;
  releaseLookPointer(event);
  if (wasTap && build.active) {
    setBuildPointer(event);
    handleBuildTap();
  }
});
canvas.addEventListener('pointercancel', (event) => {
  tapCandidate = null;
  releaseLookPointer(event);
});

canvas.addEventListener('wheel', (event) => {
  event.preventDefault();
  const factor = event.deltaY > 0 ? 1.1 : 1 / 1.1;
  cameraState.distance = clamp(cameraState.distance * factor, CONFIG.camera.minDistance, CONFIG.camera.maxDistance);
}, { passive: false });

const joystickBase = $('joystick');
const joystickKnob = $('joystickKnob');
const JOYSTICK_RANGE = 50; // px

function updateJoystick(event) {
  const rect = joystickBase.getBoundingClientRect();
  let dx = event.clientX - (rect.left + rect.width / 2);
  let dy = event.clientY - (rect.top + rect.height / 2);
  const length = Math.hypot(dx, dy);
  if (length > JOYSTICK_RANGE) {
    dx *= JOYSTICK_RANGE / length;
    dy *= JOYSTICK_RANGE / length;
  }
  joystick.x = dx / JOYSTICK_RANGE;
  joystick.y = dy / JOYSTICK_RANGE;
  joystickKnob.style.transform = `translate(${dx}px, ${dy}px)`;
}

joystickBase.addEventListener('pointerdown', (event) => {
  joystick.pointerId = event.pointerId;
  joystickBase.setPointerCapture(event.pointerId);
  updateJoystick(event);
});
joystickBase.addEventListener('pointermove', (event) => {
  if (event.pointerId === joystick.pointerId) {
    updateJoystick(event);
  }
});
function releaseJoystick(event) {
  if (event.pointerId !== joystick.pointerId) {
    return;
  }
  joystick.pointerId = null;
  joystick.x = 0;
  joystick.y = 0;
  joystickKnob.style.transform = '';
}
joystickBase.addEventListener('pointerup', releaseJoystick);
joystickBase.addEventListener('pointercancel', releaseJoystick);

$('jumpButton').addEventListener('pointerdown', (event) => {
  event.preventDefault();
  jumpRequested = true;
});

// =====================================================================
// Build mode: preview, place, remove, undo
// =====================================================================
const raycaster = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const groundHit = new THREE.Vector3();
const hitNormal = new THREE.Vector3();

const ghostMaterial = new THREE.MeshBasicMaterial({ color: 0x4caf50, transparent: true, opacity: 0.45, depthWrite: false });
let ghost = null;
let ghostType = null;
const highlightBox = new THREE.Box3();
const deleteHighlight = new THREE.Box3Helper(highlightBox, 0xff4444);
deleteHighlight.visible = false;
scene.add(deleteHighlight);

// Outline of the plot the build cursor is in: green = yours, red = not buildable, white = free to claim.
const plotCursor = new THREE.LineLoop(
  rectangleOutline({ minX: -0.5, maxX: 0.5, minZ: -0.5, maxZ: 0.5 }, 0),
  new THREE.LineBasicMaterial({ color: 0xffffff })
);
plotCursor.visible = false;
scene.add(plotCursor);

let toastTimer = null;
function toast(message) {
  const element = $('toast');
  element.textContent = message;
  element.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    element.hidden = true;
  }, 1800);
}

function pickPlaced(ndc) {
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects(placedGroup.children, true);
  for (const hit of hits) {
    let node = hit.object;
    while (node && !node.userData.objectId) {
      node = node.parent;
    }
    if (node) {
      return { hit, id: node.userData.objectId };
    }
  }
  return null;
}

function hitsFixedScenery(b) {
  for (const box of boxColliders) {
    if (b.minX < box.maxX && b.maxX > box.minX && b.minZ < box.maxZ && b.maxZ > box.minZ && b.minY < 8) {
      return true;
    }
  }
  for (const c of circleColliders) {
    const nearestX = clamp(c.x, b.minX, b.maxX);
    const nearestZ = clamp(c.z, b.minZ, b.maxZ);
    if ((nearestX - c.x) ** 2 + (nearestZ - c.z) ** 2 < c.r * c.r && b.minY < 4) {
      return true;
    }
  }
  return false;
}

function overlapsPlayer(b) {
  const r = CONFIG.playerRadius;
  const p = player.position;
  return p.x > b.minX - r && p.x < b.maxX + r && p.z > b.minZ - r && p.z < b.maxZ + r
    && b.minY < p.y + CONFIG.playerHeight && b.maxY > p.y + 0.05;
}

function computePlacement(ndc) {
  const picked = pickPlaced(ndc); // also aims the raycaster
  const groundPoint = raycaster.ray.intersectPlane(groundPlane, groundHit);
  let point;
  if (picked && (!groundPoint || picked.hit.distance < raycaster.ray.origin.distanceTo(groundPoint))) {
    point = picked.hit.point;
    hitNormal.copy(picked.hit.face.normal).transformDirection(picked.hit.object.matrixWorld);
  } else if (groundPoint) {
    point = groundPoint;
    hitNormal.set(0, 1, 0);
  } else {
    return null;
  }

  // Step slightly off the surface we hit, snap to the grid, stack on what's there.
  const x = Math.round(point.x + hitNormal.x * 0.05);
  const z = Math.round(point.z + hitNormal.z * 0.05);
  const { top, blocked } = cellTop(x, z);
  const data = { type: build.type, x, y: top, z, rot: build.rotation, color: build.color };
  const bounds = objectBounds(data);
  const def = CATALOG[build.type];
  const landRulesApply = network.online; // solo/offline mode builds locally without land rules
  const plot = plotAtCell(x, z);

  let reason = null;
  if (blocked) {
    reason = "Can't stack on that";
  } else if (Math.hypot(x, z) > CONFIG.build.radius) {
    reason = 'Outside the town limits';
  } else if (landRulesApply && isPublicCell(x, z)) {
    reason = 'Public land: build on your own plot';
  } else if (landRulesApply && !plot) {
    reason = 'Claim this plot first (stand on it and press Claim)';
  } else if (landRulesApply && !canBuildOnPlot(plot)) {
    reason = `This is ${plot.data.ownerName}'s plot (ask them to /invite you)`;
  } else if (bounds.maxY > CONFIG.build.maxHeight) {
    reason = 'Too high';
  } else if (Math.hypot(x - player.position.x, z - player.position.z) > CONFIG.build.reach) {
    reason = 'Too far away, walk closer';
  } else if (hitsFixedScenery(bounds)) {
    reason = 'Blocked by scenery';
  } else if (def.solid && overlapsPlayer(bounds)) {
    reason = "You're standing there";
  }
  return { ...data, valid: !reason, reason, plotKey: plotKeyForCell(x, z) };
}

function newObjectId() {
  build.counter += 1;
  return `${player.id.slice(0, 8)}-${build.counter.toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function canRemove(entry) {
  if (entry.pending || !network.online || entry.data.owner === ownerTag) {
    return true;
  }
  const plot = plotAtCell(entry.data.x, entry.data.z);
  return Boolean(plot && plot.data.owner === ownerTag); // you can clear anything on your own land
}

function requestRemove(id) {
  const entry = placed.get(id);
  if (!entry) {
    return false;
  }
  if (!canRemove(entry)) {
    toast('That was built by someone else');
    return false;
  }
  recentlyRemoved.set(id, entry.data);
  removePlacedObject(id); // optimistic: the server confirms or we put it back
  network.outgoingBuild.push({ op: 'remove', id });
  return true;
}

function handleBuildTap() {
  if (build.deleteMode) {
    const picked = pickPlaced(build.pointer);
    if (picked) {
      requestRemove(picked.id);
    }
    return;
  }
  const placement = computePlacement(build.pointer);
  if (!placement) {
    return;
  }
  if (!placement.valid) {
    toast(placement.reason);
    return;
  }
  if (economyUI && !economyUI.canAfford(placement.type)) {
    toast(`Not enough coins: a ${CATALOG[placement.type].label} costs ${economyUI.costOf(placement.type)} coins. Sell goods at the market.`);
    return;
  }
  const data = {
    id: newObjectId(),
    type: placement.type,
    x: placement.x,
    y: placement.y,
    z: placement.z,
    rot: placement.rot,
    color: placement.color,
    owner: ownerTag,
  };
  addPlacedObject(data, true); // optimistic: appears instantly
  network.outgoingBuild.push({ op: 'place', object: data });
  build.undoStack.push(data.id);
  if (build.undoStack.length > 200) {
    build.undoStack.shift();
  }
}

function undoLastBuild() {
  while (build.undoStack.length) {
    const id = build.undoStack.pop();
    if (placed.has(id)) {
      requestRemove(id);
      return;
    }
  }
  toast('Nothing to undo');
}

function ensureGhost() {
  if (ghostType === build.type) {
    return;
  }
  if (ghost) {
    scene.remove(ghost);
  }
  ghost = createObjectMesh(build.type, '#ffffff');
  ghost.traverse((node) => {
    if (node.isMesh) {
      node.material = ghostMaterial;
      node.renderOrder = 5;
    }
  });
  scene.add(ghost);
  ghostType = build.type;
}

function updateBuildPreview() {
  deleteHighlight.visible = false;
  plotCursor.visible = false;
  if (ghost) {
    ghost.visible = false;
  }
  if (!build.active) {
    return;
  }
  if (build.deleteMode) {
    if (isTouch) {
      return; // no hover on touch screens
    }
    const picked = pickPlaced(build.pointer);
    const entry = picked && placed.get(picked.id);
    if (entry) {
      highlightBox.setFromObject(entry.root);
      deleteHighlight.material.color.set(canRemove(entry) ? 0xff4444 : 0x9e9e9e);
      deleteHighlight.visible = true;
    }
    return;
  }
  ensureGhost();
  const placement = computePlacement(build.pointer);
  if (!placement) {
    return;
  }
  ghost.visible = true;
  ghost.position.set(placement.x, placement.y, placement.z);
  ghost.rotation.y = (placement.rot * Math.PI) / 2;
  ghostMaterial.color.set(placement.valid ? 0x4caf50 : 0xe53935);

  if (network.online && !isPublicCell(placement.x, placement.z)) {
    const bounds = plotBounds(placement.plotKey);
    const plot = plots.get(placement.plotKey);
    plotCursor.position.set(bounds.centerX, 0.08, bounds.centerZ);
    plotCursor.scale.set(rules.plotSize, 1, rules.plotSize);
    plotCursor.material.color.set(!plot ? 0xffffff : canBuildOnPlot(plot) ? 0x4caf50 : 0xe53935);
    plotCursor.visible = true;
  }
}

// ---------- Plot panel (claim / abandon the plot you're standing on) ----------
let plotPanelState = '';
let plotPanelKey = null;
let plotPanelAction = null;
let likedPlots = new Set(); // plot keys this person has starred (from the server)

function updatePlotPanel() {
  const x = Math.round(player.position.x);
  const z = Math.round(player.position.z);
  const key = plotKeyForCell(x, z);
  const plot = plots.get(key);
  let text;
  let action = null;
  let plotIcon = '';

  if (!network.online) {
    text = 'Offline: builds stay on this device';
  } else if (isPublicCell(x, z) && !plot) {
    text = 'Public land';
    plotIcon = 'landmark';
  } else if (plot && plot.data.owner === ownerTag) {
    const likes = plot.data.likes;
    text = likes ? `Your plot · ${likes} ${likes === 1 ? 'star' : 'stars'}` : 'Your plot';
    plotIcon = 'home';
    action = 'abandon';
  } else if (plot && canBuildOnPlot(plot)) {
    text = `${plot.data.ownerName}'s plot · you can build`;
    plotIcon = 'hammer';
  } else if (plot) {
    text = `${plot.data.ownerName}'s plot`;
    plotIcon = 'home';
  } else if (!isClaimablePlot(key)) {
    text = plotBlockReason(key);
    plotIcon = 'landmark';
  } else {
    const owned = myPlotCount();
    const price = rules.economy?.plotPrices?.[owned] ?? 0;
    plotIcon = 'sprout';
    if (owned >= rules.maxPlots) {
      text = `Free plot · you own ${owned}/${rules.maxPlots}`;
    } else {
      text = price ? `Free plot · ${price} coins` : 'Free plot · your first is free';
      action = 'claim';
    }
  }

  // Visitors can star someone else's plot (the showcase); builders can't star their own.
  const canStar = Boolean(network.online && plot && plot.data.owner !== ownerTag && !canBuildOnPlot(plot));
  const starred = canStar && likedPlots.has(key);
  const likes = plot?.data.likes || 0;
  const state = `${key}|${plotIcon}|${text}|${action}|${canStar}|${starred}|${likes}`;
  if (state === plotPanelState) {
    return;
  }
  plotPanelState = state;
  plotPanelKey = key;
  plotPanelAction = action;
  setLabel($('plotText'), plotIcon, text);
  $('plotShare').hidden = !(network.online && plot);
  $('plotAction').hidden = !action;
  const claimPrice = rules.economy?.plotPrices?.[myPlotCount()] ?? 0;
  $('plotAction').textContent = action === 'claim' ? (claimPrice ? `Buy plot (${claimPrice} coins)` : 'Claim plot') : 'Abandon';
  $('plotAction').classList.toggle('danger', action === 'abandon');
  $('plotLike').hidden = !canStar;
  setLabel($('plotLike'), starred ? 'star-fill' : 'star', starred ? `Starred · ${likes}` : `Star · ${likes}`);
  $('plotLike').classList.toggle('starred', starred);
}

$('plotAction').addEventListener('click', withBlur(() => {
  if (plotPanelAction === 'claim') {
    const price = rules.economy?.plotPrices?.[myPlotCount()] ?? 0;
    const coins = economyUI?.coins();
    if (price && coins !== null && coins < price) {
      toast(`This plot costs ${price} coins and you have ${coins}. Produce goods and sell them at the market.`);
      return;
    }
    network.outgoingBuild.push({ op: 'claim', plot: plotPanelKey });
    toast(price ? `Buying plot for ${price} coins…` : 'Claiming plot…');
  } else if (plotPanelAction === 'abandon') {
    if (confirm('Abandon this plot? Everything built on it will be removed.')) {
      network.outgoingBuild.push({ op: 'abandon', plot: plotPanelKey });
    }
  }
}));

$('plotShare').addEventListener('click', withBlur(() => socialUI.share(plotPanelKey)));
$('plotLike').addEventListener('click', withBlur(() => {
  network.outgoingBuild.push({ op: 'like', plot: plotPanelKey });
}));

// ---------- Build UI ----------
function selectBuildType(type) {
  build.type = type;
  build.color = CATALOG[type].color;
  build.deleteMode = false;
  refreshBuildUI();
}

function selectBuildColor(color) {
  build.color = color;
  build.deleteMode = false;
  refreshBuildUI();
}

function rotateBuild() {
  build.rotation = (build.rotation + 1) % 4;
}

function toggleDeleteMode() {
  build.deleteMode = !build.deleteMode;
  refreshBuildUI();
}

function toggleBuildMode(force) {
  build.active = typeof force === 'boolean' ? force : !build.active;
  build.deleteMode = false;
  if (build.active && network.online && myPlotCount() === 0) {
    toast('Claim a free plot first: walk onto open land and press Claim');
  }
  refreshBuildUI();
}

function refreshBuildUI() {
  $('buildBar').hidden = !build.active;
  document.body.classList.toggle('building', build.active);
  setLabel($('buildButton'), build.active ? 'check' : 'hammer', build.active ? 'Done' : 'Build');
  $('buildButton').classList.toggle('active', build.active);
  document.querySelectorAll('.build-item').forEach((button) => {
    button.classList.toggle('selected', button.dataset.type === build.type && !build.deleteMode);
  });
  document.querySelectorAll('.build-color').forEach((swatch) => {
    swatch.classList.toggle('selected', swatch.dataset.color === build.color);
  });
  $('deleteButton').classList.toggle('active', build.deleteMode);
  if (rules.economy) {
    document.querySelectorAll('.build-item').forEach((button) => {
      const cost = rules.economy.buildCosts?.[button.dataset.type] ?? 0;
      const costLabel = button.querySelector('.cost');
      if (costLabel.dataset.cost !== String(cost)) {
        costLabel.dataset.cost = String(cost);
        setLabel(costLabel, cost ? 'coin' : '', cost ? String(cost) : 'free');
      }
    });
  }
  $('hint').textContent = build.active
    ? 'Click to place · R rotate · 1-9 items · X remove (refund) · Ctrl+Z undo · B / Esc done · drag to look'
    : 'WASD / arrows move · Shift run · Space jump · E use (sit / collect / market) · drag to look · Enter chat · B build';
}

function withBlur(handler) {
  return (event) => {
    event.currentTarget.blur(); // keep Space / Enter for the game, not the button
    handler();
  };
}

function setupBuildUI() {
  CATALOG_KEYS.forEach((type, index) => {
    const def = CATALOG[type];
    const button = document.createElement('button');
    button.className = 'build-item';
    button.dataset.type = type;
    button.title = `${def.label} (${index + 1})`;
    const icon = document.createElement('span');
    icon.className = 'icon';
    icon.append(svgIcon(def.icon));
    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = def.label;
    const cost = document.createElement('span');
    cost.className = 'cost';
    button.append(icon, label, cost);
    if (def.producer) {
      button.classList.add('producer');
    }
    button.addEventListener('click', withBlur(() => selectBuildType(type)));
    $('buildItems').append(button);
  });
  for (const color of BUILD_COLORS) {
    const swatch = document.createElement('button');
    swatch.className = 'build-color';
    swatch.dataset.color = color;
    swatch.style.background = color;
    swatch.setAttribute('aria-label', `Colour ${color}`);
    swatch.addEventListener('click', withBlur(() => selectBuildColor(color)));
    $('buildColors').append(swatch);
  }
  $('rotateButton').addEventListener('click', withBlur(rotateBuild));
  $('deleteButton').addEventListener('click', withBlur(toggleDeleteMode));
  $('undoButton').addEventListener('click', withBlur(undoLastBuild));
  $('buildButton').addEventListener('click', withBlur(() => toggleBuildMode()));
$('sitButton').addEventListener('click', withBlur(() => toggleSit())); // toggleSit is hoisted
  refreshBuildUI();
}
setupBuildUI();

// =====================================================================
// Per-frame simulation
// =====================================================================
// =====================================================================
// Sitting on benches (plaza benches and benches people have built)
// =====================================================================
const SEAT_REACH = 1.6; // how close you need to be to sit down (m)
const STAND_UP_STEP = 0.95; // you stand up in front of the seat, clear of the bench
const MOVE_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'];
const sitButton = $('sitButton');
let seatCheckTimer = 0;

function benchSeatsOf(data) {
  const ry = (data.rot * Math.PI) / 2;
  return [-1, 1].map((side) => {
    const localX = side * 0.4;
    const localZ = 0.02;
    return {
      x: data.x + localX * Math.cos(ry) + localZ * Math.sin(ry),
      y: data.y,
      z: data.z - localX * Math.sin(ry) + localZ * Math.cos(ry),
      ry,
    };
  });
}

function allSeats() {
  const seats = [...scenery.benchSeats];
  for (const entry of placed.values()) {
    if (entry.data.type === 'bench' && !entry.pending) {
      seats.push(...benchSeatsOf(entry.data));
    }
  }
  return seats;
}

function seatTaken(seat) {
  for (const remote of remotePlayers.values()) {
    if (remote.pose === 'sit' && Math.hypot(remote.target.x - seat.x, remote.target.z - seat.z) < 0.3) {
      return true;
    }
  }
  return false;
}

function nearestFreeSeat() {
  let best = null;
  let bestDistance = SEAT_REACH;
  for (const seat of allSeats()) {
    const distance = Math.hypot(seat.x - player.position.x, seat.z - player.position.z);
    if (distance < bestDistance && Math.abs(seat.y - player.position.y) < 1.2 && !seatTaken(seat)) {
      best = seat;
      bestDistance = distance;
    }
  }
  return best;
}

function sitDown(seat) {
  player.sitting = seat;
  player.position.set(seat.x, seat.y, seat.z);
  player.yaw = seat.ry;
  player.velocityY = 0;
  player.onGround = true;
  player.moving = false;
  cameraState.yaw = seat.ry + Math.PI; // look at what you are sitting in front of
  seatCheckTimer = 0;
}

function standUp() {
  const seat = player.sitting;
  player.sitting = null;
  if (seat) {
    player.position.x = seat.x + Math.sin(seat.ry) * STAND_UP_STEP;
    player.position.z = seat.z + Math.cos(seat.ry) * STAND_UP_STEP;
  }
  seatCheckTimer = 0;
}

// What E / the action button does right now: stand up > market > collect > sit.
function contextAction() {
  if (player.sitting) {
    return { icon: 'stand', label: 'Stand up', run: standUp };
  }
  if (build.active) {
    return null;
  }
  const economic = economyUI?.nearestAction();
  if (economic) {
    return economic;
  }
  const seat = nearestFreeSeat();
  return seat ? { icon: 'chair', label: 'Sit', run: () => sitDown(seat) } : null;
}

function toggleSit() {
  const action = contextAction();
  if (action) {
    action.run();
    seatCheckTimer = 0;
  } else {
    toast('Walk up to a bench, one of your producers or the market stall');
  }
}

function refreshSitButton(dt) {
  seatCheckTimer -= dt;
  if (seatCheckTimer > 0) {
    return;
  }
  seatCheckTimer = 0.25;
  const action = contextAction();
  sitButton.hidden = !action;
  const actionKey = action ? `${action.icon}|${action.label}` : '';
  if (action && sitButton.dataset.key !== actionKey) {
    sitButton.dataset.key = actionKey;
    setLabel(sitButton, action.icon, action.label);
  }
}

function updateSittingPlayer(dt) {
  const wantsToMove =
    Math.hypot(joystick.x, joystick.y) > 0.3 || jumpRequested || MOVE_KEYS.some((code) => keys.has(code));
  if (wantsToMove) {
    jumpRequested = false;
    standUp();
    return false;
  }
  player.moving = false;
  const avatar = player.avatar;
  avatar.root.position.copy(player.position);
  avatar.root.rotation.y = player.yaw;
  animateAvatar(avatar, 0, false, dt, 'sit');
  const bubble = performance.now() < player.bubbleUntil ? player.bubble : '';
  drawLabel(avatar.label, labelName(player.name, juice.level()), bubble);
  refreshSitButton(dt);
  return true;
}

function updatePlayer(dt) {
  if (player.sitting && updateSittingPlayer(dt)) {
    return;
  }
  let inputX = joystick.x;
  let inputForward = -joystick.y;
  if (keys.has('KeyW') || keys.has('ArrowUp')) {
    inputForward += 1;
  }
  if (keys.has('KeyS') || keys.has('ArrowDown')) {
    inputForward -= 1;
  }
  if (keys.has('KeyD') || keys.has('ArrowRight')) {
    inputX += 1;
  }
  if (keys.has('KeyA') || keys.has('ArrowLeft')) {
    inputX -= 1;
  }
  const inputLength = Math.hypot(inputX, inputForward);
  if (inputLength > 1) {
    inputX /= inputLength;
    inputForward /= inputLength;
  }

  const running = keys.has('ShiftLeft') || keys.has('ShiftRight') || Math.hypot(joystick.x, joystick.y) > 0.95;
  const speed = running ? CONFIG.runSpeed : CONFIG.walkSpeed;

  // The camera sits behind the player at +[sin(yaw), cos(yaw)], so "forward" is the opposite direction.
  const sinYaw = Math.sin(cameraState.yaw);
  const cosYaw = Math.cos(cameraState.yaw);
  const moveX = (cosYaw * inputX - sinYaw * inputForward) * speed;
  const moveZ = (-sinYaw * inputX - cosYaw * inputForward) * speed;

  player.moving = inputLength > 0.05;
  if (player.moving) {
    player.position.x += moveX * dt;
    player.position.z += moveZ * dt;
    player.yaw = lerpAngle(player.yaw, Math.atan2(moveX, moveZ), 1 - Math.exp(-12 * dt));
  }
  resolveCollisions(player.position);

  // Vertical: jump, gravity, land on the ground or on top of builds, walk off edges.
  if ((keys.has('Space') || jumpRequested) && player.onGround) {
    player.velocityY = CONFIG.jumpSpeed;
    player.onGround = false;
  }
  jumpRequested = false;
  const floor = floorHeightAt(player.position);
  player.velocityY -= CONFIG.gravity * dt;
  player.position.y += player.velocityY * dt;
  if (player.position.y <= floor) {
    player.position.y = floor;
    player.velocityY = 0;
    player.onGround = true;
  } else if (player.position.y > floor + 0.02) {
    player.onGround = false;
  }

  const avatar = player.avatar;
  avatar.root.position.copy(player.position);
  avatar.root.rotation.y = player.yaw;
  const groundSpeed = player.moving ? speed * Math.min(1, inputLength) : 0;
  animateAvatar(avatar, groundSpeed, !player.onGround, dt);
  const bubble = performance.now() < player.bubbleUntil ? player.bubble : '';
  drawLabel(avatar.label, labelName(player.name, juice.level()), bubble);
  refreshSitButton(dt);
}

const cameraTarget = new THREE.Vector3();
const cameraDirection = new THREE.Vector3();
const cameraRay = new THREE.Raycaster();
let cameraDistanceNow = CONFIG.camera.distance;

// Third-person camera that slides in front of walls, trees and builds instead of
// clipping behind them, then eases back out when the view clears.
function updateCamera(dt) {
  const { yaw, pitch, distance } = cameraState;
  cameraTarget.copy(player.position).add({ x: 0, y: 1.6, z: 0 });
  cameraDirection.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));

  cameraRay.set(cameraTarget, cameraDirection);
  cameraRay.camera = camera; // required if a build ever contains sprites
  cameraRay.far = distance + 0.4;
  const hit = cameraRay.intersectObjects([...scenery.cameraOccluders, placedGroup], true)[0];
  const allowed = hit ? Math.max(1.0, hit.distance - 0.4) : distance;
  const ease = allowed < cameraDistanceNow ? 1 : 1 - Math.exp(-3 * dt); // snap in, ease out
  cameraDistanceNow += (allowed - cameraDistanceNow) * ease;

  camera.position.copy(cameraTarget).addScaledVector(cameraDirection, cameraDistanceNow);
  camera.position.y = Math.max(0.4, camera.position.y);
  camera.lookAt(cameraTarget);
  camera.updateMatrixWorld();
}

// =====================================================================
// Other players
// =====================================================================
const remotePlayers = new Map();

// complete = false: the server left out far-away people this time (lite sync), so keep them.
function applyRemoteState(states, complete = true) {
  const seen = new Set();
  for (const state of states) {
    if (state.id === player.id) {
      continue;
    }
    seen.add(state.id);
    let remote = remotePlayers.get(state.id);
    if (!remote || remote.color !== state.color) {
      if (remote) {
        disposeAvatar(remote.avatar);
      }
      remote = {
        color: state.color,
        avatar: createAvatar(state.color, state.name),
        target: new THREE.Vector3(state.x, state.y, state.z),
        targetYaw: state.ry,
      };
      remote.avatar.root.position.copy(remote.target);
      remotePlayers.set(state.id, remote);
    }
    remote.target.set(state.x, state.y, state.z);
    remote.targetYaw = state.ry;
    remote.moving = state.moving;
    remote.pose = state.pose === 'sit' ? 'sit' : 'stand';
    remote.npc = Boolean(state.npc);
    remote.name = state.name;
    drawLabel(remote.avatar.label, labelName(state.name, state.level), state.bubble);
  }

  for (const [id, remote] of remotePlayers) {
    if (complete && !seen.has(id)) {
      disposeAvatar(remote.avatar);
      remotePlayers.delete(id);
    }
  }
}

function updateRemotePlayers(dt) {
  const smoothing = 1 - Math.exp(-10 * dt); // hides the 10 Hz update steps
  for (const remote of remotePlayers.values()) {
    const root = remote.avatar.root;
    const previousX = root.position.x;
    const previousZ = root.position.z;
    const previousY = root.position.y;
    root.position.lerp(remote.target, smoothing);
    root.rotation.y = lerpAngle(root.rotation.y, remote.targetYaw, smoothing);
    const measuredSpeed = Math.hypot(root.position.x - previousX, root.position.z - previousZ) / Math.max(dt, 1e-3);
    remote.speed = (remote.speed || 0) + (measuredSpeed - (remote.speed || 0)) * Math.min(1, dt * 6);
    const airborne = remote.target.y > 0.05 && Math.abs(root.position.y - previousY) > dt * 0.5;
    animateAvatar(remote.avatar, remote.moving ? remote.speed : remote.speed * 0.5, airborne, dt, remote.pose);
  }
}

// =====================================================================
// Networking (simple HTTP sync — swap for WebSockets when scaling up)
// =====================================================================
const network = {
  chatSince: 0,
  outgoingChat: [],
  outgoingBuild: [],
  worldSeq: -1,
  worldEpoch: '',
  online: false,
  playerCount: 1,
  townsfolk: 0,
};
economyUI = createEconomy({ $, toast, network, player, placed, rules, getOwnerTag: () => ownerTag });
const accountUI = createAccountUI({
  $,
  toast,
  getOwnerKey: () => ownerKey,
  setOwnerKey,
  newGuestKey,
  isInWorld: () => inWorld,
  onLoggedIn: (username) => enterWorld(username),
});
// Jump somewhere (used by /visit, /home and ?visit= links), facing a point of interest.
function teleportTo(x, z, faceX = 0, faceZ = 0) {
  player.sitting = null;
  player.position.set(x, 0, z);
  player.velocityY = 0;
  player.onGround = false; // fall onto whatever is there
  player.yaw = Math.atan2(faceX - x, faceZ - z);
  cameraState.yaw = player.yaw + Math.PI;
}

function findPlayerByName(name) {
  const wanted = name.toLowerCase();
  for (const remote of remotePlayers.values()) {
    if (remote.name && remote.name.toLowerCase() === wanted) {
      return { name: remote.name, x: remote.target.x, z: remote.target.z };
    }
  }
  return null;
}

const socialUI = createSocialUI({
  $,
  toast,
  say: addChatLine,
  network,
  plots,
  plotBounds,
  getOwnerTag: () => ownerTag,
  getAccount: () => accountUI.account,
  getPlayerCell: () => {
    const x = Math.round(player.position.x);
    const z = Math.round(player.position.z);
    return { x, z, key: plotKeyForCell(x, z) };
  },
  findPlayer: findPlayerByName,
  teleport: teleportTo,
});
const townFeed = createTownFeed({ $, teleport: teleportTo, toast, isTouch });
const juice = createJuice({ $, camera, getPlayerPosition: () => player.position, isTouch });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function setStatus(state, text) {
  $('statusDot').className = state;
  $('statusText').textContent = text;
}

function refreshStatus() {
  if (!network.online) {
    setStatus('offline', `offline · solo mode · ${placed.size} builds`);
    return;
  }
  const people = network.playerCount === 1 ? 'person' : 'people';
  const townsfolk = network.townsfolk ? ` · ${network.townsfolk} townsfolk` : '';
  setStatus('online', `${network.playerCount} ${people} online${townsfolk} · ${placed.size} builds`);
}

function addChatLine(name, text) {
  const line = document.createElement('div');
  line.className = 'chat-line';
  const author = document.createElement('b');
  author.textContent = name;
  line.append(author, document.createTextNode(text));
  const log = $('chatLog');
  log.append(line);
  while (log.children.length > 8) {
    log.firstChild.remove();
  }
}

function applyWorldSnapshot(objects) {
  const serverIds = new Set(objects.map((o) => o.id));
  for (const [id, entry] of placed) {
    if (!serverIds.has(id) && !entry.pending) {
      removePlacedObject(id);
    }
  }
  for (const object of objects) {
    addPlacedObject(object, false);
  }
}

function applyWorldOps(ops) {
  for (const op of ops) {
    if (op.op === 'add') {
      addPlacedObject(op.object, false);
    } else if (op.op === 'update') {
      const entry = placed.get(op.object.id);
      if (entry) {
        entry.data = { ...entry.data, ...op.object };
      }
    } else if (op.op === 'remove') {
      removePlacedObject(op.id);
      recentlyRemoved.delete(op.id);
    } else if (op.op === 'plot') {
      const isNewClaimOfMine = op.plot.owner === ownerTag && !plots.has(op.plot.key);
      upsertPlot(op.plot);
      if (isNewClaimOfMine) {
        toast('Plot claimed! Press B to build on it');
      }
    } else if (op.op === 'unplot') {
      removePlot(op.key);
    }
  }
}

function handleRejected(ids) {
  if (!ids.length) {
    return;
  }
  let buildRejected = false;
  for (const id of ids) {
    if (id.startsWith('plot:')) {
      toast("Couldn't claim that plot (someone may have just taken it)");
      continue;
    }
    buildRejected = true;
    const entry = placed.get(id);
    if (entry && entry.pending) {
      removePlacedObject(id);
    } else if (recentlyRemoved.has(id)) {
      addPlacedObject(recentlyRemoved.get(id), false);
      recentlyRemoved.delete(id);
    }
  }
  if (buildRejected) {
    toast('The server refused some builds (your land or build limits)');
  }
}

function showBanNotice(ban) {
  let notice = $('banNotice');
  if (!notice) {
    notice = document.createElement('div');
    notice.id = 'banNotice';
    notice.setAttribute('role', 'alert');
    document.body.append(notice);
  }
  const until = ban.until ? `until ${new Date(ban.until * 1000).toLocaleString()}` : 'for good';
  notice.textContent = `You've been removed from the town ${until}. Reason: ${ban.reason || 'breaking the town rules'}.`;
  notice.hidden = false;
}

function hideBanNotice() {
  const notice = $('banNotice');
  if (notice) {
    notice.hidden = true;
  }
}

async function syncLoop() {
  for (;;) {
    const startedAt = performance.now();
    const chatToSend = network.outgoingChat.slice(0, 5);
    const buildToSend = network.outgoingBuild.slice(0, CONFIG.build.maxOpsPerSync);
    try {
      const response = await fetch('api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: player.id,
          ownerKey,
          name: player.name,
          color: player.color,
          x: +player.position.x.toFixed(2),
          y: +player.position.y.toFixed(2),
          z: +player.position.z.toFixed(2),
          ry: +player.yaw.toFixed(3),
          moving: player.moving,
          pose: player.sitting ? 'sit' : 'stand',
          chat: chatToSend,
          chatSince: network.chatSince,
          build: buildToSend,
          worldSince: network.worldSeq,
          worldEpoch: network.worldEpoch,
          feedSince: townFeed.since(),
          topSince: townFeed.topSince(),
          lite: LITE_SYNC,
        }),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      if (data.banned) {
        // A moderator removed this player: show why and check again every 30 s (bans can expire).
        showBanNotice(data.banned);
        network.outgoingChat.length = 0;
        network.outgoingBuild.length = 0;
        applyRemoteState([]);
        await sleep(30000);
        continue;
      }
      hideBanNotice();
      network.outgoingChat.splice(0, chatToSend.length);
      network.outgoingBuild.splice(0, buildToSend.length);
      network.online = true;
      ownerTag = data.you?.ownerTag ?? ownerTag;
      if (Array.isArray(data.you?.liked)) {
        likedPlots = new Set(data.you.liked);
      }
      if (typeof data.townHour === 'number') {
        const firstReading = townClock.hour === null;
        townClock.hour = data.townHour;
        townClock.at = performance.now();
        if (firstReading) {
          updateSky(); // switch from this device's clock to the town clock straight away
        }
      }

      for (const message of data.chat) {
        addChatLine(message.name, message.text);
        network.chatSince = Math.max(network.chatSince, message.id);
      }
      if (data.rules) {
        Object.assign(rules, data.rules);
        refreshBuildUI();
      }
      if (data.plotSnapshot) {
        applyPlotSnapshot(data.plotSnapshot);
      }
      if (data.worldSnapshot) {
        applyWorldSnapshot(data.worldSnapshot);
      }
      if (data.worldOps) {
        applyWorldOps(data.worldOps);
      }
      handleRejected(data.rejected || []);
      economyUI.applyReply(data);
      accountUI.applyReply(data);
      socialUI.applyReply(data);
      townFeed.applyReply(data);
      juice.applyReply(data);
      network.worldSeq = data.worldSeq;
      network.worldEpoch = data.worldEpoch;

      const playersFull = data.playersFull !== false;
      applyRemoteState(data.players, playersFull);
      if (playersFull) {
        network.playerCount = data.players.filter((p) => !p.npc).length;
        network.townsfolk = data.players.length - network.playerCount;
      }
    } catch (error) {
      // Builds stay queued and are sent when the connection comes back.
      network.online = false;
      network.worldEpoch = '';
      economyUI.goOffline();
      applyRemoteState([]);
      refreshStatus();
      await sleep(2000);
    }
    refreshStatus();
    await sleep(Math.max(0, CONFIG.syncIntervalMs - (performance.now() - startedAt)));
  }
}

$('chatForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const text = chatInput.value.trim().slice(0, 140);
  chatInput.value = '';
  chatInput.blur();
  if (!text) {
    return;
  }
  if (text.startsWith('/')) {
    socialUI.handleCommand(text);
    return;
  }
  player.bubble = text;
  player.bubbleUntil = performance.now() + 6000;
  if (network.online) {
    network.outgoingChat.push(text);
  } else {
    addChatLine(player.name, text);
  }
});
chatInput.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    chatInput.blur();
  }
});

// =====================================================================
// Join screen
// =====================================================================
const savedProfile = JSON.parse(localStorage.getItem('townsquare-profile') || '{}');
const nameInput = $('nameInput');
nameInput.value = savedProfile.name || '';
player.color = AVATAR_COLORS.includes(savedProfile.color) ? savedProfile.color : AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];

for (const color of AVATAR_COLORS) {
  const swatch = document.createElement('button');
  swatch.className = 'swatch';
  swatch.style.background = color;
  swatch.setAttribute('aria-label', color);
  swatch.classList.toggle('selected', color === player.color);
  swatch.addEventListener('click', () => {
    player.color = color;
    document.querySelectorAll('.swatch').forEach((s) => s.classList.toggle('selected', s === swatch));
  });
  $('colorPicker').append(swatch);
}

function enterWorld(name) {
  if (accountUI.account) {
    name = accountUI.account; // the server shows account holders under their username
  }
  player.name = (name || '').trim().slice(0, 16) || `Guest${Math.floor(Math.random() * 1000)}`;
  localStorage.setItem('townsquare-profile', JSON.stringify({ name: player.name, color: player.color }));
  player.avatar = createAvatar(player.color, player.name);

  $('join').hidden = true;
  $('hud').hidden = false;
  $('chat').hidden = false;
  $('buildButton').hidden = false;
  $('plotPanel').hidden = false;
  $('socialButton').hidden = false;
  townFeed.show();
  $('joystick').hidden = !isTouch;
  $('jumpButton').hidden = !isTouch;
  inWorld = true;
  syncLoop();
}

$('joinButton').addEventListener('click', () => {
  if (isTouch && document.documentElement.requestFullscreen) {
    document.documentElement.requestFullscreen().catch(() => {});
  }
  enterWorld(nameInput.value);
});
nameInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    $('joinButton').click();
  }
});
if (urlParams.has('name')) {
  enterWorld(urlParams.get('name')); // e.g. ?name=Alice skips the join screen
  if (urlParams.get('build') === '1') {
    toggleBuildMode(true); // e.g. ?name=Alice&build=1 opens straight into build mode
  }
}

if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// =====================================================================
// Main loop
// =====================================================================
const clock = new THREE.Clock();
let idleOrbit = 0;
const idleFocus = new THREE.Vector3();

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  if (inWorld) {
    updatePlayer(dt);
    updateRemotePlayers(dt);
    updateCamera(dt);
    updateBuildPreview();
    updatePlotPanel();
    economyUI.update(dt);
    juice.update(dt);
    scenery.update(dt, player.position);
  } else {
    // Slow fly-around behind the join screen.
    idleOrbit += dt * 0.05;
    camera.position.set(Math.sin(idleOrbit) * 38, 16, Math.cos(idleOrbit) * 38);
    camera.lookAt(0, 2, 0);
    scenery.update(dt, idleFocus);
  }
  instancer?.flush();
  renderer.render(scene, camera);
});

// Performance readout for testing and tuning (draw calls are for the last frame).
window.townsquareStats = () => ({
  drawCalls: renderer.info.render.calls,
  triangles: renderer.info.render.triangles,
  builds: placed.size,
  remotePlayers: remotePlayers.size,
  liteSync: LITE_SYNC,
  ...(instancer ? instancer.stats() : { batches: 0, instances: 0 }),
});
