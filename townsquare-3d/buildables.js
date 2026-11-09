// Catalog of things people can build, and the meshes that represent them.
// Every object sits on a 1 m grid cell (integer x/z), its base at height y,
// rotated in 90° steps (rot 0..3).
import * as THREE from 'three';
import { surfaces } from './textures.js';
import { createProp } from './props.js';

export const BUILD_COLORS = [
  '#f2e8cf', '#d9cdb4', '#8d6e63', '#b5543c', '#e9c46a', '#f4a261',
  '#6fae4f', '#3d5a80', '#a8dadc', '#ff6fb5', '#2d3047', '#ffffff',
];

// size = [x, height, z] of the collision box in metres.
// solid: blocks movement. standable: you can stand / stack on top of it.
export const CATALOG = {
  block:  { label: 'Block',   icon: '🧱', size: [1, 1, 1],       solid: true,  standable: true,  color: '#d9cdb4' },
  slab:   { label: 'Slab',    icon: '▬',  size: [1, 0.5, 1],     solid: true,  standable: true,  color: '#8d6e63' },
  wall:   { label: 'Wall',    icon: '▌',  size: [1, 2, 0.2],     solid: true,  standable: true,  color: '#f2e8cf' },
  glass:  { label: 'Glass',   icon: '🔳', size: [1, 1, 1],       solid: true,  standable: true,  color: '#a8dadc' },
  lamp:   { label: 'Lamp',    icon: '💡', size: [0.3, 2.7, 0.3], solid: true,  standable: false, color: '#2d3047' },
  tree:   { label: 'Tree',    icon: '🌳', size: [0.5, 3.2, 0.5], solid: true,  standable: false, color: '#3f8f3a' },
  flower: { label: 'Flowers', icon: '🌷', size: [0.8, 0.5, 0.8], solid: false, standable: false, color: '#ff6fb5' },
  bench:  { label: 'Bench',   icon: '🪑', size: [1.6, 0.9, 0.6], solid: true,  standable: true,  color: '#8d6e63' },
  // Producers (see economy.py): they make goods over time on your plot.
  field:   { label: 'Wheat field', icon: '🌾', size: [1, 0.7, 1],   solid: false, standable: false, color: '#d9b54a', producer: true },
  woodlot: { label: 'Woodlot',     icon: '🌲', size: [1, 2.2, 1],   solid: true,  standable: false, color: '#2f6b3a', producer: true },
  quarry:  { label: 'Quarry',      icon: '⛏', size: [1, 0.8, 1],   solid: true,  standable: true,  color: '#9a9a96', producer: true },
  oven:    { label: 'Oven',        icon: '🍞', size: [1, 1.6, 1],   solid: true,  standable: false, color: '#b5543c', producer: true },
  sawmill: { label: 'Sawmill',     icon: '🏭', size: [1, 1.1, 1],   solid: true,  standable: false, color: '#8d6e63', producer: true },
};
export const CATALOG_KEYS = Object.keys(CATALOG);

export const sharedMaterials = {
  lampBulb: new THREE.MeshStandardMaterial({ color: 0xfff3c4, emissive: 0xffd27a, emissiveIntensity: 0.3 }),
  trunk: new THREE.MeshStandardMaterial({ color: 0x7a5230, roughness: 1 }),
  stem: new THREE.MeshStandardMaterial({ color: 0x3f8f3a, roughness: 1 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.8 }),
};

const materialCache = new Map();
// options.texture names a surface from textures.js ('brick', 'stone', 'wood', ...), tinted by color.
function colorMaterial(color, options = {}) {
  const key = `${color}|${JSON.stringify(options)}`;
  if (!materialCache.has(key)) {
    const { texture, ...rest } = options;
    if (texture) {
      const surface = surfaces[texture]();
      rest.map = surface.map;
      rest.normalMap = surface.normalMap;
    }
    materialCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...rest }));
  }
  return materialCache.get(key);
}

