// Blender-made props (blender/make_props.py -> /models/props.glb): the market stall and the five
// producers. Each producer is cloned per build and its "Tint_<type>" material takes the colour
// stored on the built object. Until the file loads (or if it fails) callers get null and keep
// using the procedural meshes in buildables.js / scenery.js.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const PROPS_URL = 'models/props.glb';
const templates = new Map(); // 'field' -> Object3D (template, never added to the scene)
const tintCache = new Map(); // 'Tint_field|#d9b54a' -> material

export const propsReady = new GLTFLoader()
  .loadAsync(PROPS_URL)
  .then((gltf) => {
    gltf.scene.traverse((node) => {
      if (node.name.startsWith('prop_') && !templates.has(node.name.slice(5))) {
        templates.set(node.name.slice(5), node);
      }
    });
    return templates.size > 0;
  })
  .catch((error) => {
    console.warn('Props model failed to load; using simple shapes instead.', error);
    return false;
  });

function tinted(material, color) {
  const key = `${material.name}|${color}`;
  if (!tintCache.has(key)) {
    const copy = material.clone();
    copy.color.set(color);
    tintCache.set(key, copy);
  }
  return tintCache.get(key);
}

// A fresh copy of a prop (geometry and fixed materials are shared), or null if not loaded.
export function createProp(type, color = null) {
  const template = templates.get(type);
  if (!template) {
    return null;
  }
  const copy = template.clone(true);
  copy.position.set(0, 0, 0);
  copy.rotation.set(0, 0, 0);
  copy.traverse((node) => {
    if (node.isMesh && color && node.material?.name?.startsWith('Tint_')) {
      node.material = tinted(node.material, color);
    }
  });
  return copy;
}

export function hasProp(type) {
  return templates.has(type);
}
