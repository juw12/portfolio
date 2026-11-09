// Everything that makes the world look real: physically based sky and sun that follow
// the local clock, image-based lighting, terrain with distant mountains, textured
// plaza and paths, detailed town houses, wind-blown trees and grass, a working
// fountain, street lamps, clouds and stars.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { surfaces, repeatedSurface, setMaxAnisotropy } from './textures.js';
import { createObjectMesh, sharedMaterials } from './buildables.js';
import { MARKET } from './economy.js';

export const QUALITY_PRESETS = {
  high: { shadows: true, shadowMapSize: 2048, grassTufts: 6000, plazaLights: 4, spray: 500, pixelRatio: 2 },
  medium: { shadows: true, shadowMapSize: 1024, grassTufts: 1800, plazaLights: 0, spray: 240, pixelRatio: 1.5 },
  low: { shadows: false, shadowMapSize: 512, grassTufts: 0, plazaLights: 0, spray: 100, pixelRatio: 1 },
};

// ---------------------------------------------------------------- helpers
function mulberry32(seed) {
  return function next() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(ix, iz, seed) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263) ^ Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

function valueNoise(x, z, seed) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const u = fx * fx * (3 - 2 * fx);
  const v = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz, seed);
  const b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed);
  const d = hash2(ix + 1, iz + 1, seed);
  return (a + (b - a) * u) + ((c + (d - c) * u) - (a + (b - a) * u)) * v;
}

function fbm(x, z, seed, octaves = 5) {
  let sum = 0;
  let amplitude = 0.5;
  let frequency = 1;
  for (let i = 0; i < octaves; i++) {
    sum += amplitude * valueNoise(x * frequency, z * frequency, seed + i * 31);
    amplitude *= 0.5;
    frequency *= 2.03;
  }
  return sum;
}