// Shared geometries (base at y = 0) keep memory flat no matter how much is built.
const unitBox = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
const postGeometry = new THREE.CylinderGeometry(0.06, 0.08, 2.45, 8).translate(0, 1.225, 0);
const bulbGeometry = new THREE.SphereGeometry(0.2, 16, 10).translate(0, 2.5, 0);
const trunkGeometry = new THREE.CylinderGeometry(0.12, 0.18, 1.6, 8).translate(0, 0.8, 0);
const foliageGeometry = new THREE.IcosahedronGeometry(0.95, 0).translate(0, 2.3, 0);
const stemGeometry = new THREE.CylinderGeometry(0.02, 0.02, 0.35, 4).translate(0, 0.175, 0);
const petalGeometry = new THREE.IcosahedronGeometry(0.09, 0);
const FLOWER_SPOTS = [[-0.2, -0.15], [0.15, -0.2], [0, 0.1], [-0.15, 0.22], [0.22, 0.15]];
const wheatGeometry = new THREE.ConeGeometry(0.035, 0.55, 4).translate(0, 0.39, 0);
const coneTreeGeometry = new THREE.ConeGeometry(0.32, 1.3, 7).translate(0, 0.95, 0);
const smallTrunkGeometry = new THREE.CylinderGeometry(0.05, 0.07, 0.4, 6).translate(0, 0.2, 0);
const rockGeometry = new THREE.DodecahedronGeometry(0.3, 0);
const domeGeometry = new THREE.SphereGeometry(0.46, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2);
const bladeGeometry = new THREE.CylinderGeometry(0.28, 0.28, 0.02, 20).rotateX(Math.PI / 2);
const logGeometry = new THREE.CylinderGeometry(0.12, 0.12, 0.9, 10).rotateZ(Math.PI / 2);

function boxPart(material, sx, sy, sz, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(unitBox, material);
  mesh.scale.set(sx, sy, sz);
  mesh.position.set(x, y, z);
  return mesh;
}

