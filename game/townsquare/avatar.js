// Player figures.
//
// The main character is a skinned, rigged mesh built in Blender
// (blender/make_character.py -> /models/character.glb). Every player gets a clone with
// their own clothing / skin / hair colours and height. The bones are driven
// procedurally (walk, run, jump, idle) so the gait always matches the real speed.
//
// Until the model has loaded - or if it cannot load - a simple capsule figure with the
// same joints is shown; it is swapped for the rigged one in place once the model arrives.
// Feet are at y = 0 of the returned root; the figure faces +Z.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

const MODEL_URL = 'models/character.glb';

const SKIN_TONES = ['#f3d2b3', '#e8b994', '#d29f78', '#b07a52', '#8a5a3a', '#5f3c26'];
const HAIR_COLORS = ['#1e1611', '#3b2618', '#6b4425', '#a8743e', '#d9b77a', '#2a2a2a', '#8c2f1b'];
const PANTS_COLORS = ['#2f3e5c', '#38404d', '#4a5638', '#5a4632', '#1f2533', '#6b6f75'];
const SHOE_COLORS = ['#2b2b2b', '#4a3626', '#e9e9e9', '#3a2a22'];

// Bones the animation drives (names from make_character.py; _L is the character's left, +X).
const DRIVEN_BONES = [
  'Spine',
  'Head',
  'Thigh_L',
  'Shin_L',
  'Foot_L',
  'Thigh_R',
  'Shin_R',
  'Foot_R',
  'UpperArm_L',
  'Forearm_L',
  'UpperArm_R',
  'Forearm_R',
];
const ARM_IDLE_SPREAD = 0.04; // extra outward angle so hands clear the hips
const SEATED_HIP_HEIGHT = 0.61; // hip joint height when seated on a 0.52 m bench seat
const SEATED_SHIFT_BACK = 0.1; // pelvis sits back towards the backrest
const FOOT_LEVELLING = 0.65; // how much the ankle counter-rotates to keep the sole level