const smoothstep = (edge0, edge1, x) => {
  const t = THREE.MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

const tmpObject = new THREE.Object3D();
function matrixFrom(px, py, pz, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  tmpObject.position.set(px, py, pz);
  tmpObject.rotation.set(rx, ry, rz);
  tmpObject.scale.set(sx, sy, sz);
  tmpObject.updateMatrix();
  return tmpObject.matrix.clone();
}

// Collects many small static parts and merges them into one mesh per material (few draw calls).
class GeometryBatch {
  constructor() {
    this.parts = new Map();
  }

  add(geometry, material, matrix) {
    const copy = geometry.clone();
    copy.applyMatrix4(matrix);
    if (!this.parts.has(material)) {
      this.parts.set(material, []);
    }
    this.parts.get(material).push(copy);
  }

  build(target, { castShadow = true, receiveShadow = true } = {}) {
    for (const [material, geometries] of this.parts) {
      const mesh = new THREE.Mesh(mergeGeometries(geometries, false), material);
      mesh.castShadow = castShadow;
      mesh.receiveShadow = receiveShadow;
      target.add(mesh);
      geometries.forEach((g) => g.dispose());
    }
    this.parts.clear();
  }
}

function paintGeometry(geometry, colorAt) {
  const position = geometry.attributes.position;
  const colors = new Float32Array(position.count * 3);
  const color = new THREE.Color();
  for (let i = 0; i < position.count; i++) {
    colorAt(color, position.getX(i), position.getY(i), position.getZ(i));
    colors.set([color.r, color.g, color.b], i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

// Bend vertices sideways with height so foliage and grass sway in the wind (GPU only).
function addWind(material, windUniform, startHeight, strength) {
  // Each wind setting needs its own compiled shader (three caches programs by source text).
  material.customProgramCacheKey = () => `wind:${startHeight}:${strength}`;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWindTime = windUniform;
    shader.vertexShader = `uniform float uWindTime;\n${shader.vertexShader}`.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec2 windOrigin = vec2(instanceMatrix[3].x, instanceMatrix[3].z);
      #else
        vec2 windOrigin = vec2(0.0);
      #endif
      float windLift = max(position.y - ${startHeight.toFixed(3)}, 0.0);
      float windGust = sin(uWindTime * 1.4 + windOrigin.x * 0.21 + windOrigin.y * 0.17)
        + 0.35 * sin(uWindTime * 3.9 + windOrigin.x * 0.7);
      transformed.x += windGust * ${strength.toFixed(4)} * windLift * windLift;
      transformed.z += cos(uWindTime * 1.1 + windOrigin.y * 0.23) * ${(strength * 0.6).toFixed(4)} * windLift * windLift;`
    );
  };
}

// ---------------------------------------------------------------- scenery
export function createScenery({ scene, renderer, config, quality, circleColliders, boxColliders }) {
  const preset = QUALITY_PRESETS[quality] || QUALITY_PRESETS.high;
  setMaxAnisotropy(Math.min(8, renderer.capabilities.getMaxAnisotropy()));
  const random = mulberry32(config.worldSeed);
  const randomRange = (min, max) => min + random() * (max - min);
  const windUniform = { value: 0 };
  const animated = []; // per-frame callbacks
  const cameraOccluders = []; // solid things the third-person camera must not hide behind
  const benchSeats = []; // { x, y, z, ry } places people can sit (plaza benches)

  const onPath = (x, z, margin) => Math.abs(x) < config.pathHalfWidth + margin || Math.abs(z) < config.pathHalfWidth + margin;
  const overlapsHouse = (x, z, margin) => boxColliders.some((b) =>
    x > b.minX - margin && x < b.maxX + margin && z > b.minZ - margin && z < b.maxZ + margin
  );

  // ============================================================ sky, sun, moon
  const sky = new Sky();
  sky.scale.setScalar(2500);
  scene.add(sky);
  const skyUniforms = sky.material.uniforms;
  skyUniforms.turbidity.value = 3.5;
  skyUniforms.rayleigh.value = 1.4;
  skyUniforms.mieCoefficient.value = 0.004;
  skyUniforms.mieDirectionalG.value = 0.82;

  const envScene = new THREE.Scene();
  const envSky = new Sky();
  envSky.scale.setScalar(50);
  envScene.add(envSky);
  const pmrem = new THREE.PMREMGenerator(renderer);
  let envTarget = null;

  const sunDirection = new THREE.Vector3(0, 1, 0);
  const moonDirection = new THREE.Vector3(0, 1, 0);
  let sunElevation = 45;

  const sun = new THREE.DirectionalLight(0xffffff, 3);
  sun.castShadow = preset.shadows;
  sun.shadow.mapSize.set(preset.shadowMapSize, preset.shadowMapSize);
  Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 220 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);

  const moon = new THREE.DirectionalLight(0x9fb4ff, 0);
  scene.add(moon, moon.target);

  const hemi = new THREE.HemisphereLight(0xcfe3ff, 0x4f5d34, 0.5);
  scene.add(hemi);

  scene.fog = new THREE.FogExp2(0xc6d8ea, 0.0026);

  const stars = (() => {
    const count = 1800;
    const positions = new Float32Array(count * 3);
    const direction = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      direction.set(random() * 2 - 1, random() * 0.95 + 0.05, random() * 2 - 1).normalize().multiplyScalar(1400);
      positions.set([direction.x, direction.y, direction.z], i * 3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 1.7,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: false,
    });
    const points = new THREE.Points(geometry, material);
    scene.add(points);
    return points;
  })();

  const clouds = (() => {
    const material = new THREE.SpriteMaterial({
      map: surfaces.cloud().map,
      transparent: true,
      depthWrite: false,
      fog: false,
      opacity: 0.85,
    });
    const group = new THREE.Group();
    for (let i = 0; i < 18; i++) {
      const sprite = new THREE.Sprite(material);
      const angle = random() * Math.PI * 2;
      const distance = randomRange(180, 800);
      sprite.position.set(Math.cos(angle) * distance, randomRange(150, 240), Math.sin(angle) * distance);
      sprite.scale.set(randomRange(160, 320), randomRange(60, 110), 1);
      group.add(sprite);
    }
    scene.add(group);
    animated.push((dt) => {
      for (const sprite of group.children) {
        sprite.position.x += dt * 3;
        if (sprite.position.x > 900) {
          sprite.position.x = -900;
        }
      }
    });
    return { group, material };
  })();

  // Horizon / fog colour keyed by sun elevation (degrees).
  const horizonKeys = [
    [-14, new THREE.Color(0x070b16)],
    [-5, new THREE.Color(0x232a44)],
    [0, new THREE.Color(0x9a6f63)],
    [6, new THREE.Color(0xe0a77c)],
    [16, new THREE.Color(0xbcd0e4)],
    [45, new THREE.Color(0xc9dbee)],
  ];
  function horizonColor(elevation, target) {
    if (elevation <= horizonKeys[0][0]) {
      return target.copy(horizonKeys[0][1]);
    }
    for (let i = 1; i < horizonKeys.length; i++) {
      const [e1, c1] = horizonKeys[i];
      const [e0, c0] = horizonKeys[i - 1];
      if (elevation <= e1) {
        return target.copy(c0).lerp(c1, (elevation - e0) / (e1 - e0));
      }
    }
    return target.copy(horizonKeys[horizonKeys.length - 1][1]);
  }

  // Materials whose glow depends on the time of day.
  const glassLit = new THREE.MeshStandardMaterial({ color: 0x24313d, roughness: 0.08, metalness: 0.7, emissive: 0xffc777, emissiveIntensity: 0 });
  const glassDark = new THREE.MeshStandardMaterial({ color: 0x24313d, roughness: 0.08, metalness: 0.7 });
  const plazaLights = [];

  const warmSun = new THREE.Color(0xffa860);
  const whiteSun = new THREE.Color(0xfff6ea);

  function updateTimeOfDay(hour) {
    const dayProgress = (hour - 6) / 12; // 0 sunrise, 0.5 noon, 1 sunset
    sunElevation = Math.sin(dayProgress * Math.PI) * 62;
    const azimuth = THREE.MathUtils.degToRad(90 + dayProgress * 180);
    sunDirection.setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - sunElevation), azimuth);
    moonDirection.set(-sunDirection.x, Math.abs(sunDirection.y) + 0.25, -sunDirection.z).normalize();

    // Civil twilight (sun down to about -6 degrees) still carries usable sky light.
    const daylight = THREE.MathUtils.clamp((sunElevation + 7) / 24, 0, 1);
    const night = 1 - daylight;
    const golden = sunElevation > -3 ? THREE.MathUtils.clamp(1 - Math.abs(sunElevation - 5) / 14, 0, 1) : 0;

    skyUniforms.sunPosition.value.copy(sunDirection);
    skyUniforms.rayleigh.value = 1.2 + golden * 1.5;
    skyUniforms.turbidity.value = 3.5 + golden * 4;

    sun.color.copy(whiteSun).lerp(warmSun, golden * 0.85);
    sun.intensity = 3.2 * daylight;
    moon.intensity = 0.45 * night;
    hemi.intensity = 0.12 + 0.55 * daylight;
    horizonColor(sunElevation, scene.fog.color);
    hemi.color.copy(scene.fog.color).lerp(new THREE.Color(0xcfe3ff), daylight * 0.6);
    renderer.toneMappingExposure = 0.6 + 0.35 * night;

    stars.material.opacity = THREE.MathUtils.clamp((night - 0.4) * 1.8, 0, 1);
    clouds.material.opacity = 0.25 + 0.6 * daylight;
    clouds.material.color.copy(whiteSun).lerp(warmSun, golden * 0.6).multiplyScalar(0.35 + 0.65 * daylight);

    glassLit.emissiveIntensity = 2.4 * night;
    sharedMaterials.lampBulb.emissiveIntensity = 0.25 + 4 * night;
    for (const light of plazaLights) {
      light.intensity = 40 * night;
    }

    // Image-based lighting from the current sky so every surface picks up its colour.
    for (const key of ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG']) {
      envSky.material.uniforms[key].value = skyUniforms[key].value;
    }
    envSky.material.uniforms.sunPosition.value.copy(sunDirection);
    const previous = envTarget;
    envTarget = pmrem.fromScene(envScene, 0.04);
    scene.environment = envTarget.texture;
    previous?.dispose();
  }

  // ============================================================ ground & terrain
  const groundRadius = config.worldRadius + 22;
  {
    const grass = repeatedSurface(surfaces.grass(), 46, 46);
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(groundRadius, 96),
      new THREE.MeshStandardMaterial({ map: grass.map, roughness: 0.97, color: 0xd8e6c8 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // Rolling hills outside town and a ring of mountains on the horizon.
    const size = 1800;
    const segments = 220;
    const terrainGeometry = new THREE.PlaneGeometry(size, size, segments, segments);
    terrainGeometry.rotateX(-Math.PI / 2);
    const position = terrainGeometry.attributes.position;
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i);
      const z = position.getZ(i);
      const r = Math.hypot(x, z);
      let height = -0.08;
      if (r > groundRadius + 4) {
        const hills = smoothstep(groundRadius + 4, 170, r) * (fbm(x * 0.012, z * 0.012, 7) * 30 - 4);
        const mountains = smoothstep(240, 520, r) * Math.pow(fbm(x * 0.0045 + 40, z * 0.0045, 11), 1.6) * 420;
        height = Math.max(-0.08, hills + mountains);
      }
      position.setY(i, height);
    }
    terrainGeometry.computeVertexNormals();
    const normal = terrainGeometry.attributes.normal;
    paintGeometry(terrainGeometry, (color) => color.setRGB(1, 1, 1));
    const colors = terrainGeometry.attributes.color;
    const grassColor = new THREE.Color(0x4f7a35);
    const dryColor = new THREE.Color(0x7d7a4a);
    const rockColor = new THREE.Color(0x6e6a63);
    const snowColor = new THREE.Color(0xf2f5f8);
    const color = new THREE.Color();
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i);
      const y = position.getY(i);
      const z = position.getZ(i);
      const steepness = 1 - normal.getY(i);
      color.copy(grassColor).lerp(dryColor, fbm(x * 0.02, z * 0.02, 3) * 0.6);
      color.lerp(rockColor, THREE.MathUtils.clamp(steepness * 3 + (y - 60) / 120, 0, 1));
      color.lerp(snowColor, smoothstep(170, 240, y + fbm(x * 0.05, z * 0.05, 9) * 40) * (1 - steepness * 1.5));
      colors.setXYZ(i, color.r, color.g, color.b);
    }
    const terrain = new THREE.Mesh(
      terrainGeometry,
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 })
    );
    terrain.receiveShadow = true;
    scene.add(terrain);
  }

  // ============================================================ plaza & paths
  const stoneSurface = surfaces.stone();
  const stoneMaterial = new THREE.MeshStandardMaterial({
    map: stoneSurface.map,
    normalMap: stoneSurface.normalMap,
    roughness: 0.9,
  });
  {
    const pavers = repeatedSurface(surfaces.pavers(), config.plazaRadius / 1.6, config.plazaRadius / 1.6);
    const plaza = new THREE.Mesh(
      new THREE.CircleGeometry(config.plazaRadius, 72),
      new THREE.MeshStandardMaterial({ map: pavers.map, normalMap: pavers.normalMap, roughness: 0.85 })
    );
    plaza.rotation.x = -Math.PI / 2;
    plaza.position.y = 0.02;
    plaza.receiveShadow = true;

    const curb = new THREE.Mesh(new THREE.RingGeometry(config.plazaRadius, config.plazaRadius + 0.4, 72), stoneMaterial);
    curb.rotation.x = -Math.PI / 2;
    curb.position.y = 0.035;
    curb.receiveShadow = true;
    scene.add(plaza, curb);

    const pathLength = config.worldRadius * 2 + 30;
    const pathWidth = config.pathHalfWidth * 2;
    const dirt = repeatedSurface(surfaces.dirt(), 1, pathLength / pathWidth);
    const pathMaterial = new THREE.MeshStandardMaterial({ map: dirt.map, normalMap: dirt.normalMap, roughness: 1 });
    for (const angle of [0, Math.PI / 2]) {
      const path = new THREE.Mesh(new THREE.PlaneGeometry(pathWidth, pathLength), pathMaterial);
      path.rotation.set(-Math.PI / 2, 0, angle);
      path.position.y = 0.012;
      path.receiveShadow = true;
      scene.add(path);
    }
  }

  // ============================================================ fountain
  {
    const lathe = (points) => new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), 56);
    const fountainStone = stoneMaterial.clone();
    fountainStone.side = THREE.DoubleSide;
    const parts = [
      lathe([[0.01, 0.12], [2.85, 0.12], [2.88, 0.62], [3.0, 0.72], [3.28, 0.72], [3.32, 0.62], [3.3, 0.0]]),
      lathe([[0.01, 0.12], [0.5, 0.12], [0.5, 0.35], [0.32, 0.5], [0.26, 1.7], [0.36, 1.9], [0.01, 1.9]]),
      lathe([[0.01, 1.88], [0.35, 1.88], [1.0, 2.12], [1.12, 2.26], [1.05, 2.3], [0.9, 2.2], [0.01, 2.14]]),
      lathe([[0.01, 2.2], [0.12, 2.2], [0.08, 2.55], [0.14, 2.62], [0.01, 2.66]]),
    ];
    for (const geometry of parts) {
      const mesh = new THREE.Mesh(geometry, fountainStone);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
    }

    const waterSurface = surfaces.water();
    const waterNormal = waterSurface.normalMap.clone();
    waterNormal.repeat.set(3, 3);
    waterNormal.needsUpdate = true;
    const waterMaterial = new THREE.MeshStandardMaterial({
      color: 0x1d5068,
      roughness: 0.04,
      metalness: 0.15,
      normalMap: waterNormal,
      normalScale: new THREE.Vector2(0.35, 0.35),
      transparent: true,
      opacity: 0.88,
    });
    for (const [radius, y] of [[2.86, 0.5], [0.95, 2.19]]) {
      const water = new THREE.Mesh(new THREE.CircleGeometry(radius, 48), waterMaterial);
      water.rotation.x = -Math.PI / 2;
      water.position.y = y;
      water.receiveShadow = true;
      scene.add(water);
    }

    // Spray: half from the spout, half spilling over the upper bowl's rim.
    const count = preset.spray;
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    const respawn = (i) => {
      const angle = Math.random() * Math.PI * 2;
      if (i % 2 === 0) {
        const outward = 0.35 + Math.random() * 0.5;
        positions.set([0, 2.66, 0], i * 3);
        velocities.set([Math.cos(angle) * outward, 1.3 + Math.random() * 0.8, Math.sin(angle) * outward], i * 3);
      } else {
        const outward = 0.15 + Math.random() * 0.35;
        positions.set([Math.cos(angle) * 1.12, 2.26, Math.sin(angle) * 1.12], i * 3);
        velocities.set([Math.cos(angle) * outward, 0, Math.sin(angle) * outward], i * 3);
      }
    };
    for (let i = 0; i < count; i++) {
      respawn(i);
      positions[i * 3 + 1] -= Math.random() * 1.7; // stagger so the stream starts full
    }
    const sprayGeometry = new THREE.BufferGeometry();
    sprayGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const spray = new THREE.Points(sprayGeometry, new THREE.PointsMaterial({
      color: 0xe4f4ff,
      size: 0.06,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
    }));
    scene.add(spray);

    animated.push((dt) => {
      waterNormal.offset.x += dt * 0.03;
      waterNormal.offset.y += dt * 0.017;
      for (let i = 0; i < count; i++) {
        const p = i * 3;
        velocities[p + 1] -= 9.8 * dt;
        positions[p] += velocities[p] * dt;
        positions[p + 1] += velocities[p + 1] * dt;
        positions[p + 2] += velocities[p + 2] * dt;
        const radius = Math.hypot(positions[p], positions[p + 2]);
        const inUpperBowl = i % 2 === 0 && radius < 0.95 && positions[p + 1] < 2.2 && velocities[p + 1] < 0;
        if (inUpperBowl || positions[p + 1] < 0.5) {
          respawn(i);
        }
      }
      sprayGeometry.attributes.position.needsUpdate = true;
    });
    circleColliders.push({ x: 0, z: 0, r: 3.3 });
  }

  // ============================================================ street lamps & benches
  {
    const metal = new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.45, metalness: 0.75 });
    const batch = new GeometryBatch();
    const pole = new THREE.CylinderGeometry(0.06, 0.09, 3.4, 10);
    const base = new THREE.CylinderGeometry(0.18, 0.22, 0.4, 10);
    const lantern = new THREE.BoxGeometry(0.3, 0.42, 0.3);
    const cap = new THREE.ConeGeometry(0.28, 0.25, 4);
    const lampRadius = config.plazaRadius - 1.2;
    for (let i = 0; i < 8; i++) {
      const angle = (i + 0.5) * (Math.PI / 4); // between the paths
      const x = Math.cos(angle) * lampRadius;
      const z = Math.sin(angle) * lampRadius;
      batch.add(base, metal, matrixFrom(x, 0.2, z));
      batch.add(pole, metal, matrixFrom(x, 1.9, z));
      batch.add(lantern, sharedMaterials.lampBulb, matrixFrom(x, 3.75, z));
      batch.add(cap, metal, matrixFrom(x, 4.08, z, 0, Math.PI / 4));
      circleColliders.push({ x, z, r: 0.25 });
      if (plazaLights.length < preset.plazaLights && i % 2 === 0) {
        const light = new THREE.PointLight(0xffc98a, 0, 24, 2);
        light.position.set(x, 3.6, z);
        scene.add(light);
        plazaLights.push(light);
      }
    }
    batch.build(scene);

    for (let i = 0; i < 4; i++) {
      const angle = i * (Math.PI / 2) + Math.PI / 4;
      const x = Math.cos(angle) * 8.5;
      const z = Math.sin(angle) * 8.5;
      const bench = createObjectMesh('bench', '#7a5638');
      bench.position.set(x, 0, z);
      bench.rotation.y = Math.atan2(-x, -z); // face the fountain
      bench.traverse((node) => {
        node.castShadow = true;
        node.receiveShadow = true;
      });
      scene.add(bench);
      circleColliders.push({ x, z, r: 0.85 });
      // Two seats per bench (keep in sync with townlife.py bench_seats)
      const ry = bench.rotation.y;
      for (const side of [-1, 1]) {
        const localX = side * 0.4;
        const localZ = 0.02;
        benchSeats.push({
          x: x + localX * Math.cos(ry) + localZ * Math.sin(ry),
          y: 0,
          z: z - localX * Math.sin(ry) + localZ * Math.cos(ry),
          ry,
        });
      }
    }
  }


  // ============================================================ market stall (trade goods, see economy.py)
  // Procedural first; useMarketModel() swaps in the Blender stall when /models/props.glb loads.
  const marketStall = new THREE.Group();
  let marketSign = null;
  {
    const stall = marketStall;
    const woodSurfaceStall = surfaces.wood();
    const counterWood = new THREE.MeshStandardMaterial({
      color: 0x9a6b43,
      map: woodSurfaceStall.map,
      normalMap: woodSurfaceStall.normalMap,
      roughness: 0.75,
    });
    const postWood = new THREE.MeshStandardMaterial({ color: 0x5b3a24, roughness: 0.8 });
    const awningRed = new THREE.MeshStandardMaterial({ color: 0xc8453a, roughness: 0.9, side: THREE.DoubleSide });
    const awningCream = new THREE.MeshStandardMaterial({ color: 0xf2e8cf, roughness: 0.9, side: THREE.DoubleSide });
    const box = new THREE.BoxGeometry(1, 1, 1);
    const part = (material, sx, sy, sz, x, y, z) => {
      const mesh = new THREE.Mesh(box, material);
      mesh.scale.set(sx, sy, sz);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      stall.add(mesh);
      return mesh;
    };
    part(counterWood, 3, 0.95, 0.7, 0, 0.475, 0.3);      // counter (front faces the fountain)
    part(counterWood, 3.1, 0.06, 0.8, 0, 0.98, 0.3);     // counter top
    for (const [x, z] of [[-1.45, -0.6], [1.45, -0.6], [-1.45, 0.6], [1.45, 0.6]]) {
      part(postWood, 0.1, 2.5, 0.1, x, 1.25, z);
    }
    for (let i = 0; i < 6; i++) {                         // striped awning sloping to the front
      const stripe = part(i % 2 ? awningCream : awningRed, 0.52, 0.04, 1.75, -1.3 + i * 0.52, 2.55, 0.15);
      stripe.rotation.x = 0.22;
    }
    const goods = [
      [0xd9b54a, -1.05], [0x8b5a2b, -0.35], [0x9a9a96, 0.35], [0xc58a4a, 1.05], // wheat, bread, stone, planks
    ];
    for (const [color, x] of goods) {
      part(postWood, 0.55, 0.22, 0.45, x, 1.12, 0.3);
      part(new THREE.MeshStandardMaterial({ color, roughness: 0.9 }), 0.48, 0.12, 0.38, x, 1.27, 0.3);
    }
    const signCanvas = document.createElement('canvas');
    signCanvas.width = 512;
    signCanvas.height = 128;
    const sign = signCanvas.getContext('2d');
    sign.fillStyle = '#3b2716';
    sign.fillRect(0, 0, 512, 128);
    sign.strokeStyle = '#e9c46a';
    sign.lineWidth = 8;
    sign.strokeRect(8, 8, 496, 112);
    sign.fillStyle = '#f2e8cf';
    sign.font = 'bold 64px Georgia, serif';
    sign.textAlign = 'center';
    sign.textBaseline = 'middle';
    sign.fillText('MARKET', 256, 68);
    const signTexture = new THREE.CanvasTexture(signCanvas);
    signTexture.colorSpace = THREE.SRGBColorSpace;
    const signBoard = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.4), new THREE.MeshStandardMaterial({ map: signTexture, roughness: 0.8 }));
    signBoard.position.set(0, 2.95, 0.98);
    stall.add(signBoard);
    marketSign = signBoard;

    stall.position.set(MARKET.x, 0, MARKET.z);
    stall.rotation.y = Math.atan2(-MARKET.x, -MARKET.z); // face the fountain
    scene.add(stall);
    // Colliders along the counter (the stall sits diagonally, so use circles).
    const ry = stall.rotation.y;
    for (const offset of [-1.1, 0, 1.1]) {
      circleColliders.push({
        x: MARKET.x + offset * Math.cos(ry),
        z: MARKET.z - offset * Math.sin(ry),
        r: 0.7,
      });
    }
  }

  // ============================================================ town houses
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const trimMaterial = new THREE.MeshStandardMaterial({ color: 0xf2efe8, roughness: 0.6 });
  const woodSurface = surfaces.wood();
  const doorMaterial = new THREE.MeshStandardMaterial({
    color: 0x6b4428,
    map: woodSurface.map,
    normalMap: woodSurface.normalMap,
    roughness: 0.7,
  });
  const brickSurface = surfaces.brick();
  const chimneyMaterial = new THREE.MeshStandardMaterial({
    color: 0x9c5a44,
    map: brickSurface.map,
    normalMap: brickSurface.normalMap,
    roughness: 0.9,
  });

  function addWindow(batch, faceMatrix, x, y, lit) {
    const at = (px, py, pz, sx, sy, sz) => faceMatrix.clone().multiply(matrixFrom(px, py, pz, 0, 0, 0, sx, sy, sz));
    batch.add(unitBox, lit ? glassLit : glassDark, at(x, y, 0.03, 0.86, 1.1, 0.04));
    batch.add(unitBox, trimMaterial, at(x, y + 0.6, 0.05, 1.04, 0.1, 0.1));
    batch.add(unitBox, trimMaterial, at(x, y - 0.6, 0.05, 1.04, 0.1, 0.1));
    batch.add(unitBox, trimMaterial, at(x - 0.47, y, 0.05, 0.1, 1.3, 0.1));
    batch.add(unitBox, trimMaterial, at(x + 0.47, y, 0.05, 0.1, 1.3, 0.1));
    batch.add(unitBox, trimMaterial, at(x, y, 0.06, 0.04, 1.1, 0.04));
    batch.add(unitBox, trimMaterial, at(x, y + 0.1, 0.06, 0.86, 0.04, 0.04));
    batch.add(unitBox, trimMaterial, at(x, y - 0.68, 0.1, 1.2, 0.07, 0.2));
  }

  function addDoor(batch, faceMatrix, plinthHeight) {
    const at = (px, py, pz, sx, sy, sz) => faceMatrix.clone().multiply(matrixFrom(px, py, pz, 0, 0, 0, sx, sy, sz));
    const doorHeight = 2.15;
    batch.add(unitBox, doorMaterial, at(0, plinthHeight + doorHeight / 2, 0.03, 1.05, doorHeight, 0.06));
    batch.add(unitBox, trimMaterial, at(0, plinthHeight + doorHeight + 0.06, 0.05, 1.35, 0.12, 0.1));
    batch.add(unitBox, trimMaterial, at(-0.6, plinthHeight + doorHeight / 2, 0.05, 0.12, doorHeight, 0.1));
    batch.add(unitBox, trimMaterial, at(0.6, plinthHeight + doorHeight / 2, 0.05, 0.12, doorHeight, 0.1));
    batch.add(unitBox, stoneMaterial, at(0, plinthHeight / 2, 0.4, 1.7, plinthHeight, 0.8));
  }

  function buildHouse(spec) {
    const { x, z, width, depth, wallHeight, roofHeight } = spec;
    const houseRandom = mulberry32(Math.round(x * 1000) ^ Math.round(z * 7919));
    const plinthHeight = 0.35;
    const wallTop = plinthHeight + wallHeight;
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    const batch = new GeometryBatch();

    const plaster = repeatedSurface(surfaces.plaster(), Math.max(width, depth) / 2.5, wallHeight / 2.5);
    const wallMaterial = new THREE.MeshStandardMaterial({
      color: spec.wallColor,
      map: plaster.map,
      normalMap: plaster.normalMap,
      normalScale: new THREE.Vector2(0.5, 0.5),
      roughness: 0.92,
    });
    const gableMaterial = wallMaterial.clone();
    gableMaterial.side = THREE.DoubleSide;

    batch.add(unitBox, stoneMaterial, matrixFrom(0, plinthHeight / 2, 0, 0, 0, 0, width + 0.25, plinthHeight, depth + 0.25));
    batch.add(unitBox, wallMaterial, matrixFrom(0, plinthHeight + wallHeight / 2, 0, 0, 0, 0, width, wallHeight, depth));

    // Gable roof with overhang; the ridge runs along the longer side.
    const ridgeAlongX = width >= depth;
    const length = ridgeAlongX ? width : depth;
    const span = ridgeAlongX ? depth : width;
    const roofFrame = matrixFrom(0, 0, 0, 0, ridgeAlongX ? 0 : Math.PI / 2, 0);
    const halfSpan = span / 2;
    const theta = Math.atan2(roofHeight, halfSpan);
    const overhang = 0.5;
    const slopeLength = Math.hypot(halfSpan, roofHeight) + overhang;
    const tiles = repeatedSurface(surfaces.roofTiles(), (length + 0.8) / 1.4, slopeLength / 1.4);
    const roofMaterial = new THREE.MeshStandardMaterial({
      color: spec.roofColor,
      map: tiles.map,
      normalMap: tiles.normalMap,
      roughness: 0.8,
    });
    for (const side of [-1, 1]) {
      const dirY = -Math.sin(theta);
      const dirZ = side * Math.cos(theta);
      const cx = 0;
      const cy = wallTop + roofHeight + dirY * (slopeLength / 2) + Math.cos(theta) * 0.07;
      const cz = dirZ * (slopeLength / 2) + side * Math.sin(theta) * 0.07;
      batch.add(unitBox, roofMaterial, roofFrame.clone().multiply(
        matrixFrom(cx, cy, cz, side * theta, 0, 0, length + 0.8, 0.14, slopeLength)
      ));
    }
    batch.add(unitBox, roofMaterial, roofFrame.clone().multiply(
      matrixFrom(0, wallTop + roofHeight + 0.12, 0, Math.PI / 4, 0, 0, length + 0.85, 0.22, 0.22)
    ));
    const gableShape = new THREE.Shape([
      new THREE.Vector2(-halfSpan, 0),
      new THREE.Vector2(halfSpan, 0),
      new THREE.Vector2(0, roofHeight),
    ]);
    const gableGeometry = new THREE.ShapeGeometry(gableShape);
    for (const end of [-1, 1]) {
      batch.add(gableGeometry, gableMaterial, roofFrame.clone().multiply(
        matrixFrom(end * length / 2, wallTop, 0, 0, Math.PI / 2, 0)
      ));
    }
    batch.add(unitBox, chimneyMaterial, roofFrame.clone().multiply(
      matrixFrom(length * 0.28, wallTop + roofHeight * 0.55 + 0.45, halfSpan * 0.35, 0, 0, 0, 0.6, 1.9, 0.6)
    ));

    // Windows on every wall, the door on the side facing the town square.
    const faces = [
      { nx: 0, nz: 1, length: width, half: depth / 2, ry: 0 },
      { nx: 0, nz: -1, length: width, half: depth / 2, ry: Math.PI },
      { nx: 1, nz: 0, length: depth, half: width / 2, ry: Math.PI / 2 },
      { nx: -1, nz: 0, length: depth, half: width / 2, ry: -Math.PI / 2 },
    ];
    const toCentre = new THREE.Vector2(-x, -z).normalize();
    const front = faces.reduce((best, face) =>
      face.nx * toCentre.x + face.nz * toCentre.y > best.nx * toCentre.x + best.nz * toCentre.y ? face : best
    );
    const windowY = plinthHeight + wallHeight * 0.56;
    for (const face of faces) {
      const faceMatrix = matrixFrom(face.nx * face.half, 0, face.nz * face.half, 0, face.ry, 0);
      const count = Math.max(1, Math.floor(face.length / 2.3));
      for (let i = 0; i < count; i++) {
        const wx = (i - (count - 1) / 2) * (face.length / count);
        if (face === front && Math.abs(wx) < 1.2) {
          continue;
        }
        addWindow(batch, faceMatrix, wx, windowY, houseRandom() < 0.6);
      }
      if (face === front) {
        addDoor(batch, faceMatrix, plinthHeight);
      }
    }

    batch.build(group);
    gableGeometry.dispose();
    scene.add(group);
    cameraOccluders.push(group);
    boxColliders.push({ minX: x - width / 2, maxX: x + width / 2, minZ: z - depth / 2, maxZ: z + depth / 2 });
  }

  function buildHouses(houses) {
    houses.forEach(buildHouse);
  }

  // ============================================================ trees, rocks, grass
  function jitterBlob(geometry, amount, seed) {
    geometry.deleteAttribute('uv');
    geometry.deleteAttribute('normal');
    const merged = mergeVertices(geometry);
    const position = merged.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < position.count; i++) {
      v.fromBufferAttribute(position, i);
      const n = Math.sin(v.x * 3.1 + seed) * Math.sin(v.y * 2.7 + seed * 2) * Math.sin(v.z * 3.3 + seed * 3);
      v.multiplyScalar(1 + n * amount);
      position.setXYZ(i, v.x, v.y, v.z);
    }
    merged.computeVertexNormals();
    return merged;
  }

  function trunkGeometry(radiusTop, radiusBottom, height, color) {
    const trunk = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, 8, 2).translate(0, height / 2, 0);
    trunk.deleteAttribute('uv');
    return paintGeometry(trunk.toNonIndexed(), (c, x, y) => c.copy(color).multiplyScalar(0.85 + (y / height) * 0.25));
  }

  function broadleafGeometry() {
    const parts = [trunkGeometry(0.1, 0.2, 2.6, new THREE.Color(0x4a3526))];
    const clumps = [[0, 3.2, 0, 1.3], [0.7, 2.75, 0.3, 0.95], [-0.65, 2.85, -0.25, 1.0], [0.1, 3.85, -0.2, 0.9], [-0.25, 2.55, 0.65, 0.85], [0.35, 3.3, -0.7, 0.85]];
    clumps.forEach(([cx, cy, cz, radius], index) => {
      const blob = jitterBlob(new THREE.IcosahedronGeometry(radius, 2), 0.18, index * 1.7).translate(cx, cy, cz);
      parts.push(paintGeometry(blob.toNonIndexed(), (c, x, y, z) => {
        const shade = 0.75 + (y - 2.2) * 0.18 + Math.sin(x * 5 + z * 4) * 0.05;
        c.setRGB(0.2 * shade, 0.36 * shade, 0.13 * shade);
      }));
    });
    return mergeGeometries(parts, false);
  }

  function coniferGeometry() {
    const parts = [trunkGeometry(0.08, 0.16, 1.6, new THREE.Color(0x3d2b1e))];
    for (let i = 0; i < 4; i++) {
      const radius = 1.55 - i * 0.33;
      const height = 1.8;
      const base = 1.0 + i * 0.85;
      const cone = new THREE.ConeGeometry(radius, height, 11, 3);
      const jittered = jitterBlob(cone, 0.06, i * 2.3).translate(0, base + height / 2, 0); // jitter around its own centre
      parts.push(paintGeometry(jittered.toNonIndexed(), (c, x, y) => {
        const shade = 0.7 + ((y - base) / height) * 0.45;
        c.setRGB(0.1 * shade, 0.25 * shade, 0.13 * shade);
      }));
    }
    return mergeGeometries(parts, false);
  }

  function buildTrees() {
    const spots = [];
    const tryPlace = (minRadius, maxRadius, count, spacing, inTown) => {
      for (let attempt = 0, placed = 0; attempt < count * 40 && placed < count; attempt++) {
        const angle = random() * Math.PI * 2;
        const distance = Math.sqrt(randomRange(minRadius ** 2, maxRadius ** 2));
        const x = Math.cos(angle) * distance;
        const z = Math.sin(angle) * distance;
        if (onPath(x, z, 1.5) || overlapsHouse(x, z, 2.2)) {
          continue;
        }
        if (spots.some((s) => (s.x - x) ** 2 + (s.z - z) ** 2 < spacing * spacing)) {
          continue;
        }
        spots.push({ x, z, inTown, scale: randomRange(0.8, 1.35), conifer: random() < (inTown ? 0.35 : 0.55) });
        placed++;
      }
    };
    tryPlace(config.plazaRadius + 3, config.worldRadius - 2, 70, 3.2, true);
    tryPlace(config.worldRadius + 4, config.worldRadius + 70, 320, 2.6, false);

    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
    addWind(material, windUniform, 1.6, 0.012);
    const species = [
      { geometry: broadleafGeometry(), list: spots.filter((s) => !s.conifer) },
      { geometry: coniferGeometry(), list: spots.filter((s) => s.conifer) },
    ];
    const tint = new THREE.Color();
    for (const { geometry, list } of species) {
      const mesh = new THREE.InstancedMesh(geometry, material, list.length);
      list.forEach((spot, index) => {
        mesh.setMatrixAt(index, matrixFrom(spot.x, 0, spot.z, 0, random() * Math.PI * 2, 0, spot.scale, spot.scale * randomRange(0.9, 1.15), spot.scale));
        mesh.setColorAt(index, tint.setRGB(randomRange(0.85, 1.12), randomRange(0.9, 1.12), randomRange(0.85, 1.05)));
        if (spot.inTown) {
          circleColliders.push({ x: spot.x, z: spot.z, r: 0.28 * spot.scale });
        }
      });
      mesh.castShadow = preset.shadows;
      mesh.receiveShadow = true;
      scene.add(mesh);
      cameraOccluders.push(mesh);
    }

    // Rocks scattered in the meadows.
    const rockGeometry = jitterBlob(new THREE.IcosahedronGeometry(0.6, 1), 0.25, 4.2);
    const rockMaterial = new THREE.MeshStandardMaterial({ color: 0x8a857d, roughness: 0.95 }); // no UVs on jittered rocks
    const rocks = new THREE.InstancedMesh(rockGeometry, rockMaterial, 60);
    for (let i = 0; i < 60; i++) {
      let x;
      let z;
      do {
        const angle = random() * Math.PI * 2;
        const distance = randomRange(config.plazaRadius + 6, config.worldRadius + 60);
        x = Math.cos(angle) * distance;
        z = Math.sin(angle) * distance;
      } while (onPath(x, z, 1.5) || overlapsHouse(x, z, 1.5));
      const size = randomRange(0.3, 1.1);
      rocks.setMatrixAt(i, matrixFrom(x, size * 0.15, z, random(), random() * 6, 0, size, size * randomRange(0.4, 0.7), size * randomRange(0.8, 1.2)));
    }
    rocks.castShadow = preset.shadows;
    rocks.receiveShadow = true;
    scene.add(rocks);

    buildGrass();
  }

  function buildGrass() {
    if (!preset.grassTufts) {
      return;
    }
    const blades = [];
    const base = new THREE.Color(0x2c4a1a);
    const tip = new THREE.Color(0x8db45a);
    for (let i = 0; i < 7; i++) {
      const angle = (i / 7) * Math.PI * 2 + Math.random() * 0.5;
      const height = 0.22 + Math.random() * 0.25;
      const lean = 0.05 + Math.random() * 0.1;
      const ox = Math.cos(angle) * 0.06;
      const oz = Math.sin(angle) * 0.06;
      const px = -Math.sin(angle) * 0.025;
      const pz = Math.cos(angle) * 0.025;
      blades.push(
        ox - px, 0, oz - pz,
        ox + px, 0, oz + pz,
        ox + Math.cos(angle) * lean, height, oz + Math.sin(angle) * lean
      );
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(blades, 3));
    const normals = new Float32Array(blades.length).fill(0);
    for (let i = 1; i < normals.length; i += 3) {
      normals[i] = 1; // light the blades like the ground they grow from
    }
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    paintGeometry(geometry, (c, x, y) => c.copy(base).lerp(tip, y / 0.45));

    const material = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 1 });
    addWind(material, windUniform, 0, 0.35);
    const grass = new THREE.InstancedMesh(geometry, material, preset.grassTufts);
    let placed = 0;
    for (let attempt = 0; attempt < preset.grassTufts * 4 && placed < preset.grassTufts; attempt++) {
      const angle = random() * Math.PI * 2;
      const distance = Math.sqrt(randomRange((config.plazaRadius + 0.8) ** 2, (groundRadius - 2) ** 2));
      const x = Math.cos(angle) * distance;
      const z = Math.sin(angle) * distance;
      if (onPath(x, z, 0.2) || overlapsHouse(x, z, 0.3)) {
        continue;
      }
      const scale = randomRange(0.7, 1.5);
      grass.setMatrixAt(placed, matrixFrom(x, 0, z, 0, random() * Math.PI * 2, 0, scale, scale, scale));
      placed++;
    }
    grass.count = placed;
    grass.receiveShadow = true;
    scene.add(grass);
  }

  // ============================================================ per frame
  let elapsed = 0;
  function update(dt, focus) {
    elapsed += dt;
    windUniform.value = elapsed;
    sun.position.copy(focus).addScaledVector(sunDirection, 100);
    sun.target.position.copy(focus);
    moon.position.copy(focus).addScaledVector(moonDirection, 100);
    moon.target.position.copy(focus);
    stars.rotation.y += dt * 0.004;
    for (const step of animated) {
      step(dt);
    }
  }

  function useMarketModel(model) {
    if (!model) {
      return;
    }
    for (const child of [...marketStall.children]) {
      if (child !== marketSign) {
        marketStall.remove(child);
      }
    }
    model.traverse((node) => {
      if (node.isMesh) {
        node.castShadow = renderer.shadowMap.enabled;
        node.receiveShadow = true;
      }
    });
    marketStall.add(model);
    const anchor = model.getObjectByName('market_sign');
    if (anchor && marketSign) {
      model.updateMatrixWorld(true);
      marketSign.position.copy(anchor.getWorldPosition(new THREE.Vector3()));
      marketStall.worldToLocal(marketSign.position);
    }
    marketStall.userData.model = true;
  }

  return { updateTimeOfDay, update, buildHouses, buildTrees, sun, cameraOccluders, benchSeats, useMarketModel };
}
