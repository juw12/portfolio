'use strict';
/* Cozy Island - world: the same island layout as the Blender script, built with three.js.
   Layout constants use Blender axes (x, y on the ground, z up); toV() converts to three.js (y up). */
(function (Cozy) {
  const THREE = window.THREE;

  const C = {
    ISLAND_RADIUS: 14,
    SEABED: -2.6,
    DOCK_Y: -2,
    DOCK_LENGTH: 10,
    DOCK_WIDTH: 2,
    DOCK_HEIGHT: 0.6,
    CABIN: { x: -4, y: 3 },
    CABIN_FLOOR: 1.3,
    GARDEN: { x: -0.5, y: 7.5 },
    GARDEN_FLOOR: 1.05,
    VIEWPOINT: { x: -8.5, y: -0.5 },
    VIEWPOINT_FLOOR: 1.2,
    SUNSET: normalize2({ x: -0.94, y: 0.34 }),
    HOMESTEADS: [{ x: -5, y: -5.5 }, { x: 0.5, y: -7.5 }, { x: 6, y: -6 }, { x: 6.5, y: 4 }],
    HOMESTEAD_FLOOR: 0.95,
    CAMPFIRE: { x: -5.4, y: -0.9 },
    CAMPFIRE_FLOOR: 1.15,
  };
  C.PADS = [
    [C.CABIN, C.CABIN_FLOOR, 4.2, 6.0],
    [C.GARDEN, C.GARDEN_FLOOR, 2.6, 4.0],
    [C.VIEWPOINT, C.VIEWPOINT_FLOOR, 1.5, 3.5],
    [C.CAMPFIRE, C.CAMPFIRE_FLOOR, 1.7, 2.8],
  ].concat(C.HOMESTEADS.map((centre) => [centre, C.HOMESTEAD_FLOOR, 2.3, 3.4]));

  const PALETTE = {
    grass: '#7FB069', grassDark: '#6FA35C', sand: '#E8D3A2', seabed: '#5E8F86', water: '#4FB3BF',
    wood: '#A9744F', woodDark: '#6B4632', wall: '#F3E3C3', roof: '#C8553D', stone: '#9C9A91',
    window: '#FFC46B', pine: '#3E7C59', leaf: '#8CC084', leafAlt: '#7DB574', trunk: '#7A5136', rock: '#8F8C86',
    bush: '#6FA36B', pink: '#F4A6C0', yellow: '#FFE08A', white: '#FFF6E8', lily: '#5E9E5A',
    lantern: '#FFB45E', metal: '#8A9BA8', bobberRed: '#E4473C', cork: '#C9A27A', soil: '#6B4A35',
    teal: '#5FA8A0', mountain: '#8E9FC4', skin: '#F2C9A5', shirt: '#7A9CC6', hat: '#E8C170',
  };

  /** Season looks. Materials are recoloured in place (the batched meshes share them), so a season
   *  change costs no rebuild. `weather` picks the falling-particle style. */
  const SEASON_LOOKS = {
    spring: {
      grass: ['#8CC46E', '#7DB862'], sand: PALETTE.sand,
      leaf: '#F29BB8', leafAlt: '#F7C4D4', bush: '#7DB86A', pine: '#3E7C59',
      mountain: '#8E9FC4', lily: '#5E9E5A', water: '#4FB3BF', fog: '#F0C3AE', hemiSky: '#C6CCF2',
      flowers: true, snow: false, fireflies: true, weather: 'petals',
    },
    summer: {
      grass: [PALETTE.grass, PALETTE.grassDark], sand: PALETTE.sand,
      leaf: PALETTE.leaf, leafAlt: PALETTE.leafAlt, bush: PALETTE.bush, pine: PALETTE.pine,
      mountain: PALETTE.mountain, lily: PALETTE.lily, water: PALETTE.water, fog: '#F0C3AE', hemiSky: '#C6CCF2',
      flowers: true, snow: false, fireflies: true, weather: 'fluff',
    },
    autumn: {
      grass: ['#ADA65A', '#9E9A4E'], sand: PALETTE.sand,
      leaf: '#E38B3A', leafAlt: '#C8553A', bush: '#B07A3C', pine: '#3A6E50',
      mountain: '#9A98B8', lily: '#7E8E4A', water: '#4AA6B4', fog: '#EFB89A', hemiSky: '#D0C4E0',
      flowers: true, snow: false, fireflies: false, weather: 'leaves',
    },
    winter: {
      grass: ['#EEF3F7', '#E1E9F0'], sand: '#E3DACB',
      leaf: '#EEF2F6', leafAlt: '#DCE5EE', bush: '#E2EAF0', pine: '#2F5E46',
      mountain: '#C9D2E6', lily: '#4E7E5E', water: '#4E9FBA', fog: '#E3D2D6', hemiSky: '#D6DCF6',
      flowers: false, snow: true, fireflies: false, weather: 'snow',
    },
  };

  const WEATHER = {
    petals: { count: 170, size: 0.17, fall: 0.55, sway: 0.9, colors: ['#F7C6D4', '#F4A6C0', '#FFE3EC'] },
    fluff: { count: 45, size: 0.1, fall: -0.12, sway: 0.5, colors: ['#FFF8E8', '#FFFDF5'] },
    leaves: { count: 130, size: 0.22, fall: 0.75, sway: 1.3, colors: ['#E38B3A', '#C8553A', '#E8B04A'] },
    snow: { count: 340, size: 0.16, fall: 0.9, sway: 0.35, colors: ['#FFFFFF', '#F2F6FF'] },
  };
  const WEATHER_MAX = 340;
  const WEATHER_HALF = 30;
  const WEATHER_TOP = 16;

  /** Lighting keyframes over the day (hours). The 18.5 key is the original sunset look.
   *  `night` dims birds / wakes crickets + stars; `glow` drives lanterns, windows, fireflies, campfire. */
  const NIGHT_KEY = {
    top: '#0B1430', mid: '#1B2850', bottom: '#2E3A66', sun: '#9DB2FF', sunI: 0.6,
    hemiSky: '#4A5A94', hemiGround: '#1C1C2A', hemiI: 0.65, ambient: 0.14, fog: '#1A2444', water: '#1F4A66',
    exposure: 1.0, disc: '#DDE6FF', discI: 0.7, night: 1, glow: 1,
  };
  const DAY_KEYS = [
    Object.assign({ hour: 0 }, NIGHT_KEY),
    Object.assign({ hour: 5 }, NIGHT_KEY),
    {
      hour: 6.5, top: '#56689F', mid: '#E2A5A6', bottom: '#FFB48C', sun: '#FFB27A', sunI: 1.5,
      hemiSky: '#A4A8D8', hemiGround: '#5A4E48', hemiI: 0.85, ambient: 0.2, fog: '#E2B1A6', water: '#3E93A8',
      exposure: 1.0, disc: '#FFD9B0', discI: 1, night: 0.3, glow: 0.5,
    },
    {
      hour: 9, top: '#6FA6E6', mid: '#C9E0F2', bottom: '#FCE6CC', sun: '#FFE8C8', sunI: 2.6,
      hemiSky: '#C8DAF7', hemiGround: '#7A6A55', hemiI: 1.1, ambient: 0.25, fog: '#D6E5EE', water: '#4FB3BF',
      exposure: 1.0, disc: '#FFF2DC', discI: 0.8, night: 0, glow: 0.05,
    },
    {
      hour: 13, top: '#5895DE', mid: '#B8D8F0', bottom: '#E4F0F4', sun: '#FFF5E2', sunI: 2.9,
      hemiSky: '#D0E2FF', hemiGround: '#7A6A55', hemiI: 1.15, ambient: 0.25, fog: '#CADFEA', water: '#4FB8C4',
      exposure: 1.0, disc: '#FFF8EC', discI: 0.7, night: 0, glow: 0,
    },
    {
      hour: 16.5, top: '#7EA0DC', mid: '#E2D4D2', bottom: '#FFD2A6', sun: '#FFDDAA', sunI: 2.8,
      hemiSky: '#CCD0F0', hemiGround: '#7A6A55', hemiI: 1.15, ambient: 0.25, fog: '#E8D2C4', water: '#4FB3BF',
      exposure: 1.0, disc: '#FFE6C0', discI: 0.9, night: 0, glow: 0.2,
    },
    {
      hour: 18.5, top: '#8FA8E0', mid: '#F5C4C0', bottom: '#FFB38A', sun: '#FFC68C', sunI: 2.7,
      hemiSky: '#C6CCF2', hemiGround: '#7A6A55', hemiI: 1.15, ambient: 0.25, fog: '#F0C3AE', water: '#4FB3BF',
      exposure: 1.0, disc: '#FFD194', discI: 1, night: 0, glow: 0.7,
    },
    {
      hour: 20.3, top: '#26305E', mid: '#6E5684', bottom: '#D0806E', sun: '#FF9468', sunI: 0.9,
      hemiSky: '#6A6CA8', hemiGround: '#3A3040', hemiI: 0.75, ambient: 0.16, fog: '#5E4E70', water: '#2F6A84',
      exposure: 1.0, disc: '#FFB08A', discI: 0.6, night: 0.65, glow: 0.95,
    },
    Object.assign({ hour: 22 }, NIGHT_KEY),
    Object.assign({ hour: 24 }, NIGHT_KEY),
  ];
  const COLOR_FIELDS = ['top', 'mid', 'bottom', 'sun', 'hemiSky', 'hemiGround', 'fog', 'water', 'disc'];
  const NUMBER_FIELDS = ['sunI', 'hemiI', 'ambient', 'exposure', 'discI', 'night', 'glow'];

  function normalize2(v) {
    const length = Math.hypot(v.x, v.y);
    return { x: v.x / length, y: v.y / length };
  }

  /** Blender (x, y, z-up) -> three.js (x, y-up, z). */
  function toV(x, y, z) {
    return new THREE.Vector3(x, z, -y);
  }

  function heightAt(x, y) {
    const sx = x * 0.09;
    const sy = y * 0.09;
    const radius = C.ISLAND_RADIUS * (1 + 0.18 * Cozy.noise2(sx * 0.7 + 11.3, sy * 0.7 + 4.1));
    const d = Math.hypot(x, y) / radius;
    let h = 2 * (1 - d * d) - 0.4 + 0.35 * Cozy.noise2(sx * 2 + 5.2, sy * 2 + 1.3);
    for (const [centre, padHeight, inner, outer] of C.PADS) {
      const distance = Math.hypot(x - centre.x, y - centre.y);
      if (distance < outer) {
        const blend = Cozy.smoothstep(outer, inner, distance);
        h = h * (1 - blend) + padHeight * blend;
      }
    }
    return Math.max(h, C.SEABED);
  }

  function waveHeight(x, z, t) {
    return 0.05 * Math.sin(0.35 * x + 1.1 * t)
      + 0.04 * Math.sin(0.35 * z - 0.9 * t + 1.7)
      + 0.025 * Math.sin(0.8 * (x + z) + 1.7 * t);
  }

  // ------------------------------------------------------------------ materials + static batching

  const materialCache = new Map();

  function material(color, options) {
    const opts = options || {};
    const key = color + JSON.stringify(opts);
    if (!materialCache.has(key)) {
      materialCache.set(key, new THREE.MeshStandardMaterial({
        color,
        flatShading: true,
        roughness: opts.roughness !== undefined ? opts.roughness : 0.85,
        metalness: opts.metalness || 0,
        emissive: opts.emissive ? new THREE.Color(color) : new THREE.Color(0x000000),
        emissiveIntensity: opts.emissive || 0,
        side: opts.doubleSide ? THREE.DoubleSide : THREE.FrontSide,
        transparent: opts.opacity !== undefined,
        opacity: opts.opacity !== undefined ? opts.opacity : 1,
      }));
    }
    return materialCache.get(key);
  }

  /** Matrix from Blender-axis position / XYZ-euler rotation / scale. */
  function matB(position, rotation, scale) {
    const p = position || [0, 0, 0];
    const r = rotation || [0, 0, 0];
    const s = scale || [1, 1, 1];
    const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(r[0], r[2], -r[1], 'YZX'));
    return new THREE.Matrix4().compose(toV(p[0], p[1], p[2]), quaternion, new THREE.Vector3(s[0], s[2], s[1]));
  }

  const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);

  /** Merges many static pieces into one mesh per material (keeps draw calls low on laptops). */
  class Batcher {
    constructor() {
      this.groups = new Map();
      this.frame = null;
    }

    add(geometry, color, matrix, options) {
      const key = color + JSON.stringify(options || {});
      if (!this.groups.has(key)) {
        this.groups.set(key, { color, options: options || {}, parts: [] });
      }
      const piece = geometry.index ? geometry.toNonIndexed() : geometry.clone();
      piece.applyMatrix4(this.frame ? this.frame.clone().multiply(matrix) : matrix);
      this.groups.get(key).parts.push(piece);
    }

    box(color, size, position, rotation, options) {
      this.add(UNIT_BOX, color, matB(position, rotation, size), options);
    }

    cylinder(color, radiusBottom, radiusTop, depth, position, segments, rotation, options) {
      const geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, depth, segments || 8);
      this.add(geometry, color, matB(position, rotation), options);
      geometry.dispose();
    }

    /** Cylinder along an arbitrary three.js direction starting at `start` (three.js coords). */
    cylinderAlong(color, radiusBottom, radiusTop, start, direction, length, segments) {
      const geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, length, segments || 6);
      const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
      const centre = start.clone().addScaledVector(direction, length / 2);
      this.add(geometry, color, new THREE.Matrix4().compose(centre, quaternion, new THREE.Vector3(1, 1, 1)));
      geometry.dispose();
    }

    ico(color, radius, position, scale, jitter, detail) {
      const geometry = new THREE.IcosahedronGeometry(radius, detail === undefined ? 1 : detail);
      if (jitter) {
        const positions = geometry.attributes.position;
        const offsets = new Map();
        for (let i = 0; i < positions.count; i++) {
          const key = `${positions.getX(i).toFixed(3)},${positions.getY(i).toFixed(3)},${positions.getZ(i).toFixed(3)}`;
          if (!offsets.has(key)) {
            offsets.set(key, [Cozy.rand(-jitter, jitter), Cozy.rand(-jitter, jitter), Cozy.rand(-jitter, jitter)]);
          }
          const offset = offsets.get(key);
          positions.setXYZ(i, positions.getX(i) + offset[0], positions.getY(i) + offset[1], positions.getZ(i) + offset[2]);
        }
      }
      this.add(geometry, color, matB(position, null, scale));
      geometry.dispose();
    }

    build(parent, castShadow) {
      for (const group of this.groups.values()) {
        let vertexCount = 0;
        for (const part of group.parts) {
          vertexCount += part.attributes.position.count;
        }
        const positions = new Float32Array(vertexCount * 3);
        const normals = new Float32Array(vertexCount * 3);
        let offset = 0;
        for (const part of group.parts) {
          positions.set(part.attributes.position.array, offset);
          normals.set(part.attributes.normal.array, offset);
          offset += part.attributes.position.array.length;
          part.dispose();
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
        geometry.computeBoundingSphere();
        const mesh = new THREE.Mesh(geometry, material(group.color, group.options));
        mesh.castShadow = castShadow !== false && !group.options.emissive;
        mesh.receiveShadow = true;
        parent.add(mesh);
      }
      this.groups.clear();
    }
  }

  // ------------------------------------------------------------------ glow sprites + particles

  let glowTexture = null;

  function getGlowTexture() {
    if (!glowTexture) {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 64;
      const context = canvas.getContext('2d');
      const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
      gradient.addColorStop(0, 'rgba(255,255,255,1)');
      gradient.addColorStop(0.25, 'rgba(255,255,255,0.6)');
      gradient.addColorStop(1, 'rgba(255,255,255,0)');
      context.fillStyle = gradient;
      context.fillRect(0, 0, 64, 64);
      glowTexture = new THREE.CanvasTexture(canvas);
      glowTexture.colorSpace = THREE.SRGBColorSpace;
    }
    return glowTexture;
  }

  function glowSprite(color, size, opacity) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: getGlowTexture(),
      color,
      transparent: true,
      opacity: opacity === undefined ? 0.8 : opacity,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    }));
    sprite.scale.setScalar(size);
    return sprite;
  }

  const FX = {
    scene: null,
    drops: [],
    rings: [],
    puffs: [],
    ringGeometry: null,

    init(scene) {
      this.scene = scene;
      this.ringGeometry = new THREE.RingGeometry(0.85, 1, 32).rotateX(-Math.PI / 2);
    },

    splash(position, count, color) {
      for (let i = 0; i < count; i++) {
        const sprite = glowSprite(color || '#E8FAFF', Cozy.rand(0.08, 0.16), 0.9);
        sprite.material.blending = THREE.NormalBlending;
        sprite.position.copy(position);
        const angle = Math.random() * Math.PI * 2;
        const speed = Cozy.rand(0.6, 1.6);
        this.drops.push({
          sprite,
          velocity: new THREE.Vector3(Math.cos(angle) * speed, Cozy.rand(1.5, 3.2), Math.sin(angle) * speed),
          life: 1.2,
        });
        this.scene.add(sprite);
      }
    },

    ripple(position, size) {
      const mesh = new THREE.Mesh(this.ringGeometry, new THREE.MeshBasicMaterial({
        color: '#F4FFFF', transparent: true, opacity: 0.6, depthWrite: false,
      }));
      mesh.position.set(position.x, position.y + 0.03, position.z);
      mesh.scale.setScalar(0.1);
      this.rings.push({ mesh, age: 0, size: size || 1 });
      this.scene.add(mesh);
    },

    /** Soft rising puff (steam, dust). */
    puff(position, color, rise) {
      const sprite = glowSprite(color || '#FFFFFF', 0.15, 0.35);
      sprite.material.blending = THREE.NormalBlending;
      sprite.position.copy(position);
      this.puffs.push({ sprite, age: 0, rise: rise || 0.5, drift: Cozy.rand(-0.1, 0.1) });
      this.scene.add(sprite);
    },

    update(dt) {
      for (let i = this.drops.length - 1; i >= 0; i--) {
        const drop = this.drops[i];
        drop.velocity.y -= 9 * dt;
        drop.sprite.position.addScaledVector(drop.velocity, dt);
        drop.life -= dt;
        if (drop.life <= 0 || drop.sprite.position.y < -0.2) {
          this.scene.remove(drop.sprite);
          drop.sprite.material.dispose();
          this.drops.splice(i, 1);
        }
      }
      for (let i = this.rings.length - 1; i >= 0; i--) {
        const ring = this.rings[i];
        ring.age += dt;
        const t = ring.age / 1.6;
        ring.mesh.scale.setScalar(0.1 + t * 1.4 * ring.size);
        ring.mesh.material.opacity = 0.6 * (1 - t);
        if (t >= 1) {
          this.scene.remove(ring.mesh);
          ring.mesh.material.dispose();
          this.rings.splice(i, 1);
        }
      }
      for (let i = this.puffs.length - 1; i >= 0; i--) {
        const puff = this.puffs[i];
        puff.age += dt;
        const t = puff.age / 2.2;
        puff.sprite.position.y += puff.rise * dt;
        puff.sprite.position.x += puff.drift * dt;
        puff.sprite.scale.setScalar(0.15 + t * 0.5);
        puff.sprite.material.opacity = 0.35 * (1 - t);
        if (t >= 1) {
          this.scene.remove(puff.sprite);
          puff.sprite.material.dispose();
          this.puffs.splice(i, 1);
        }
      }
    },
  };

  // ------------------------------------------------------------------ reusable dynamic models

  /** Stem + leaves + bloom + thirsty water-drop, grown by Update(growth, thirsty). Same as Unity PlantVisual. */
  class PlantVisual {
    constructor(parent, position, swayPhase) {
      this.root = new THREE.Group();
      this.root.position.copy(position);
      parent.add(this.root);
      this.parts = new THREE.Group();
      this.root.add(this.parts);
      this.swayPhase = swayPhase;
      this.droop = 0;
      this.hasPlant = false;
      this.bloomSize = 0;

      const stemMaterial = material('#5C9A4C');
      const leafMaterial = material('#78BD66');
      this.stem = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 2, 6), stemMaterial);
      this.leafLeft = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), leafMaterial);
      this.leafRight = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), leafMaterial);
      this.bloomMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', flatShading: true, roughness: 0.6 });
      this.bloom = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), this.bloomMaterial);
      this.drop = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), material('#73B8FF', { emissive: 0.4 }));
      this.drop.scale.set(0.05, 0.07, 0.05);
      [this.stem, this.leafLeft, this.leafRight, this.bloom].forEach((mesh) => {
        mesh.castShadow = true;
        this.parts.add(mesh);
      });
      this.root.add(this.drop);

      // invisible, generous click box
      this.hit = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.6, 0.6),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
      this.hit.position.y = 0.3;
      this.root.add(this.hit);
      this.setPlant(false);
    }

    setPlant(hasPlant, bloomColor, bloomSize) {
      this.hasPlant = hasPlant;
      this.bloomSize = bloomSize || 0;
      this.parts.visible = hasPlant;
      if (hasPlant && bloomColor) {
        this.bloomMaterial.color.set(bloomColor);
      }
    }

    update(growth, thirsty, time) {
      this.drop.visible = this.hasPlant && thirsty;
      if (this.drop.visible) {
        this.drop.position.y = 0.7 + Math.sin(time * 3) * 0.04;
      }
      if (!this.hasPlant) {
        return;
      }
      const eased = growth * growth * (3 - 2 * growth);
      this.droop += ((thirsty && growth > 0.01 ? 0.3 : 0) - this.droop) * 0.05;
      this.parts.rotation.z = this.droop + Math.sin(time * 1.3 + this.swayPhase) * 0.05 * eased;

      const height = 0.03 + (0.45 - 0.03) * eased;
      this.stem.scale.set(0.015, height / 2, 0.015);
      this.stem.position.y = height / 2;
      const leaf = 0.02 + 0.14 * eased;
      this.leafLeft.scale.set(leaf, leaf * 0.35, leaf * 0.6);
      this.leafRight.scale.set(leaf, leaf * 0.35, leaf * 0.6);
      this.leafLeft.position.set(-leaf * 0.45, height * 0.45, 0);
      this.leafRight.position.set(leaf * 0.45, height * 0.6, 0);
      const bloom = this.bloomSize * Cozy.clamp01((growth - 0.75) / 0.25);
      this.bloom.visible = bloom > 0.001;
      this.bloom.scale.setScalar(bloom);
      this.bloom.position.y = height + bloom * 0.3;
    }
  }

  /** Low-poly bird (faces +z). Returns { group, wingLeft, wingRight }. */
  function buildBirdModel(species) {
    const group = new THREE.Group();
    const body = material(species.body);
    const accent = material(species.accent);
    const beak = material('#F2A541');
    const dark = material('#221A1A');
    const add = (geometry, mat, position, scale, rotation) => {
      const mesh = new THREE.Mesh(geometry, mat);
      mesh.position.set(position[0], position[1], position[2]);
      mesh.scale.set(scale[0], scale[1], scale[2]);
      if (rotation) {
        mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
      }
      mesh.castShadow = true;
      group.add(mesh);
      return mesh;
    };
    const sphere = new THREE.IcosahedronGeometry(0.5, 1);
    add(sphere, body, [0, 0.1, 0], [0.16, 0.15, 0.22]);
    add(sphere, accent, [0, 0.08, 0.06], [0.13, 0.11, 0.15]);
    add(sphere, body, [0, 0.19, 0.08], [0.11, 0.11, 0.11]);
    add(UNIT_BOX, beak, [0, 0.185, 0.15], [0.025, 0.025, 0.06]);
    add(sphere, dark, [-0.04, 0.205, 0.12], [0.018, 0.018, 0.018]);
    add(sphere, dark, [0.04, 0.205, 0.12], [0.018, 0.018, 0.018]);
    add(UNIT_BOX, accent, [0, 0.12, -0.15], [0.08, 0.02, 0.12], [-0.35, 0, 0]);
    const wing = (side) => {
      const pivot = new THREE.Group();
      pivot.position.set(0.07 * side, 0.13, 0);
      const mesh = new THREE.Mesh(UNIT_BOX, accent);
      mesh.position.set(0.06 * side, 0, -0.01);
      mesh.scale.set(0.12, 0.02, 0.15);
      mesh.castShadow = true;
      pivot.add(mesh);
      group.add(pivot);
      return pivot;
    };
    const wingLeft = wing(-1);
    const wingRight = wing(1);
    group.scale.setScalar(species.size || 1);
    // click box
    const hit = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    hit.position.y = 0.12;
    group.add(hit);
    return { group, wingLeft, wingRight, hit };
  }

  // ------------------------------------------------------------------ build the world

  function build(container) {
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog('#F0C3AE', 55, 200);
    const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 900);
    FX.init(scene);

    // sun from the sunset direction, ~18 degrees above the horizon
    const elevation = THREE.MathUtils.degToRad(18);
    const sunDirection = new THREE.Vector3(C.SUNSET.x * Math.cos(elevation), Math.sin(elevation), -C.SUNSET.y * Math.cos(elevation)).normalize();

    const sky = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        topColor: { value: new THREE.Color('#8FA8E0') },
        midColor: { value: new THREE.Color('#F5C4C0') },
        bottomColor: { value: new THREE.Color('#FFB38A') },
        sunDirection: { value: sunDirection },
        discColor: { value: new THREE.Color('#FFD194') },
        discStrength: { value: 1 },
      },
      vertexShader: `
        varying vec3 vDirection;
        void main() {
          vDirection = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 midColor;
        uniform vec3 bottomColor;
        uniform vec3 sunDirection;
        uniform vec3 discColor;
        uniform float discStrength;
        varying vec3 vDirection;
        void main() {
          vec3 direction = normalize(vDirection);
          float h = direction.y;
          vec3 color = mix(bottomColor, midColor, smoothstep(-0.05, 0.16, h));
          color = mix(color, topColor, smoothstep(0.16, 0.7, h));
          float facing = max(dot(direction, sunDirection), 0.0);
          color += discColor * discStrength * (pow(facing, 300.0) * 2.5 + pow(facing, 8.0) * 0.35);
          gl_FragColor = vec4(color, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }));
    sky.renderOrder = -1;
    sky.userData.noOcclude = true;
    scene.add(sky);

    const hemi = new THREE.HemisphereLight('#C6CCF2', '#7A6A55', 1.15);
    scene.add(hemi);
    const ambient = new THREE.AmbientLight('#FFE2C8', 0.25);
    scene.add(ambient);
    const sun = new THREE.DirectionalLight('#FFC68C', 2.7);
    sun.position.copy(sunDirection).multiplyScalar(70);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -32;
    sun.shadow.camera.right = 32;
    sun.shadow.camera.top = 32;
    sun.shadow.camera.bottom = -32;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 160;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    scene.add(sun);
    scene.add(sun.target);

    const world = {
      renderer, scene, camera, sky, sun, hemi, ambient, C, toV, heightAt, waveHeight,
      lanterns: [], windowGlows: [], fireflies: null, places: {}, pines: [], season: null,
      hour: Cozy.daytime.hours(), night: 0, glow: 0.7, rain: Cozy.weather.isRaining() ? 1 : 0, rainbow: 0,
    };

    buildTerrainAndWater(world);
    const batch = new Batcher();
    const places = world.places;
    buildDock(world, batch);
    buildCabin(world, batch);
    buildCampfire(world, batch);
    buildGarden(world, batch);
    buildFeeder(world, batch);
    buildBench(world, batch);
    C.HOMESTEADS.forEach((centre, index) => buildHomestead(world, batch, index, centre));
    buildPaths(world, batch);
    buildNature(world, batch);
    buildFishingProps(world, batch);
    buildBackdrop(world, batch);
    batch.build(scene);
    buildFireflies(world);
    buildSeasonal(world);
    buildNightSky(world);
    buildRain(world);
    buildRainbow(world);
    world.cat = buildCat(world);
    applySeason(world, Cozy.season.current());
    updateDaylight(world, 0, true);

    const spawn = lerp2(places.pathStart2, { x: places.dockStart - 0.3, y: C.DOCK_Y }, 0.5);
    places.villageSpawn = toV(spawn.x, spawn.y, heightAt(spawn.x, spawn.y));

    window.addEventListener('resize', () => {
      if (world.lockViewport) {
        return;  // desk mode sizes the view to its floating window
      }
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });
    return world;
  }

  function lerp2(a, b, t) {
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }

  // ------------------------------------------------------------------ day / night

  function sampleDayKeys(hour) {
    let index = 0;
    while (index < DAY_KEYS.length - 2 && DAY_KEYS[index + 1].hour <= hour) {
      index++;
    }
    const a = DAY_KEYS[index];
    const b = DAY_KEYS[index + 1];
    const t = Cozy.smoothstep(0, 1, (hour - a.hour) / Math.max(0.001, b.hour - a.hour));
    const result = {};
    for (const field of COLOR_FIELDS) {
      result[field] = new THREE.Color(a[field]).lerp(new THREE.Color(b[field]), t);
    }
    for (const field of NUMBER_FIELDS) {
      result[field] = a[field] + (b[field] - a[field]) * t;
    }
    return result;
  }

  /** Sun arcs from the east (6:00) to the sunset side (20:00); the moon takes over at night. */
  function lightDirection(hour) {
    const setAzimuth = Math.atan2(C.SUNSET.y, C.SUNSET.x);
    const progress = Cozy.clamp01((hour - 6) / 14);
    const elevation = Math.max(THREE.MathUtils.degToRad(4), Math.sin(progress * Math.PI) * THREE.MathUtils.degToRad(62));
    const azimuth = setAzimuth + Math.PI * (1 - progress);
    const sunDir = new THREE.Vector3(
      Math.cos(elevation) * Math.cos(azimuth), Math.sin(elevation), -Math.cos(elevation) * Math.sin(azimuth));
    const moonElevation = THREE.MathUtils.degToRad(42);
    const moonAzimuth = setAzimuth + Math.PI * 0.62;
    const moonDir = new THREE.Vector3(
      Math.cos(moonElevation) * Math.cos(moonAzimuth), Math.sin(moonElevation), -Math.cos(moonElevation) * Math.sin(moonAzimuth));
    let moonBlend = 0;
    if (hour >= 19.5) {
      moonBlend = Cozy.smoothstep(19.5, 20.6, hour);
    } else if (hour <= 6.5) {
      moonBlend = 1 - Cozy.smoothstep(5.4, 6.5, hour);
    }
    return sunDir.lerp(moonDir, moonBlend).normalize();
  }

  /** Eases the shown hour toward the target (always forwards around the clock) and relights everything. */
  function updateDaylight(world, dt, instant) {
    const target = Cozy.daytime.hours();
    if (instant) {
      world.hour = target;
    } else {
      const ahead = ((target - world.hour) % 24 + 24) % 24;
      const step = Math.min(ahead, Math.max(0.0005, ahead * 2.2 * dt));
      world.hour = (world.hour + step) % 24;
    }
    const key = sampleDayKeys(world.hour);
    const look = world.seasonLook || SEASON_LOOKS.summer;
    const day = 1 - key.night;

    // rain: ease toward the forecast, then grey everything down a little
    const rainTarget = Cozy.weather.isRaining() ? 1 : 0;
    world.rain = instant ? rainTarget : world.rain + (rainTarget - world.rain) * Math.min(1, dt * 0.35);
    const rain = world.rain;
    const overcast = new THREE.Color(key.night > 0.5 ? '#1C2333' : '#8E98A8');
    key.top.lerp(overcast, 0.7 * rain);
    key.mid.lerp(overcast, 0.6 * rain);
    key.bottom.lerp(overcast, 0.55 * rain);
    key.fog.lerp(overcast, 0.6 * rain);
    key.sunI *= 1 - 0.65 * rain;
    key.discI *= 1 - 0.9 * rain;
    key.hemiI *= 1 - 0.12 * rain;
    key.water.lerp(new THREE.Color('#3B6670'), 0.45 * rain);

    const uniforms = world.sky.material.uniforms;
    uniforms.topColor.value.copy(key.top);
    uniforms.midColor.value.copy(key.mid);
    uniforms.bottomColor.value.copy(key.bottom);
    uniforms.discColor.value.copy(key.disc);
    uniforms.discStrength.value = key.discI;
    const direction = lightDirection(world.hour);
    uniforms.sunDirection.value.copy(direction);

    world.sun.position.copy(direction).multiplyScalar(70);
    world.sun.color.copy(key.sun);
    world.sun.intensity = key.sunI;
    world.hemi.color.copy(key.hemiSky).lerp(new THREE.Color(look.hemiSky), 0.35 * day);
    world.hemi.groundColor.copy(key.hemiGround);
    world.hemi.intensity = key.hemiI;
    world.ambient.intensity = key.ambient;
    world.scene.fog.color.copy(key.fog).lerp(new THREE.Color(look.fog), 0.35 * day);
    world.scene.fog.near = 55 - 28 * rain;
    world.scene.fog.far = 200 - 85 * rain;
    world.water.material.color.set(look.water).lerp(key.water, Math.max(0.3, key.night));
    world.renderer.toneMappingExposure = key.exposure;

    world.night = key.night;
    world.glow = key.glow;
    world.stars.material.opacity = Math.pow(key.night, 1.5) * 0.9 * (1 - rain);
    world.stars.visible = key.night > 0.02;
    for (const glow of world.windowGlows) {
      glow.material.opacity = 0.55 * Math.min(1.3, 0.3 + key.glow);
    }
    if (world.porchLight) {
      world.porchLight.intensity = 8 * (0.3 + key.glow);
    }
    world.fireflies.points.visible = look.fireflies && key.glow > 0.45 && rain < 0.4;
    Cozy.sound.night = key.night;
    Cozy.sound.evening = key.glow;
    Cozy.sound.rain = look.snow ? 0 : rain;  // a winter "rainy" spell is snowy and quiet
    if (world.rainbowFx) {
      updateRainbow(world, instant ? 0 : dt, direction, day, !!look.snow);
    }
  }

  // ------------------------------------------------------------------ rain

  const RAIN_DROPS = 1400;
  const RAIN_HALF = 16;
  const RAIN_TOP = 10;
  const RAIN_BOTTOM = -12;

  /** Short slanted streaks in a box that travels with the camera. */
  function buildRain(world) {
    const positions = new Float32Array(RAIN_DROPS * 6);
    const drops = [];
    for (let i = 0; i < RAIN_DROPS; i++) {
      drops.push({
        x: Cozy.rand(-RAIN_HALF, RAIN_HALF),
        y: Cozy.rand(RAIN_BOTTOM, RAIN_TOP),
        z: Cozy.rand(-RAIN_HALF, RAIN_HALF),
        speed: Cozy.rand(13, 19),
      });
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const streaks = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({
      color: '#C9D6E6', transparent: true, opacity: 0, depthWrite: false,
    }));
    streaks.frustumCulled = false;
    world.scene.add(streaks);
    world.rainFx = { streaks, drops, rippleTimer: 0 };
  }

  function updateRain(world, dt) {
    const fx = world.rainFx;
    const amount = world.seasonLook && world.seasonLook.snow ? 0 : world.rain;
    fx.streaks.visible = amount > 0.02;
    if (!fx.streaks.visible) {
      return;
    }
    fx.streaks.material.opacity = 0.42 * amount;
    fx.streaks.position.copy(world.camera.position);
    const positions = fx.streaks.geometry.attributes.position;
    const wind = 2.2;
    for (let i = 0; i < RAIN_DROPS; i++) {
      const drop = fx.drops[i];
      drop.y -= drop.speed * dt;
      drop.x += wind * dt;
      if (drop.y < RAIN_BOTTOM) {
        drop.y = RAIN_TOP;
        drop.x = Cozy.rand(-RAIN_HALF, RAIN_HALF);
        drop.z = Cozy.rand(-RAIN_HALF, RAIN_HALF);
      }
      const length = 0.45;
      positions.setXYZ(i * 2, drop.x, drop.y, drop.z);
      positions.setXYZ(i * 2 + 1, drop.x - wind * 0.03, drop.y + length, drop.z);
    }
    positions.needsUpdate = true;

    // little rings on the water in front of the camera
    fx.rippleTimer -= dt;
    if (fx.rippleTimer <= 0) {
      fx.rippleTimer = 0.07 / amount;
      const forward = new THREE.Vector3();
      world.camera.getWorldDirection(forward);
      forward.y = 0;
      forward.normalize();
      const spot = world.camera.position.clone().addScaledVector(forward, Cozy.rand(4, 22));
      spot.x += Cozy.rand(-8, 8);
      spot.z += Cozy.rand(-8, 8);
      if (heightAt(spot.x, -spot.z) < -0.4) {
        spot.y = 0.02;
        FX.ripple(spot, Cozy.rand(0.25, 0.5));
      }
    }
  }

  // ------------------------------------------------------------------ rainbow (after a daytime shower)

  const RAINBOW_SECONDS = 240;
  const RAINBOW_DISTANCE = 300;            // inside the 500-unit sky dome, follows the camera like the sky
  const RAINBOW_MAX_SUN = THREE.MathUtils.degToRad(24);  // cozy cheat: keep the bow up even at midday

  function rainbowMaterial(innerDeg, outerDeg, strength, reverse) {
    const inner = RAINBOW_DISTANCE * Math.tan(THREE.MathUtils.degToRad(innerDeg));
    const outer = RAINBOW_DISTANCE * Math.tan(THREE.MathUtils.degToRad(outerDeg));
    const materialRef = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
      uniforms: {
        inner: { value: inner },
        outer: { value: outer },
        opacity: { value: 0 },
        strength: { value: strength },
        reverse: { value: reverse ? 1 : 0 },
      },
      vertexShader: `
        varying vec2 vLocal;
        varying float vHeight;
        void main() {
          vLocal = position.xy;
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vHeight = worldPosition.y - cameraPosition.y;
          gl_Position = projectionMatrix * viewMatrix * worldPosition;
        }`,
      fragmentShader: `
        uniform float inner;
        uniform float outer;
        uniform float opacity;
        uniform float strength;
        uniform float reverse;
        varying vec2 vLocal;
        varying float vHeight;
        void main() {
          float t = clamp((length(vLocal) - inner) / (outer - inner), 0.0, 1.0);
          float band = t;
          if (reverse > 0.5) {
            band = 1.0 - t;
          }
          // red on the outside of the bow, violet on the inside
          float hue = (1.0 - band) * 0.78;
          vec3 rgb = clamp(abs(mod(hue * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
          rgb = mix(vec3(1.0), rgb, 0.85);
          float alpha = pow(sin(t * 3.14159), 0.7) * opacity * strength * smoothstep(0.0, 25.0, vHeight);
          gl_FragColor = vec4(rgb, alpha);
        }`,
    });
    return { material: materialRef, inner, outer };
  }

  function buildRainbow(world) {
    const group = new THREE.Group();
    const bows = [
      rainbowMaterial(39.5, 42.5, 0.5, false),    // primary bow
      rainbowMaterial(50.5, 53.5, 0.18, true),    // faint secondary bow, colours reversed
    ].map((bow) => {
      const mesh = new THREE.Mesh(new THREE.RingGeometry(bow.inner, bow.outer, 128, 1, 0, Math.PI), bow.material);
      mesh.frustumCulled = false;
      mesh.renderOrder = -0.5;   // just after the sky, before the island
      mesh.userData.noOcclude = true;
      group.add(mesh);
      return mesh;
    });
    group.visible = false;
    world.scene.add(group);
    const forced = new URLSearchParams(window.location.search).get('rainbow') === '1';
    world.rainbowFx = { group, bows, timer: forced ? 1e9 : 0, amount: forced ? 1 : 0, wasRaining: Cozy.weather.isRaining() };
  }

  /** Starts a rainbow when a daytime shower ends; keeps it opposite the sun. */
  function updateRainbow(world, dt, sunDirection, day, snowy) {
    const fx = world.rainbowFx;
    const raining = Cozy.weather.isRaining();
    if (fx.wasRaining && !raining && day > 0.6 && !snowy) {
      fx.timer = RAINBOW_SECONDS;
      Cozy.events.emit('rainbow');
    }
    fx.wasRaining = raining;
    fx.timer = Math.max(0, fx.timer - dt);
    const fadeOut = Math.min(1, fx.timer / 30);
    const target = fx.timer > 0 ? fadeOut : 0;
    fx.amount += (target - fx.amount) * Math.min(1, dt * 0.5);
    const visible = fx.amount * (1 - world.rain) * Cozy.smoothstep(0.5, 0.9, day);
    world.rainbow = visible;
    fx.group.visible = visible > 0.01;
    if (!fx.group.visible) {
      return;
    }
    const elevation = Math.min(RAINBOW_MAX_SUN, Math.max(0, Math.asin(Math.min(1, sunDirection.y))));
    const away = new THREE.Vector3(-sunDirection.x, 0, -sunDirection.z).normalize();
    const antisolar = away.multiplyScalar(Math.cos(elevation)).add(new THREE.Vector3(0, -Math.sin(elevation), 0));
    fx.group.position.copy(world.camera.position);
    fx.bows.forEach((mesh) => {
      mesh.position.copy(antisolar).multiplyScalar(RAINBOW_DISTANCE);
      mesh.lookAt(fx.group.position);
      mesh.material.uniforms.opacity.value = visible;
    });
  }

  function buildNightSky(world) {
    const count = 650;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      // random points on the upper part of the dome
      const y = 0.08 + Math.pow(Math.random(), 0.7) * 0.92;
      const angle = Math.random() * Math.PI * 2;
      const ring = Math.sqrt(1 - y * y);
      positions.set([Math.cos(angle) * ring * 450, y * 450, Math.sin(angle) * ring * 450], i * 3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const stars = new THREE.Points(geometry, new THREE.PointsMaterial({
      color: '#F4F6FF', size: 1.8, sizeAttenuation: false, transparent: true, opacity: 0,
      depthWrite: false, fog: false,
    }));
    stars.frustumCulled = false;
    world.sky.add(stars);  // the sky dome follows the camera, so the stars do too
    world.stars = stars;
  }

  // ------------------------------------------------------------------ campfire (cooking)

  function buildCampfire(world, batch) {
    const centre = C.CAMPFIRE;
    const floor = heightAt(centre.x, centre.y);
    // stone ring + crossed logs
    for (let k = 0; k < 9; k++) {
      const angle = (k / 9) * Math.PI * 2;
      batch.ico(PALETTE.stone, 0.13, [centre.x + Math.cos(angle) * 0.5, centre.y + Math.sin(angle) * 0.5, floor + 0.06],
        [1, 1, 0.7], 0.03, 1);
    }
    for (let k = 0; k < 3; k++) {
      batch.box(PALETTE.trunk, [0.62, 0.11, 0.11], [centre.x, centre.y, floor + 0.08], [0, 0.25, k * 2.1]);
    }
    // tripod + hanging pot
    const apex = toV(centre.x, centre.y, floor + 1.35);
    for (let k = 0; k < 3; k++) {
      const angle = k * (Math.PI * 2 / 3) + 0.4;
      const foot = toV(centre.x + Math.cos(angle) * 0.7, centre.y + Math.sin(angle) * 0.7, floor);
      const leg = apex.clone().sub(foot);
      batch.cylinderAlong(PALETTE.woodDark, 0.035, 0.03, foot, leg.clone().normalize(), leg.length(), 5);
    }
    batch.cylinderAlong(PALETTE.metal, 0.008, 0.008, toV(centre.x, centre.y, floor + 0.78), new THREE.Vector3(0, 1, 0), 0.57, 4);
    batch.cylinder('#3A3A40', 0.2, 0.24, 0.26, [centre.x, centre.y, floor + 0.65], 12, null, { metalness: 0.4, roughness: 0.5 });
    // two log seats + a crate of ingredients
    for (const [angle, length] of [[0.6, 1.1], [2.6, 1.0]]) {
      const seat = { x: centre.x + Math.cos(angle) * 1.45, y: centre.y + Math.sin(angle) * 1.45 };
      batch.cylinder(PALETTE.trunk, 0.17, 0.17, length, [seat.x, seat.y, heightAt(seat.x, seat.y) + 0.15], 8,
        [Math.PI / 2, 0, angle + Math.PI / 2]);
    }
    const crate = { x: centre.x + Math.cos(4.3) * 1.3, y: centre.y + Math.sin(4.3) * 1.3 };
    const crateFloor = heightAt(crate.x, crate.y);
    batch.box(PALETTE.wood, [0.5, 0.36, 0.26], [crate.x, crate.y, crateFloor + 0.13], [0, 0, 4.3]);
    ['#E5402F', '#E8862F', '#FFD23F', '#5DAA4F'].forEach((color, k) => {
      batch.ico(color, 0.07, [crate.x + (k - 1.5) * 0.1, crate.y + Cozy.rand(-0.06, 0.06), crateFloor + 0.3], null, 0, 1);
    });

    // animated flames + firelight
    const flames = new THREE.Group();
    flames.position.copy(toV(centre.x, centre.y, floor + 0.12));
    const flameMaterials = ['#FF7A2E', '#FFB341', '#FFE07A'].map((color) => new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.9, depthWrite: false,
    }));
    const flameParts = [];
    [[0.2, 0.55, 0], [0.14, 0.42, 1], [0.08, 0.3, 2]].forEach(([radius, height, layer]) => {
      for (let k = 0; k < (layer === 0 ? 3 : 2); k++) {
        const cone = new THREE.Mesh(new THREE.ConeGeometry(radius, height, 6), flameMaterials[layer]);
        cone.position.set(Cozy.rand(-0.07, 0.07), height / 2, Cozy.rand(-0.07, 0.07));
        cone.userData = { height, phase: Math.random() * 10, noOcclude: true };
        flames.add(cone);
        flameParts.push(cone);
      }
    });
    world.scene.add(flames);
    const light = new THREE.PointLight('#FF8A3D', 4, 9, 2);
    light.position.copy(toV(centre.x, centre.y, floor + 0.7));
    world.scene.add(light);
    const glow = glowSprite('#FF9A4A', 1.8, 0.6);
    glow.position.copy(toV(centre.x, centre.y, floor + 0.35));
    world.scene.add(glow);

    const places = world.places;
    places.campfire = toV(centre.x, centre.y, floor);
    places.pot = toV(centre.x, centre.y, floor + 0.8);
    places.crate = toV(crate.x, crate.y, crateFloor + 0.3);
    places.campfireFrom = toV(centre.x + 3, centre.y - 2.2, floor);
    world.campfire = { flames, flameParts, light, glow, heat: 0.35, emberTimer: 0 };
  }

  function updateCampfire(world, time, dt) {
    const fire = world.campfire;
    const heat = fire.heat;  // 0..1; the cooking activity fans it up
    const size = 0.55 + heat * 0.9;
    for (const cone of fire.flameParts) {
      const flicker = 0.85 + 0.25 * Math.sin(time * 9 + cone.userData.phase) * Math.sin(time * 4.3 + cone.userData.phase * 2);
      cone.scale.set(size * (0.9 + 0.1 * flicker), size * flicker, size * (0.9 + 0.1 * flicker));
      cone.position.y = (cone.userData.height * size * flicker) / 2;
      cone.rotation.y = time * 0.6 + cone.userData.phase;
    }
    const flicker = 0.85 + 0.15 * Math.sin(time * 11) * Math.sin(time * 5.7 + 1);
    fire.light.intensity = (2.5 + 4 * heat) * (0.6 + world.glow * 0.8) * flicker;
    fire.glow.material.opacity = (0.35 + 0.4 * heat) * (0.5 + world.glow * 0.6) * flicker;
    fire.emberTimer -= dt;
    if (fire.emberTimer <= 0) {
      fire.emberTimer = 0.3 - heat * 0.18;
      const ember = fire.flames.position.clone().add(new THREE.Vector3(Cozy.rand(-0.15, 0.15), 0.4 + heat * 0.3, Cozy.rand(-0.15, 0.15)));
      FX.puff(ember, '#FFB060', 0.08);
    }
  }

  // ------------------------------------------------------------------ Mochi, the dock cat

  /** A small low-poly cat (sitting pose); parts are returned so callers can animate them. */
  function buildCatModel() {
    const fur = material('#E39A4E');
    const cream = material('#F7E6CC');
    const dark = material('#2A1E18');
    const pink = material('#F29CA8');
    const sphere = new THREE.IcosahedronGeometry(1, 2);
    const part = (geometry, mat, position, scale, parent) => {
      const mesh = new THREE.Mesh(geometry, mat);
      mesh.position.set(position[0], position[1], position[2]);
      if (scale) {
        mesh.scale.set(scale[0], scale[1], scale[2]);
      }
      mesh.castShadow = true;
      parent.add(mesh);
      return mesh;
    };

    const root = new THREE.Group();
    const body = new THREE.Group();  // tilts between sitting and curled up asleep
    root.add(body);
    part(sphere, fur, [0, 0.15, -0.02], [0.14, 0.16, 0.2], body);
    part(sphere, cream, [0, 0.17, 0.1], [0.08, 0.11, 0.08], body);
    for (const side of [-1, 1]) {
      part(new THREE.CylinderGeometry(0.025, 0.028, 0.16, 6), fur, [side * 0.05, 0.07, 0.12], null, body);
      part(sphere, cream, [side * 0.05, 0.0, 0.14], [0.03, 0.02, 0.04], body);
      part(sphere, fur, [side * 0.09, 0.07, -0.08], [0.06, 0.07, 0.1], body);
    }

    const head = new THREE.Group();
    head.position.set(0, 0.36, 0.1);
    body.add(head);
    part(sphere, fur, [0, 0, 0], [0.11, 0.1, 0.1], head);
    part(sphere, cream, [0, -0.03, 0.07], [0.055, 0.04, 0.045], head);
    part(sphere, pink, [0, -0.005, 0.1], [0.012, 0.01, 0.01], head);
    const eyes = [-1, 1].map((side) => part(sphere, dark, [side * 0.04, 0.02, 0.085], [0.016, 0.022, 0.012], head));
    const ears = [-1, 1].map((side) => {
      const ear = part(new THREE.ConeGeometry(0.04, 0.08, 4), fur, [side * 0.06, 0.1, 0], null, head);
      ear.rotation.z = -side * 0.35;
      return ear;
    });

    // tail: a chain of segments, each parented to the previous one so it curls naturally
    const tail = [];
    let parent = body;
    let offset = [0, 0.05, -0.2];
    for (let k = 0; k < 6; k++) {
      const pivot = new THREE.Group();
      pivot.position.set(offset[0], offset[1], offset[2]);
      parent.add(pivot);
      const segment = part(new THREE.CylinderGeometry(0.022, 0.026, 0.075, 6), k === 5 ? cream : fur, [0, 0, -0.035], null, pivot);
      segment.rotation.x = Math.PI / 2;
      tail.push(pivot);
      parent = pivot;
      offset = [0, 0, -0.07];
    }

    const hit = new THREE.Mesh(new THREE.SphereGeometry(0.38, 10, 8),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    hit.position.y = 0.2;
    root.add(hit);
    root.traverse((object) => {
      object.userData.noOcclude = true;
    });
    return { root, body, head, eyes, ears, tail, hit };
  }

  function buildCat(world) {
    const cat = buildCatModel();
    const root = cat.root;
    const places = world.places;
    const deckTop = C.DOCK_HEIGHT + 0.035;
    // between the tackle box and your stool, side-on to the fishing camera so you see her profile
    root.position.copy(toV(places.dockEnd - 1.85, C.DOCK_Y + 0.62, deckTop));
    root.rotation.y = 2.67;  // facing out over the water toward the far shore
    root.scale.setScalar(1.15);
    world.scene.add(root);
    places.cat = root.position.clone();
    return Object.assign(cat, { baseYaw: root.rotation.y });
  }

  function buildTerrainAndWater(world) {
    const { scene } = world;
    const plane = new THREE.PlaneGeometry(52, 52, 96, 96);
    plane.rotateX(-Math.PI / 2);
    const indexed = plane.attributes.position;
    for (let i = 0; i < indexed.count; i++) {
      const x = indexed.getX(i);
      const z = indexed.getZ(i);
      indexed.setY(i, heightAt(x, -z));
    }
    const terrain = plane.toNonIndexed();
    plane.dispose();
    const positions = terrain.attributes.position;
    const colors = new Float32Array(positions.count * 3);
    // remember what each triangle is (grass / sand / seabed) so seasons can repaint it later
    const faces = [];
    for (let i = 0; i < positions.count; i += 3) {
      const h = (positions.getY(i) + positions.getY(i + 1) + positions.getY(i + 2)) / 3;
      const kind = h > 0.45 ? 'grass' : (h > -0.9 ? 'sand' : 'seabed');
      faces.push({ kind, variant: Math.random() < 0.5 ? 0 : 1, shade: Cozy.rand(-0.02, 0.02) });
    }
    terrain.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    terrain.computeVertexNormals();
    const terrainMesh = new THREE.Mesh(terrain, new THREE.MeshStandardMaterial({
      vertexColors: true, flatShading: true, roughness: 0.95,
    }));
    terrainMesh.receiveShadow = true;
    terrainMesh.name = 'terrain';
    scene.add(terrainMesh);
    world.terrain = terrainMesh;
    world.terrainFaces = faces;
    paintTerrain(world, SEASON_LOOKS.summer);

    const seabed = new THREE.Mesh(new THREE.PlaneGeometry(400, 400).rotateX(-Math.PI / 2), material(PALETTE.seabed));
    seabed.position.y = C.SEABED;
    seabed.userData.noOcclude = true;
    scene.add(seabed);

    const waterGeometry = new THREE.PlaneGeometry(180, 180, 110, 110);
    waterGeometry.rotateX(-Math.PI / 2);
    const water = new THREE.Mesh(waterGeometry, new THREE.MeshStandardMaterial({
      color: PALETTE.water, flatShading: true, roughness: 0.12, metalness: 0.05,
      transparent: true, opacity: 0.78,
    }));
    water.receiveShadow = true;
    water.userData.noOcclude = true;
    scene.add(water);
    world.water = water;
  }

  function paintTerrain(world, look) {
    const colors = world.terrain.geometry.attributes.color;
    const color = new THREE.Color();
    world.terrainFaces.forEach((face, f) => {
      if (face.kind === 'grass') {
        color.set(look.grass[face.variant]);
        color.offsetHSL(0, 0, face.shade);
      } else if (face.kind === 'sand') {
        color.set(look.sand);
        color.offsetHSL(0, 0, face.shade * 0.75);
      } else {
        color.set(PALETTE.seabed);
      }
      for (let k = 0; k < 3; k++) {
        colors.setXYZ(f * 3 + k, color.r, color.g, color.b);
      }
    });
    colors.needsUpdate = true;
  }

  // ------------------------------------------------------------------ seasons

  let discTexture = null;

  function getDiscTexture() {
    if (!discTexture) {
      const canvas = document.createElement('canvas');
      canvas.width = 32;
      canvas.height = 32;
      const context = canvas.getContext('2d');
      const gradient = context.createRadialGradient(16, 16, 0, 16, 16, 16);
      gradient.addColorStop(0, 'rgba(255,255,255,1)');
      gradient.addColorStop(0.55, 'rgba(255,255,255,0.9)');
      gradient.addColorStop(1, 'rgba(255,255,255,0)');
      context.fillStyle = gradient;
      context.fillRect(0, 0, 32, 32);
      discTexture = new THREE.CanvasTexture(canvas);
    }
    return discTexture;
  }

  /** Snow caps for the pines + one particle system reused for petals / fluff / leaves / snow. */
  function buildSeasonal(world) {
    const snowBatch = new Batcher();
    for (const pine of world.pines) {
      for (const tier of pine.tiers) {
        // white cone over the top ~45% of each tier, a hair larger so it sits on the outside
        const capDepth = tier.depth * 0.45;
        const capRadius = tier.radius * 0.45 * 1.08;
        snowBatch.cylinder('#F7FAFC', capRadius, 0, capDepth * 1.04,
          [pine.x, pine.y, tier.centre + tier.depth / 2 - capDepth / 2 + 0.01], 7, [0, 0, tier.rotation]);
      }
    }
    const snowCaps = new THREE.Group();
    snowBatch.build(snowCaps);
    world.scene.add(snowCaps);

    const positions = new Float32Array(WEATHER_MAX * 3);
    const colors = new Float32Array(WEATHER_MAX * 3);
    const particles = [];
    for (let i = 0; i < WEATHER_MAX; i++) {
      particles.push({
        x: Cozy.rand(-WEATHER_HALF, WEATHER_HALF),
        y: Cozy.rand(0, WEATHER_TOP),
        z: Cozy.rand(-WEATHER_HALF, WEATHER_HALF),
        speed: Cozy.rand(0.7, 1.3),
        phase: Math.random() * 100,
      });
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const points = new THREE.Points(geometry, new THREE.PointsMaterial({
      size: 0.16, map: getDiscTexture(), vertexColors: true, transparent: true, opacity: 0.95,
      depthWrite: false, alphaTest: 0.05,
    }));
    points.frustumCulled = false;
    world.scene.add(points);
    world.seasonal = { snowCaps, weather: { points, particles, style: null } };
  }

  function applySeason(world, season) {
    const look = SEASON_LOOKS[season] || SEASON_LOOKS.summer;
    world.season = season;
    world.seasonLook = look;
    paintTerrain(world, look);
    material(PALETTE.leaf).color.set(look.leaf);
    material(PALETTE.leafAlt).color.set(look.leafAlt);
    material(PALETTE.bush).color.set(look.bush);
    material(PALETTE.pine).color.set(look.pine);
    material(PALETTE.mountain).color.set(look.mountain);
    material(PALETTE.lily).color.set(look.lily);
    // fog, sky light and water colour are blended with the time of day in updateDaylight()
    if (world.flowers) {
      world.flowers.visible = look.flowers;
    }
    world.seasonal.snowCaps.visible = look.snow;

    const style = WEATHER[look.weather];
    const weather = world.seasonal.weather;
    weather.style = style;
    weather.points.material.size = style.size;
    weather.points.geometry.setDrawRange(0, style.count);
    const colors = weather.points.geometry.attributes.color;
    const color = new THREE.Color();
    for (let i = 0; i < WEATHER_MAX; i++) {
      color.set(style.colors[i % style.colors.length]);
      colors.setXYZ(i, color.r, color.g, color.b);
    }
    colors.needsUpdate = true;
  }

  function updateWeather(world, time, dt) {
    const weather = world.seasonal.weather;
    const style = weather.style;
    if (!style) {
      return;
    }
    const positions = weather.points.geometry.attributes.position;
    for (let i = 0; i < style.count; i++) {
      const p = weather.particles[i];
      p.y -= style.fall * p.speed * dt;
      p.x += Math.sin(time * 0.7 + p.phase) * style.sway * dt;
      p.z += Math.cos(time * 0.55 + p.phase * 1.3) * style.sway * 0.6 * dt;
      if (p.y < -0.2 || p.y > WEATHER_TOP) {
        // recycle: falling styles restart at the top, rising fluff restarts near the ground
        p.y = style.fall > 0 ? WEATHER_TOP : 0.3;
        p.x = Cozy.rand(-WEATHER_HALF, WEATHER_HALF);
        p.z = Cozy.rand(-WEATHER_HALF, WEATHER_HALF);
      }
      positions.setXYZ(i, p.x, p.y, p.z);
    }
    positions.needsUpdate = true;
  }

  function updateWater(world, time) {
    const positions = world.water.geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      positions.setY(i, waveHeight(positions.getX(i), positions.getZ(i), time));
    }
    positions.needsUpdate = true;
  }

  function findDockStart() {
    for (let x = 0; x < 30; x += 0.05) {
      const highest = Math.max(heightAt(x, C.DOCK_Y - 1.1), heightAt(x, C.DOCK_Y), heightAt(x, C.DOCK_Y + 1.1));
      if (highest < C.DOCK_HEIGHT - 0.15) {
        return x;
      }
    }
    return 10;
  }

  function addLantern(world, batch, x, y, deckTop) {
    batch.cylinder(PALETTE.woodDark, 0.06, 0.05, 1.4, [x, y, deckTop + 0.7], 6);
    batch.box(PALETTE.lantern, [0.2, 0.2, 0.24], [x, y, deckTop + 1.52], null, { emissive: 2.2 });
    batch.cylinder(PALETTE.woodDark, 0.19, 0, 0.16, [x, y, deckTop + 1.72], 4);
    const position = toV(x, y, deckTop + 1.52);
    const light = new THREE.PointLight('#FFB066', 6, 7, 2);
    light.position.copy(position);
    world.scene.add(light);
    const glow = glowSprite('#FFB45E', 1.4, 0.7);
    glow.position.copy(position);
    world.scene.add(glow);
    world.lanterns.push({ light, glow, phase: Math.random() * 10 });
  }

  function buildDock(world, batch) {
    const places = world.places;
    const start = findDockStart();
    const end = start + C.DOCK_LENGTH;
    places.dockStart = start;
    places.dockEnd = end;
    const pitch = 0.32;
    const count = Math.floor(C.DOCK_LENGTH / pitch);
    for (let k = 0; k < count; k++) {
      const x = start + (k + 0.5) * pitch;
      batch.box(PALETTE.wood, [0.29, C.DOCK_WIDTH, 0.07], [x, C.DOCK_Y, C.DOCK_HEIGHT + Cozy.rand(-0.012, 0.012)],
        [0, 0, THREE.MathUtils.degToRad(Cozy.rand(-1.5, 1.5))]);
    }
    for (const side of [-1, 1]) {
      batch.box(PALETTE.woodDark, [C.DOCK_LENGTH, 0.14, 0.14], [start + C.DOCK_LENGTH / 2, C.DOCK_Y + side * 0.75, C.DOCK_HEIGHT - 0.1]);
    }
    const postBottom = C.SEABED - 0.1;
    const postTop = C.DOCK_HEIGHT + 0.08;
    const postXs = [];
    for (let n = 0; n < Math.floor(C.DOCK_LENGTH / 2); n++) {
      postXs.push(start + 0.3 + 2 * n);
    }
    postXs.push(end - 0.15);
    for (const x of postXs) {
      for (const side of [-1, 1]) {
        batch.cylinder(PALETTE.woodDark, 0.1, 0.1, postTop - postBottom,
          [x, C.DOCK_Y + side * (C.DOCK_WIDTH / 2 - 0.05), (postTop + postBottom) / 2], 8);
      }
    }
    const deckTop = C.DOCK_HEIGHT + 0.035;
    addLantern(world, batch, start + 0.4, C.DOCK_Y + 0.95, deckTop);
    addLantern(world, batch, end - 0.3, C.DOCK_Y + 0.95, deckTop);
  }

  function buildCabin(world, batch) {
    const places = world.places;
    const yaw = Math.atan2(C.DOCK_Y - C.CABIN.y, places.dockStart - C.CABIN.x);
    const floorTop = 0.2;
    const wallTop = 2.6;
    const halfX = 2;
    const halfY = 1.6;
    const slope = 0.75;
    const ridge = wallTop + 0.1 + slope * halfY;
    const porchDepth = 1.8;
    const frame = matB([C.CABIN.x, C.CABIN.y, C.CABIN_FLOOR], [0, 0, yaw]);
    const toWorld = (lx, ly, lz) => {
      const cos = Math.cos(yaw);
      const sin = Math.sin(yaw);
      return { x: C.CABIN.x + lx * cos - ly * sin, y: C.CABIN.y + lx * sin + ly * cos, z: C.CABIN_FLOOR + lz };
    };

    batch.frame = frame;
    batch.box(PALETTE.stone, [2 * halfX + 0.4, 2 * halfY + 0.4, 0.6], [0, 0, floorTop - 0.3]);
    batch.box(PALETTE.wall, [2 * halfX, 2 * halfY, wallTop - floorTop], [0, 0, (wallTop + floorTop) / 2]);
    // gable triangles: thin wedge boxes approximated by stacked boxes
    for (let i = 0; i < 6; i++) {
      const z0 = wallTop + i * ((ridge - 0.1 - wallTop) / 6);
      const width = 2 * halfY * (1 - i / 6);
      batch.box(PALETTE.wall, [2 * halfX, width, (ridge - 0.1 - wallTop) / 6], [0, 0, z0 + (ridge - 0.1 - wallTop) / 12]);
    }
    const eaveY = halfY + 0.4;
    const slabLength = Math.hypot(eaveY, slope * eaveY) + 0.1;
    const slabAngle = Math.atan(slope);
    for (const side of [-1, 1]) {
      batch.box(PALETTE.roof, [2 * halfX + 0.7, slabLength, 0.12], [0, side * eaveY / 2, ridge - slope * eaveY / 2],
        [-side * slabAngle, 0, 0]);
    }
    batch.box(PALETTE.woodDark, [0.08, 0.9, 1.6], [halfX + 0.02, 0, floorTop + 0.8]);
    batch.box(PALETTE.wood, [porchDepth, 2 * halfY + 0.4, 0.6], [halfX + porchDepth / 2, 0, floorTop - 0.3]);
    batch.box(PALETTE.stone, [0.4, 1, 0.1], [halfX + porchDepth + 0.2, 0, floorTop - 0.15]);
    for (const side of [-1, 1]) {
      for (const wx of [-0.9, 0.9]) {
        batch.box(PALETTE.window, [0.9, 0.06, 0.7], [wx, side * (halfY + 0.02), 1.6], null, { emissive: 1.6 });
        batch.box(PALETTE.wood, [1, 0.2, 0.18], [wx, side * (halfY + 0.1), 1.12]);
        for (let k = 0; k < 5; k++) {
          batch.ico(PALETTE.pink, 0.07, [wx - 0.36 + k * 0.18, side * (halfY + 0.1), 1.26], null, 0, 0);
        }
      }
    }
    batch.box(PALETTE.stone, [0.5, 0.5, 1.6], [-1.2, 0.8, ridge - 0.3]);
    // tea corner
    const table = { x: halfX + 0.85, y: 1.15 };
    const tableTop = floorTop + 0.645;
    batch.box(PALETTE.woodDark, [0.7, 0.7, 0.05], [table.x, table.y, floorTop + 0.62]);
    batch.cylinder(PALETTE.woodDark, 0.05, 0.05, 0.6, [table.x, table.y, floorTop + 0.3], 6);
    const chair = { x: table.x + 0.62, y: table.y };
    batch.box(PALETTE.wood, [0.45, 0.45, 0.05], [chair.x, chair.y, floorTop + 0.42]);
    batch.box(PALETTE.wood, [0.05, 0.45, 0.5], [chair.x + 0.2, chair.y, floorTop + 0.7]);
    for (const dx of [-0.18, 0.18]) {
      for (const dy of [-0.18, 0.18]) {
        batch.cylinder(PALETTE.woodDark, 0.025, 0.025, 0.4, [chair.x + dx, chair.y + dy, floorTop + 0.2], 5);
      }
    }
    const kettle = { x: table.x - 0.12, y: table.y + 0.1 };
    batch.cylinder(PALETTE.metal, 0.1, 0.09, 0.14, [kettle.x, kettle.y, tableTop + 0.07], 10, null, { metalness: 0.5, roughness: 0.35 });
    batch.cylinder(PALETTE.metal, 0.05, 0, 0.05, [kettle.x, kettle.y, tableTop + 0.165], 10, null, { metalness: 0.5, roughness: 0.35 });
    batch.cylinder(PALETTE.white, 0.04, 0.045, 0.07, [table.x + 0.12, table.y - 0.1, tableTop + 0.035], 10);
    batch.frame = null;

    // window glows + porch light
    for (const side of [-1, 1]) {
      for (const wx of [-0.9, 0.9]) {
        const p = toWorld(wx, side * (halfY + 0.12), 1.6);
        const glow = glowSprite('#FFC46B', 1.1, 0.55);
        glow.position.copy(toV(p.x, p.y, p.z));
        world.scene.add(glow);
        world.windowGlows.push(glow);
      }
    }
    const porch = toWorld(halfX + 0.5, 0.75, 2.0);
    const porchLight = new THREE.PointLight('#FFB066', 8, 8, 2);
    porchLight.position.copy(toV(porch.x, porch.y, porch.z));
    world.scene.add(porchLight);
    world.porchLight = porchLight;

    const kettleWorld = toWorld(kettle.x, kettle.y, tableTop + 0.2);
    const cupWorld = toWorld(table.x + 0.12, table.y - 0.1, tableTop + 0.08);
    const tea = toWorld(table.x, table.y, floorTop);
    const teaFrom = toWorld(halfX + porchDepth + 3.5, 1.6, 0);
    const pathStart = toWorld(halfX + porchDepth + 0.5, 0, 0);
    places.kettle = toV(kettleWorld.x, kettleWorld.y, kettleWorld.z);
    places.cup = toV(cupWorld.x, cupWorld.y, cupWorld.z);
    places.teaSpot = toV(tea.x, tea.y, tea.z);
    places.teaFrom = toV(teaFrom.x, teaFrom.y, teaFrom.z);
    places.pathStart2 = { x: pathStart.x, y: pathStart.y };
  }

  function buildGarden(world, batch) {
    const centre = C.GARDEN;
    const floor = heightAt(centre.x, centre.y);
    const places = world.places;
    places.gardenPlots = [];
    for (const bedY of [-1.2, 0, 1.2]) {
      batch.box(PALETTE.wood, [2.2, 0.9, 0.3], [centre.x, centre.y + bedY, floor + 0.1]);
      batch.box(PALETTE.soil, [2.0, 0.7, 0.04], [centre.x, centre.y + bedY, floor + 0.22]);
      for (const bedX of [-0.55, 0.55]) {
        places.gardenPlots.push(toV(centre.x + bedX, centre.y + bedY, floor + 0.24));
      }
    }
    const fencePosts = buildFence(batch, centre, floor, 1.8, 2.2, 0.7, 0.8, [0.3, 0.6], 0);
    const can = { x: centre.x + 0.9, y: centre.y - 2.2 - 0.5 };
    const canFloor = heightAt(can.x, can.y);
    batch.cylinder(PALETTE.teal, 0.12, 0.11, 0.22, [can.x, can.y, canFloor + 0.11], 10, null, { metalness: 0.3, roughness: 0.5 });
    batch.cylinder(PALETTE.teal, 0.02, 0.015, 0.3, [can.x + 0.18, can.y, canFloor + 0.2], 6, [0, THREE.MathUtils.degToRad(55), 0]);
    places.gardenCenter = toV(centre.x, centre.y, floor);
    places.fencePerches = [
      toV(centre.x + 1.8, centre.y, floor + 0.75),
      toV(centre.x - 1.8, centre.y + 2.2, floor + 0.75),
    ];
    return fencePosts;
  }

  /** Rectangular picket fence with a gate gap on the local -y side. Returns post positions. */
  function buildFence(batch, centre, floor, halfX, halfY, spacing, postHeight, railHeights, yaw) {
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    const rotate = (p) => ({ x: centre.x + p.x * cos - p.y * sin, y: centre.y + p.x * sin + p.y * cos });
    const corners = [{ x: -halfX, y: -halfY }, { x: halfX, y: -halfY }, { x: halfX, y: halfY }, { x: -halfX, y: halfY }];
    const posts = [];
    for (let side = 0; side < 4; side++) {
      const a = corners[side];
      const b = corners[(side + 1) % 4];
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      const count = Math.max(2, Math.round(length / spacing));
      const points = [];
      for (let k = 0; k <= count; k++) {
        points.push({ x: a.x + (b.x - a.x) * k / count, y: a.y + (b.y - a.y) * k / count });
      }
      points.slice(0, -1).forEach((p) => posts.push(rotate(p)));
      for (let k = 0; k < count; k++) {
        const mid = { x: (points[k].x + points[k + 1].x) / 2, y: (points[k].y + points[k + 1].y) / 2 };
        if (side === 0 && Math.abs(mid.x) < 0.45) {
          continue;
        }
        const angle = Math.atan2(points[k + 1].y - points[k].y, points[k + 1].x - points[k].x) + yaw;
        const world = rotate(mid);
        for (const railZ of railHeights) {
          batch.box(PALETTE.woodDark, [length / count, 0.04, 0.05], [world.x, world.y, floor + railZ], [0, 0, angle]);
        }
      }
    }
    for (const post of posts) {
      batch.box(PALETTE.woodDark, [0.08, 0.08, postHeight], [post.x, post.y, floor + postHeight / 2 - 0.05], [0, 0, yaw]);
    }
    return posts;
  }

  function buildFeeder(world, batch) {
    const p = { x: C.GARDEN.x + 2.8, y: C.GARDEN.y - 1.8 };
    const floor = heightAt(p.x, p.y);
    const tray = floor + 1.5;
    batch.cylinder(PALETTE.woodDark, 0.05, 0.05, 1.55, [p.x, p.y, floor + 0.725], 6);
    batch.box(PALETTE.wood, [0.6, 0.6, 0.04], [p.x, p.y, tray]);
    batch.cylinder(PALETTE.woodDark, 0.035, 0.035, 0.35, [p.x, p.y, tray + 0.19], 6);
    batch.cylinder(PALETTE.roof, 0.5, 0, 0.3, [p.x, p.y, tray + 0.5], 4, [0, 0, Math.PI / 4]);
    for (let i = 0; i < 10; i++) {
      batch.ico(PALETTE.yellow, 0.02, [p.x + Cozy.rand(-0.2, 0.2), p.y + Cozy.rand(-0.2, 0.2), tray + 0.03], null, 0, 0);
    }
    const places = world.places;
    places.feederSpot = toV(p.x, p.y, floor);
    places.birdFrom = toV(C.GARDEN.x, C.GARDEN.y, C.GARDEN_FLOOR);
    places.perches = [[0.26, 0], [-0.26, 0], [0, 0.26], [0, -0.26]].map(([dx, dy]) => toV(p.x + dx, p.y + dy, tray + 0.02))
      .concat(places.fencePerches);
  }

  function buildBench(world, batch) {
    const p = C.VIEWPOINT;
    const facing = C.SUNSET;
    const floor = heightAt(p.x, p.y);
    const yaw = Math.atan2(-facing.x, facing.y);
    batch.frame = matB([p.x, p.y, floor - 0.02], [0, 0, yaw]);
    batch.box(PALETTE.wood, [1.4, 0.42, 0.06], [0, 0, 0.45]);
    batch.box(PALETTE.wood, [1.4, 0.05, 0.36], [0, -0.21, 0.72], [THREE.MathUtils.degToRad(12), 0, 0]);
    for (const dx of [-0.6, 0.6]) {
      for (const dy of [-0.15, 0.15]) {
        batch.cylinder(PALETTE.woodDark, 0.03, 0.03, 0.45, [dx, dy, 0.225], 6);
      }
    }
    batch.frame = null;
    world.places.viewpointSpot = toV(p.x, p.y, floor);
    world.places.viewpointFrom = toV(p.x - facing.x * 3, p.y - facing.y * 3, floor);
  }

  function buildHomestead(world, batch, index, centre) {
    const floor = heightAt(centre.x, centre.y);
    const length = Math.hypot(centre.x, centre.y);
    const outward = { x: centre.x / length, y: centre.y / length };
    const yaw = Math.atan2(-outward.x, outward.y);
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    const local = (lx, ly, lz) => toV(centre.x + lx * cos - ly * sin, centre.y + lx * sin + ly * cos, floor + lz);

    batch.frame = matB([centre.x, centre.y, floor], [0, 0, yaw]);
    const beds = [];
    for (const bedY of [-0.55, 0.55]) {
      batch.box(PALETTE.wood, [2.0, 0.8, 0.3], [0, bedY, 0.1]);
      batch.box(PALETTE.soil, [1.8, 0.6, 0.04], [0, bedY, 0.22]);
      for (const bedX of [-0.5, 0.5]) {
        beds.push(local(bedX, bedY, 0.24));
      }
    }
    batch.cylinder(PALETTE.woodDark, 0.04, 0.04, 1.1, [-0.8, -1.9, 0.5], 6);
    batch.box(PALETTE.wood, [0.6, 0.05, 0.35], [-0.8, -1.93, 1.0]);
    batch.cylinder(PALETTE.woodDark, 0.035, 0.035, 0.9, [0.8, -1.9, 0.4], 6);
    batch.box(PALETTE.roof, [0.25, 0.4, 0.22], [0.8, -1.9, 0.92]);
    batch.frame = null;
    buildFence(batch, centre, floor, 1.5, 1.5, 0.75, 0.65, [0.45], yaw);

    world.places.homesteads = world.places.homesteads || [];
    world.places.homesteads.push({
      index,
      center: toV(centre.x, centre.y, floor),
      beds,
      sign: local(-0.8, -1.93, 1.0),
      mailbox: local(0.8, -1.9, 0.92),
      cameraFrom: local(0, -6, 0),
      // visiting cats nap here, between the sign and the mailbox, looking out at the path
      catSpot: local(0.05, -2.05, 0.02),
      catYaw: Math.atan2(local(0, -3, 0).x - local(0, -2, 0).x, local(0, -3, 0).z - local(0, -2, 0).z),
    });
  }

  function buildPaths(world, batch) {
    const places = world.places;
    const start = places.pathStart2;
    const dockEnd = { x: places.dockStart - 0.3, y: C.DOCK_Y };
    const gate = { x: C.GARDEN.x, y: C.GARDEN.y - 2.6 };
    const stones = (a, b, skipFirst) => {
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      const dir = { x: (b.x - a.x) / length, y: (b.y - a.y) / length };
      const steps = Math.floor(length / 0.85);
      for (let k = skipFirst ? 1 : 0; k <= steps; k++) {
        const side = Cozy.rand(-0.15, 0.15);
        const p = { x: a.x + dir.x * k * 0.85 - dir.y * side, y: a.y + dir.y * k * 0.85 + dir.x * side };
        const radius = Cozy.rand(0.22, 0.3);
        batch.cylinder(PALETTE.stone, radius, radius * 0.9, 0.06, [p.x, p.y, heightAt(p.x, p.y) + 0.03], 7);
      }
    };
    stones(start, dockEnd, false);
    stones(start, gate, true);
    places.pathSegments = [[start, dockEnd], [start, gate]];
  }

  function distanceToSegment(p, a, b) {
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const t = Cozy.clamp01(((p.x - a.x) * abx + (p.y - a.y) * aby) / (abx * abx + aby * aby));
    return Math.hypot(p.x - (a.x + abx * t), p.y - (a.y + aby * t));
  }

  function buildNature(world, batch) {
    const places = world.places;
    const feeder = { x: C.GARDEN.x + 2.8, y: C.GARDEN.y - 1.8 };
    const isClear = (x, y, margin) => {
      const p = { x, y };
      if (Math.hypot(x - C.CABIN.x, y - C.CABIN.y) < 5 + margin) return false;
      if (Math.hypot(x - C.GARDEN.x, y - C.GARDEN.y) < 3.4 + margin) return false;
      if (C.HOMESTEADS.some((h) => Math.hypot(x - h.x, y - h.y) < 2.8 + margin)) return false;
      if (Math.hypot(x - C.CAMPFIRE.x, y - C.CAMPFIRE.y) < 2.4 + margin) return false;
      if (Math.hypot(x - feeder.x, y - feeder.y) < 1 + margin) return false;
      if (x > places.dockStart - 2.5 - margin && Math.abs(y - C.DOCK_Y) < 2 + margin) return false;
      if (places.pathSegments.some(([a, b]) => distanceToSegment(p, a, b) < 1 + margin)) return false;
      const ox = x - C.VIEWPOINT.x;
      const oy = y - C.VIEWPOINT.y;
      if (Math.hypot(ox, oy) < 2 + margin) return false;
      const along = ox * C.SUNSET.x + oy * C.SUNSET.y;
      const across = Math.abs(ox * C.SUNSET.y - oy * C.SUNSET.x);
      if (along > 0 && across < 3 + margin) return false;
      return true;
    };
    const scatter = (count, minH, maxH, spacing, accept, extent) => {
      const points = [];
      const range = extent || C.ISLAND_RADIUS * 1.2;
      for (let attempt = 0; attempt < 6000 && points.length < count; attempt++) {
        const x = Cozy.rand(-range, range);
        const y = Cozy.rand(-range, range);
        const h = heightAt(x, y);
        if (h < minH || h > maxH || !accept(x, y)) continue;
        if (points.some((q) => Math.hypot(q.x - x, q.y - y) < spacing)) continue;
        points.push({ x, y, h });
      }
      return points;
    };

    for (const p of scatter(30, 0.7, 99, 2, (x, y) => isClear(x, y, 0.8) && x - y < 12)) {
      const s = Cozy.rand(0.75, 1.3);
      const z = p.h - 0.05;
      if (Math.random() < 0.6) {
        batch.cylinder(PALETTE.trunk, 0.14 * s, 0.1 * s, 1 * s, [p.x, p.y, z + 0.5 * s], 6);
        const pine = { x: p.x, y: p.y, tiers: [] };
        [[1.1, 1.4, 1.5], [0.85, 1.2, 2.3], [0.55, 1.0, 3.0]].forEach(([r, d, h]) => {
          const rotation = Math.random() * 6;
          batch.cylinder(PALETTE.pine, r * s, 0, d * s, [p.x, p.y, z + h * s], 7, [0, 0, rotation]);
          pine.tiers.push({ radius: r * s, depth: d * s, centre: z + h * s, rotation });
        });
        world.pines.push(pine);
      } else {
        const leafColor = Math.random() < 0.5 ? PALETTE.leaf : PALETTE.leafAlt;
        batch.cylinder(PALETTE.trunk, 0.16 * s, 0.12 * s, 1.4 * s, [p.x, p.y, z + 0.7 * s], 6);
        batch.ico(leafColor, 1.1 * s, [p.x, p.y, z + 2.2 * s], null, 0.12 * s);
        batch.ico(leafColor, 0.7 * s, [p.x + 0.5 * s, p.y + 0.3 * s, z + 2.75 * s], null, 0.08 * s);
      }
    }
    for (const p of scatter(16, 0.55, 99, 1.2, (x, y) => isClear(x, y, 0.2))) {
      batch.ico(PALETTE.bush, Cozy.rand(0.35, 0.6), [p.x, p.y, p.h + 0.15], [1, 1, 0.75], 0.06);
    }
    for (const p of scatter(18, -0.5, 0.45, 1.2, (x, y) => !(x > places.dockStart - 1 && Math.abs(y - C.DOCK_Y) < 1.8))) {
      const size = Cozy.rand(0.3, 0.9);
      batch.ico(PALETTE.rock, size, [p.x, p.y, p.h], [1, Cozy.rand(0.7, 1), Cozy.rand(0.5, 0.75)], size * 0.15, 1);
    }
    // wild flowers get their own meshes so winter can tuck them away
    const flowerBatch = new Batcher();
    const flowerColors = [PALETTE.pink, PALETTE.yellow, PALETTE.white];
    for (const p of scatter(12, 0.6, 99, 2.5, (x, y) => isClear(x, y, 0))) {
      const color = Cozy.randomFrom(flowerColors);
      for (let i = 0; i < 7; i++) {
        const fx = p.x + Cozy.rand(-0.6, 0.6);
        const fy = p.y + Cozy.rand(-0.6, 0.6);
        flowerBatch.ico(color, 0.07, [fx, fy, heightAt(fx, fy) + 0.12], null, 0, 0);
      }
    }
    world.flowers = new THREE.Group();
    flowerBatch.build(world.flowers, false);
    world.scene.add(world.flowers);
    const boat = { x: places.dockStart + 5.5, y: C.DOCK_Y + 2 };
    for (const p of scatter(14, -1.4, -0.4, 0.9,
      (x, y) => Math.abs(y - C.DOCK_Y) > 2.2 && Math.hypot(x - boat.x, y - boat.y) > 2.5, C.ISLAND_RADIUS * 1.4)) {
      const r = Cozy.rand(0.25, 0.4);
      batch.cylinder(PALETTE.lily, r, r, 0.02, [p.x, p.y, 0.06], 10);
      if (Math.random() < 0.3) {
        batch.cylinder(PALETTE.pink, 0, 0.1, 0.1, [p.x, p.y, 0.12], 5);
      }
    }
    // rowboat (open hull -> separate double-sided mesh)
    const hull = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
      material(PALETTE.wood, { doubleSide: true }));
    hull.scale.set(1.7, 0.5, 0.7);
    hull.position.copy(toV(boat.x, boat.y, 0.22));
    hull.rotation.y = THREE.MathUtils.degToRad(7);
    hull.castShadow = true;
    world.scene.add(hull);
    for (const seat of [-0.45, 0.45]) {
      batch.box(PALETTE.woodDark, [0.2, 1.2, 0.05], [boat.x + seat, boat.y, 0.1]);
    }
    world.boat = hull;
  }

  function buildFishingProps(world, batch) {
    const places = world.places;
    const end = places.dockEnd;
    const deckTop = C.DOCK_HEIGHT + 0.035;
    const stool = { x: end - 1.3, y: C.DOCK_Y + 0.25 };
    batch.box(PALETTE.wood, [0.42, 0.42, 0.06], [stool.x, stool.y, deckTop + 0.45]);
    for (const dx of [-0.16, 0.16]) {
      for (const dy of [-0.16, 0.16]) {
        batch.cylinder(PALETTE.woodDark, 0.025, 0.025, 0.42, [stool.x + dx, stool.y + dy, deckTop + 0.21], 5);
      }
    }
    batch.cylinder(PALETTE.metal, 0.2, 0.25, 0.32, [end - 1.75, C.DOCK_Y - 0.5, deckTop + 0.16], 12, null, { metalness: 0.4, roughness: 0.4 });
    batch.box(PALETTE.roof, [0.42, 0.26, 0.18], [end - 2.4, C.DOCK_Y + 0.45, deckTop + 0.09]);

    // the player, sitting on the stool facing the water
    const seat = deckTop + 0.48;
    batch.cylinder(PALETTE.shirt, 0.17, 0.14, 0.5, [stool.x, stool.y, seat + 0.25], 8);
    batch.ico(PALETTE.skin, 0.13, [stool.x, stool.y, seat + 0.62], null, 0, 1);
    batch.cylinder(PALETTE.hat, 0.26, 0.26, 0.03, [stool.x, stool.y, seat + 0.71], 12);
    batch.cylinder(PALETTE.hat, 0.13, 0.1, 0.12, [stool.x, stool.y, seat + 0.78], 10);
    batch.box(PALETTE.shirt, [0.4, 0.09, 0.09], [stool.x + 0.2, stool.y - 0.12, seat + 0.35], [0, 0, -0.5]);

    // rod in a holder on the dock edge
    const base = toV(end - 0.8, C.DOCK_Y - 0.55, deckTop + 0.5);
    const blenderDir = { x: Math.cos(THREE.MathUtils.degToRad(38)), y: 0.12, z: Math.sin(THREE.MathUtils.degToRad(38)) };
    const direction = new THREE.Vector3(blenderDir.x, blenderDir.z, -blenderDir.y).normalize();
    const rodLength = 2.6;
    batch.cylinder(PALETTE.woodDark, 0.05, 0.05, 0.5, [end - 0.8, C.DOCK_Y - 0.55, deckTop + 0.25], 8);
    batch.cylinderAlong(PALETTE.woodDark, 0.03, 0.012, base, direction, rodLength, 6);
    batch.cylinderAlong(PALETTE.cork, 0.045, 0.045, base.clone().addScaledVector(direction, 0.08), direction, 0.45, 8);
    places.rodTip = base.clone().addScaledVector(direction, rodLength);
    places.playerSpot = toV(stool.x, stool.y, deckTop);
    places.fishingFrom = toV(places.dockStart, C.DOCK_Y, C.DOCK_HEIGHT);
    places.castDirection = new THREE.Vector3(1, 0, -0.12).normalize();
  }

  function buildBackdrop(world, batch) {
    for (let k = 0; k < 9; k++) {
      const angle = THREE.MathUtils.degToRad(k * 40 + Cozy.rand(-12, 12));
      const distance = Cozy.rand(75, 95);
      const height = Cozy.rand(10, 22);
      batch.cylinder(PALETTE.mountain, Cozy.rand(14, 24), 0, height,
        [Math.cos(angle) * distance, Math.sin(angle) * distance, height / 2 - 1], 6, [0, 0, Math.random() * 6]);
    }
  }

  function buildFireflies(world) {
    const count = 40;
    const positions = new Float32Array(count * 3);
    const bases = [];
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.random() * C.ISLAND_RADIUS;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      const ground = Math.max(heightAt(x, y), 0);
      bases.push(toV(x, y, ground + Cozy.rand(0.6, 2.4)));
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const points = new THREE.Points(geometry, new THREE.PointsMaterial({
      size: 0.22, map: getGlowTexture(), color: '#E8FF9C', transparent: true, opacity: 0.9,
      depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    }));
    world.scene.add(points);
    world.fireflies = { points, bases, phases: bases.map(() => Math.random() * 100) };
  }

  function update(world, time, dt) {
    updateDaylight(world, dt, false);
    updateWater(world, time);
    const lanternLevel = 0.3 + world.glow;  // dim by day, brightest at night (1.0 at sunset)
    for (const lantern of world.lanterns) {
      const flicker = 0.9 + 0.1 * Math.sin(time * 7 + lantern.phase) * Math.sin(time * 3.1 + lantern.phase);
      lantern.light.intensity = 6 * flicker * lanternLevel;
      lantern.glow.material.opacity = Math.min(0.9, 0.65 * flicker * lanternLevel);
    }
    const ff = world.fireflies;
    const positions = ff.points.geometry.attributes.position;
    for (let i = 0; i < ff.bases.length; i++) {
      const base = ff.bases[i];
      const phase = ff.phases[i];
      positions.setXYZ(i,
        base.x + Math.sin(time * 0.3 + phase) * 0.8,
        base.y + Math.sin(time * 0.5 + phase * 2) * 0.3,
        base.z + Math.cos(time * 0.27 + phase) * 0.8);
    }
    positions.needsUpdate = true;
    ff.points.material.opacity = (0.6 + 0.3 * Math.sin(time * 1.7)) * Math.min(1, world.glow * 1.2);
    updateWeather(world, time, dt);
    updateCampfire(world, time, dt);
    updateRain(world, dt);
    if (world.boat) {
      world.boat.position.y = 0.22 + Math.sin(time * 1.2) * 0.04;
      world.boat.rotation.z = Math.sin(time * 0.8) * 0.03;
    }
    FX.update(dt);
  }

  Cozy.world = {
    build, update, applySeason, PlantVisual, buildBirdModel, buildCatModel, glowSprite, material, FX, C, toV, heightAt, waveHeight,
  };
})(window.Cozy);