function hashString(text) {
  let hash = 2166136261;
  for (const char of String(text)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

// ===================================================================== rigged model
let rigTemplate = null;
const awaitingModel = new Set(); // simple figures to upgrade once the model arrives

function prepareTemplate(scene) {
  scene.updateMatrixWorld(true);
  const rest = {};
  for (const name of DRIVEN_BONES) {
    const bone = scene.getObjectByName(name);
    if (!bone || !bone.isBone) {
      throw new Error(`character model is missing bone ${name}`);
    }
    const parentWorld = bone.parent.getWorldQuaternion(new THREE.Quaternion());
    rest[name] = {
      local: bone.quaternion.clone(),
      parentWorld,
      parentWorldInverse: parentWorld.clone().invert(),
    };
  }
  // The upper arm hangs slightly outward in the rest pose; measure it so the
  // animation's "spread" angle means the same thing on both figure types.
  const shoulder = scene.getObjectByName('UpperArm_L').getWorldPosition(new THREE.Vector3());
  const elbow = scene.getObjectByName('Forearm_L').getWorldPosition(new THREE.Vector3());
  const armRestSpread = Math.atan2(elbow.x - shoulder.x, shoulder.y - elbow.y);

  scene.traverse((node) => {
    if (node.isMesh) {
      node.castShadow = true;
      node.receiveShadow = true;
      node.frustumCulled = false; // limbs swing outside the bind-pose bounds
    }
  });
  return { scene, rest, armRestSpread };
}

export const characterModelReady = new GLTFLoader()
  .loadAsync(MODEL_URL)
  .then((gltf) => {
    rigTemplate = prepareTemplate(gltf.scene);
    for (const h of awaitingModel) {
      upgradeToRig(h);
    }
    awaitingModel.clear();
    return true;
  })
  .catch((error) => {
    console.warn('Character model unavailable - using simple figures.', error);
    return false;
  });

/** Joint "handles" the animation writes to; for the rig they are plain objects. */
function createJointHandles() {
  const legs = [-1, 1].map((side) => ({ hip: new THREE.Object3D(), knee: new THREE.Object3D(), side }));
  const arms = [-1, 1].map((side) => ({ shoulder: new THREE.Object3D(), elbow: new THREE.Object3D(), side }));
  return { legs, arms, chest: new THREE.Object3D(), head: new THREE.Object3D() };
}

function buildRigged(h) {
  const model = cloneSkinned(rigTemplate.scene);
  const tints = {
    Skin: h.palette.skin,
    Shirt: h.palette.shirt,
    Pants: h.palette.pants,
    Shoes: h.palette.shoes,
    Hair: h.palette.hair,
  };
  const ownMaterials = new Map();
  const tinted = (material) => {
    const color = tints[material.name];
    if (!color) {
      return material; // eyes stay shared
    }
    if (!ownMaterials.has(material.name)) {
      const copy = material.clone();
      copy.color.set(color);
      ownMaterials.set(material.name, copy);
    }
    return ownMaterials.get(material.name);
  };
  model.traverse((node) => {
    if (node.isMesh) {
      node.material = Array.isArray(node.material) ? node.material.map(tinted) : tinted(node.material);
    }
  });
  model.scale.setScalar(h.heightScale);

  const bones = {};
  for (const name of DRIVEN_BONES) {
    bones[name] = model.getObjectByName(name);
  }

  h.visual = new THREE.Group();
  h.visual.add(model);
  h.root.add(h.visual);
  h.rig = { model, bones };
  h.materials = [...ownMaterials.values()];
  Object.assign(h, createJointHandles());
  h.kind = 'rig';
}

function upgradeToRig(h) {
  if (h.disposed) {
    return;
  }
  h.root.remove(h.visual);
  for (const material of h.materials) {
    material.dispose();
  }
  buildRigged(h);
}

const boneEuler = new THREE.Euler();
const boneRotation = new THREE.Quaternion();

/** Rotate a bone about character-space axes at its joint (same convention as the simple figure). */
function driveBone(h, name, x, y, z) {
  const rest = rigTemplate.rest[name];
  boneRotation.setFromEuler(boneEuler.set(x, y, z));
  h.rig.bones[name].quaternion
    .copy(rest.parentWorldInverse)
    .multiply(boneRotation)
    .multiply(rest.parentWorld)
    .multiply(rest.local);
}

function applyJointsToRig(h) {
  const [legRight, legLeft] = h.legs;
  const [armRight, armLeft] = h.arms;
  const sides = [
    [legLeft, armLeft, '_L'],
    [legRight, armRight, '_R'],
  ];
  for (const [leg, arm, suffix] of sides) {
    const hip = leg.hip.rotation.x;
    const knee = leg.knee.rotation.x;
    driveBone(h, 'Thigh' + suffix, hip, 0, 0);
    driveBone(h, 'Shin' + suffix, knee, 0, 0);
    driveBone(h, 'Foot' + suffix, -(hip + knee) * FOOT_LEVELLING, 0, 0);

    const spread = arm.shoulder.rotation.z + arm.side * (ARM_IDLE_SPREAD - rigTemplate.armRestSpread);
    driveBone(h, 'UpperArm' + suffix, arm.shoulder.rotation.x, 0, spread);
    driveBone(h, 'Forearm' + suffix, arm.elbow.rotation.x, 0, 0);
  }
  driveBone(h, 'Spine', h.chest.rotation.x, h.chest.rotation.y, 0);
  driveBone(h, 'Head', 0, h.head.rotation.y, 0);
}

// ===================================================================== simple figure (fallback)
const HIP_HEIGHT = 0.94; // hip (0.44 thigh) + knee (0.50 shin + shoe) puts the soles on y = 0

const geometry = {
  thigh: new THREE.CapsuleGeometry(0.085, 0.32, 4, 10).translate(0, -0.22, 0),
  shin: new THREE.CapsuleGeometry(0.07, 0.34, 4, 10).translate(0, -0.22, 0),
  shoe: new THREE.BoxGeometry(0.11, 0.08, 0.26).translate(0, -0.46, 0.05),
  pelvis: new THREE.CapsuleGeometry(0.15, 0.08, 4, 12),
  torso: new THREE.CapsuleGeometry(0.165, 0.34, 4, 14),
  neck: new THREE.CylinderGeometry(0.05, 0.06, 0.12, 10),
  head: new THREE.SphereGeometry(0.115, 20, 16),
  hair: new THREE.SphereGeometry(0.124, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.56),
  nose: new THREE.ConeGeometry(0.018, 0.045, 6).rotateX(Math.PI / 2),
  eye: new THREE.SphereGeometry(0.016, 8, 6),
  upperArm: new THREE.CapsuleGeometry(0.055, 0.2, 4, 8).translate(0, -0.15, 0),
  forearm: new THREE.CapsuleGeometry(0.046, 0.2, 4, 8).translate(0, -0.14, 0),
  hand: new THREE.SphereGeometry(0.05, 10, 8).translate(0, -0.3, 0),
};

function mesh(geometryKey, material, x = 0, y = 0, z = 0) {
  const part = new THREE.Mesh(geometry[geometryKey], material);
  part.position.set(x, y, z);
  part.castShadow = true;
  part.receiveShadow = true;
  return part;
}

function buildSimple(h) {
  const materials = {
    shirt: new THREE.MeshStandardMaterial({ color: h.palette.shirt, roughness: 0.85 }),
    pants: new THREE.MeshStandardMaterial({ color: h.palette.pants, roughness: 0.9 }),
    skin: new THREE.MeshStandardMaterial({ color: h.palette.skin, roughness: 0.65 }),
    hair: new THREE.MeshStandardMaterial({ color: h.palette.hair, roughness: 0.75 }),
    shoes: new THREE.MeshStandardMaterial({ color: h.palette.shoes, roughness: 0.6 }),
    eyes: new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.2 }),
  };

  const visual = new THREE.Group(); // bobs while walking; root stays at the feet
  h.root.add(visual);

  const legs = [-1, 1].map((side) => {
    const hip = new THREE.Group();
    hip.position.set(side * 0.095, HIP_HEIGHT, 0);
    hip.add(mesh('thigh', materials.pants));
    const knee = new THREE.Group();
    knee.position.y = -0.44;
    knee.add(mesh('shin', materials.pants), mesh('shoe', materials.shoes));
    hip.add(knee);
    visual.add(hip);
    return { hip, knee, side };
  });

  const chest = new THREE.Group();
  chest.position.y = HIP_HEIGHT;
  visual.add(chest);
  const pelvis = mesh('pelvis', materials.pants, 0, 0.02, 0);
  pelvis.scale.set(1.15, 1, 0.8);
  const torso = mesh('torso', materials.shirt, 0, 0.34, 0);
  torso.scale.set(1.12, 1, 0.72);
  chest.add(pelvis, torso, mesh('neck', materials.skin, 0, 0.66, 0));

  const head = new THREE.Group();
  head.position.y = 0.8;
  const skull = mesh('head', materials.skin);
  skull.scale.set(0.92, 1.08, 1);
  const hair = mesh('hair', materials.hair, 0, 0.012, -0.008);
  hair.rotation.x = -0.35;
  head.add(skull, hair, mesh('nose', materials.skin, 0, -0.01, 0.115));
  for (const side of [-1, 1]) {
    head.add(mesh('eye', materials.eyes, side * 0.04, 0.025, 0.1));
  }
  chest.add(head);

  const arms = [-1, 1].map((side) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.225, 0.55, 0);
    shoulder.add(mesh('upperArm', materials.shirt));
    const elbow = new THREE.Group();
    elbow.position.y = -0.3;
    elbow.add(mesh('forearm', materials.skin), mesh('hand', materials.skin));
    shoulder.add(elbow);
    chest.add(shoulder);
    return { shoulder, elbow, side };
  });

  Object.assign(h, { visual, legs, arms, chest, head, kind: 'simple' });
  h.materials = Object.values(materials);
}

