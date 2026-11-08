'use strict';
/* Cozy Island - activities. Each activity: { id, name, station, focus, from, distance, pitch, hint,
   enter(), exit(), update(dt, time, active) }. Shared context `game` is provided by main.js. */
(function (Cozy) {
  const THREE = window.THREE;
  const ui = Cozy.ui;
  const sound = Cozy.sound;
  const progress = Cozy.progress;

  const SEEDS = [
    { id: 'daisy', name: 'Daisy', color: '#FFF8E8', minutes: 5, size: 0.16 },
    { id: 'tulip', name: 'Tulip', color: '#F4809E', minutes: 15, size: 0.16 },
    { id: 'tomato', name: 'Tomato', color: '#E5402F', minutes: 25, size: 0.14 },
    { id: 'sunflower', name: 'Sunflower', color: '#FFD23F', minutes: 50, size: 0.24 },
    { id: 'moonflower', name: 'Moonflower', color: '#BFD9FF', minutes: 90, size: 0.2, cost: 'rare_seeds' },
    // seasonal seeds: only plantable in their season (anything already planted keeps growing)
    { id: 'strawberry', name: 'Strawberry', color: '#E8434F', minutes: 20, size: 0.14, season: 'spring' },
    { id: 'watermelon', name: 'Watermelon', color: '#5DAA4F', minutes: 40, size: 0.26, season: 'summer' },
    { id: 'pumpkin', name: 'Pumpkin', color: '#E8862F', minutes: 45, size: 0.28, season: 'autumn' },
    { id: 'snowdrop', name: 'Snowdrop', color: '#F4F8FF', minutes: 10, size: 0.14, season: 'winter' },
  ];

  function seedById(id) {
    return SEEDS.find((seed) => seed.id === id) || null;
  }

  function availableSeeds() {
    const season = Cozy.season.current();
    // this season's special seed first, so it's what you plant by default
    const seasonal = SEEDS.filter((seed) => seed.season === season);
    return seasonal.concat(SEEDS.filter((seed) => !seed.season));
  }

  function formatMinutes(minutes) {
    return minutes < 60 ? `${Math.max(1, Math.round(minutes))} min` : `${(minutes / 60).toFixed(1).replace('.0', '')} h`;
  }

  /** Real-time plant growth (keeps growing while the tab is closed). Water at planting + once around halfway. */
  class PlotModel {
    constructor(storageKey) {
      this.key = storageKey;
      const saved = storageKey ? Cozy.store.get(storageKey, null) : null;
      this.seedId = saved ? saved.seedId : '';
      this.grownMs = saved ? saved.grownMs : 0;
      this.lastTick = saved ? saved.lastTick : 0;
      this.waterEnds = saved ? saved.waterEnds : 0;
    }

    get seed() {
      return seedById(this.seedId);
    }

    totalMs() {
      const seed = this.seed;
      return seed ? seed.minutes * 60000 : 1;
    }

    projected(now) {
      if (!this.seed) {
        return 0;
      }
      const growEnd = Math.min(now, this.waterEnds);
      return this.grownMs + Math.max(0, growEnd - this.lastTick);
    }

    stage(now) {
      if (!this.seed) {
        return 'empty';
      }
      if (this.projected(now) >= this.totalMs()) {
        return 'bloomed';
      }
      return now >= this.waterEnds ? 'thirsty' : 'growing';
    }

    growth(now) {
      return this.seed ? Math.min(1, this.projected(now) / this.totalMs()) : 0;
    }

    minutesLeft(now) {
      return Math.max(0, (this.totalMs() - this.projected(now)) / 60000);
    }

    plant(seedId, now) {
      this.seedId = seedId;
      this.grownMs = 0;
      this.lastTick = now;
      this.waterEnds = 0;
      this.save();
    }

    water(now) {
      this.grownMs = this.projected(now);
      this.lastTick = now;
      this.waterEnds = now + this.totalMs() * 0.55;
      this.save();
    }

    harvest() {
      const seed = this.seed;
      this.seedId = '';
      this.grownMs = 0;
      this.waterEnds = 0;
      this.save();
      return seed;
    }

    save() {
      if (this.key) {
        Cozy.store.set(this.key, { seedId: this.seedId, grownMs: this.grownMs, lastTick: this.lastTick, waterEnds: this.waterEnds });
      }
    }

    /** Overwrite with the village server's copy of this bed. */
    applyRemote(state) {
      this.seedId = state.seedId || '';
      this.grownMs = state.grownMs || 0;
      this.lastTick = state.lastTick || 0;
      this.waterEnds = state.waterEnds || 0;
    }
  }

  /** Shared plant-bed interaction used by the personal garden and village homesteads. */
  class BedSet {
    constructor(game, positions, keyPrefix, phaseOffset) {
      this.game = game;
      this.beds = positions.map((position, i) => ({
        model: new PlotModel(`${keyPrefix}.${i}`),
        visual: new Cozy.world.PlantVisual(game.world.scene, position, phaseOffset + i * 1.7),
        shownSeed: null,
      }));
      this.selectedSeed = 0;           // index into availableSeeds()
      this.wateringProgress = 0;
      this.dripTimer = 0;
      this.hovered = null;
      this.clock = () => Date.now();   // replaced by the server clock for online homesteads
      this.onAction = null;            // (bedIndex, action, seedId) => void, set when online
    }

    notify(bed, action, seedId) {
      bed.pendingUntil = performance.now() + 4000;  // keep the optimistic result until the server agrees
      if (this.onAction) {
        this.onAction(this.beds.indexOf(bed), action, seedId || '');
      }
    }

    currentSeed() {
      const seeds = availableSeeds();
      return seeds[((this.selectedSeed % seeds.length) + seeds.length) % seeds.length];
    }

    hitObjects() {
      return this.beds.map((bed) => bed.visual.hit);
    }

    updateVisuals(time) {
      const now = this.clock();
      for (const bed of this.beds) {
        const seed = bed.model.seed;
        if (bed.shownSeed !== bed.model.seedId) {
          bed.shownSeed = bed.model.seedId;
          bed.visual.setPlant(!!seed, seed ? seed.color : null, seed ? seed.size : 0);
        }
        bed.visual.update(bed.model.growth(now), bed.model.stage(now) === 'thirsty', time);
      }
    }

    /** Returns true if something under the pointer was handled. */
    interact(dt, canPlant, canHarvest, canWater = true) {
      const input = this.game.input;
      const seedCount = availableSeeds().length;
      if (input.pressed('KeyQ')) {
        this.selectedSeed = (this.selectedSeed + seedCount - 1) % seedCount;
        sound.tick(0.05, 1800);
      }
      if (input.pressed('KeyE')) {
        this.selectedSeed = (this.selectedSeed + 1) % seedCount;
        sound.tick(0.05, 1800);
      }
      const hit = this.game.pick(this.hitObjects());
      this.hovered = hit ? this.beds.find((bed) => bed.visual.hit === hit.object) : null;
      let watering = false;
      if (this.hovered) {
        const bed = this.hovered;
        const now = this.clock();
        const stage = bed.model.stage(now);
        if (stage === 'empty' && input.primaryPressed && canPlant) {
          const seed = this.currentSeed();
          if (seed.cost && !progress.trySpend(seed.cost)) {
            ui.toast(`No ${seed.name} seeds yet - finish a focus session (F) to earn one.`, 5);
          } else {
            bed.model.plant(seed.id, now);
            this.notify(bed, 'plant', seed.id);
            sound.thud();
            Cozy.world.FX.puff(bed.visual.root.position.clone().add(new THREE.Vector3(0, 0.1, 0)), '#B89A7A', 0.2);
          }
        } else if (stage === 'thirsty' && input.primaryHeld && canWater) {
          watering = true;
          this.wateringProgress += dt / 1.2;
          this.dripTimer -= dt;
          if (this.dripTimer <= 0) {
            this.dripTimer = 0.08;
            const above = bed.visual.root.position.clone().add(new THREE.Vector3(Cozy.rand(-0.1, 0.1), 0.9, Cozy.rand(-0.1, 0.1)));
            Cozy.world.FX.splash(above, 1, '#9FD4FF');
          }
          if (this.wateringProgress >= 1) {
            bed.model.water(now);
            this.notify(bed, 'water');
            this.wateringProgress = 0;
            sound.softChime();
          }
        } else if (stage === 'bloomed' && input.primaryPressed && canHarvest) {
          const seed = bed.model.harvest();
          this.notify(bed, 'harvest');
          progress.add('harvest');
          progress.add('harvest_' + seed.name);
          Cozy.pantry.add('crops', seed.id);
          Cozy.events.emit('harvest', seed);
          sound.pop();
          Cozy.world.FX.splash(bed.visual.root.position.clone().add(new THREE.Vector3(0, 0.4, 0)), 8, seed.color);
          ui.toast(`Harvested a ${seed.name}! (${progress.get('harvest_' + seed.name)} so far)`, 4);
        }
      }
      if (watering) {
        sound.startLoop('pour');
      } else {
        sound.stopLoop('pour');
        this.wateringProgress = Math.max(0, this.wateringProgress - dt);
      }
      return this.hovered;
    }

    status(bed, canPlant, canHarvest) {
      const now = this.clock();
      const seed = bed.model.seed;
      switch (bed.model.stage(now)) {
        case 'empty':
          return canPlant ? `Click to plant ${this.currentSeed().name}` : 'Empty bed';
        case 'thirsty':
          return bed.model.growth(now) < 0.01 ? 'Hold to water the seed' : `${seed.name} is thirsty - hold to water`;
        case 'growing':
          return `${seed.name} · ${Math.round(bed.model.growth(now) * 100)}% · ~${formatMinutes(bed.model.minutesLeft(now))} left`;
        default:
          return canHarvest ? `Click to harvest the ${seed.name}` : `${seed.name} is in bloom`;
      }
    }

    seedLabel() {
      const seed = this.currentSeed();
      let cost = seed.cost ? ` · ${progress.get(seed.cost)} in pouch` : ' · free';
      if (seed.season) {
        cost += ` · ${Cozy.season.name(seed.season)} only`;
      }
      return { title: `Q  ‹  ${seed.name}  ›  E`, sub: `${formatMinutes(seed.minutes)} to bloom${cost}` };
    }

    thirstyCount() {
      const now = this.clock();
      return this.beds.filter((bed) => bed.model.stage(now) === 'thirsty').length;
    }

    stopSounds() {
      sound.stopLoop('pour');
      this.wateringProgress = 0;
    }
  }

  // ================================================================== 1. Fishing

  /** Rarity sets how often a fish bites (weight) and how hard it fights (difficulty). */
  const RARITY = {
    common: { weight: 6, difficulty: 0.25, stars: '', label: 'common' },
    uncommon: { weight: 2.5, difficulty: 0.45, stars: '(uncommon)', label: 'uncommon' },
    rare: { weight: 0.8, difficulty: 0.65, stars: '(rare)', label: 'rare' },
    legendary: { weight: 0.2, difficulty: 0.82, stars: '(legendary)', label: 'legendary' },
  };
  const ALL_YEAR = ['spring', 'summer', 'autumn', 'winter'];

  /** Species list. Names stay stable: catches are saved as progress 'fish_<name>'. */
  const FISH = [
    { name: 'Bluegill', rarity: 'common', seasons: ALL_YEAR, kg: [0.1, 0.5], color: '#7FA7C9', accent: '#E8A04A',
      note: 'A friendly regular under the dock.' },
    { name: 'Perch', rarity: 'common', seasons: ALL_YEAR, kg: [0.2, 1.0], color: '#C9B458', accent: '#E36B3A',
      note: 'Striped and curious.' },
    { name: 'Rainbow Trout', rarity: 'uncommon', seasons: ALL_YEAR, kg: [0.5, 2.5], color: '#C7CDB8', accent: '#E39BB0',
      note: 'A pink stripe that catches the sunset.' },
    { name: 'Golden Koi', rarity: 'legendary', seasons: ALL_YEAR, kg: [1.5, 4.0], color: '#F2A23A', accent: '#FFF1D6',
      note: 'Said to grant one quiet afternoon.' },

    { name: 'Crappie', rarity: 'common', seasons: ['spring'], kg: [0.2, 0.9], color: '#B9C4B0', accent: '#5E6B58',
      note: 'Speckled like spring rain.' },
    { name: 'Cherry Salmon', rarity: 'uncommon', seasons: ['spring'], kg: [0.3, 1.2], color: '#D8B9C0', accent: '#F28BA8',
      note: 'Swims up with the blossom petals.' },
    { name: 'Northern Pike', rarity: 'rare', seasons: ['spring', 'autumn'], kg: [2.0, 8.0], color: '#6E8B4E', accent: '#D9D18A',
      note: 'Long, patient, a little grumpy.' },
    { name: 'Golden Trout', rarity: 'rare', seasons: ['spring'], kg: [0.4, 1.5], color: '#F0C04A', accent: '#D9573A',
      note: 'Only rises when the meltwater is clear.' },

    { name: 'Largemouth Bass', rarity: 'common', seasons: ['summer'], kg: [0.5, 3.0], color: '#7E9A5A', accent: '#3F5230',
      note: 'Loves the warm shallows by the lilies.' },
    { name: 'Pufferfish', rarity: 'uncommon', seasons: ['summer'], kg: [0.2, 1.0], color: '#E8D49A', accent: '#8A7448',
      note: 'Puffs up, then forgives you.' },
    { name: 'Catfish', rarity: 'rare', seasons: ['summer', 'autumn'], kg: [2.0, 12.0], color: '#7A6E62', accent: '#C9B9A2',
      night: true, note: 'Whiskers that know every secret of the lake.' },
    { name: 'Mahi-mahi', rarity: 'rare', seasons: ['summer'], kg: [4.0, 14.0], color: '#3FB08A', accent: '#F2D33A',
      note: 'A flash of green and gold far out past the dock.' },

    { name: 'Common Carp', rarity: 'common', seasons: ['autumn'], kg: [1.0, 6.0], color: '#B89A5A', accent: '#7A5E32',
      note: 'Slow and steady, like a Sunday.' },
    { name: 'Brown Trout', rarity: 'uncommon', seasons: ['autumn', 'winter'], kg: [0.5, 3.0], color: '#A88158', accent: '#D9573A',
      note: 'Freckled with autumn colours.' },
    { name: 'Sockeye Salmon', rarity: 'uncommon', seasons: ['autumn'], kg: [2.0, 5.0], color: '#D9483A', accent: '#3F7A5A',
      note: 'Comes home red when the leaves turn.' },
    { name: 'Sturgeon', rarity: 'rare', seasons: ['autumn'], kg: [10.0, 30.0], color: '#8A8F98', accent: '#5A5F68',
      note: 'Older than the cabin. Much older.' },

    { name: 'Whitefish', rarity: 'common', seasons: ['winter'], kg: [0.4, 1.8], color: '#D8DEE6', accent: '#9AA6B4',
      note: 'Hard to see against the snow light.' },
    { name: 'Smelt', rarity: 'common', seasons: ['winter'], kg: [0.05, 0.2], color: '#C4D6DE', accent: '#6E9AAA',
      note: 'Tiny, silvery, smells faintly of cucumber.' },
    { name: 'Arctic Char', rarity: 'uncommon', seasons: ['winter'], kg: [1.0, 4.0], color: '#6E7F96', accent: '#F28A5A',
      note: 'Cold-water jewel with a sunset belly.' },
    { name: 'Burbot', rarity: 'rare', seasons: ['winter'], kg: [1.0, 5.0], color: '#6B6A4E', accent: '#B5AE7A',
      night: true, note: 'Only bites on the darkest, coziest days.' },
    { name: 'Aurora Koi', rarity: 'legendary', seasons: ['winter'], kg: [2.0, 5.0], color: '#9FE3E0', accent: '#C7A3F2',
      night: true, note: 'Its scales shimmer like northern lights.' },
  ];
  FISH.forEach((fish) => {
    fish.difficulty = RARITY[fish.rarity].difficulty;
  });

  /** Night fish bite 3x as often after dark; rare and legendary fish 1.5x as often in the rain. */
  function biteWeight(fish, night, rain) {
    const rainy = rain > 0.5 && (fish.rarity === 'rare' || fish.rarity === 'legendary') ? 1.5 : 1;
    return RARITY[fish.rarity].weight * (fish.night && night > 0.6 ? 3 : 1) * rainy;
  }

  const fishBook = {
    caught(fish) {
      return progress.get('fish_' + fish.name);
    },
    best(fish) {
      return Cozy.store.get('fishBest', {})[fish.name] || 0;
    },
    /** Returns true if this is a new personal best. */
    record(fish, kg) {
      const bests = Cozy.store.get('fishBest', {});
      const isBest = kg > (bests[fish.name] || 0);
      if (isBest) {
        bests[fish.name] = kg;
        Cozy.store.set('fishBest', bests);
      }
      return isBest;
    },
    speciesCount() {
      return FISH.filter((fish) => this.caught(fish) > 0).length;
    },
    inSeason(season) {
      return FISH.filter((fish) => fish.seasons.includes(season));
    },
  };

  function seasonList(fish) {
    const when = fish.seasons.length === 4 ? 'all year' : fish.seasons.map((id) => Cozy.season.name(id)).join(' & ');
    return fish.night ? `${when} · loves night` : when;
  }

  function createFishing(game) {
    const { world } = game;
    const places = world.places;
    const scene = world.scene;
    const els = {
      hint: ui.el('fish-hint'),
      bars: ui.el('fish-bars'),
      progress: ui.el('fish-progress'),
      tension: ui.el('fish-tension'),
      count: ui.el('fish-count'),
      journal: ui.el('fish-journal'),
      list: ui.el('fish-list'),
    };
    let showJournal = false;

    const bobber = new THREE.Group();
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), Cozy.world.material('#E4473C'));
    const bottom = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), Cozy.world.material('#FAF5EC'));
    bobber.add(top, bottom);
    scene.add(bobber);

    const lineSegments = 24;
    const lineGeometry = new THREE.BufferGeometry();
    lineGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array((lineSegments + 1) * 3), 3));
    const line = new THREE.Line(lineGeometry, new THREE.LineBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.7 }));
    line.frustumCulled = false;
    scene.add(line);

    const state = {
      mode: 'idle', timer: 0, castT: 0, castFrom: new THREE.Vector3(), castPoint: new THREE.Vector3(),
      dip: 0, nibbles: 0, nibbling: false, fish: null, progress: 0, tension: 0, seed: 0, reelStart: new THREE.Vector3(),
      message: 'Click or Space to cast', jumping: null,
    };

    const hangPosition = (time) => places.rodTip.clone().add(new THREE.Vector3(0, -0.6, Math.sin(time * 1.3) * 0.03));
    bobber.position.copy(hangPosition(0));

    function pickFish() {
      const pool = fishBook.inSeason(Cozy.season.current());
      const night = world.night;
      const rain = world.rain;
      const total = pool.reduce((sum, fish) => sum + biteWeight(fish, night, rain), 0);
      let roll = Math.random() * total;
      for (const fish of pool) {
        roll -= biteWeight(fish, night, rain);
        if (roll <= 0) {
          return fish;
        }
      }
      return pool[pool.length - 1];
    }

    function renderJournal() {
      const season = Cozy.season.current();
      els.list.innerHTML = '';
      for (const fish of FISH) {
        const caught = fishBook.caught(fish);
        const row = document.createElement('div');
        row.className = 'fish-row' + (fish.seasons.includes(season) ? ' in-season' : '');
        const swatch = document.createElement('span');
        swatch.className = 'fish-swatch';
        swatch.style.background = caught ? `linear-gradient(90deg, ${fish.color} 60%, ${fish.accent} 60%)` : 'rgba(255,245,225,0.15)';
        const name = document.createElement('span');
        name.className = 'fish-name';
        const stars = RARITY[fish.rarity].stars;
        name.textContent = caught ? `${fish.name} ${stars}` : `? ? ?  ${stars}`;
        name.title = caught ? fish.note : `${RARITY[fish.rarity].label} · ${seasonList(fish)}`;
        const info = document.createElement('span');
        info.className = 'fish-info';
        info.textContent = caught
          ? `×${caught} · best ${fishBook.best(fish).toFixed(2)} kg`
          : seasonList(fish);
        row.append(swatch, name, info);
        els.list.appendChild(row);
      }
      ui.setText(ui.el('fish-journal-title'), `Fish journal  ${fishBook.speciesCount()}/${FISH.length}`);
      ui.setText(ui.el('fish-journal-sub'), `${Cozy.season.name()} · highlighted fish are biting now`);
    }

    function finish(message, hold) {
      sound.stopReel();
      state.mode = 'result';
      state.timer = hold || 1.8;
      state.message = message;
      state.nibbling = false;
    }

    function startCast() {
      state.mode = 'casting';
      state.castT = 0;
      state.message = '';
      state.castFrom.copy(bobber.position);
      const distance = Cozy.rand(3, 7);
      state.castPoint.copy(places.rodTip).addScaledVector(places.castDirection, distance);
      state.castPoint.y = 0;
      sound.whoosh();
    }

    function jumpFish(fish) {
      const kg = state.caughtKg || fish.kg[0];
      // bigger fish look bigger: scale 0.8..1.6 across the species' weight range
      const size = 0.8 + 0.8 * Cozy.clamp01((kg - fish.kg[0]) / Math.max(0.01, fish.kg[1] - fish.kg[0]));
      const group = new THREE.Group();
      const bodyMesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 1), Cozy.world.material(fish.color, { roughness: 0.4 }));
      bodyMesh.scale.set(0.12, 0.09, 0.26);
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.14, 4), Cozy.world.material(fish.accent));
      tail.rotation.x = -Math.PI / 2;
      tail.position.z = -0.16;
      const fin = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.09, 3), Cozy.world.material(fish.accent));
      fin.position.set(0, 0.06, 0.01);
      group.add(bodyMesh, tail, fin);
      group.scale.setScalar(size);
      group.position.copy(bobber.position);
      scene.add(group);
      state.jumping = { group, t: 0, from: bobber.position.clone(), to: places.playerSpot.clone().add(new THREE.Vector3(0, 0.9, 0)) };
      if (fish.rarity === 'legendary' || fish.rarity === 'rare') {
        const sparkle = fish.rarity === 'legendary' ? '#FFE9A8' : '#E8FAFF';
        Cozy.world.FX.splash(bobber.position.clone().add(new THREE.Vector3(0, 0.3, 0)), fish.rarity === 'legendary' ? 30 : 14, sparkle);
      }
    }

    /** Records a catch (journal, pantry, stats), plays the jump + sounds and returns the weight. */
    function landFish(fish) {
      const kg = Cozy.rand(fish.kg[0], fish.kg[1]);
      const isNewSpecies = fishBook.caught(fish) === 0;
      progress.add('fish');
      progress.add('fish_' + fish.name);
      Cozy.pantry.add('fish', fish.name);
      const isBest = fishBook.record(fish, kg);
      sound.jingle();
      if (fish.rarity === 'legendary') {
        sound.softChime();
      }
      Cozy.world.FX.splash(bobber.position, 20);
      state.caughtKg = kg;
      jumpFish(fish);
      Cozy.events.emit('catch', fish);
      if (isNewSpecies) {
        ui.toast(`New species: ${fish.name} (${RARITY[fish.rarity].label}). "${fish.note}"  Journal ${fishBook.speciesCount()}/${FISH.length}`, 6);
      } else if (isBest) {
        ui.toast(`New personal best for ${fish.name}: ${kg.toFixed(2)} kg!`, 4);
      }
      if (showJournal) {
        renderJournal();
      }
      return kg;
    }

    // ---- desk mode: the line stays in the water while you work; a nibble pings you, one click lands it
    const DESK_BITE_SECONDS = 12;
    const deskNibbleOverride = Number(new URLSearchParams(window.location.search).get('desknibble')) || 0;
    const desk = { timer: 0, biteLeft: 0 };
    const nextNibble = () => deskNibbleOverride || Cozy.rand(45, 120) * (1 - 0.4 * world.rain);

    const activity = {
      id: 'fishing', name: 'Fishing', key: 1,
      station: places.playerSpot, focus: places.playerSpot, from: places.fishingFrom, distance: 9, pitch: 0.42,
      hint: 'Cast, wait for the big dip, then hold to reel.',

      enter() {
        state.mode = 'idle';
        state.message = 'Click or Space to cast';
        showJournal = false;
        ui.show(els.journal, false);
      },

      exit() {
        sound.stopReel();
        state.mode = 'idle';
        showJournal = false;
        ui.show(els.journal, false);
      },

      /** Desk mode: keep a lazy line in the water (on) or reel it back in (off). */
      setDesk(on) {
        sound.stopReel();
        if (on) {
          state.mode = 'desk';
          state.castPoint.copy(places.rodTip).addScaledVector(places.castDirection, 4.5);
          state.castPoint.y = 0;
          desk.timer = nextNibble();
          desk.biteLeft = 0;
        } else if (state.mode === 'desk' || state.mode === 'deskBite') {
          state.mode = 'idle';
        }
      },

      deskStatus() {
        return { biting: state.mode === 'deskBite', secondsLeft: Math.max(0, desk.biteLeft), nextIn: desk.timer };
      },

      /** One click while something nibbles: land it. Returns { fish, kg } or null. */
      deskReel() {
        if (state.mode !== 'deskBite') {
          return null;
        }
        const fish = state.fish;
        const kg = landFish(fish);
        progress.add('desk_catches');
        state.mode = 'desk';
        desk.timer = nextNibble();
        return { fish, kg };
      },

      update(dt, time, active) {
        const input = game.input;
        const pressed = active && input.primaryPressed;
        const held = active && input.primaryHeld;
        if (active && input.pressed('KeyJ')) {
          showJournal = !showJournal;
          if (showJournal) {
            renderJournal();
          }
          ui.show(els.journal, showJournal);
        }
        state.dip *= Math.max(0, 1 - dt * 3);
        const waveAt = (p) => Cozy.world.waveHeight(p.x, p.z, time);

        switch (state.mode) {
          case 'idle':
            bobber.position.lerp(hangPosition(time), Math.min(1, dt * 6));
            if (pressed) {
              startCast();
            }
            break;

          case 'casting': {
            state.castT = Math.min(1, state.castT + dt / 0.9);
            const p = state.castFrom.clone().lerp(state.castPoint, state.castT);
            p.y += Math.sin(state.castT * Math.PI) * 2.5;
            bobber.position.copy(p);
            if (state.castT >= 1) {
              sound.plop(1);
              Cozy.world.FX.ripple(state.castPoint, 1);
              Cozy.world.FX.splash(state.castPoint, 10);
              state.dip = -0.12;
              state.mode = 'waiting';
              state.timer = Cozy.rand(2, 6) * (1 - 0.4 * world.rain);  // fish bite sooner in the rain
              state.nibbles = Math.floor(Math.random() * 4);
              state.message = 'Waiting... (click to reel in)';
            }
            break;
          }

          case 'waiting':
          case 'bite': {
            const shake = state.mode === 'bite' ? Math.sin(time * 40) * 0.03 : 0;
            bobber.position.set(state.castPoint.x + shake, waveAt(state.castPoint) + state.dip + Math.sin(time * 2.1) * 0.01, state.castPoint.z);
            state.timer -= dt;
            if (state.mode === 'waiting') {
              if (pressed) {
                finish(state.nibbling ? 'Too early! It was only nibbling.' : 'Reeled in... nothing yet.');
                break;
              }
              if (state.timer <= 0) {
                if (state.nibbles > 0) {
                  state.nibbles--;
                  state.nibbling = true;
                  state.dip = -0.05;
                  state.timer = Cozy.rand(0.7, 1.8);
                  sound.tick(0.06, 1400);
                  Cozy.world.FX.ripple(state.castPoint, 0.4);
                } else {
                  state.mode = 'bite';
                  state.timer = 1.1;
                  state.fish = pickFish();
                  state.dip = -0.35;
                  state.message = 'Bite! Click now!';
                  sound.splash(1);
                  Cozy.events.emit('bite', state.fish);
                  Cozy.world.FX.splash(state.castPoint, 16);
                  Cozy.world.FX.ripple(state.castPoint, 1.4);
                }
              }
            } else if (pressed) {
              state.mode = 'reeling';
              state.progress = 0.15;
              state.tension = 0.2;
              state.seed = Math.random() * 100;
              state.reelStart.copy(state.castPoint);
              state.message = 'Hold to reel - let go when the line gets tight!';
            } else if (state.timer <= 0) {
              finish('It got away...');
            }
            break;
          }

          case 'reeling': {
            const difficulty = state.fish.difficulty;
            const perlin = Cozy.clamp01(0.5 + 0.75 * Cozy.noise2(time * (0.8 + difficulty * 1.5), state.seed));
            const surge = Cozy.clamp01(perlin * 1.6 - 0.5);
            if (held) {
              state.progress += 0.22 * (1 - 0.5 * difficulty) * dt;
              state.tension += (0.55 + 0.6 * difficulty * surge * 2) * dt;
              if (!sound.loops.reel) {
                sound.startReel(0.07);
              }
            } else {
              state.progress -= (0.04 + surge * difficulty * 0.1) * dt;
              state.tension -= 0.9 * dt;
              sound.stopReel();
            }
            state.progress = Math.max(0, state.progress);
            state.tension = Cozy.clamp01(state.tension);
            if (state.tension >= 1) {
              sound.snap();
              finish('Snap! The line broke.');
              break;
            }
            if (state.progress >= 1) {
              const fish = state.fish;
              const kg = landFish(fish);
              finish(`You caught a ${kg.toFixed(2)} kg ${fish.name}! ${RARITY[fish.rarity].stars}`.trim(), 3.2);
              break;
            }
            const landing = hangPosition(time);
            landing.y = 0;
            const target = state.reelStart.clone().lerp(landing, state.progress);
            const thrashX = (Cozy.noise2(time * 6, state.seed + 3)) * surge * 0.6;
            const thrashZ = (Cozy.noise2(time * 6, state.seed + 7)) * surge * 0.6;
            bobber.position.set(target.x + thrashX, waveAt(target) + state.dip - surge * 0.08, target.z + thrashZ);
            if (surge > 0.7 && Math.random() < dt * 3) {
              Cozy.world.FX.splash(bobber.position, 4);
            }
            break;
          }

          case 'desk':
          case 'deskBite': {
            const biting = state.mode === 'deskBite';
            const shake = biting ? Math.sin(time * 40) * 0.03 : 0;
            bobber.position.set(state.castPoint.x + shake, waveAt(state.castPoint) + state.dip + Math.sin(time * 2.1) * 0.01, state.castPoint.z);
            if (!biting) {
              desk.timer -= dt;
              if (desk.timer <= 0) {
                state.mode = 'deskBite';
                state.fish = pickFish();
                desk.biteLeft = DESK_BITE_SECONDS;
                state.dip = -0.3;
                sound.splash(0.6);
                Cozy.world.FX.splash(state.castPoint, 10);
                Cozy.world.FX.ripple(state.castPoint, 1.2);
                Cozy.events.emit('bite', state.fish);
                Cozy.events.emit('deskBite', state.fish);
              }
            } else {
              desk.biteLeft -= dt;
              if (Math.random() < dt * 1.5) {
                state.dip = -0.2;
                Cozy.world.FX.ripple(state.castPoint, 0.6);
                sound.tick(0.04, 1200);
              }
              if (desk.biteLeft <= 0) {
                state.mode = 'desk';
                desk.timer = nextNibble();
                Cozy.events.emit('deskMissed', state.fish);
              }
            }
            break;
          }

          case 'result':
            bobber.position.lerp(hangPosition(time), Math.min(1, dt * 6));
            state.timer -= dt;
            if (state.timer <= 0) {
              state.mode = 'idle';
              state.message = 'Click or Space to cast';
            }
            break;
        }

        if (state.jumping) {
          const jump = state.jumping;
          jump.t += dt / 1.1;
          const p = jump.from.clone().lerp(jump.to, Math.min(1, jump.t));
          p.y += Math.sin(Math.min(1, jump.t) * Math.PI) * 1.4;
          jump.group.position.copy(p);
          jump.group.rotation.x = -jump.t * Math.PI * 2;
          jump.group.rotation.y = Math.atan2(jump.to.x - jump.from.x, jump.to.z - jump.from.z);
          if (jump.t >= 1.2) {
            scene.remove(jump.group);
            state.jumping = null;
          }
        }

        // sagging line
        const a = places.rodTip;
        const b = bobber.position;
        const slack = state.mode === 'reeling' ? 1 - state.tension : (state.mode === 'idle' || state.mode === 'result' ? 0.1 : 1);
        const sag = 0.6 * slack * Math.min(1, a.distanceTo(b) / 5);
        const control = a.clone().add(b).multiplyScalar(0.5);
        control.y -= sag * 2;
        const positions = lineGeometry.attributes.position;
        for (let i = 0; i <= lineSegments; i++) {
          const t = i / lineSegments;
          const u = 1 - t;
          positions.setXYZ(i,
            u * u * a.x + 2 * u * t * control.x + t * t * b.x,
            u * u * a.y + 2 * u * t * control.y + t * t * b.y,
            u * u * a.z + 2 * u * t * control.z + t * t * b.z);
        }
        positions.needsUpdate = true;

        if (active) {
          ui.setText(els.hint, state.message);
          ui.show(els.bars, state.mode === 'reeling');
          ui.bar(els.progress, state.progress);
          ui.bar(els.tension, state.tension);
          els.tension.style.background = `hsl(${Math.round(40 - state.tension * 35)}, 80%, ${Math.round(70 - state.tension * 12)}%)`;
          const season = Cozy.season.current();
          const biting = fishBook.inSeason(season);
          const newHere = biting.filter((fish) => fishBook.caught(fish) === 0).length;
          // two short rows: your progress, then what is biting right now
          ui.setText(els.count,
            `Caught ${progress.get('fish')} · Journal ${fishBook.speciesCount()}/${FISH.length}\n`
            + `${Cozy.season.name()}: ${biting.length} kinds biting`
            + `${newHere ? `, ${newHere} new to you` : ''}`
            + `${world.rain > 0.5 ? ' · rain brings quicker bites' : ''}`);
        }
      },
    };
    return activity;
  }

  // ================================================================== 2. Garden

  function createGarden(game) {
    const places = game.world.places;
    const beds = new BedSet(game, places.gardenPlots, 'garden', 0);
    const els = { title: ui.el('garden-seed'), sub: ui.el('garden-sub'), thirsty: ui.el('garden-thirsty'), bar: ui.el('garden-water') };
    let rainCheck = 0;

    /** Rain waters your own garden (even while you're busy elsewhere on the island). */
    function rainWatering(dt) {
      rainCheck -= dt;
      if (rainCheck > 0 || game.world.rain < 0.6 || (game.world.seasonLook && game.world.seasonLook.snow)) {
        return;
      }
      rainCheck = 3;
      const now = beds.clock();
      let watered = 0;
      for (const bed of beds.beds) {
        if (bed.model.stage(now) === 'thirsty') {
          bed.model.water(now);
          watered++;
          Cozy.world.FX.splash(bed.visual.root.position.clone().add(new THREE.Vector3(0, 0.5, 0)), 5, '#9FD4FF');
        }
      }
      if (watered) {
        ui.toast(watered === 1 ? 'The rain watered a thirsty plant in your garden.' : `The rain watered ${watered} plants in your garden.`, 4);
      }
    }

    return {
      id: 'garden', name: 'Garden', key: 2,
      station: places.gardenCenter, focus: places.gardenCenter, from: null, distance: 8, pitch: 0.8,
      hint: 'Plant something now - it grows while you work.',
      beds,
      enter() {},
      exit() {
        beds.stopSounds();
      },
      update(dt, time, active) {
        beds.updateVisuals(time);
        rainWatering(dt);
        if (!active) {
          return;
        }
        const hovered = beds.interact(dt, true, true);
        ui.tooltip(hovered ? beds.status(hovered, true, true) : null);
        const label = beds.seedLabel();
        ui.setText(els.title, label.title);
        ui.setText(els.sub, label.sub);
        const thirsty = beds.thirstyCount();
        ui.setText(els.thirsty, thirsty === 0 ? '' : thirsty === 1 ? '1 plant is thirsty' : `${thirsty} plants are thirsty`);
        ui.show(els.bar.parentElement, beds.wateringProgress > 0.01);
        ui.bar(els.bar, beds.wateringProgress);
      },
    };
  }

  // ================================================================== 3. Tea porch + guided breathing

  const TEAS = [
    { name: 'Chamomile', mood: 'unwind', phases: [4, 7, 8, 0], cycles: 4, color: 'rgba(242, 204, 115, 0.55)' },
    { name: 'Green tea', mood: 'refocus', phases: [4, 4, 4, 4], cycles: 4, color: 'rgba(158, 209, 115, 0.55)' },
    { name: 'Peppermint', mood: 'fresh air', phases: [4, 2, 6, 0], cycles: 5, color: 'rgba(140, 219, 184, 0.55)' },
  ];
  const PHASE_LABELS = ['Breathe in', 'Hold', 'Breathe out', 'Hold'];

  function createTea(game) {
    const places = game.world.places;
    const els = {
      panel: ui.el('tea-panel'), title: ui.el('tea-title'), sub: ui.el('tea-sub'), bar: ui.el('tea-heat'),
      breath: ui.el('breath'), circle: ui.el('breath-circle'), label: ui.el('breath-label'),
      count: ui.el('breath-count'), cycle: ui.el('breath-cycle'),
    };
    const s = { step: 'choose', tea: 0, timer: 0, phase: 0, phaseTimer: 0, cycle: 0, scale: 0.35, sips: 0, startTime: 0, steamTimer: 0 };

    const startPhase = () => {
      const tea = TEAS[s.tea];
      if (tea.phases[s.phase] <= 0) {
        return;
      }
      if (s.phase === 0) {
        sound.bowl(196);
      } else if (s.phase === 2) {
        sound.bowl(147);
      }
    };

    return {
      id: 'tea', name: 'Tea Porch', key: 3,
      station: places.teaSpot, focus: places.teaSpot, from: places.teaFrom, distance: 6, pitch: 0.55,
      hint: 'Pick a tea, then breathe along while it steeps.',
      enter() {
        s.step = 'choose';
      },
      exit() {
        sound.stopLoop('kettle');
        ui.show(els.breath, false);
      },
      update(dt, time, active) {
        const input = game.input;
        const pressed = active && input.primaryPressed;
        s.steamTimer -= dt;
        const steamSource = s.step === 'heating' ? places.kettle : (s.step === 'steeping' || s.step === 'ready') ? places.cup : null;
        if (steamSource && s.steamTimer <= 0) {
          s.steamTimer = s.step === 'heating' ? 0.12 + 0.4 * (1 - s.timer / 6) : 0.35;
          Cozy.world.FX.puff(steamSource.clone().add(new THREE.Vector3(Cozy.rand(-0.03, 0.03), 0, Cozy.rand(-0.03, 0.03))), '#FFFFFF', 0.35);
        }
        if (!active) {
          return;
        }
        const tea = TEAS[s.tea];
        switch (s.step) {
          case 'choose':
            if (input.pressed('KeyQ')) {
              s.tea = (s.tea + TEAS.length - 1) % TEAS.length;
            }
            if (input.pressed('KeyE')) {
              s.tea = (s.tea + 1) % TEAS.length;
            }
            if (pressed) {
              s.step = 'heating';
              s.timer = 0;
              sound.startLoop('kettle');
            }
            break;
          case 'heating':
            s.timer += dt;
            sound.setLoopPitch('kettle', 220 + s.timer * 80);
            if (s.timer >= 6) {
              sound.stopLoop('kettle');
              sound.startLoop('pour');
              setTimeout(() => sound.stopLoop('pour'), 1300);
              s.step = 'steeping';
              s.phase = 0;
              s.phaseTimer = 0;
              s.cycle = 0;
              s.startTime = time;
              startPhase();
            }
            break;
          case 'steeping': {
            if (pressed) {
              s.step = 'ready';
              s.sips = 3;
              break;
            }
            s.phaseTimer += dt;
            let guard = 0;
            while (s.phaseTimer >= tea.phases[s.phase] && guard++ < 8) {
              s.phaseTimer -= tea.phases[s.phase];
              s.phase++;
              if (s.phase >= 4) {
                s.phase = 0;
                s.cycle++;
                if (s.cycle >= tea.cycles) {
                  s.step = 'ready';
                  s.sips = 3;
                  break;
                }
              }
              startPhase();
            }
            const duration = tea.phases[s.phase];
            const t = duration > 0 ? s.phaseTimer / duration : 1;
            const eased = 0.5 - 0.5 * Math.cos(t * Math.PI);
            const from = [0.35, 1, 1, 0.35][s.phase];
            const to = [1, 1, 0.35, 0.35][s.phase];
            s.scale = from + (to - from) * eased;
            break;
          }
          case 'ready':
            if (pressed) {
              sound.sip();
              s.sips--;
              if (s.sips <= 0) {
                s.step = 'done';
                progress.add('tea_cups');
                progress.add('mindful_seconds', Math.round(time - s.startTime));
              }
            }
            break;
          case 'done':
            if (pressed) {
              s.step = 'choose';
            }
            break;
        }

        // HUD
        const breathing = s.step === 'steeping';
        ui.show(els.breath, breathing);
        ui.show(els.panel, !breathing);
        ui.show(els.bar.parentElement, s.step === 'heating');
        if (breathing) {
          const duration = tea.phases[s.phase];
          els.circle.style.transform = `scale(${s.scale.toFixed(3)})`;
          els.circle.style.background = tea.color;
          ui.setText(els.label, PHASE_LABELS[s.phase]);
          ui.setText(els.count, String(Math.max(1, Math.ceil(duration - s.phaseTimer))));
          ui.setText(els.cycle, `Breath ${s.cycle + 1} of ${tea.cycles} · click to skip`);
        } else {
          const rhythm = tea.phases.filter((p, i) => p > 0 || i < 3).join('-');
          const texts = {
            choose: [`Q  ‹  ${tea.name}  ›  E`, `${tea.mood} · ${rhythm} breathing · click to brew`],
            heating: ['Warming the kettle...', 'listen to it hum'],
            ready: [`Your ${tea.name} is ready`, `click to sip (${s.sips})`],
            done: ['Ahh.', `${progress.get('tea_cups')} cups so far · click to brew another`],
          }[s.step];
          ui.setText(els.title, texts[0]);
          ui.setText(els.sub, texts[1]);
          ui.bar(els.bar, s.timer / 6);
        }
      },
    };
  }

  // ================================================================== 4. Birdwatching

  // `seasons` limits a bird to part of the year (omitted = all year); `night` birds only come after dark.
  const BIRDS = [
    { name: 'Sparrow', body: '#94734F', accent: '#DCC7A5', weight: 8, size: 0.9 },
    { name: 'Robin', body: '#80664F', accent: '#F27F40', weight: 6, size: 1 },
    { name: 'Blue Tit', body: '#598CD9', accent: '#FFE05A', weight: 5, size: 0.85 },
    { name: 'Goldfinch', body: '#FFD940', accent: '#262020', weight: 3, size: 0.85 },
    { name: 'Cardinal', body: '#D92626', accent: '#8C1419', weight: 2, size: 1.1 },
    { name: 'Kingfisher', body: '#1A99BF', accent: '#F28C33', weight: 0.5, size: 1 },
    { name: 'Barn Swallow', body: '#2B3A67', accent: '#C8553D', weight: 4, size: 0.9, seasons: ['spring', 'summer'] },
    { name: 'Hummingbird', body: '#3FA34D', accent: '#C2185B', weight: 2, size: 0.6, seasons: ['summer'] },
    { name: 'Blue Jay', body: '#3D6FC4', accent: '#F0F0F0', weight: 3, size: 1.15, seasons: ['autumn'] },
    { name: 'Waxwing', body: '#B59A7A', accent: '#F5D547', weight: 3, size: 0.95, seasons: ['autumn', 'winter'] },
    { name: 'Snow Bunting', body: '#F2F2F2', accent: '#8C6A4F', weight: 4, size: 0.9, seasons: ['winter'] },
    { name: 'Barn Owl', body: '#D9B98C', accent: '#FFF6E8', weight: 1, size: 1.6, night: true },
  ];
  const BIRD_SEASON_NAMES = { spring: 'spring', summer: 'summer', autumn: 'autumn', winter: 'winter' };

  function birdIsAround(bird, season, night) {
    if (!!bird.night !== night) {
      return false;
    }
    return !bird.seasons || bird.seasons.includes(season);
  }

  function birdWhen(bird) {
    const parts = [];
    if (bird.seasons) {
      parts.push(bird.seasons.map((season) => BIRD_SEASON_NAMES[season]).join(' & '));
    }
    if (bird.night) {
      parts.push('after dark');
    }
    return parts.length ? parts.join(', ') : 'all year, by day';
  }

  function createBirds(game) {
    const { world } = game;
    const places = world.places;
    const scene = world.scene;
    const els = { hint: ui.el('bird-hint'), journal: ui.el('bird-journal'), list: ui.el('bird-list'), flash: ui.el('flash') };
    const birds = [];
    let nextSpawn = 2;
    let showJournal = false;

    const seenCount = () => BIRDS.filter((b) => progress.get('bird_' + b.name) > 0).length;

    const isNight = () => world.night > 0.6;

    /** Birds that visit right now (season + day/night). */
    function birdsAround() {
      const season = Cozy.season.current();
      return BIRDS.filter((b) => birdIsAround(b, season, isNight()));
    }

    function pickSpecies() {
      const around = birdsAround();
      const total = around.reduce((sum, b) => sum + b.weight, 0);
      let roll = Math.random() * total;
      for (const b of around) {
        roll -= b.weight;
        if (roll <= 0) {
          return b;
        }
      }
      return around[0];
    }

    function spawn() {
      if (birds.length >= (isNight() ? 1 : 4)) {
        return;
      }
      const free = places.perches.filter((perch) => !birds.some((b) => b.perch === perch && b.mode !== 'leaving'));
      if (free.length === 0) {
        return;
      }
      const perch = Cozy.randomFrom(free);
      const species = pickSpecies();
      const model = Cozy.world.buildBirdModel(species);
      const angle = Math.random() * Math.PI * 2;
      const from = perch.clone().add(new THREE.Vector3(Math.cos(angle) * 18, 6, Math.sin(angle) * 18));
      model.group.position.copy(from);
      scene.add(model.group);
      const bird = { species, model, perch, mode: 'arriving', yaw: 0, targetYaw: 0, nextAction: 0, action: -1, actionTime: 0, nextSong: 0, stayUntil: 0 };
      startFlight(bird, from, perch.clone());
      birds.push(bird);
    }

    function startFlight(bird, from, to) {
      bird.from = from;
      bird.to = to;
      bird.t = 0;
      const distance = from.distanceTo(to);
      bird.duration = Math.min(4, Math.max(1.2, distance / 6));
      bird.control = from.clone().add(to).multiplyScalar(0.5).add(new THREE.Vector3(0, Math.max(1.5, distance * 0.25), 0));
    }

    function bezier(bird, t) {
      const u = 1 - t;
      return bird.from.clone().multiplyScalar(u * u).add(bird.control.clone().multiplyScalar(2 * u * t)).add(bird.to.clone().multiplyScalar(t * t));
    }

    function panFor(position) {
      const projected = position.clone().project(world.camera);
      return Math.max(-0.9, Math.min(0.9, projected.x));
    }

    function photograph(bird) {
      sound.shutter();
      els.flash.classList.remove('go');
      void els.flash.offsetWidth;
      els.flash.classList.add('go');
      const key = 'bird_' + bird.species.name;
      const first = progress.get(key) === 0;
      progress.add(key);
      progress.add('photos');
      ui.toast(first
        ? `New species! ${bird.species.name} added to your journal (${seenCount()}/${BIRDS.length})`
        : `Lovely shot of a ${bird.species.name}.`, first ? 5 : 3);
    }

    function renderJournal() {
      els.list.innerHTML = '';
      const around = birdsAround();
      for (const b of BIRDS) {
        const photos = progress.get('bird_' + b.name);
        const row = document.createElement('div');
        row.className = around.includes(b) ? 'row in-season' : 'row';
        const when = around.includes(b) ? 'around now' : birdWhen(b);
        row.textContent = photos > 0
          ? `${b.name}  ·  ${photos} photo${photos === 1 ? '' : 's'}  ·  ${when}`
          : `? ? ?  ·  ${when}`;
        els.list.appendChild(row);
      }
      ui.setText(ui.el('bird-journal-title'), `Bird journal  ${seenCount()}/${BIRDS.length}`);
    }

    return {
      id: 'birds', name: 'Birdwatching', key: 4,
      station: places.feederSpot, focus: places.feederSpot, from: places.birdFrom, distance: 5, pitch: 0.26,
      hint: 'Sit still... click a bird to take its photo. J opens your bird journal.',
      enter() {},
      exit() {
        showJournal = false;
        ui.show(els.journal, false);
      },
      update(dt, time, active) {
        nextSpawn -= dt;
        if (nextSpawn <= 0) {
          // birds shelter from the rain, so visits are rarer while it pours
          nextSpawn = Cozy.rand(4, 12) * (1 + 1.5 * world.rain);
          spawn();
        }
        for (let i = birds.length - 1; i >= 0; i--) {
          const bird = birds[i];
          const group = bird.model.group;
          if (bird.mode === 'perched') {
            if (time >= bird.nextAction) {
              bird.action = Math.floor(Math.random() * 3);
              bird.actionTime = 0;
              if (bird.action !== 1) {
                bird.targetYaw += Cozy.rand(-1.2, 1.2);
              }
              bird.nextAction = time + Cozy.rand(1.5, 4);
            }
            bird.actionTime += dt;
            const hop = bird.action === 0 && bird.actionTime < 0.3 ? Math.sin(bird.actionTime / 0.3 * Math.PI) * 0.06 : 0;
            const peck = bird.action === 1 && bird.actionTime < 0.5 ? Math.sin(bird.actionTime / 0.5 * Math.PI) * 0.6 : 0;
            bird.yaw += (bird.targetYaw - bird.yaw) * Math.min(1, dt * 8);
            group.position.copy(bird.perch).add(new THREE.Vector3(0, hop, 0));
            group.rotation.set(peck, bird.yaw, 0, 'YXZ');
            if (time >= bird.nextSong) {
              if (bird.species.night) {
                bird.nextSong = time + Cozy.rand(9, 16);
                sound.owl();
              } else {
                bird.nextSong = time + Cozy.rand(4, 10);
                sound.birdSong(panFor(group.position), 0.07);
              }
            }
            if (time >= bird.stayUntil) {
              bird.mode = 'leaving';
              const angle = Math.random() * Math.PI * 2;
              startFlight(bird, group.position.clone(), group.position.clone().add(new THREE.Vector3(Math.cos(angle) * 20, 8, Math.sin(angle) * 20)));
            }
          } else {
            bird.t += dt / bird.duration;
            const t = Math.min(1, bird.t);
            const eased = bird.mode === 'arriving' ? 1 - (1 - t) * (1 - t) : t * t;
            const position = bezier(bird, eased);
            const ahead = bezier(bird, Math.min(1, eased + 0.02)).sub(position);
            if (ahead.x * ahead.x + ahead.z * ahead.z > 1e-6) {
              bird.yaw = Math.atan2(ahead.x, ahead.z);
              bird.targetYaw = bird.yaw;
            }
            group.position.copy(position);
            group.rotation.set(0, bird.yaw, 0);
            if (t >= 1) {
              if (bird.mode === 'arriving') {
                bird.mode = 'perched';
                bird.stayUntil = time + Cozy.rand(15, 35);
                bird.nextAction = time + Cozy.rand(1, 3);
                bird.nextSong = time + Cozy.rand(0.5, 3);
              } else {
                scene.remove(group);
                birds.splice(i, 1);
                continue;
              }
            }
          }
          const flap = bird.mode === 'perched' ? 1.25 : Math.sin(time * 26) * 0.95;
          bird.model.wingLeft.rotation.z = flap;
          bird.model.wingRight.rotation.z = -flap;
        }

        if (!active) {
          return;
        }
        if (game.input.pressed('KeyJ')) {
          showJournal = !showJournal;
          if (showJournal) {
            renderJournal();
          }
        }
        ui.show(els.journal, showJournal);
        const hit = game.pick(birds.map((b) => b.model.hit));
        const hovered = hit ? birds.find((b) => b.model.hit === hit.object) : null;
        ui.tooltip(hovered ? `${hovered.species.name} - click to photograph` : null);
        if (hovered && game.input.primaryPressed) {
          photograph(hovered);
          if (showJournal) {
            renderJournal();
          }
        }
        ui.setText(els.hint, `Click a bird to photograph · J journal (${seenCount()}/${BIRDS.length})`);
      },
    };
  }

  // ================================================================== 5. Sunset viewpoint: eye rest + stretches

  const STRETCHES = [
    ['Roll your shoulders back, slowly, five times', 12],
    ['Tilt your head to the left... hold... now to the right', 14],
    ['Arm out, palm forward, gently pull your fingers back. Swap hands.', 14],
    ['Interlace your fingers and reach up high', 10],
    ['Close your eyes. Three slow breaths.', 15],
  ];

  function createViewpoint(game) {
    const places = game.world.places;
    const els = { title: ui.el('view-title'), sub: ui.el('view-sub'), bar: ui.el('view-bar') };
    const s = { step: 'rest', timer: 0, index: 0 };
    return {
      id: 'viewpoint', name: 'Sunset Viewpoint', key: 5,
      station: places.viewpointSpot, focus: places.viewpointSpot, from: places.viewpointFrom, distance: 3.5, pitch: 0.12,
      hint: 'Let your eyes soften on the far mountains.',
      enter() {
        s.step = 'rest';
        s.timer = 0;
      },
      exit() {},
      update(dt, time, active) {
        if (!active) {
          return;
        }
        s.timer += dt;
        const pressed = game.input.primaryPressed;
        switch (s.step) {
          case 'rest':
            ui.setText(els.title, 'Look at the far horizon. Let your eyes soften.');
            ui.setText(els.sub, String(Math.max(1, Math.ceil(20 - s.timer))));
            ui.bar(els.bar, s.timer / 20);
            if (s.timer >= 20) {
              progress.add('eye_rests');
              sound.softChime();
              s.step = 'offer';
              s.timer = 0;
            }
            break;
          case 'offer':
            ui.setText(els.title, 'Eyes rested.');
            ui.setText(els.sub, 'Click for a one-minute stretch, or Esc to head back.');
            ui.bar(els.bar, 1);
            if (pressed) {
              s.step = 'stretch';
              s.index = 0;
              s.timer = 0;
              sound.bowl(220);
            }
            break;
          case 'stretch': {
            const [text, seconds] = STRETCHES[s.index];
            ui.setText(els.title, text);
            ui.setText(els.sub, `${s.index + 1} / ${STRETCHES.length} · click to skip`);
            ui.bar(els.bar, s.timer / seconds);
            if (s.timer >= seconds || pressed) {
              s.index++;
              s.timer = 0;
              if (s.index >= STRETCHES.length) {
                s.step = 'done';
                progress.add('stretch_sessions');
                sound.softChime();
              } else {
                sound.bowl(220);
              }
            }
            break;
          }
          case 'done':
            ui.setText(els.title, 'All done. Your shoulders say thanks.');
            ui.setText(els.sub, 'Click to rest your eyes again.');
            if (pressed) {
              s.step = 'rest';
              s.timer = 0;
            }
            break;
        }
      },
    };
  }

  // ================================================================== 6. Village homesteads (local preview)

  function createVillage(game) {
    const { world } = game;
    const online = Cozy.online;
    const homesteads = world.places.homesteads;
    const els = {
      title: ui.el('village-title'), sub: ui.el('village-sub'), panel: ui.el('village-panel'),
      panelTitle: ui.el('village-panel-title'), body: ui.el('village-panel-body'), close: ui.el('village-close'),
    };
    let claimed = Cozy.store.get('village.claimed', -1);   // offline claim; online uses the server
    let isOnline = false;
    let plots = [];   // latest server view of each homestead (online only)
    const name = () => Cozy.store.get('name', 'You');
    const bedSets = homesteads.map((h, i) => new BedSet(game, h.beds, `home.${i}`, i * 3.1));

    const makeHit = (position) => {
      const hit = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 6),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
      hit.position.copy(position);
      world.scene.add(hit);
      return hit;
    };
    const signHits = homesteads.map((h) => makeHit(h.sign));
    const mailboxHits = homesteads.map((h) => makeHit(h.mailbox));

    // a little wrapped present that sits on top of *your* mailbox while gifts are waiting
    const giftBoxes = homesteads.map((h) => {
      const box = new THREE.Group();
      box.add(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.18, 0.22), Cozy.world.material('#D9534F')));
      const ribbon = Cozy.world.material('#FFD866', { emissive: 0.3 });
      box.add(new THREE.Mesh(new THREE.BoxGeometry(0.235, 0.19, 0.05), ribbon));
      box.add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.19, 0.235), ribbon));
      const bow = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.018, 6, 10), ribbon);
      bow.position.y = 0.12;
      box.add(bow);
      box.position.copy(h.mailbox).add(new THREE.Vector3(0, 0.32, 0));
      box.visible = false;
      world.scene.add(box);
      return box;
    });

    // ---- visiting cats: a friend's cat naps by the mailbox for a while (everyone can see and pet her)
    const visitorCats = homesteads.map(() => null);
    const visitorMoods = homesteads.map(() => ({ look: 0, lookTarget: 0, lookTimer: 1, sleep: 0, nuzzle: 0, zzz: 0 }));
    let petCooldown = 0;
    let lastPetToast = 0;

    function visitAt(i) {
      const visit = isOnline && plots[i] ? plots[i].catVisit : null;
      return visit && visit.until > online.clock() ? visit : null;
    }

    function visitorCat(i) {
      if (!visitorCats[i]) {
        const model = Cozy.world.buildCatModel();
        model.root.position.copy(homesteads[i].catSpot);
        model.root.rotation.y = homesteads[i].catYaw;
        model.root.scale.setScalar(1.1);
        world.scene.add(model.root);
        visitorCats[i] = model;
      }
      return visitorCats[i];
    }

    function updateVisitorCats(dt, time) {
      petCooldown -= dt;
      homesteads.forEach((h, i) => {
        const visit = visitAt(i);
        if (!visit) {
          if (visitorCats[i]) {
            visitorCats[i].root.visible = false;
          }
          return;
        }
        const model = visitorCat(i);
        const mood = visitorMoods[i];
        model.root.visible = true;
        mood.nuzzle = Math.max(0, mood.nuzzle - dt);
        const sleepy = (world.night > 0.7 || world.rain > 0.6) && mood.nuzzle <= 0 ? 1 : 0;
        mood.sleep += (sleepy - mood.sleep) * Math.min(1, dt * 0.8);
        mood.lookTimer -= dt;
        if (mood.lookTimer <= 0) {
          mood.lookTimer = 2 + Math.random() * 4;
          mood.lookTarget = Cozy.rand(-0.8, 0.8);
        }
        mood.look += (mood.lookTarget - mood.look) * Math.min(1, dt * 3);
        const sleep = mood.sleep;
        model.body.position.y = -0.1 * sleep;
        model.body.scale.set(1 + 0.12 * sleep, 1 - 0.25 * sleep, 1 + 0.1 * sleep);
        model.head.rotation.y = mood.look * (1 - sleep);
        model.head.rotation.x = 0.55 * sleep + (mood.nuzzle > 0 ? Math.sin(time * 6) * 0.15 : 0);
        model.head.position.y = 0.36 - 0.12 * sleep;
        const closed = sleep > 0.5 || mood.nuzzle > 0 || (time + i) % 4 < 0.15;
        model.eyes.forEach((eye) => {
          eye.scale.y = closed ? 0.003 : 0.022;
        });
        model.tail.forEach((pivot, k) => {
          pivot.rotation.y = Math.sin(time * 1.6 - k * 0.6 + i) * 0.22 * (1 - sleep * 0.8) + 0.35 * sleep;
          pivot.rotation.x = k === 0 ? 0.35 - 0.3 * sleep : -0.05;
        });
        if (sleep > 0.8) {
          mood.zzz -= dt;
          if (mood.zzz <= 0) {
            mood.zzz = 1.6;
            Cozy.world.FX.puff(model.root.position.clone().add(new THREE.Vector3(0.05, 0.45, 0)), '#DDE6FF', 0.25);
          }
        }
      });
    }

    function petVisitor(i) {
      if (petCooldown > 0) {
        return;
      }
      petCooldown = 0.8;
      visitorMoods[i].nuzzle = 1.6;
      sound.purr(1.6);
      Cozy.world.FX.splash(homesteads[i].catSpot.clone().add(new THREE.Vector3(0, 0.6, 0)), 6, '#FF9EB5');
      online.act('petcat', { plot: i });
    }

    /** Keeps the local "Mochi is away" note in step with the server (e.g. after clearing the browser). */
    function syncOwnCat(snapshot) {
      snapshot.plots.forEach((plot, i) => {
        const visit = plot.catVisit;
        if (visit && visit.from === snapshot.you && visit.until > snapshot.serverNow && !catAway()) {
          Cozy.store.set(CAT_AWAY_KEY, { plot: i, host: plot.ownerName, at: visit.at, until: visit.until });
        }
      });
    }

    function catNews(snapshot, previous, mine) {
      snapshot.plots.forEach((plot, i) => {
        const visit = plot.catVisit;
        if (!visit || visit.until <= snapshot.serverNow) {
          return;
        }
        const before = previous && previous.plots[i] ? previous.plots[i].catVisit : null;
        const isNew = !before || before.at !== visit.at;
        if (visit.from === snapshot.you) {
          if (!previous) {
            return;
          }
          const petted = !isNew && visit.pets > before.pets && visit.lastPetBy && visit.lastPetBy !== snapshot.name;
          if (petted && performance.now() - lastPetToast > 15000) {
            lastPetToast = performance.now();
            ui.toast(`${visit.lastPetBy} is giving ${visit.cat} chin scratches at ${plot.ownerName}'s homestead.`, 4);
          }
        } else if (i === mine && isNew) {
          // also on arrival in the game: you may have been away when she came over
          sound.meow();
          ui.toast(previous
            ? `${visit.fromName}'s cat ${visit.cat} wandered over to nap by your mailbox! Give her a pet in the Village (6).`
            : `${visit.fromName}'s cat ${visit.cat} is napping by your mailbox. Give her a pet in the Village (6).`, 6);
        }
      });
    }

    function giftLabel(kind, item) {
      if (kind === 'crops') {
        return (seedById(item) || { name: item }).name;
      }
      if (kind === 'dishes') {
        return (RECIPES.find((recipe) => recipe.id === item) || { name: item }).name;
      }
      return item;
    }

    /** Everything in your pantry that can be wrapped, dishes first. */
    function giftOptions() {
      const pantry = Cozy.pantry.read();
      const options = [];
      for (const kind of ['dishes', 'fish', 'crops']) {
        for (const [key, count] of Object.entries(pantry[kind])) {
          if (count > 0) {
            options.push({ kind, key, count, label: giftLabel(kind, key) });
          }
        }
      }
      return options;
    }

    // floating name labels above signs
    const labels = homesteads.map(() => {
      const label = document.createElement('div');
      label.className = 'world-label';
      ui.el('labels').appendChild(label);
      return label;
    });

    els.close.addEventListener('click', () => ui.show(els.panel, false));

    // ------------------------------------------------------------ online wiring
    const isMember = (i) => (isOnline ? !!(plots[i] && plots[i].member) : i === claimed);
    const isOwner = (i) => (isOnline ? !!(plots[i] && plots[i].owner && plots[i].owner === online.snapshot.you) : i === claimed);
    const isLived = (i) => (isOnline ? !!(plots[i] && plots[i].owner) : i === claimed);

    function applySnapshot(snapshot, previous) {
      plots = snapshot.plots;
      const mine = plots.findIndex((p) => p.owner && p.owner === snapshot.you);
      claimed = mine;
      const gifts = snapshot.gifts || [];
      giftBoxes.forEach((box, i) => {
        box.visible = i === mine && gifts.length > 0;
      });
      if (previous && gifts.length > (previous.gifts || []).length) {
        const newest = gifts[gifts.length - 1];
        sound.jingle();
        ui.toast(`${newest.fromName} left you a present in your mailbox!`, 5);
      }
      syncOwnCat(snapshot);
      catNews(snapshot, previous, mine);
      plots.forEach((plot, i) => {
        bedSets[i].beds.forEach((bed, j) => {
          if (bed.pendingUntil && performance.now() < bed.pendingUntil) {
            return;
          }
          const remote = plot.beds[j];
          const before = { seedId: bed.model.seedId, waterEnds: bed.model.waterEnds };
          bed.model.applyRemote(remote);
          if (!previous) {
            return;
          }
          // someone else changed this bed: show it happening
          const spot = bed.visual.root.position.clone();
          if (remote.seedId && remote.seedId !== before.seedId) {
            Cozy.world.FX.puff(spot.clone().add(new THREE.Vector3(0, 0.1, 0)), '#B89A7A', 0.2);
          } else if (remote.waterEnds > before.waterEnds + 5000 && remote.seedId) {
            Cozy.world.FX.splash(spot.clone().add(new THREE.Vector3(0, 0.6, 0)), 6, '#9FD4FF');
            if (plot.member && remote.wateredBy && remote.wateredBy !== snapshot.name) {
              ui.toast(`${remote.wateredBy} watered the ${(seedById(remote.seedId) || {}).name || 'plant'} at your homestead`, 4);
            }
          } else if (!remote.seedId && before.seedId) {
            Cozy.world.FX.splash(spot.clone().add(new THREE.Vector3(0, 0.4, 0)), 6, '#FFE7A8');
          }
        });
        const before = previous && previous.plots[i];
        if (before && plot.member && plot.noteCount > before.noteCount) {
          const note = plot.notes[plot.notes.length - 1];
          if (note && note.name !== snapshot.name) {
            sound.softChime();
            ui.toast(`New note from ${note.name} in your mailbox`, 5);
          }
        }
      });
      if (els.panel.style.display !== 'none' && panelMode && !panelTyping()) {
        renderPanel();
      }
    }

    online.ready.then((ok) => {
      if (!ok) {
        return;
      }
      isOnline = true;
      bedSets.forEach((set, i) => {
        set.clock = () => online.clock();
        set.beds.forEach((bed) => {
          bed.model = new PlotModel(null);   // server-backed, not saved in this browser
          bed.shownSeed = null;
        });
        set.onAction = (bedIndex, action, seedId) => {
          online.act('bed', { plot: i, bed: bedIndex, action, seed: seedId }).then((data) => {
            set.beds[bedIndex].pendingUntil = 0;
            if (data.ok === false && data.plots) {
              applySnapshot(data, null);   // refused: snap back to the server's version
            }
          });
        };
      });
      online.onChange(applySnapshot);
      activity.hint = 'Shared village - claim a free homestead, or visit friends and water their plants.';
    });

    // ------------------------------------------------------------ panel (invite / visit / mailbox)
    let panelMode = null;   // { kind: 'invite' | 'visit' | 'mail', plot }

    function panelTyping() {
      const active = document.activeElement;
      return active && els.panel.contains(active) && (active.tagName === 'INPUT' || active.tagName === 'SELECT');
    }

    function node(tag, text, className) {
      const element = document.createElement(tag);
      if (text) {
        element.textContent = text;
      }
      if (className) {
        element.className = className;
      }
      els.body.appendChild(element);
      return element;
    }

    function button(label, onClick, parent) {
      const element = document.createElement('button');
      element.textContent = label;
      element.addEventListener('click', onClick);
      (parent || els.body).appendChild(element);
      return element;
    }

    function joinRow() {
      const row = node('div', '', 'village-row');
      const input = document.createElement('input');
      input.maxLength = 8;
      input.placeholder = 'Invite code';
      input.className = 'code-input';
      row.appendChild(input);
      button('Join', async () => {
        const data = await online.act('join', { code: input.value });
        if (data.ok) {
          sound.jingle();
          ui.toast('Welcome to the family! You can now plant and harvest there too.', 5);
          ui.show(els.panel, false);
        }
      }, row);
    }

    function openPanel(kind, plot) {
      panelMode = { kind, plot };
      renderPanel();
      ui.show(els.panel, true);
    }

    function renderPanel() {
      els.body.textContent = '';
      const { kind, plot } = panelMode;
      const info = plots[plot] || {};
      if (!isOnline) {
        els.panelTitle.textContent = 'Invite friends';
        node('div', 'Friends who join your homestead can plant, water and harvest with you - live, or any time while you\u2019re away.');
        node('div', 'You opened the game as a file, so the village lives only in this browser. Start the village server (StartVillageServer.bat) and play from the address it shows to get your invite code.', 'village-code');
        return;
      }
      if (kind === 'invite') {
        els.panelTitle.textContent = 'Invite friends';
        node('div', 'Friends who join can plant, water and harvest here with you - live, or whenever you\u2019re away.');
        node('div', info.code || '------', 'village-code big-code');
        const link = online.inviteLink(info.code || '');
        node('div', link, 'small invite-link');
        const row = node('div', '', 'village-row');
        button('Copy invite link', () => {
          const done = () => ui.toast('Invite link copied - send it to a friend.', 3);
          if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(link).then(done, () => window.prompt('Copy this link:', link));
          } else {
            window.prompt('Copy this link:', link);
          }
        }, row);
        button('New code', () => online.act('invite', {}), row);
        const family = (info.mates || []).map((m) => m.name);
        node('div', family.length ? `Family: ${family.join(', ')}` : 'No family members yet.', 'small');
        node('div', 'Joining a friend instead? Enter their code:', 'small');
        joinRow();
      } else if (kind === 'visit') {
        els.panelTitle.textContent = `${info.ownerName || 'A friend'}\u2019s homestead`;
        if (info.member) {
          const family = [info.ownerName].concat((info.mates || []).map((m) => m.name));
          node('div', `You\u2019re family here: ${family.join(', ')}. Plant, water and harvest as you like.`);
          button('Leave this homestead', async () => {
            const data = await online.act('leave', { plot });
            if (data.ok) {
              ui.show(els.panel, false);
            }
          });
        } else {
          node('div', 'As a visitor you can water thirsty plants and leave a note in the mailbox. Have an invite code? Join to plant and harvest too.');
          joinRow();
        }
        renderCatVisit(plot, info);
      } else if (kind === 'mail') {
        els.panelTitle.textContent = `Mailbox \u00b7 ${info.ownerName || ''}`;
        if (isOwner(plot)) {
          renderPresents();
        }
        if (info.member) {
          const list = node('div', '', 'mail-list');
          const notes = (info.notes || []).slice().reverse();
          if (!notes.length) {
            list.textContent = 'No notes yet.';
          }
          notes.forEach((note) => {
            const row = document.createElement('div');
            row.className = 'mail-note';
            const when = new Date(note.at).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' });
            row.textContent = `${note.name} \u00b7 ${when}: ${note.text}`;
            list.appendChild(row);
          });
        } else {
          node('div', `Notes are private to ${info.ownerName || 'the owner'}\u2019s family - but you can leave one.`, 'small');
        }
        const row = node('div', '', 'village-row');
        const input = document.createElement('input');
        input.maxLength = 140;
        input.placeholder = 'Leave a kind note\u2026';
        input.className = 'note-input';
        row.appendChild(input);
        const send = async () => {
          const data = await online.act('note', { plot, text: input.value });
          if (data.ok) {
            input.value = '';
            sound.softChime();
            ui.toast('Note left in the mailbox.', 3);
            renderPanel();
          }
        };
        input.addEventListener('keydown', (event) => {
          if (event.key === 'Enter') {
            send();
          }
        });
        button('Send', send, row);
        if (!isOwner(plot) && info.owner) {
          renderGiftForm(plot, info);
        }
      }
    }

    function renderCatVisit(plot, info) {
      const away = catAway();
      const visit = visitAt(plot);
      if (away && villageClock() < away.until) {
        const minutes = Math.max(1, Math.ceil((away.until - villageClock()) / 60000));
        node('div', away.plot === plot
          ? `${CAT_NAME} is napping here by the mailbox - home in ${minutes} min.`
          : `${CAT_NAME} is visiting ${away.host} - home in ${minutes} min.`, 'small cat-line');
        return;
      }
      if (visit) {
        node('div', `${visit.fromName}'s cat ${visit.cat} is napping here right now - click her to pet.`, 'small cat-line');
        return;
      }
      const row = node('div', '', 'village-row');
      button(`Send ${CAT_NAME} over for a nap`, async () => {
        const data = await online.act('sendcat', { plot, cat: CAT_NAME });
        const sent = data.ok && data.plots && data.plots[plot].catVisit;
        if (sent) {
          const awayNote = { plot, host: info.ownerName, at: sent.at, until: sent.until };
          Cozy.store.set(CAT_AWAY_KEY, awayNote);
          Cozy.events.emit('catLeft', awayNote);
          renderPanel();
        }
      }, row);
      node('div', `She naps by ${info.ownerName}'s mailbox for a while (they can pet her), then comes home with a little souvenir.`, 'small');
    }

    function renderPresents() {
      const gifts = (online.snapshot && online.snapshot.gifts) || [];
      node('div', gifts.length ? `Presents for you (${gifts.length})` : 'No presents right now.', 'small');
      gifts.forEach((gift) => {
        const row = node('div', '', 'village-row gift-row');
        const text = document.createElement('span');
        text.className = 'gift-text';
        text.textContent = `Gift from ${gift.fromName}: ${giftLabel(gift.kind, gift.item)}${gift.note ? ` \u2014 \u201C${gift.note}\u201D` : ''}`;
        row.appendChild(text);
        button('Open', async () => {
          const data = await online.act('opengift', { id: gift.id });
          if (data.ok && data.opened) {
            Cozy.pantry.add(data.opened.kind, data.opened.item);
            progress.add('gifts_received');
            sound.jingle();
            const top = homesteads[plotOf(online.snapshot.you)].mailbox.clone().add(new THREE.Vector3(0, 0.5, 0));
            Cozy.world.FX.splash(top, 14, '#FFD866');
            ui.toast(`You unwrap ${giftLabel(data.opened.kind, data.opened.item)} from ${data.opened.fromName}. It's in your pantry.`, 5);
            renderPanel();
          }
        }, row);
      });
    }

    function plotOf(playerId) {
      return Math.max(0, plots.findIndex((p) => p.owner === playerId));
    }

    function renderGiftForm(plot, info) {
      node('div', `Send ${info.ownerName} a present`, 'small gift-heading');
      const options = giftOptions();
      if (!options.length) {
        node('div', 'Your pantry is empty - catch a fish, harvest a crop or cook something first.', 'small');
        return;
      }
      const row = node('div', '', 'village-row');
      const select = document.createElement('select');
      select.className = 'gift-select';
      options.forEach((option, index) => {
        const element = document.createElement('option');
        element.value = String(index);
        element.textContent = `${option.label} (${option.count})`;
        select.appendChild(element);
      });
      row.appendChild(select);
      const noteRow = node('div', '', 'village-row');
      const note = document.createElement('input');
      note.maxLength = 80;
      note.placeholder = 'Tag: "for your focus sessions"\u2026';
      noteRow.appendChild(note);
      button('Wrap & send', async () => {
        const choice = options[Number(select.value)];
        // take it out of the pantry first; put it back if the server says no
        if (!choice || !Cozy.pantry.take(choice.kind, choice.key)) {
          return;
        }
        const data = await online.act('gift', { plot, kind: choice.kind, item: choice.key, note: note.value });
        if (data.ok) {
          progress.add('gifts_sent');
          sound.softChime();
          Cozy.world.FX.splash(homesteads[plot].mailbox.clone().add(new THREE.Vector3(0, 0.5, 0)), 10, '#FF9EB5');
          ui.toast(`${choice.label} wrapped and left in ${info.ownerName}'s mailbox.`, 4);
          renderPanel();
        } else {
          Cozy.pantry.add(choice.kind, choice.key);
        }
      }, noteRow);
    }

    // ------------------------------------------------------------ activity
    function focusTarget() {
      if (claimed >= 0) {
        return homesteads[claimed].center;
      }
      const centre = new THREE.Vector3();
      homesteads.forEach((h) => centre.add(h.center));
      return centre.multiplyScalar(1 / homesteads.length);
    }

    function labelFor(i, active) {
      if (!isOnline) {
        return i === claimed ? `${name()}'s homestead` : (active ? 'Free plot - click the sign' : '');
      }
      const plot = plots[i];
      if (!plot || !plot.owner) {
        return active ? 'Free plot - click the sign' : '';
      }
      const family = (plot.mates || []).length;
      const suffix = family ? ` +${family}` : '';
      return isOwner(i) ? `Your homestead${suffix}` : `${plot.ownerName}'s homestead${suffix}${plot.member ? ' \u2665' : ''}`;
    }

    const activity = {
      id: 'village', name: 'Village', key: 6,
      station: homesteads[1].center, focus: homesteads[1].center, from: homesteads[1].cameraFrom, distance: 16, pitch: 0.7,
      hint: 'Claim a homestead by clicking its sign. Invite friends from your sign.',
      enter() {
        activity.focus = focusTarget();
        activity.from = claimed >= 0 ? homesteads[claimed].cameraFrom : homesteads[1].cameraFrom;
        activity.distance = claimed >= 0 ? 8 : 20;
        activity.pitch = claimed >= 0 ? 0.7 : 0.95;
      },
      exit() {
        bedSets.forEach((set) => set.stopSounds());
        ui.show(els.panel, false);
      },
      openPanel,
      petVisitor,
      visitorsShown: () => visitorCats.map((model) => !!(model && model.root.visible)),
      update(dt, time, active) {
        bedSets.forEach((set) => set.updateVisuals(time));
        updateVisitorCats(dt, time);
        // world labels (always visible when on screen)
        homesteads.forEach((h, i) => {
          const text = labelFor(i, active);
          const screen = h.sign.clone().add(new THREE.Vector3(0, 0.7, 0)).project(world.camera);
          const visible = text && screen.z < 1 && Math.abs(screen.x) < 1.1 && Math.abs(screen.y) < 1.1;
          ui.show(labels[i], !!visible);
          if (visible) {
            ui.setText(labels[i], text);
            labels[i].style.transform = `translate(-50%, -100%) translate(${(screen.x * 0.5 + 0.5) * window.innerWidth}px, ${(-screen.y * 0.5 + 0.5) * window.innerHeight}px)`;
          }
        });
        if (!active || els.panel.style.display !== 'none') {
          return;
        }
        const input = game.input;
        const signHit = game.pick(signHits);
        const mailHit = game.pick(mailboxHits);
        const catHits = visitorCats.filter((model) => model && model.root.visible).map((model) => model.hit);
        const catHit = catHits.length ? game.pick(catHits) : null;
        let tip = null;
        if (catHit) {
          const index = visitorCats.findIndex((model) => model && model.hit === catHit.object);
          const visit = visitAt(index);
          if (visit) {
            tip = visit.from === online.snapshot.you
              ? `Your ${visit.cat}, napping at ${plots[index].ownerName}'s - click to pet`
              : `${visit.fromName}'s cat ${visit.cat} is visiting - click to pet`;
            if (input.primaryPressed) {
              petVisitor(index);
            }
          }
        } else if (signHit) {
          const index = signHits.indexOf(signHit.object);
          if (isOwner(index)) {
            tip = 'Your homestead - click to invite friends';
            if (input.primaryPressed) {
              openPanel('invite', index);
            }
          } else if (isLived(index)) {
            tip = isMember(index) ? `${plots[index].ownerName}'s homestead - you're family here` : `${plots[index].ownerName}'s homestead - click to visit`;
            if (input.primaryPressed) {
              openPanel('visit', index);
            }
          } else if (claimed < 0) {
            tip = 'Click to claim this homestead';
            if (input.primaryPressed) {
              const claimHere = () => {
                claimed = index;
                sound.jingle();
                ui.toast('This homestead is yours! Click the sign again to invite friends.', 5);
                activity.focus = homesteads[claimed].center;
                activity.from = homesteads[claimed].cameraFrom;
                activity.distance = 8;
                activity.pitch = 0.7;
                game.refocus(activity);
              };
              if (isOnline) {
                online.act('claim', { plot: index }).then((data) => {
                  if (data.ok) {
                    claimHere();
                  }
                });
              } else {
                Cozy.store.set('village.claimed', index);
                claimHere();
              }
            }
          } else {
            tip = 'You already have a homestead';
          }
        } else if (mailHit) {
          const index = mailboxHits.indexOf(mailHit.object);
          if (!isOnline) {
            tip = 'Mailbox - friends\u2019 notes arrive here when you play through the village server';
          } else if (!isLived(index)) {
            tip = 'An empty mailbox';
          } else {
            const unread = isMember(index) ? plots[index].noteCount : 0;
            const presents = isOwner(index) ? ((online.snapshot && online.snapshot.gifts) || []).length : 0;
            tip = isMember(index)
              ? `Mailbox - ${unread} note${unread === 1 ? '' : 's'}${presents ? ` · ${presents} present${presents === 1 ? '' : 's'}!` : ''}`
              : `Leave ${plots[index].ownerName} a note or a present`;
            if (input.primaryPressed) {
              openPanel('mail', index);
            }
          }
        } else {
          for (let i = 0; i < bedSets.length; i++) {
            if (!isLived(i)) {
              continue;
            }
            const member = isMember(i);
            // family: plant / water / harvest; visitors (online only): water
            if (!member && !isOnline) {
              continue;
            }
            const hovered = bedSets[i].interact(dt, member, member, true);
            if (hovered) {
              tip = bedSets[i].status(hovered, member, member);
              if (!member && hovered.model.stage(bedSets[i].clock()) !== 'thirsty') {
                tip += ` \u00b7 ${plots[i].ownerName}'s garden`;
              }
            }
          }
          if (!tip && claimed >= 0) {
            const label = bedSets[claimed].seedLabel();
            ui.setText(els.title, label.title);
            ui.setText(els.sub, label.sub);
          }
        }
        if (claimed < 0) {
          ui.setText(els.title, 'Pick a homestead');
          ui.setText(els.sub, isOnline ? 'Click a free sign to claim it, or visit a friend\u2019s' : 'Click any sign to claim it as yours');
        }
        ui.tooltip(tip);
      },
    };
    return activity;
  }

  // ================================================================== 7. Campfire cooking

  /** Ingredients: { fish: 'any' | 'small' | [names] } or { crop: seedId }.
   *  `heat` is the comfy zone on the heat bar; `seconds` is cooking time spent in that zone. */
  const RECIPES = [
    { id: 'grilled_fish', name: 'Campfire Grilled Fish', needs: [{ fish: 'any' }], heat: [0.4, 0.7], seconds: 6,
      note: 'Smoky, simple, perfect.' },
    { id: 'fish_stew', name: 'Tomato Fish Stew', needs: [{ fish: 'any' }, { crop: 'tomato' }], heat: [0.3, 0.55], seconds: 8,
      note: 'Slow bubbles, big flavour.' },
    { id: 'cedar_salmon', name: 'Cedar-Plank Salmon', needs: [{ fish: ['Cherry Salmon', 'Sockeye Salmon'] }], heat: [0.5, 0.78],
      seconds: 8, note: 'Spring or autumn salmon on a warm plank.' },
    { id: 'pumpkin_soup', name: 'Pumpkin Soup', needs: [{ crop: 'pumpkin' }], heat: [0.3, 0.55], seconds: 8,
      note: 'Orange, velvety, autumn in a bowl.' },
    { id: 'strawberry_cake', name: 'Skillet Strawberry Cake', needs: [{ crop: 'strawberry' }], heat: [0.35, 0.6], seconds: 7,
      note: 'Spring berries, golden edges.' },
    { id: 'watermelon_skewers', name: 'Grilled Watermelon Skewers', needs: [{ crop: 'watermelon' }], heat: [0.5, 0.8],
      seconds: 5, note: 'Sweet, charred, summery.' },
    { id: 'sunflower_seeds', name: 'Toasted Sunflower Seeds', needs: [{ crop: 'sunflower' }], heat: [0.4, 0.65], seconds: 5,
      note: 'A crunchy snack for focus sessions.' },
    { id: 'cat_treat', name: 'Fish Treat for Mochi', needs: [{ fish: 'small' }], heat: [0.3, 0.55], seconds: 4,
      note: 'Mochi approves. Mochi always approves.' },
  ];

  /** Gives the player credit for catches / harvests made before the pantry existed (once, capped). */
  function backfillPantry() {
    if (Cozy.store.get('pantryInit', false)) {
      return;
    }
    for (const fish of FISH) {
      Cozy.pantry.add('fish', fish.name, Math.min(3, progress.get('fish_' + fish.name)));
    }
    for (const seed of SEEDS) {
      Cozy.pantry.add('crops', seed.id, Math.min(3, progress.get('harvest_' + seed.name)));
    }
    Cozy.store.set('pantryInit', true);
  }

  /** Turns a recipe's needs into concrete pantry items, or reports what's missing. */
  function resolveRecipe(recipe) {
    const items = [];
    const missing = [];
    for (const need of recipe.needs) {
      if (need.crop) {
        const seed = seedById(need.crop);
        const have = Cozy.pantry.count('crops', need.crop);
        (have > 0 ? items : missing).push({ kind: 'crops', key: need.crop, label: seed.name, have });
        continue;
      }
      let options = FISH;
      if (need.fish === 'small') {
        options = FISH.filter((fish) => fish.rarity === 'common');
      } else if (Array.isArray(need.fish)) {
        options = FISH.filter((fish) => need.fish.includes(fish.name));
      } else {
        options = FISH.filter((fish) => fish.rarity !== 'legendary');  // nobody cooks a legendary koi
      }
      // use whichever matching fish you have the most of
      const best = options
        .map((fish) => ({ fish, have: Cozy.pantry.count('fish', fish.name) }))
        .sort((a, b) => b.have - a.have)[0];
      if (best && best.have > 0) {
        items.push({ kind: 'fish', key: best.fish.name, label: best.fish.name, have: best.have });
      } else {
        const label = Array.isArray(need.fish) ? need.fish.join(' or ') : (need.fish === 'small' ? 'a common fish' : 'any fish');
        missing.push({ kind: 'fish', label, have: 0 });
      }
    }
    return { items, missing };
  }

  function createCooking(game) {
    const { world } = game;
    const places = world.places;
    const els = {
      title: ui.el('cook-title'), sub: ui.el('cook-sub'), bars: ui.el('cook-bars'),
      zone: ui.el('cook-zone'), marker: ui.el('cook-marker'), progress: ui.el('cook-progress'),
      book: ui.el('cook-book'), list: ui.el('cook-list'),
    };
    const s = { step: 'choose', recipe: 0, chops: 0, heat: 0.3, progress: 0, inZone: 0, total: 0, steamTimer: 0, crackleTimer: 0, stars: 0 };
    let showBook = false;
    backfillPantry();

    function renderBook() {
      els.list.innerHTML = '';
      for (const recipe of RECIPES) {
        const { missing } = resolveRecipe(recipe);
        const cooked = progress.get('dish_' + recipe.id);
        const row = document.createElement('div');
        row.className = 'fish-row' + (missing.length === 0 ? ' in-season' : '');
        const swatch = document.createElement('span');
        swatch.className = 'fish-swatch';
        swatch.style.background = missing.length === 0 ? '#9ED99A' : 'rgba(255,245,225,0.15)';
        const name = document.createElement('span');
        name.className = 'fish-name';
        name.textContent = recipe.name;
        name.title = recipe.note;
        const info = document.createElement('span');
        info.className = 'fish-info';
        const needs = recipe.needs.map((need) => {
          if (need.crop) {
            return seedById(need.crop).name;
          }
          if (need.fish === 'small') {
            return 'common fish';
          }
          return Array.isArray(need.fish) ? 'salmon' : 'fish';
        }).join(' + ');
        info.textContent = `${needs}${cooked ? ` · cooked ×${cooked}` : ''}`;
        row.append(swatch, name, info);
        els.list.appendChild(row);
      }
      const known = RECIPES.filter((recipe) => progress.get('dish_' + recipe.id) > 0).length;
      ui.setText(ui.el('cook-book-title'), `Cookbook  ${known}/${RECIPES.length}`);
    }

    function setBook(visible) {
      showBook = visible;
      if (visible) {
        renderBook();
      }
      ui.show(els.book, visible);
    }

    function serve() {
      const recipe = RECIPES[s.recipe];
      const ratio = s.total > 0 ? s.inZone / s.total : 1;
      s.stars = ratio > 0.8 ? 3 : ratio > 0.55 ? 2 : 1;
      progress.add('dishes');
      progress.add('dish_' + recipe.id);
      if (recipe.id !== 'cat_treat') {
        Cozy.pantry.add('dishes', recipe.id);  // keep it in your basket - or gift it to a friend
      }
      if (s.stars === 3) {
        progress.add('perfect_dishes');
      }
      sound.stopLoop('sizzle');
      sound.jingle();
      Cozy.world.FX.splash(places.pot.clone().add(new THREE.Vector3(0, 0.25, 0)), 14, '#FFE3A8');
      Cozy.events.emit('cooked', recipe);
      s.step = 'done';
    }

    return {
      id: 'cooking', name: 'Campfire Cooking', key: 7,
      station: places.campfire, focus: places.campfire, from: places.campfireFrom, distance: 5.5, pitch: 0.5,
      hint: 'Cook what you caught and grew. Q/E pick a recipe, J opens the cookbook.',

      enter() {
        s.step = 'choose';
        sound.startLoop('fire');
        setBook(false);
      },

      exit() {
        sound.stopLoop('fire');
        sound.stopLoop('sizzle');
        world.campfire.heat = 0.35;
        setBook(false);
      },

      update(dt, time, active) {
        if (!active) {
          return;
        }
        const input = game.input;
        const pressed = input.primaryPressed;
        let recipe = RECIPES[s.recipe];
        if (input.pressed('KeyJ')) {
          setBook(!showBook);
        }
        s.crackleTimer -= dt;
        if (s.crackleTimer <= 0) {
          s.crackleTimer = 0.4 + Math.random() * 1.6 * (1.2 - world.campfire.heat);
          sound.crackle();
        }

        switch (s.step) {
          case 'choose': {
            if (input.pressed('KeyQ')) {
              s.recipe = (s.recipe + RECIPES.length - 1) % RECIPES.length;
              sound.tick(0.05, 1800);
            }
            if (input.pressed('KeyE')) {
              s.recipe = (s.recipe + 1) % RECIPES.length;
              sound.tick(0.05, 1800);
            }
            world.campfire.heat += (0.35 - world.campfire.heat) * Math.min(1, dt * 2);
            if (pressed) {
              const { items, missing } = resolveRecipe(RECIPES[s.recipe]);
              if (missing.length) {
                ui.toast(`You need ${missing.map((item) => item.label).join(' + ')} - catch or grow it first.`, 4);
              } else {
                items.forEach((item) => Cozy.pantry.take(item.kind, item.key));
                s.step = 'prep';
                s.chops = 0;
              }
            }
            break;
          }
          case 'prep':
            if (pressed) {
              s.chops++;
              sound.chop();
              Cozy.world.FX.splash(places.crate.clone(), 3, s.chops % 2 ? '#FFE3A8' : '#9ED99A');
              if (s.chops >= 4) {
                s.step = 'cook';
                s.heat = 0.25;
                s.progress = 0;
                s.inZone = 0;
                s.total = 0;
                sound.startLoop('sizzle');
              }
            }
            break;
          case 'cook': {
            // hold to fan the fire, let go to let it settle; keep the needle in the green zone
            s.heat = Cozy.clamp01(s.heat + (input.primaryHeld ? 0.45 : -0.28) * dt);
            const [low, high] = recipe.heat;
            const inZone = s.heat >= low && s.heat <= high;
            s.total += dt;
            if (inZone) {
              s.inZone += dt;
            }
            s.progress = Math.min(1, s.progress + (dt / recipe.seconds) * (inZone ? 1 : 0.3));
            world.campfire.heat = s.heat;
            sound.setLoopVolume('sizzle', 0.3 + s.heat * 1.4);
            s.steamTimer -= dt;
            if (s.steamTimer <= 0) {
              s.steamTimer = s.heat > 0.88 ? 0.12 : 0.35;
              const smoky = s.heat > 0.88;
              Cozy.world.FX.puff(places.pot.clone().add(new THREE.Vector3(Cozy.rand(-0.08, 0.08), 0.1, Cozy.rand(-0.08, 0.08))),
                smoky ? '#8A8480' : '#FFFFFF', smoky ? 0.5 : 0.35);
            }
            if (s.progress >= 1) {
              serve();
            }
            break;
          }
          case 'done':
            world.campfire.heat += (0.35 - world.campfire.heat) * Math.min(1, dt * 2);
            if (pressed) {
              s.step = 'choose';
            }
            break;
        }

        // HUD
        recipe = RECIPES[s.recipe];  // Q/E may have changed it this frame
        ui.show(els.bars, s.step === 'cook');
        let title = '';
        let sub = '';
        if (s.step === 'choose') {
          const { items, missing } = resolveRecipe(recipe);
          title = `Q  ‹  ${recipe.name}  ›  E`;
          sub = missing.length
            ? `needs ${missing.map((item) => item.label).join(' + ')} · ${recipe.note}`
            : `uses ${items.map((item) => `${item.label} (${item.have} in pantry)`).join(' + ')} · click to cook`;
        } else if (s.step === 'prep') {
          title = 'Chop chop';
          sub = `click to chop (${4 - s.chops} left)`;
        } else if (s.step === 'cook') {
          const [low, high] = recipe.heat;
          title = s.heat > 0.88 ? 'Too hot! Let the fire settle' : (s.heat < low ? 'Hold to fan the fire' : 'Just right... keep it cozy');
          sub = `${recipe.name} · keep the flame in the green zone`;
          els.zone.style.left = `${low * 100}%`;
          els.zone.style.width = `${(high - low) * 100}%`;
          els.marker.style.left = `calc(${(s.heat * 100).toFixed(1)}% - 3px)`;
          ui.bar(els.progress, s.progress);
        } else {
          title = `${recipe.name} · ${s.stars} of 3`;
          sub = `${recipe.note} · ${progress.get('dishes')} dishes cooked · click to cook again`;
        }
        ui.setText(els.title, title);
        ui.setText(els.sub, sub);
        if (showBook && Math.random() < dt * 2) {
          renderBook();
        }
      },
    };
  }

  // ================================================================== Mochi, the dock cat

  const CAT_NAME = 'Mochi';
  const CAT_AWAY_KEY = 'catAway';

  /** Where Mochi is napping right now ({ plot, host, at, until } in server ms), or null when she's home. */
  function catAway() {
    return Cozy.store.get(CAT_AWAY_KEY, null);
  }

  function villageClock() {
    return Cozy.online.enabled ? Cozy.online.clock() : Date.now();
  }

  /** What Mochi carries home: something from the friend's garden, otherwise a little fish from their dock. */
  function catSouvenir(plot) {
    const planted = plot && plot.beds ? plot.beds.map((bed) => bed.seedId).filter((id) => id && seedById(id)) : [];
    if (planted.length && Math.random() < 0.7) {
      const seedId = Cozy.randomFrom(planted);
      return { kind: 'crops', key: seedId, label: seedById(seedId).name.toLowerCase() };
    }
    const season = Cozy.season.current();
    const fish = Cozy.randomFrom(FISH.filter((f) => f.rarity === 'common' && f.seasons.includes(season)));
    return { kind: 'fish', key: fish.name, label: fish.name };
  }
  const CAT_LINES = {
    catch: ['{cat} stares at your {fish} with enormous eyes.', '{cat} meows approvingly at the {fish}.', '{cat} pretends not to care about the {fish}.'],
    treat: ['{cat} crunches the treat and purrs like a little engine.', '{cat} headbutts your hand. Best day ever.'],
    harvest: ['{cat} sniffs the {crop} and sneezes.'],
  };

  function createCat(game) {
    const cat = game.world.cat;
    const state = { excited: 0, look: 0, lookTarget: 0, lookTimer: 2, blinkTimer: 3, blink: 0, sleep: 0, nuzzle: 0, zzzTimer: 0, meowCooldown: 0 };
    const say = (key, values) => {
      let line = Cozy.randomFrom(CAT_LINES[key]).replace('{cat}', CAT_NAME);
      for (const [name, value] of Object.entries(values || {})) {
        line = line.replace(`{${name}}`, value);
      }
      ui.toast(line, 4);
    };

    Cozy.events.on('bite', () => {
      state.excited = Math.max(state.excited, 1.5);
    });
    Cozy.events.on('catLeft', (away) => {
      Cozy.world.FX.puff(cat.root.position.clone().add(new THREE.Vector3(0, 0.2, 0)), '#F7E6CC', 0.3);
      cat.root.visible = false;
      sound.meow();
      const minutes = Math.max(1, Math.round((away.until - away.at) / 60000));
      ui.toast(`${CAT_NAME} stretches, hops off the dock and trots over to ${away.host}'s homestead. Back in about ${minutes} min.`, 5);
    });
    Cozy.events.on('catch', (fish) => {
      if (catAway()) {
        return;
      }
      state.excited = 4;
      if (state.meowCooldown <= 0) {
        sound.meow();
        state.meowCooldown = 6;
      }
      if (Math.random() < 0.35) {
        setTimeout(() => say('catch', { fish: fish.name }), 1800);
      }
    });
    Cozy.events.on('cooked', (recipe) => {
      if (recipe.id === 'cat_treat' && !catAway()) {
        progress.add('cat_treats');
        state.excited = 3;
        state.nuzzle = 2;
        sound.purr(2.4);
        say('treat');
      }
    });

    function friendship() {
      return Math.min(5, Math.floor(progress.get('cat_pets') / 8) + progress.get('cat_treats'));
    }

    // wait for the village connection before deciding she's home (so we know who petted her)
    let onlineSettled = false;
    Cozy.online.ready.then(() => {
      onlineSettled = true;
    });

    function comeHome(away) {
      Cozy.store.set(CAT_AWAY_KEY, null);
      cat.root.visible = true;
      const snapshot = Cozy.online.snapshot;
      const plot = snapshot && snapshot.plots ? snapshot.plots[away.plot] : null;
      const visit = plot && plot.catVisit && plot.catVisit.from === snapshot.you && plot.catVisit.at === away.at ? plot.catVisit : null;
      const souvenir = catSouvenir(plot);
      Cozy.pantry.add(souvenir.kind, souvenir.key);
      progress.add('cat_visits');
      state.excited = 3;
      state.nuzzle = 1.5;
      sound.meow();
      Cozy.world.FX.splash(cat.root.position.clone().add(new THREE.Vector3(0, 0.6, 0)), 8, '#FF9EB5');
      let line = `${CAT_NAME} is home from ${away.host}'s homestead and drops a ${souvenir.label} at your feet (it's in your pantry).`;
      if (visit && visit.pets > 0) {
        const friends = visit.petBy.filter((name) => name !== snapshot.name);
        const by = friends.length ? ` from ${friends.slice(0, 3).join(' & ')}` : '';
        line += ` She got ${visit.pets} chin scratch${visit.pets === 1 ? '' : 'es'}${by}.`;
      }
      ui.toast(line, 7);
    }

    return {
      name: CAT_NAME,
      hit: cat.hit,
      friendship,
      isHome: () => !catAway(),

      pet() {
        const pets = progress.add('cat_pets');
        state.nuzzle = 1.6;
        state.sleep = Math.min(state.sleep, 0.4);  // a sleepy cat still opens one eye for pets
        sound.purr(1.8);
        const top = cat.root.position.clone().add(new THREE.Vector3(0, 0.6, 0));
        Cozy.world.FX.splash(top, 6, '#FF9EB5');
        if (pets === 1) {
          ui.toast(`This is ${CAT_NAME}, the dock cat. She likes chin scratches and fish.`, 5);
        } else if (pets % 8 === 0) {
          ui.toast(`${CAT_NAME} trusts you a little more (friendship ${friendship()})`, 3);
        }
      },

      update(dt, time) {
        // off visiting a friend? the dock stays empty until she trots home
        const away = catAway();
        cat.root.visible = !away;
        if (away) {
          if (onlineSettled && villageClock() >= away.until) {
            comeHome(away);
          }
          return;
        }
        state.excited = Math.max(0, state.excited - dt);
        state.nuzzle = Math.max(0, state.nuzzle - dt);
        state.meowCooldown -= dt;
        // naps at night and through the rain (unless something exciting happens)
        const sleepy = game.world.night > 0.7 || game.world.rain > 0.6;
        const wantsSleep = sleepy && state.excited <= 0 && state.nuzzle <= 0 ? 1 : 0;
        state.sleep += (wantsSleep - state.sleep) * Math.min(1, dt * 0.8);
        const sleep = state.sleep;

        // posture: sitting upright -> curled loaf
        cat.body.rotation.x = -0.08 * (1 - sleep) + Math.sin(time * 1.4) * 0.01;
        cat.body.position.y = -0.1 * sleep;
        cat.body.scale.set(1 + 0.12 * sleep, 1 - 0.25 * sleep, 1 + 0.1 * sleep);
        const hop = state.excited > 3 ? Math.abs(Math.sin(time * 9)) * 0.05 : 0;
        cat.root.position.y = game.world.places.cat.y + hop;

        // head: look around, toward the water when excited, down when asleep, nuzzle when petted
        state.lookTimer -= dt;
        if (state.lookTimer <= 0) {
          state.lookTimer = 2 + Math.random() * 4;
          state.lookTarget = Cozy.rand(-0.7, 0.7);
        }
        const target = state.excited > 0 ? -0.35 : state.lookTarget;
        state.look += (target - state.look) * Math.min(1, dt * 3);
        cat.head.rotation.y = state.look * (1 - sleep);
        cat.head.rotation.x = 0.55 * sleep + (state.nuzzle > 0 ? Math.sin(time * 6) * 0.15 : 0);
        cat.head.rotation.z = state.nuzzle > 0 ? Math.sin(time * 5) * 0.2 : 0;
        cat.head.position.y = 0.36 - 0.12 * sleep;

        // blink (or keep eyes closed while asleep / purring)
        state.blinkTimer -= dt;
        if (state.blinkTimer <= 0) {
          state.blinkTimer = 2.5 + Math.random() * 4;
          state.blink = 0.15;
        }
        state.blink -= dt;
        const closed = sleep > 0.5 || state.nuzzle > 0 || state.blink > 0;
        cat.eyes.forEach((eye) => {
          eye.scale.y = closed ? 0.003 : 0.022;
        });
        cat.ears.forEach((ear, index) => {
          ear.rotation.x = Math.max(0, Math.sin(time * 0.7 + index * 2) - 0.96) * 6;  // the occasional twitch
        });

        // tail: lazy sway, faster flicks when excited, wrapped around when asleep
        const speed = state.excited > 0 ? 6 : 1.6;
        const amount = state.excited > 0 ? 0.35 : 0.22;
        cat.tail.forEach((pivot, index) => {
          const curl = 0.35 * sleep;
          pivot.rotation.y = (Math.sin(time * speed - index * 0.6) * amount) * (1 - sleep * 0.8) + curl;
          pivot.rotation.x = index === 0 ? 0.35 - 0.3 * sleep : -0.05;
        });

        // little Zzz while napping
        if (sleep > 0.8) {
          state.zzzTimer -= dt;
          if (state.zzzTimer <= 0) {
            state.zzzTimer = 1.6;
            Cozy.world.FX.puff(cat.root.position.clone().add(new THREE.Vector3(0.05, 0.45, 0)), '#DDE6FF', 0.25);
          }
        }
      },
    };
  }

  Cozy.activities = {
    createCooking, createCat, RECIPES,
    createFishing, createGarden, createTea, createBirds, createViewpoint, createVillage,
    SEEDS, FISH, RARITY, BIRDS,
    fishSpeciesCount: () => fishBook.speciesCount(),
    birdSpeciesCount: () => BIRDS.filter((b) => progress.get('bird_' + b.name) > 0).length,
  };
})(window.Cozy);