export function createObjectMesh(type, color) {
  const group = new THREE.Group();
  const [sx, sy, sz] = CATALOG[type].size;

  // Producers use the Blender model once /models/props.glb has loaded (see props.js).
  const model = CATALOG[type].producer ? createProp(type, color) : null;
  if (model) {
    group.add(model);
    group.userData.model = true;
    return group;
  }

  switch (type) {
    case 'block':
    case 'wall':
      group.add(boxPart(colorMaterial(color, { texture: 'brick', roughness: 0.9 }), sx, sy, sz));
      break;
    case 'slab':
      group.add(boxPart(colorMaterial(color, { texture: 'stone', roughness: 0.9 }), sx, sy, sz));
      break;
    case 'glass':
      group.add(boxPart(colorMaterial(color, { transparent: true, opacity: 0.35, roughness: 0.03, metalness: 0.4 }), sx, sy, sz));
      break;
    case 'lamp':
      group.add(new THREE.Mesh(postGeometry, colorMaterial(color, { metalness: 0.7, roughness: 0.4 })));
      group.add(new THREE.Mesh(bulbGeometry, sharedMaterials.lampBulb));
      break;
    case 'tree':
      group.add(new THREE.Mesh(trunkGeometry, sharedMaterials.trunk));
      group.add(new THREE.Mesh(foliageGeometry, colorMaterial(color, { flatShading: true })));
      break;
    case 'flower':
      for (const [x, z] of FLOWER_SPOTS) {
        const stem = new THREE.Mesh(stemGeometry, sharedMaterials.stem);
        stem.position.set(x, 0, z);
        const petal = new THREE.Mesh(petalGeometry, colorMaterial(color));
        petal.position.set(x, 0.38, z);
        group.add(stem, petal);
      }
      break;
    case 'bench': {
      const wood = colorMaterial(color, { texture: 'wood', roughness: 0.75 });
      group.add(boxPart(wood, 1.6, 0.1, 0.5, 0, 0.42, 0.05));
      group.add(boxPart(wood, 1.6, 0.4, 0.08, 0, 0.5, -0.22));
      for (const x of [-0.7, 0.7]) {
        group.add(boxPart(sharedMaterials.dark, 0.08, 0.42, 0.45, x, 0, 0.05));
      }
      break;
    }
    case 'field': {
      group.add(boxPart(colorMaterial('#5a3e2b', { roughness: 1 }), 1, 0.12, 1));
      const wheat = colorMaterial(color, { roughness: 0.9 });
      for (let i = 0; i < 16; i++) {
        const stalk = new THREE.Mesh(wheatGeometry, wheat);
        stalk.position.set(-0.36 + (i % 4) * 0.24, 0, -0.36 + Math.floor(i / 4) * 0.24);
        stalk.rotation.z = ((i * 37) % 7 - 3) * 0.03;
        group.add(stalk);
      }
      break;
    }
    case 'woodlot':
      for (const [x, z, s] of [[-0.22, -0.2, 1], [0.24, -0.1, 0.8], [0, 0.25, 0.9]]) {
        const trunk = new THREE.Mesh(smallTrunkGeometry, sharedMaterials.trunk);
        const crown = new THREE.Mesh(coneTreeGeometry, colorMaterial(color, { flatShading: true }));
        trunk.position.set(x, 0, z);
        crown.position.set(x, 0, z);
        crown.scale.setScalar(s);
        group.add(trunk, crown);
      }
      break;
    case 'quarry': {
      const stone = colorMaterial(color, { texture: 'stone', flatShading: true });
      for (const [x, y, z, s] of [[-0.2, 0.22, -0.15, 1.1], [0.22, 0.2, 0.1, 1], [-0.05, 0.5, 0.05, 0.8], [0.15, 0.15, -0.28, 0.6]]) {
        const rock = new THREE.Mesh(rockGeometry, stone);
        rock.position.set(x, y, z);
        rock.scale.setScalar(s);
        rock.rotation.set(x * 5, z * 7, y * 3);
        group.add(rock);
      }
      break;
    }
    case 'oven': {
      const brick = colorMaterial(color, { texture: 'brick', roughness: 0.95 });
      group.add(boxPart(brick, 1, 0.55, 1));
      const dome = new THREE.Mesh(domeGeometry, brick);
      dome.position.y = 0.55;
      group.add(dome);
      group.add(boxPart(sharedMaterials.dark, 0.36, 0.26, 0.05, 0, 0.62, 0.43)); // oven mouth
      group.add(boxPart(brick, 0.16, 0.6, 0.16, 0.22, 0.9, -0.2));             // chimney
      break;
    }
    case 'sawmill': {
      const wood = colorMaterial(color, { texture: 'wood', roughness: 0.8 });
      group.add(boxPart(wood, 1, 0.08, 0.6, 0, 0.72, 0));
      for (const [x, z] of [[-0.42, -0.24], [0.42, -0.24], [-0.42, 0.24], [0.42, 0.24]]) {
        group.add(boxPart(wood, 0.08, 0.72, 0.08, x, 0, z));
      }
      const blade = new THREE.Mesh(bladeGeometry, colorMaterial('#c9ced6', { metalness: 0.9, roughness: 0.25 }));
      blade.position.set(0.15, 0.85, 0);
      group.add(blade);
      const log = new THREE.Mesh(logGeometry, sharedMaterials.trunk);
      log.position.set(-0.1, 0.92, 0.12);
      group.add(log);
      break;
    }
    default:
      group.add(boxPart(colorMaterial(color), sx, sy, sz));
  }
  return group;
}

// Axis-aligned collision box of a placed object in world space.
export function objectBounds(object) {
  const [sx, sy, sz] = CATALOG[object.type].size;
  const swapAxes = object.rot % 2 === 1;
  const halfX = (swapAxes ? sz : sx) / 2;
  const halfZ = (swapAxes ? sx : sz) / 2;
  return {
    minX: object.x - halfX,
    maxX: object.x + halfX,
    minY: object.y,
    maxY: object.y + sy,
    minZ: object.z - halfZ,
    maxZ: object.z + halfZ,
  };
}