// ===================================================================== public API
/**
 * @param {string} shirtColor  the colour the player picked
 * @param {string} seed        stable string (player name) that picks skin, hair, trousers, height
 */
export function createHumanoid(shirtColor, seed) {
  const hash = hashString(seed);
  const pick = (list, shift) => list[(hash >>> shift) % list.length];
  const h = {
    root: new THREE.Group(),
    palette: {
      shirt: shirtColor,
      pants: pick(PANTS_COLORS, 3),
      skin: pick(SKIN_TONES, 7),
      hair: pick(HAIR_COLORS, 11),
      shoes: pick(SHOE_COLORS, 15),
    },
    heightScale: 0.94 + ((hash >>> 19) % 13) * 0.01, // 1.67 m .. 1.89 m
    materials: [],
    phase: Math.random() * Math.PI * 2,
    time: Math.random() * 10,
    disposed: false,
  };
  if (rigTemplate) {
    buildRigged(h);
  } else {
    buildSimple(h);
    awaitingModel.add(h);
  }
  return h;
}

function approach(current, target, k) {
  return current + (target - current) * k;
}

/** Standing hip-joint height of this figure, used to lower it onto a seat. */
function hipHeight(h) {
  return h.kind === 'rig' ? 0.94 * h.heightScale : HIP_HEIGHT;
}

