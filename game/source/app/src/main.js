'use strict';
/* Cozy Island - main: camera rig, activity hub, focus timer, journal, game loop. */
(function (Cozy) {
  const THREE = window.THREE;
  const ui = Cozy.ui;
  const sound = Cozy.sound;
  const input = Cozy.input;
  const progress = Cozy.progress;

  const world = Cozy.world.build(document.getElementById('app'));
  input.init(world.renderer.domElement);

  // ------------------------------------------------------------------ picking

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let deskWindow = null;   // the floating desk-mode window, when open

  function pick(objects) {
    const host = deskWindow || window;
    ndc.set((input.pointer.x / host.innerWidth) * 2 - 1, -(input.pointer.y / host.innerHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, world.camera);
    const hits = raycaster.intersectObjects(objects, false);
    return hits.length ? hits[0] : null;
  }

  // ------------------------------------------------------------------ camera rig (slow cozy glide + right-drag orbit)

  const EXPLORE = { focus: new THREE.Vector3(2, 0.5, 0), yaw: 0.85, pitch: 0.55, distance: 42 };
  const rig = {
    focus: EXPLORE.focus.clone(), yaw: EXPLORE.yaw, pitch: EXPLORE.pitch, distance: EXPLORE.distance,
    current: { focus: EXPLORE.focus.clone(), yaw: EXPLORE.yaw, pitch: EXPLORE.pitch, distance: EXPLORE.distance },
  };

  function focusRig(activity) {
    if (!activity) {
      rig.focus.copy(EXPLORE.focus);
      rig.yaw = EXPLORE.yaw;
      rig.pitch = EXPLORE.pitch;
      rig.distance = EXPLORE.distance;
      return;
    }
    rig.focus.copy(activity.focus).add(new THREE.Vector3(0, 1, 0));
    rig.pitch = activity.pitch;
    rig.distance = activity.distance;
    if (activity.from) {
      const dx = activity.from.x - activity.focus.x;
      const dz = activity.from.z - activity.focus.z;
      rig.yaw = Math.atan2(dx, dz);
    }
    frameWithoutOcclusion();
  }

  // ---- Occlusion-aware framing: nudge the camera yaw (then distance) so trees,
  // roofs and hills never sit between the camera and the activity. ----
  const occluders = [];
  world.scene.traverse((object) => {
    if (object.isMesh && !object.userData.noOcclude && !(object.material && object.material.transparent)) {
      occluders.push(object);
    }
  });
  const occlusionRay = new THREE.Raycaster();

  function cameraOffset(yaw, pitch, distance) {
    return new THREE.Vector3(
      Math.sin(yaw) * Math.cos(pitch),
      Math.sin(pitch),
      Math.cos(yaw) * Math.cos(pitch)).multiplyScalar(distance);
  }

  /** Distance from the focus to the first blocking surface along a few rays
   *  that cover the centre and edges of the view. */
  function clearDistance(focus, yaw, pitch, distance) {
    const ignoreNear = 1.3;
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const camera = focus.clone().add(cameraOffset(yaw, pitch, distance));
    // rays from the centre and the left/right of the framed area back to the camera:
    // catches trees that sit beside the camera and cover half the screen
    const halfWidth = Math.max(1.2, distance * 0.42);
    let nearest = distance;
    [-1, -0.5, 0, 0.5, 1].forEach((side) => {
      const origin = focus.clone().addScaledVector(right, side * halfWidth);
      const toCamera = camera.clone().sub(origin);
      const length = toCamera.length();
      occlusionRay.set(origin, toCamera.normalize());
      occlusionRay.near = ignoreNear;
      occlusionRay.far = length;
      const hit = occlusionRay.intersectObjects(occluders, false)[0];
      if (hit) {
        nearest = Math.min(nearest, hit.distance);
      }
    });
    return nearest;
  }

  function frameWithoutOcclusion() {
    const preferredYaw = rig.yaw;
    let bestYaw = preferredYaw;
    let bestClear = -1;
    for (let step = 0; step <= 16; step++) {
      const offset = (step % 2 ? 1 : -1) * Math.ceil(step / 2) * 0.17;
      const yaw = preferredYaw + offset;
      const clear = clearDistance(rig.focus, yaw, rig.pitch, rig.distance);
      if (clear >= rig.distance - 0.01) {
        rig.yaw = yaw;
        return;
      }
      if (clear > bestClear) {
        bestClear = clear;
        bestYaw = yaw;
      }
    }
    // Nothing fully clear within ±80°: take the most open view and move in front of the blocker.
    rig.yaw = bestYaw;
    rig.distance = Math.max(2.5, bestClear - 0.6);
  }

  function updateRig(dt, time) {
    if (input.dragX || input.dragY) {
      rig.yaw -= input.dragX * 0.005;
      rig.pitch = Math.min(1.35, Math.max(0.06, rig.pitch + input.dragY * 0.003));
    }
    if (input.wheel) {
      rig.distance = Math.min(80, Math.max(2.5, rig.distance * (1 + input.wheel * 0.1)));
    }
    const k = 1 - Math.exp(-3.5 * dt);
    const c = rig.current;
    let deltaYaw = rig.yaw - c.yaw;
    deltaYaw = Math.atan2(Math.sin(deltaYaw), Math.cos(deltaYaw));
    c.yaw += deltaYaw * k;
    c.pitch += (rig.pitch - c.pitch) * k;
    c.distance += (rig.distance - c.distance) * k;
    c.focus.lerp(rig.focus, k);
    const sway = new THREE.Vector3(Math.sin(time * 0.25), Math.sin(time * 0.32 + 1) * 0.5, Math.cos(time * 0.18)).multiplyScalar(0.12);
    const offset = new THREE.Vector3(
      Math.sin(c.yaw) * Math.cos(c.pitch),
      Math.sin(c.pitch),
      Math.cos(c.yaw) * Math.cos(c.pitch)).multiplyScalar(c.distance);
    world.camera.position.copy(c.focus).add(offset).add(sway);
    world.camera.lookAt(c.focus);
    world.sky.position.copy(world.camera.position);
  }

  // ------------------------------------------------------------------ activities + hub

  const game = { world, input, pick, refocus: (activity) => focusRig(activity) };
  const A = Cozy.activities;
  const activities = [
    A.createFishing(game),
    A.createGarden(game),
    A.createTea(game),
    A.createBirds(game),
    A.createViewpoint(game),
    A.createVillage(game),
    A.createCooking(game),
  ];
  const cat = A.createCat(game);
  let catHovered = false;

  const stationHits = [];
  const stationMarkers = [];
  activities.forEach((activity) => {
    const hit = new THREE.Mesh(new THREE.SphereGeometry(1.8, 10, 8),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    hit.position.copy(activity.station).add(new THREE.Vector3(0, 0.8, 0));
    hit.userData.activity = activity;
    world.scene.add(hit);
    stationHits.push(hit);

    const marker = new THREE.Group();
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.4, 0), Cozy.world.material('#FFD08A', { emissive: 1.4 }));
    marker.add(gem);
    const glow = Cozy.world.glowSprite('#FFC46B', 2.6, 0.75);
    marker.add(glow);
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.32, 3.0, 10, 1, true),
      new THREE.MeshBasicMaterial({
        color: '#FFD79A', transparent: true, opacity: 0.22, depthWrite: false,
        blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      }));
    beam.position.y = -1.7;
    marker.add(beam);
    marker.position.copy(activity.station).add(new THREE.Vector3(0, 3.2, 0));
    marker.userData = { gem, base: marker.position.clone(), phase: Math.random() * 6 };
    world.scene.add(marker);
    stationMarkers.push(marker);
  });

  const els = {
    explore: ui.el('explore'),
    list: ui.el('explore-list'),
    title: ui.el('activity-title'),
    rail: ui.el('mode-rail'),
    railList: ui.el('mode-list'),
    back: ui.el('back-button'),
    actTools: ui.el('act-tools'),
    actPrev: ui.el('act-prev'),
    actNext: ui.el('act-next'),
    actJournal: ui.el('act-journal'),
    actBack: ui.el('act-back'),
    exploreToggle: ui.el('explore-toggle'),
    journal: ui.el('journal'),
    journalRows: ui.el('journal-rows'),
    timer: ui.el('timer'),
    start: ui.el('start'),
    mute: ui.el('mute-label'),
    muteIcon: ui.el('mute-icon'),
    muteShort: ui.el('mute-short'),
    season: ui.el('season-label'),
    time: ui.el('time-label'),
    weather: ui.el('weather-label'),
  };

  // ------------------------------------------------------------------ seasons

  const SEASON_WELCOME = {
    spring: 'Spring on the island: blossom on the trees, strawberries in the seed pouch.',
    summer: 'Summer on the island: warm shallows, bass by the lilies, watermelon seeds.',
    autumn: 'Autumn on the island: falling leaves, salmon coming home, pumpkin seeds.',
    winter: 'Winter on the island: soft snow, Arctic char under the dock, snowdrop seeds.',
  };
  Cozy.events.on('rainbow', () => {
    progress.add('rainbows');
    sound.softChime();
    ui.toast('The rain has stopped... a rainbow is arching over the lake. Look away from the sun.', 6);
  });

  let shownSeason = Cozy.season.current();
  let seasonCheckTimer = 0;
  let timeLabelTimer = 0;
  let wasRaining = Cozy.weather.isRaining();

  /** One-word value under each island tool icon: "Autumn", "12:30", "Clear". */
  function refreshToolShorts() {
    const firstWord = (text) => {
      const word = String(text || '').trim().split(/[\s(]+/)[0] || '';
      return word.charAt(0).toUpperCase() + word.slice(1);
    };
    const clock = String(els.time.textContent || '').match(/\d{1,2}:\d{2}/);
    ui.setText(ui.el('season-short'), firstWord(els.season.textContent) || 'Season');
    // a word reads faster than a bare clock: "Day", "Sunset", "Night" (the exact time stays in the tooltip)
    ui.setText(ui.el('time-short'), firstWord(els.time.textContent) || 'Time');
    const timeButton = document.querySelector('[data-key="KeyN"]');
    if (timeButton) {
      timeButton.title = `Time of day: ${clock ? clock[0] : ''} - change it (N)`;
    }
    ui.setText(ui.el('weather-short'), firstWord(els.weather.textContent) || 'Weather');
  }

  function showSeasonLabel() {
    ui.setText(els.season, `${Cozy.season.label()}`);
    refreshToolShorts();
  }

  Cozy.season.onChange((season) => {
    shownSeason = season;
    Cozy.world.applySeason(world, season);
    showSeasonLabel();
    sound.softChime();
    ui.toast(SEASON_WELCOME[season], 5);
  });
  showSeasonLabel();

  function showClockLabels() {
    ui.setText(els.time, Cozy.daytime.label());
    ui.setText(els.weather, Cozy.weather.label());
    refreshToolShorts();
  }
  showClockLabels();  // fill the explore panel straight away, not after the first tick

  function updateSeason(dt) {
    if (input.pressed('KeyS')) {
      Cozy.season.cycle();
      showSeasonLabel();  // label also changes auto <-> manual when the season itself stays the same
    }
    if (input.pressed('KeyN')) {
      Cozy.daytime.cycle();
      sound.softChime();
      ui.toast(`Time of day: ${Cozy.daytime.label()}`, 2.5);
      timeLabelTimer = 0;
    }
    if (input.pressed('KeyR')) {
      Cozy.weather.cycle();
      sound.softChime();
      ui.toast(`Weather: ${Cozy.weather.label()}`, 2.5);
      timeLabelTimer = 0;
    }
    timeLabelTimer -= dt;
    if (timeLabelTimer <= 0) {
      timeLabelTimer = 1;
      showClockLabels();
      const raining = Cozy.weather.isRaining();
      if (raining !== wasRaining) {
        wasRaining = raining;
        const snowy = Cozy.season.current() === 'winter';
        ui.toast(raining
          ? (snowy ? 'A soft, snowy spell settles over the island.' : 'Soft rain is falling. Fish bite sooner, and the rain waters your garden.')
          : 'The sky is clearing up.', 5);
      }
    }
    // in calendar mode, pick up a new season if the laptop stays open across the change
    seasonCheckTimer -= dt;
    if (seasonCheckTimer <= 0) {
      seasonCheckTimer = 60;
      Cozy.season.notifyIfChanged(shownSeason);
    }
  }

  // ------------------------------------------------------------------ navigation (mouse, touch and keys)

  const SHORT_NAMES = {
    fishing: 'Fishing', garden: 'Garden', tea: 'Tea', birds: 'Birds', viewpoint: 'Sunset', village: 'Village', cooking: 'Cooking',
  };
  const ICONS = {
    fishing: 'fish', garden: 'sprout', tea: 'cup', birds: 'bird', viewpoint: 'sunset', village: 'house', cooking: 'flame',
  };
  // which activities have previous/next (Q/E) and a journal (J), and what they are called there
  const ACTION_LABELS = {
    garden: { cycle: 'seed' },
    village: { cycle: 'seed' },
    tea: { cycle: 'tea' },
    cooking: { cycle: 'recipe', journal: 'Cookbook' },
    fishing: { journal: 'Fish journal' },
    birds: { journal: 'Bird journal' },
  };

  /** A button that never keeps keyboard focus, so Space still casts / reels after a click. */
  function onPress(button, handler) {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      handler();
      button.blur();
    });
  }

  /** One line icon from the inline SVG sprite in index.html (no emoji anywhere in the UI). */
  function svgIcon(name) {
    return `<svg class="ico" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  }

  const railButtons = new Map();
  activities.forEach((activity) => {
    const icon = svgIcon(ICONS[activity.id] || 'sun');
    const row = document.createElement('button');
    row.className = 'ui-btn row clickable';
    row.setAttribute('aria-label', activity.name);
    row.title = `${activity.name} (${activity.key})`;
    const short = SHORT_NAMES[activity.id] || activity.name;
    row.innerHTML = `<span class="key">${activity.key}</span><span class="row-icon" aria-hidden="true">${icon}</span> `
      + `<span class="name-long">${activity.name}</span><span class="name-short" aria-hidden="true">${short}</span>`;
    onPress(row, () => switchTo(activity));
    els.list.appendChild(row);

    const railButton = document.createElement('button');
    railButton.className = 'ui-btn rail-btn';
    railButton.setAttribute('aria-label', activity.name);
    railButton.title = `${activity.name} (${activity.key})`;
    railButton.innerHTML = `<span class="rail-icon" aria-hidden="true">${icon}</span>`
      + `<span class="rail-label"><span class="name-long">${activity.name}</span>`
      + `<span class="name-short" aria-hidden="true">${short}</span></span><span class="key">${activity.key}</span>`;
    onPress(railButton, () => switchTo(activity));
    els.railList.appendChild(railButton);
    railButtons.set(activity, railButton);
  });
  // the island journal sits with the places as an eighth tile, so the grid is even on every screen
  const journalTile = document.querySelector('.tool[data-key="KeyJ"]');
  if (journalTile) {
    els.list.appendChild(journalTile);
  }
  // the tab strip fades at its right edge while more places are hidden there
  function markRailEnd() {
    const rail = els.rail;
    rail.classList.toggle('at-end', rail.scrollLeft + rail.clientWidth >= rail.scrollWidth - 2);
  }
  els.rail.addEventListener('scroll', markRailEnd, { passive: true });
  onPress(els.back, () => switchTo(null));
  onPress(els.actBack, () => switchTo(null));

  /** Fold the island menu away (or back out) so the scene can breathe on small screens. */
  function setExploreCollapsed(collapsed) {
    els.explore.classList.toggle('collapsed', collapsed);
    els.exploreToggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    els.exploreToggle.setAttribute('aria-label', collapsed ? 'Show menu' : 'Hide menu');
    els.exploreToggle.querySelector('.toggle-text').textContent = collapsed ? 'Menu' : 'Hide';
  }
  onPress(els.exploreToggle, () => setExploreCollapsed(!els.explore.classList.contains('collapsed')));

  // phone landscape: places stay on one row, the tool row opens on demand
  const exploreMore = ui.el('explore-more');
  function setToolsOpen(open) {
    els.explore.classList.toggle('tools-open', open);
    exploreMore.setAttribute('aria-expanded', open ? 'true' : 'false');
    exploreMore.setAttribute('aria-label', open ? 'Hide tools' : 'Show tools');
    exploreMore.textContent = open ? 'Less' : 'More';
  }
  onPress(exploreMore, () => setToolsOpen(!els.explore.classList.contains('tools-open')));

  // dragging the island with one finger tucks the menu away; returning to the island brings it back
  const dragStart = { x: 0, y: 0, active: false };
  const appEl = ui.el('app');
  appEl.addEventListener('pointerdown', (event) => {
    dragStart.active = event.pointerType === 'touch' && !current;
    dragStart.x = event.clientX;
    dragStart.y = event.clientY;
  });
  appEl.addEventListener('pointermove', (event) => {
    if (!dragStart.active || current) {
      return;
    }
    if (Math.hypot(event.clientX - dragStart.x, event.clientY - dragStart.y) > 32) {
      dragStart.active = false;
      setExploreCollapsed(true);
    }
  });
  appEl.addEventListener('pointerup', () => {
    dragStart.active = false;
  });

  // every on-screen tool button with data-key does exactly what that key does
  document.querySelectorAll('[data-key]').forEach((button) => {
    onPress(button, () => input.tap(button.dataset.key));
  });
  onPress(ui.el('desk-button'), () => enterDesk());
  els.timer.addEventListener('click', () => toggleFocus());
  els.timer.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      toggleFocus();
    }
  });

  /** Put the previous / next / journal chips inside the current activity's HUD panel. */
  function placeActionChips(activity) {
    const labels = activity ? ACTION_LABELS[activity.id] : null;
    const host = activity && (document.querySelector(`#hud-${activity.id} .hud`) || ui.el('hud-' + activity.id));
    if (!host) {
      ui.show(els.actTools, false);
      return;
    }
    host.appendChild(els.actTools);
    // activities without previous/next or a journal still get the phone back chip
    els.actTools.classList.toggle('only-back', !labels);
    if (!labels) {
      els.actPrev.hidden = true;
      els.actNext.hidden = true;
      els.actJournal.hidden = true;
      ui.show(els.actTools, true);
      return;
    }
    const cycle = labels.cycle;
    els.actPrev.hidden = !cycle;
    els.actNext.hidden = !cycle;
    els.actJournal.hidden = !labels.journal;
    if (cycle) {
      els.actPrev.setAttribute('aria-label', `Previous ${cycle}`);
      els.actNext.setAttribute('aria-label', `Next ${cycle}`);
      els.actPrev.querySelector('.chip-text').textContent = 'Previous';
      els.actNext.querySelector('.chip-text').textContent = 'Next';
    }
    if (labels.journal) {
      els.actJournal.setAttribute('aria-label', labels.journal);
      els.actJournal.querySelector('.chip-text').textContent = labels.journal;
    }
    ui.show(els.actTools, true);
  }

  let current = null;
  let showJournal = false;
  const friends = Cozy.online.createAvatars(world);

  function switchTo(next) {
    if (next === current) {
      return;
    }
    if (current) {
      current.exit();
    }
    current = next;
    showJournal = false;
    activities.forEach((activity) => ui.show(ui.el('hud-' + activity.id), activity === current));
    ui.show(els.explore, !current);
    ui.show(els.rail, !!current);
    document.body.classList.toggle('in-activity', !!current);
    ui.show(els.title, !!current);
    railButtons.forEach((button, activity) => button.setAttribute('aria-current', activity === current ? 'true' : 'false'));
    // on a narrow strip, keep the current place in view
    const activeTab = current ? railButtons.get(current) : null;
    if (activeTab && els.rail.scrollWidth > els.rail.clientWidth + 1) {
      els.rail.scrollLeft = Math.max(0, activeTab.offsetLeft - els.rail.clientWidth / 2 + activeTab.offsetWidth / 2);
    }
    markRailEnd();
    placeActionChips(current);
    if (current) {
      current.enter();
      ui.setText(els.title, current.name);
      // the activity hint lives inside its own HUD, so there is one panel to read instead of two
      const hud = document.getElementById('hud-' + current.id);
      if (hud) {
        let hintLine = hud.querySelector('.hud-hint');
        if (!hintLine) {
          hintLine = document.createElement('div');
          hintLine.className = 'hud-hint';
          hud.appendChild(hintLine);
        }
        ui.setText(hintLine, current.hint);
        ui.clearToast();
      } else {
        ui.toast(current.hint, 5);
      }
      sound.tick(0.05, 1200);
    } else {
      // the activity hint ("Tap to cast...") means nothing back on the island
      ui.clearToast();
      setExploreCollapsed(false);
    }
    focusRig(current);
  }

  function updateHub() {
    activities.forEach((activity) => {
      if (input.pressed('Digit' + activity.key) || input.pressed('Numpad' + activity.key)) {
        switchTo(activity);
      }
    });
    if (input.pressed('Escape')) {
      if (current) {
        switchTo(null);
      } else {
        showJournal = false;
      }
    }
    if (input.pressed('KeyM')) {
      const muted = sound.toggleMute();
      ui.setText(els.mute, muted ? 'sound off' : 'sound on');
      els.muteIcon.innerHTML = svgIcon(muted ? 'mute' : 'sound');
      ui.setText(els.muteShort, muted ? 'Muted' : 'Sound');
      const muteButton = document.querySelector('.tool[data-key="KeyM"]');
      if (muteButton) {
        muteButton.classList.toggle('is-muted', muted);
        muteButton.setAttribute('aria-pressed', muted ? 'true' : 'false');
      }
      ui.toast(muted ? 'Sound off' : 'Sound on', 1.5);
    }
    if (current) {
      return;
    }
    if (input.pressed('KeyJ')) {
      showJournal = !showJournal;
      if (showJournal) {
        renderJournal();
      }
    }
    ui.show(els.journal, showJournal);
    const hit = pick(stationHits);
    if (hit && !catHovered) {
      ui.tooltip(`Click: ${hit.object.userData.activity.name}`);
      if (input.leftPressed) {
        switchTo(hit.object.userData.activity);
      }
    }
  }

  const STATS = [
    ['Fish caught', 'fish'], ['Plants harvested', 'harvest'], ['Cups of tea', 'tea_cups'], ['Bird photos', 'photos'],
    ['Focus sessions', 'focus_sessions'], ['Eye rests', 'eye_rests'], ['Stretch breaks', 'stretch_sessions'],
  ];

  function renderJournal() {
    els.journalRows.innerHTML = '';
    const rows = STATS.map(([label, key]) => [label, progress.get(key)]);
    rows.push(['Mindful minutes', Math.floor(progress.get('mindful_seconds') / 60)]);
    rows.push(['Moonflower seeds', progress.get('rare_seeds')]);
    rows.push(['Fish species found', `${A.fishSpeciesCount()}/${A.FISH.length}`]);
    rows.push(['Dishes cooked', progress.get('dishes')]);
    rows.push([`${cat.name} the cat`, cat.friendship() ? `friendship ${cat.friendship()}` : `${progress.get('cat_pets')} pets`]);
    rows.push([`${cat.name}'s visits to friends`, progress.get('cat_visits')]);
    rows.push(['Bird species seen', `${A.birdSpeciesCount()}/${A.BIRDS.length}`]);
    rows.push(['Rainbows seen', progress.get('rainbows')]);
    rows.push(['Fish caught at your desk', progress.get('desk_catches')]);
    rows.push(['Season', Cozy.season.label()]);
    rows.push(['Time', Cozy.daytime.label()]);
    rows.push(['Weather', Cozy.weather.label()]);
    rows.push(['Presents sent / received', `${progress.get('gifts_sent')} / ${progress.get('gifts_received')}`]);
    for (const [label, value] of rows) {
      const row = document.createElement('div');
      row.className = 'row';
      row.innerHTML = `<span>${label}</span><span>${value}</span>`;
      els.journalRows.appendChild(row);
    }
  }

  // ------------------------------------------------------------------ focus timer (Pomodoro + 20-20-20)

  const BREAK_IDEAS = [
    'brew a cup of tea on the porch (3)',
    'check on the garden (2)',
    'watch the birds at the feeder (4)',
    'rest your eyes at the sunset viewpoint (5)',
    'cast a line off the dock (1)',
  ];
  const focus = { phase: 'idle', remaining: 0, paused: false, sessions: 0, elapsed: 0, nextEyeRest: 20 * 60 };

  function notify(text) {
    ui.toast(text, 10);
    try {
      if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
        new Notification('Cozy Island', { body: text });
      }
    } catch (error) {
      /* notifications are optional */
    }
  }

  function toggleFocus() {
    if (focus.phase === 'focus') {
      focus.paused = !focus.paused;
      ui.toast(focus.paused ? 'Focus paused' : 'Focus resumed', 2);
      return;
    }
    focus.phase = 'focus';
    focus.remaining = 25 * 60;
    focus.paused = false;
    focus.elapsed = 0;
    focus.nextEyeRest = 20 * 60;
    ui.toast('Focus time. The island will wait for you.', 3);
    try {
      if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
      }
    } catch (error) {
      /* ignore */
    }
  }

  function updateFocus(dt) {
    if (input.pressed('KeyF')) {
      toggleFocus();
    }
    // the Focus tool looks pressed while a session runs
    const focusButton = document.querySelector('.tool[data-key="KeyF"]');
    if (focusButton) {
      const running = focus.phase !== 'idle';
      focusButton.classList.toggle('is-on', running);
      focusButton.setAttribute('aria-pressed', running ? 'true' : 'false');
    }
    if (focus.phase !== 'idle' && !focus.paused) {
      focus.remaining -= dt;
      if (focus.phase === 'focus') {
        focus.elapsed += dt;
        if (focus.elapsed >= focus.nextEyeRest) {
          focus.nextEyeRest += 20 * 60;
          sound.softChime();
          notify('20-20-20: look at something ~6 m away for 20 seconds.');
        }
      }
      if (focus.remaining <= 0) {
        if (focus.phase === 'focus') {
          focus.sessions++;
          progress.add('focus_sessions');
          progress.add('rare_seeds');
          const longBreak = focus.sessions % 4 === 0;
          focus.phase = 'break';
          focus.remaining = (longBreak ? 15 : 5) * 60;
          sound.jingle();
          notify(`Nice work! +1 Moonflower seed. Take ${longBreak ? 15 : 5} minutes and ${Cozy.randomFrom(BREAK_IDEAS)}.`);
        } else {
          focus.phase = 'idle';
          sound.softChime();
          notify("Break's over. Press F when you're ready to focus again.");
        }
      }
    }
    const format = (seconds) => {
      const total = Math.max(0, Math.ceil(seconds));
      return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
    };
    let text = 'F  start focus';
    els.timer.className = 'pill';
    if (focus.phase === 'focus') {
      text = `Focus  ${format(focus.remaining)}${focus.paused ? '  (paused)' : ''}`;
      els.timer.className = 'pill focus';
    } else if (focus.phase === 'break') {
      text = `Break  ${format(focus.remaining)}`;
      els.timer.className = 'pill break';
    }
    if (focus.sessions > 0) {
      text += `  ·  ${focus.sessions} done`;
    }
    ui.setText(els.timer, text);
    const title = focus.phase === 'idle' ? 'Cozy Island' : `${focus.phase === 'focus' ? 'Focus' : 'Break'} ${format(focus.remaining)} · Cozy Island`;
    if (document.title !== title) {
      document.title = title;
    }
  }

  // ------------------------------------------------------------------ desk mode (a tiny island beside your work)

  const DESK_FPS = 20;
  const DESK_PIP_SIZE = { width: 520, height: 300 };
  const deskParams = new URLSearchParams(window.location.search);
  const DESK_SIDE = deskParams.get('deskside') === '1' ? 1 : -1;   // -1: Mochi stays in view beside the angler
  // 0 = side-on; negative = from the water side looking back at the angler with the island behind
  const DESK_ANGLE = Number(deskParams.get('deskangle') || -1.0);
  const deskEls = {
    hud: ui.el('desk-hud'), status: ui.el('desk-status'), ping: ui.el('desk-ping'),
    focus: ui.el('desk-focus'), open: ui.el('desk-open'),
  };
  const fishing = activities.find((activity) => activity.id === 'fishing');
  const desk = { on: false, pingTimer: 0, shadowTimer: 0 };

  /** A low, wide view of the dock: the angler, Mochi, the bobber and the cabin behind. */
  function deskView() {
    const places = world.places;
    const out = places.castDirection.clone().setY(0).normalize();
    const side = new THREE.Vector3(-out.z, 0, out.x).multiplyScalar(DESK_SIDE);
    const castPoint = places.rodTip.clone().addScaledVector(out, 4.5);
    const focusPoint = places.playerSpot.clone().lerp(castPoint, 0.5);
    focusPoint.y = places.playerSpot.y + 0.4;
    const toCamera = side.multiplyScalar(Math.cos(DESK_ANGLE)).addScaledVector(out, -Math.sin(DESK_ANGLE));
    return { focus: focusPoint, yaw: Math.atan2(toCamera.x, toCamera.z), pitch: 0.24, distance: 9.5 };
  }

  function setDeskQuality(on) {
    world.renderer.setPixelRatio(on ? 1 : Math.min(window.devicePixelRatio, 2));
    world.renderer.shadowMap.autoUpdate = !on;   // shadows refresh once a second instead of every frame
    world.renderer.shadowMap.needsUpdate = true;
  }

  function resizeView() {
    const host = deskWindow || window;
    const width = Math.max(1, host.innerWidth);
    const height = Math.max(1, host.innerHeight);
    world.renderer.setSize(width, height);
    world.camera.aspect = width / height;
    world.camera.updateProjectionMatrix();
  }

  function deskPing(text, seconds, bite) {
    ui.setText(deskEls.ping, text);
    deskEls.ping.classList.toggle('bite', !!bite);
    ui.show(deskEls.ping, true);
    desk.pingTimer = seconds || 4;
  }

  async function enterDesk(snap) {
    if (desk.on || !started) {
      return;
    }
    switchTo(null);
    showJournal = false;
    ui.show(els.journal, false);
    desk.on = true;
    fishing.setDesk(true);
    const view = deskView();
    rig.focus.copy(view.focus);
    rig.yaw = view.yaw;
    rig.pitch = view.pitch;
    rig.distance = view.distance;
    if (snap) {
      rig.current.focus.copy(rig.focus);
      rig.current.yaw = rig.yaw;
      rig.current.pitch = rig.pitch;
      rig.current.distance = rig.distance;
    }
    setDeskQuality(true);
    document.body.classList.add('desk');
    ui.show(deskEls.hud, true);
    deskPing(`Line's in the water. Click when something nibbles.`, 5);
    if (window.documentPictureInPicture && !deskParams.has('deskinline')) {
      try {
        const pip = await window.documentPictureInPicture.requestWindow(DESK_PIP_SIZE);
        if (!desk.on) {
          pip.close();
          return;
        }
        document.querySelectorAll('style').forEach((style) => pip.document.head.appendChild(style.cloneNode(true)));
        pip.document.title = 'Cozy Island';
        pip.document.body.className = 'desk-pip';
        world.renderer.domElement.style.display = 'block';
        pip.document.body.append(world.renderer.domElement, deskEls.hud);
        deskWindow = pip;
        world.lockViewport = true;
        pip.addEventListener('pagehide', () => exitDesk());
        pip.addEventListener('resize', resizeView);
        pip.document.addEventListener('keydown', onDeskKey);
        resizeView();
        schedule();   // keep animating from the floating window even if this tab is minimised
      } catch (error) {
        deskPing('Tip: make this browser window small and keep it beside your work.', 6);
      }
    }
  }

  function exitDesk() {
    if (!desk.on) {
      return;
    }
    desk.on = false;
    const pip = deskWindow;
    deskWindow = null;
    world.lockViewport = false;
    document.getElementById('app').appendChild(world.renderer.domElement);
    document.body.appendChild(deskEls.hud);
    ui.show(deskEls.hud, false);
    document.body.classList.remove('desk');
    if (pip && !pip.closed) {
      pip.close();
    }
    fishing.setDesk(false);
    setDeskQuality(false);
    resizeView();
    focusRig(null);
    schedule();
  }

  /** Handled straight in the key event so the browser lets us open the floating window. */
  function onDeskKey(event) {
    const tag = event.target && event.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || !started) {
      return;
    }
    if (event.code === 'KeyD') {
      if (desk.on) {
        exitDesk();
      } else {
        enterDesk();
      }
    } else if (desk.on && event.code === 'Escape') {
      exitDesk();
    } else if (desk.on && deskWindow && event.code === 'KeyF') {
      toggleFocus();
    }
  }
  window.addEventListener('keydown', onDeskKey);
  deskEls.open.addEventListener('click', exitDesk);
  deskEls.focus.addEventListener('click', toggleFocus);

  // toasts also appear in the small desk window
  const baseToast = ui.toast.bind(ui);
  ui.toast = (text, seconds) => {
    baseToast(text, seconds);
    if (desk.on) {
      deskPing(text, seconds);
    }
  };
  Cozy.events.on('deskMissed', () => {
    deskPing('It swam off. Another one will come along.', 3);
  });

  function formatClock(seconds) {
    const total = Math.max(0, Math.ceil(seconds));
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  }

  function updateDesk(dt) {
    if (input.leftPressed) {
      const landed = fishing.deskReel();
      if (landed) {
        deskPing(`You reel in a ${landed.kg.toFixed(2)} kg ${landed.fish.name}! ${A.RARITY[landed.fish.rarity].stars}`.trim(), 4);
      } else if (catHovered) {
        cat.pet();
      }
    }
    const line = fishing.deskStatus();
    if (line.biting) {
      deskPing(`Nibble! Click to reel it in (${Math.ceil(line.secondsLeft)})`, 0.3, true);
    } else if (desk.pingTimer > 0) {
      desk.pingTimer -= dt;
      if (desk.pingTimer <= 0) {
        ui.show(deskEls.ping, false);
      }
    }
    const catNote = cat.isHome() ? `${cat.name} is here` : `${cat.name} is visiting a friend`;
    ui.setText(deskEls.status, `${progress.get('fish')} fish · ${Cozy.weather.label()} · ${catNote}`);
    let focusText = 'Focus 25:00';
    if (focus.phase === 'focus') {
      focusText = `${focus.paused ? 'Paused' : 'Focus'} ${formatClock(focus.remaining)}`;
    } else if (focus.phase === 'break') {
      focusText = `Break ${formatClock(focus.remaining)}`;
    }
    ui.setText(deskEls.focus, focusText);
    desk.shadowTimer -= dt;
    if (desk.shadowTimer <= 0) {
      desk.shadowTimer = 1;
      world.renderer.shadowMap.needsUpdate = true;
    }
  }

  // ------------------------------------------------------------------ start screen

  let started = false;
  const nameInput = ui.el('name-input');
  nameInput.value = Cozy.store.get('name', '');
  ui.el('start-button').addEventListener('click', () => {
    const name = nameInput.value.trim().slice(0, 20);
    if (name) {
      Cozy.store.set('name', name);
    }
    sound.start();
    started = true;
    els.start.classList.add('hidden');
    setTimeout(() => ui.show(els.start, false), 700);
    ui.toast(name ? `Welcome back to the island, ${name}.` : 'Welcome to the island.', 4);
  });

  // ------------------------------------------------------------------ loop

  let last = performance.now();
  let time = 0;

  // the loop runs from whichever window shows the island (the floating desk window keeps going
  // when this tab is minimised); a token drops callbacks queued in the other window
  let loopToken = 0;
  function schedule() {
    const token = ++loopToken;
    (deskWindow || window).requestAnimationFrame(() => {
      if (token === loopToken) {
        frame();
      }
    });
  }

  function frame() {
    // measure with performance.now(): rAF timestamps can lag it (and even predate the first frame)
    const now = performance.now();
    if (desk.on && now - last < 1000 / DESK_FPS - 2) {
      schedule();   // low-power: ~20 fps in desk mode
      return;
    }
    const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
    last = now;
    time += dt;
    try {
      step(dt);
    } catch (error) {
      console.error(error);   // one bad frame must never freeze the island
    } finally {
      input.endFrame();
    }
    schedule();
  }

  function step(dt) {
    ui.tooltip(null);

    if (started && desk.on) {
      catHovered = cat.isHome() && !!pick([cat.hit]);
      updateFocus(dt);
      updateSeason(dt);
      updateDesk(dt);
    } else if (started) {
      input.touchOrbit = !current;
      // Mochi first: clicking her pets her instead of casting / switching activity
      catHovered = cat.isHome() && !!pick([cat.hit]);
      if (catHovered && input.leftPressed) {
        cat.pet();
        input.leftPressed = false;
      }
      updateHub();
      updateFocus(dt);
      updateSeason(dt);
      if (catHovered) {
        ui.tooltip(`Pet ${cat.name}`);
      }
    } else {
      rig.yaw += dt * 0.03;
    }
    activities.forEach((activity) => activity.update(dt, time, started && activity === current));
    cat.update(dt, time);

    stationMarkers.forEach((marker) => {
      marker.visible = started && !current && !desk.on;
      marker.position.y = marker.userData.base.y + Math.sin(time * 1.6 + marker.userData.phase) * 0.15;
      marker.userData.gem.rotation.y = time * 1.2;
    });

    updateRig(dt, time);
    // rain sounds closer and woodier on the cabin roof (tea porch, campfire)
    const cabinDistance = rig.current.focus.distanceTo(world.places.teaSpot);
    sound.roof = Cozy.clamp01(1 - (cabinDistance - 3) / 6) * Cozy.clamp01(1.4 - rig.current.distance / 12);
    const presence = desk.on ? 'desk' : (started && current ? current.id : 'explore');
    Cozy.online.setPresence(presence, rig.focus.x, rig.focus.y - 1, rig.focus.z);
    Cozy.online.update(dt);
    friends.update(dt, time);
    Cozy.world.update(world, time, dt);
    sound.update(dt);
    ui.update(dt);
    world.renderer.render(world.scene, world.camera);
  }

  switchTo(null);

  // test / deep-link hook: ?autostart&activity=3&season=winter&press=KeyJ
  // (skips the start card; audio still needs a click; `press` taps one key on the first frame)
  const params = new URLSearchParams(window.location.search);
  if (params.has('autostart')) {
    started = true;
    ui.show(els.start, false);
    const wanted = activities.find((activity) => String(activity.key) === params.get('activity'));
    if (wanted) {
      switchTo(wanted);
      rig.current.focus.copy(rig.focus);
      rig.current.yaw = rig.yaw;
      rig.current.pitch = rig.pitch;
      rig.current.distance = rig.distance;
    }
    if (params.get('press')) {
      input.keysPressed.add(params.get('press'));
    }
    // ?cam=yaw,pitch,distance - or ?cam=rainbow to look low across the lake, away from the sun
    const cam = params.get('cam');
    if (cam) {
      let view = cam.split(',').map(Number);
      if (cam === 'rainbow') {
        const bow = world.rainbowFx.bows[0].position;
        view = [Math.atan2(-bow.x, -bow.z), 0.1, 34];
      }
      if (view.length === 3 && view.every(Number.isFinite)) {
        [rig.yaw, rig.pitch, rig.distance] = view;
        rig.current.yaw = rig.yaw;
        rig.current.pitch = rig.pitch;
        rig.current.distance = rig.distance;
      }
    }
  }
  if (params.has('desk')) {
    enterDesk(true);   // test / deep link: ?autostart&desk=1 (opens inline - a floating window needs a click)
  }
  schedule();
  Cozy.debug = { world, activities, switchTo, rig, cat, enterDesk, exitDesk, desk, current: () => current };
})(window.Cozy);
