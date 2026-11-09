// Draws every placed build through one InstancedMesh per (geometry, material) pair, so a town of
// 500 brick blocks costs one draw call instead of 500. Each build keeps its own Group (hidden from
// drawing but still there for clicking, the camera ray, collisions and "ready" badges); only the
// drawing is batched. Transparent parts (glass) are left alone so they still sort correctly.
import * as THREE from 'three';

const FIRST_CAPACITY = 16;

export function createInstancer(scene, { castShadow = false } = {}) {
  const group = new THREE.Group();
  group.name = 'instanced-builds';
  scene.add(group);

  const batches = new Map(); // "geometry|material" -> { geometry, material, mesh, sources }
  const batchOf = new Map(); // source mesh -> its batch
  const dirty = new Set();

  function makeMesh(geometry, material, capacity) {
    const mesh = new THREE.InstancedMesh(geometry, material, capacity);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.count = 0;
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }

  function batchFor(geometry, material) {
    const key = `${geometry.uuid}|${material.uuid}`;
    let batch = batches.get(key);
    if (!batch) {
      batch = { geometry, material, sources: [], mesh: makeMesh(geometry, material, FIRST_CAPACITY) };
      batches.set(key, batch);
    }
    return batch;
  }

  // Double the capacity, keeping the matrices already written.
  function grow(batch) {
    const old = batch.mesh;
    const bigger = makeMesh(batch.geometry, batch.material, old.instanceMatrix.count * 2);
    bigger.instanceMatrix.array.set(old.instanceMatrix.array);
    bigger.count = old.count;
    group.remove(old);
    old.dispose();
    batch.mesh = bigger;
  }

  function canBatch(node) {
    return node.isMesh
      && !node.isInstancedMesh
      && !node.isSkinnedMesh
      && !Array.isArray(node.material)
      && !node.material.transparent;
  }

  // Start drawing a placed build (call after it is positioned and in the scene graph).
  function add(root) {
    root.updateMatrixWorld(true);
    const sources = [];
    root.traverse((node) => {
      if (canBatch(node)) {
        sources.push(node);
      }
    });
    for (const node of sources) {
      const batch = batchFor(node.geometry, node.material);
      if (batch.mesh.count === batch.mesh.instanceMatrix.count) {
        grow(batch);
      }
      const index = batch.mesh.count;
      batch.mesh.count += 1;
      batch.sources[index] = node;
      batch.mesh.setMatrixAt(index, node.matrixWorld);
      node.userData.batchIndex = index;
      node.visible = false; // drawn by the batch; still raycastable
      batchOf.set(node, batch);
      dirty.add(batch);
    }
    root.userData.batchedParts = sources;
  }

  // Stop drawing a build: the last instance of each batch moves into the freed slot.
  function remove(root) {
    for (const node of root.userData.batchedParts || []) {
      const batch = batchOf.get(node);
      if (!batch) {
        continue;
      }
      const index = node.userData.batchIndex;
      const last = batch.mesh.count - 1;
      if (index !== last) {
        const moved = batch.sources[last];
        batch.sources[index] = moved;
        moved.userData.batchIndex = index;
        batch.mesh.instanceMatrix.array.copyWithin(index * 16, last * 16, last * 16 + 16);
      }
      batch.sources.length = last;
      batch.mesh.count = last;
      batchOf.delete(node);
      delete node.userData.batchIndex;
      node.visible = true;
      dirty.add(batch);
    }
    root.userData.batchedParts = [];
  }

  // Once per frame, before rendering: upload changed matrices and refresh culling bounds.
  function flush() {
    for (const batch of dirty) {
      batch.mesh.instanceMatrix.needsUpdate = true;
      batch.mesh.boundingSphere = null; // recomputed on demand for frustum culling
      batch.mesh.visible = batch.mesh.count > 0;
    }
    dirty.clear();
  }

  function stats() {
    let drawBatches = 0;
    let instances = 0;
    for (const batch of batches.values()) {
      if (batch.mesh.count > 0) {
        drawBatches += 1;
        instances += batch.mesh.count;
      }
    }
    return { batches: drawBatches, instances };
  }

  return { add, remove, flush, stats, group };
}