/**
 * @param {number} speed     ground speed in m/s (0 = idle, ~5 walk, ~10 run)
 * @param {boolean} airborne jumping / falling
 * @param {'stand'|'sit'} pose  'sit' = seated on a bench (root at the seat, facing forward)
 */
export function animateHumanoid(h, speed, airborne, dt, pose = 'stand') {
  h.time += dt;
  const k = 1 - Math.exp(-14 * dt);
  const sitting = pose === 'sit';
  if (sitting) {
    speed = 0;
    airborne = false;
  }
  const moving = speed > 0.3 && !airborne;
  const run = THREE.MathUtils.clamp((speed - 5) / 5, 0, 1);

  if (moving) {
    h.phase += dt * (5.2 + speed * 0.75); // cadence rises with speed
  }
  const s = Math.sin(h.phase);
  const stride = moving ? 0.45 + 0.35 * run : 0;

  h.legs.forEach((leg, index) => {
    const sign = index === 0 ? 1 : -1;
    let hipTarget = s * stride * sign;
    // the knee bends while the leg swings forward and on landing
    let kneeTarget = moving ? Math.max(0, -Math.sin(h.phase + (index === 0 ? 0 : Math.PI) - 0.6)) * (0.7 + run * 0.7) : 0.03;
    if (airborne) {
      hipTarget = index === 0 ? 0.55 : -0.15; // lead leg forward, trailing leg back
      kneeTarget = index === 0 ? 0.9 : 0.35;
    }
    if (sitting) {
      hipTarget = 1.5; // thighs forward along the seat
      kneeTarget = 1.5; // shins hang down to the ground
    }
    leg.hip.rotation.x = approach(leg.hip.rotation.x, -hipTarget, k);
    leg.knee.rotation.x = approach(leg.knee.rotation.x, kneeTarget, k);
  });

  h.arms.forEach((arm, index) => {
    const sign = index === 0 ? -1 : 1;
    let shoulderTarget = moving ? s * stride * 0.9 * sign : Math.sin(h.time * 1.7 + index) * 0.02;
    let elbowTarget = moving ? -(0.25 + run * 0.9) : -0.12;
    let spreadTarget = arm.side * (0.06 + (airborne ? 0.35 : 0));
    if (airborne) {
      shoulderTarget = 0.9; // arms swing forward and up
      elbowTarget = -0.4;
    }
    if (sitting) {
      shoulderTarget = 0.42; // hands resting on the thighs
      elbowTarget = -0.95;
      spreadTarget = arm.side * 0.12;
    }
    arm.shoulder.rotation.x = approach(arm.shoulder.rotation.x, -shoulderTarget, k);
    arm.shoulder.rotation.z = approach(arm.shoulder.rotation.z, spreadTarget, k);
    arm.elbow.rotation.x = approach(arm.elbow.rotation.x, elbowTarget, k);
  });

  const bob = moving ? Math.abs(Math.cos(h.phase)) * (0.035 + run * 0.04) : 0;
  const seatedDrop = SEATED_HIP_HEIGHT - hipHeight(h);
  h.visual.position.y = approach(h.visual.position.y, sitting ? seatedDrop : bob, k);
  h.visual.position.z = approach(h.visual.position.z, sitting ? -SEATED_SHIFT_BACK : 0, k);
  const lean = sitting ? -0.06 : moving ? 0.05 + run * 0.18 : 0;
  h.chest.rotation.x = approach(h.chest.rotation.x, lean, k);
  h.chest.rotation.y = approach(h.chest.rotation.y, moving ? s * 0.08 : 0, k);
  h.chest.scale.y = 1 + (moving ? 0 : Math.sin(h.time * 2.1) * 0.008); // breathing (simple figure)
  h.head.rotation.y = moving ? 0 : Math.sin(h.time * 0.37) * 0.25; // idle glance around

  if (h.kind === 'rig') {
    applyJointsToRig(h);
  }
}

export function disposeHumanoid(h) {
  h.disposed = true;
  awaitingModel.delete(h);
  for (const material of h.materials) {
    material.dispose();
  }
}
