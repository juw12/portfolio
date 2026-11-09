'use strict';
/* Cozy Island - online village connection.
   When the game is opened from the village server (http://...), it talks to /api/* and the
   village becomes shared. Opened as a local file it stays in offline mode (browser-only save). */
(function (Cozy) {
  const POLL_SECONDS = 1.5;
  const params = new URLSearchParams(window.location.search);
  const base = (params.get('server') || (window.location.protocol.startsWith('http') ? window.location.origin : '')).replace(/\/$/, '');

  function playerSecret() {
    let secret = Cozy.store.get('online.secret', '');
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(secret)) {
      const bytes = new Uint8Array(18);
      crypto.getRandomValues(bytes);
      secret = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      Cozy.store.set('online.secret', secret);
    }
    return secret;
  }

  const listeners = [];
  const Online = {
    enabled: false,
    connected: false,
    snapshot: null,
    offsetMs: 0,
    presence: { activity: '', x: 0, z: 0 },
    pollTimer: 0,
    busy: false,
    failures: 0,

    /** Server-synchronised clock (ms) for plant growth. */
    clock() {
      return Date.now() + this.offsetMs;
    },

    onChange(listener) {
      listeners.push(listener);
      if (this.snapshot) {
        listener(this.snapshot, null);
      }
    },

    async call(action, body) {
      const response = await fetch(`${base}/api/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Cozy-Secret': playerSecret() },
        body: JSON.stringify(Object.assign({ name: Cozy.store.get('name', '') }, body || {})),
      });
      const data = await response.json();
      if (data && data.plots) {
        const previous = this.snapshot;
        this.snapshot = data;
        this.offsetMs = data.serverNow - Date.now();
        listeners.forEach((listener) => listener(data, previous));
      }
      return data;
    },

    /** Fire-and-forget action with a friendly toast on refusal. */
    async act(action, body) {
      try {
        const data = await this.call(action, body);
        if (!data.ok && data.error) {
          Cozy.ui.toast(data.error, 4);
        }
        return data;
      } catch (error) {
        Cozy.ui.toast('The village server is not answering - is it still running?', 5);
        return { ok: false, error: String(error) };
      }
    },

    setPresence(activity, x, y, z) {
      this.presence = { activity: activity || '', x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, z: Math.round(z * 10) / 10 };
    },

    update(dt) {
      if (!this.enabled || this.busy) {
        return;
      }
      this.pollTimer -= dt;
      if (this.pollTimer > 0) {
        return;
      }
      this.pollTimer = POLL_SECONDS * Math.min(8, 1 + this.failures);
      this.busy = true;
      this.call('presence', this.presence)
        .then(() => {
          if (!this.connected) {
            Cozy.ui.toast('Reconnected to the village.', 3);
          }
          this.connected = true;
          this.failures = 0;
        })
        .catch(() => {
          if (this.connected) {
            Cozy.ui.toast('Lost the village connection - retrying quietly.', 4);
          }
          this.connected = false;
          this.failures++;
        })
        .finally(() => {
          this.busy = false;
        });
    },

    /** Address to share with friends (LAN/public address when the host plays on localhost). */
    shareBase() {
      const host = window.location.hostname;
      const local = host === 'localhost' || host === '127.0.0.1' || host === '';
      const urls = (this.snapshot && this.snapshot.shareUrls) || [];
      if (local && urls.length) {
        return urls[0];
      }
      return base;
    },

    inviteLink(code) {
      return `${this.shareBase()}/?join=${encodeURIComponent(code)}`;
    },

    async start() {
      // A static copy (e.g. GitHub Pages) has no village server: skip the handshake unless ?server= is given.
      const staticHost = document.querySelector('meta[name="cozy-static"]') && !params.get('server');
      if (!base || staticHost) {
        return false;
      }
      try {
        const hello = await this.call('hello', {});
        if (!hello.ok) {
          return false;
        }
        this.enabled = true;
        this.connected = true;
        const code = params.get('join');
        if (code) {
          const joined = await this.act('join', { code });
          if (joined.ok) {
            const plot = joined.plots.find((p) => p.member && p.owner !== joined.you);
            Cozy.ui.toast(plot ? `You joined ${plot.ownerName}'s homestead! Press 6 to visit.` : 'Joined!', 6);
          }
          params.delete('join');
          const query = params.toString();
          window.history.replaceState(null, '', window.location.pathname + (query ? '?' + query : ''));
        }
        return true;
      } catch (error) {
        return false;
      }
    },
  };


  const ACTIVITY_WORDS = {
    fishing: 'fishing on the dock', garden: 'in the garden', tea: 'having tea', birds: 'birdwatching',
    viewpoint: 'resting their eyes', village: 'in the village', explore: 'looking around', '': 'looking around',
    desk: 'fishing at their desk', cooking: 'cooking at the campfire',
  };

  function hashHue(id) {
    let hash = 0;
    for (const ch of id) {
      hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
    }
    return hash;
  }

  /** Little villagers standing where online friends are playing + the "who's here" list. */
  Online.createAvatars = function (world) {
    const THREE = window.THREE;
    const avatars = new Map();
    const listEl = Cozy.ui.el('online-list');
    const down = new THREE.Raycaster();
    const groundMeshes = [];
    world.scene.traverse((object) => {
      if (object.isMesh && !object.userData.noOcclude && !(object.material && object.material.transparent)) {
        groundMeshes.push(object);
      }
    });
    const known = new Set();
    let firstList = true;

    function makeAvatar(friend) {
      const hash = hashHue(friend.id);
      const color = new THREE.Color().setHSL((hash % 360) / 360, 0.45, 0.6);
      const group = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.26, 0.7, 8), Cozy.world.material('#' + color.getHexString()));
      body.position.y = 0.35;
      const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.17, 1), Cozy.world.material('#F2C9A0'));
      head.position.y = 0.86;
      const hat = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.22, 8), Cozy.world.material('#E8D8A8'));
      hat.position.y = 1.06;
      [body, head, hat].forEach((mesh) => {
        mesh.castShadow = true;
        group.add(mesh);
      });
      const glow = Cozy.world.glowSprite('#FFE3A8', 1.0, 0.35);
      glow.position.y = 0.6;
      group.add(glow);
      world.scene.add(group);
      const label = document.createElement('div');
      label.className = 'world-label friend-label';
      Cozy.ui.el('labels').appendChild(label);
      const angle = ((hash >> 8) % 628) / 100;
      return { group, label, angle, target: new THREE.Vector3(), placed: false };
    }

    function groundAt(x, y, z) {
      down.set(new THREE.Vector3(x, y + 2.5, z), new THREE.Vector3(0, -1, 0));
      down.far = 6;
      const hit = down.intersectObjects(groundMeshes, false)[0];
      return hit ? hit.point.y : null;
    }

    function place(avatar, friend) {
      // stand a little beside the spot the friend is looking at, on solid ground
      const baseY = friend.y || 0;
      for (const radius of [1.3, 0.8, 0]) {
        const x = friend.x + Math.cos(avatar.angle) * radius;
        const z = friend.z + Math.sin(avatar.angle) * radius;
        const y = groundAt(x, baseY, z);
        if (y !== null && Math.abs(y - baseY) < 0.9) {
          avatar.target.set(x, y, z);
          return;
        }
      }
      avatar.target.set(friend.x, baseY, friend.z);
    }

    return {
      update(dt, time) {
        if (!Online.enabled || !Online.snapshot) {
          Cozy.ui.show(listEl, false);
          return;
        }
        const friends = Online.snapshot.online || [];
        const seen = new Set();
        friends.forEach((friend) => {
          seen.add(friend.id);
          if (!known.has(friend.id)) {
            known.add(friend.id);
            if (!firstList) {
              Cozy.ui.toast(`${friend.name} arrived on the island`, 4);
              Cozy.sound.softChime();
            }
          }
          let avatar = avatars.get(friend.id);
          if (!avatar) {
            avatar = makeAvatar(friend);
            avatars.set(friend.id, avatar);
          }
          const visible = friend.activity && friend.activity !== 'explore';
          avatar.group.visible = !!visible;
          if (visible) {
            place(avatar, friend);
            if (!avatar.placed) {
              avatar.group.position.copy(avatar.target);
              avatar.placed = true;
            }
            avatar.group.position.lerp(avatar.target, Math.min(1, dt * 2));
            avatar.group.position.y = avatar.target.y + Math.abs(Math.sin(time * 2 + avatar.angle)) * 0.03;
            avatar.group.rotation.y = Math.sin(time * 0.4 + avatar.angle) * 0.6;
            const screen = avatar.group.position.clone().add(new THREE.Vector3(0, 1.45, 0)).project(world.camera);
            const onScreen = screen.z < 1 && Math.abs(screen.x) < 1.05 && Math.abs(screen.y) < 1.05;
            Cozy.ui.show(avatar.label, onScreen);
            if (onScreen) {
              Cozy.ui.setText(avatar.label, friend.name);
              avatar.label.style.transform = `translate(-50%, -100%) translate(${(screen.x * 0.5 + 0.5) * window.innerWidth}px, ${(-screen.y * 0.5 + 0.5) * window.innerHeight}px)`;
            }
          } else {
            Cozy.ui.show(avatar.label, false);
          }
        });
        firstList = false;
        avatars.forEach((avatar, id) => {
          if (!seen.has(id)) {
            world.scene.remove(avatar.group);
            avatar.label.remove();
            avatars.delete(id);
            known.delete(id);
          }
        });
        // who's-here list
        Cozy.ui.show(listEl, true);
        const status = Online.connected ? '' : ' (reconnecting\u2026)';
        const lines = [`Village online${status}`].concat(
          friends.length
            ? friends.map((friend) => `\u2022 ${friend.name} \u00b7 ${ACTIVITY_WORDS[friend.activity] || 'around'}`)
            : ['Nobody else here right now']);
        const text = lines.join('\n');
        if (listEl.textContent !== text) {
          listEl.textContent = text;
        }
      },
    };
  };

  Online.ready = Online.start();
  Cozy.online = Online;
})(window.Cozy);
