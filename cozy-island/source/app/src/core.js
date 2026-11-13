'use strict';
/* Cozy Island - core: random/noise, saving, input, UI helpers, procedural ASMR audio. */
window.Cozy = window.Cozy || {};

(function (Cozy) {
  // ------------------------------------------------------------------ random + Perlin noise

  function mulberry32(seed) {
    return function () {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  Cozy.rng = mulberry32(7);
  Cozy.rand = function (min, max) {
    return min + (max - min) * Cozy.rng();
  };
  Cozy.randomFrom = function (list) {
    return list[Math.floor(Math.random() * list.length)];
  };

  const permutation = new Uint8Array(512);
  (function buildPermutation() {
    const table = [];
    for (let i = 0; i < 256; i++) {
      table.push(i);
    }
    const shuffle = mulberry32(1337);
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(shuffle() * (i + 1));
      const swap = table[i];
      table[i] = table[j];
      table[j] = swap;
    }
    for (let i = 0; i < 512; i++) {
      permutation[i] = table[i & 255];
    }
  })();

  function fade(t) {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  function gradient(hash, x, y) {
    switch (hash & 7) {
      case 0: return x + y;
      case 1: return -x + y;
      case 2: return x - y;
      case 3: return -x - y;
      case 4: return x;
      case 5: return -x;
      case 6: return y;
      default: return -y;
    }
  }

  function lerp(t, a, b) {
    return a + t * (b - a);
  }

  /** Classic 2D Perlin noise, roughly in [-1, 1]. */
  Cozy.noise2 = function (x, y) {
    const cellX = Math.floor(x) & 255;
    const cellY = Math.floor(y) & 255;
    x -= Math.floor(x);
    y -= Math.floor(y);
    const u = fade(x);
    const v = fade(y);
    const a = permutation[cellX] + cellY;
    const b = permutation[cellX + 1] + cellY;
    return lerp(v,
      lerp(u, gradient(permutation[a], x, y), gradient(permutation[b], x - 1, y)),
      lerp(u, gradient(permutation[a + 1], x, y - 1), gradient(permutation[b + 1], x - 1, y - 1)));
  };

  Cozy.clamp01 = function (value) {
    return Math.max(0, Math.min(1, value));
  };

  Cozy.smoothstep = function (edge0, edge1, x) {
    const t = Cozy.clamp01((x - edge0) / (edge1 - edge0));
    return t * t * (3 - 2 * t);
  };

  // ------------------------------------------------------------------ saving

  Cozy.store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem('cozy.' + key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch (error) {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem('cozy.' + key, JSON.stringify(value));
      } catch (error) {
        /* private mode etc. - progress just won't persist */
      }
      if (Cozy.widget) {
        Cozy.widget.queue();
      }
    },
  };

  /** Stats + inventory: fish, harvest, tea_cups, mindful_seconds, photos, bird_*, focus_sessions, rare_seeds, eye_rests, stretch_sessions */
  Cozy.progress = {
    get(key) {
      return Cozy.store.get('p.' + key, 0);
    },
    add(key, amount) {
      const value = this.get(key) + (amount === undefined ? 1 : amount);
      Cozy.store.set('p.' + key, value);
      return value;
    },
    trySpend(key, amount) {
      const cost = amount === undefined ? 1 : amount;
      if (this.get(key) < cost) {
        return false;
      }
      this.add(key, -cost);
      return true;
    },
  };

  // ------------------------------------------------------------------ seasons

  /** The island follows the real calendar (northern hemisphere) unless the player picks a season.
   *  Mode cycles auto -> spring -> summer -> autumn -> winter -> auto and is saved. */
  const SEASON_IDS = ['spring', 'summer', 'autumn', 'winter'];
  const SEASON_NAMES = { spring: 'Spring', summer: 'Summer', autumn: 'Autumn', winter: 'Winter' };
  const MODES = ['auto'].concat(SEASON_IDS);
  const listeners = [];
  const urlSeason = new URLSearchParams(window.location.search).get('season');

  function calendarSeason(date) {
    const month = date.getMonth();  // 0 = January
    if (month >= 2 && month <= 4) {
      return 'spring';
    }
    if (month >= 5 && month <= 7) {
      return 'summer';
    }
    if (month >= 8 && month <= 10) {
      return 'autumn';
    }
    return 'winter';
  }

  Cozy.season = {
    IDS: SEASON_IDS,
    NAMES: SEASON_NAMES,
    mode: MODES.includes(urlSeason) ? urlSeason : Cozy.store.get('seasonMode', 'auto'),

    current() {
      return this.mode === 'auto' ? calendarSeason(new Date()) : this.mode;
    },
    name(id) {
      return SEASON_NAMES[id || this.current()];
    },
    label() {
      return `${this.name()}${this.mode === 'auto' ? ' (calendar)' : ''}`;
    },
    cycle() {
      const before = this.current();
      this.mode = MODES[(MODES.indexOf(this.mode) + 1) % MODES.length];
      Cozy.store.set('seasonMode', this.mode);
      this.notifyIfChanged(before);
    },
    /** Call now and then: picks up the calendar rolling over to a new season. */
    notifyIfChanged(before) {
      const now = this.current();
      if (now !== before) {
        listeners.forEach((listener) => listener(now, before));
      }
    },
    onChange(listener) {
      listeners.push(listener);
    },
  };

  // ------------------------------------------------------------------ time of day

  /** Follows the laptop clock unless the player picks a time with N.
   *  Mode cycles auto -> morning -> day -> sunset -> night -> auto and is saved. */
  const TIME_PRESETS = { morning: 8, day: 12.5, sunset: 18.5, night: 23 };
  const TIME_MODES = ['auto'].concat(Object.keys(TIME_PRESETS));
  const urlTime = new URLSearchParams(window.location.search).get('time');

  Cozy.daytime = {
    mode: TIME_MODES.includes(urlTime) ? urlTime : Cozy.store.get('timeMode', 'auto'),

    /** Target hour 0..24 (the world eases toward it so changes glide). */
    hours() {
      if (this.mode !== 'auto') {
        return TIME_PRESETS[this.mode];
      }
      const now = new Date();
      return now.getHours() + now.getMinutes() / 60;
    },
    phaseName(hour) {
      if (hour < 5) {
        return 'night';
      }
      if (hour < 7.5) {
        return 'dawn';
      }
      if (hour < 11) {
        return 'morning';
      }
      if (hour < 16.5) {
        return 'day';
      }
      if (hour < 20) {
        return 'sunset';
      }
      if (hour < 21.5) {
        return 'dusk';
      }
      return 'night';
    },
    label() {
      const hour = this.hours();
      const clock = `${String(Math.floor(hour)).padStart(2, '0')}:${String(Math.floor((hour % 1) * 60)).padStart(2, '0')}`;
      return `${this.phaseName(hour)} ${clock}${this.mode === 'auto' ? ' (clock)' : ''}`;
    },
    cycle() {
      this.mode = TIME_MODES[(TIME_MODES.indexOf(this.mode) + 1) % TIME_MODES.length];
      Cozy.store.set('timeMode', this.mode);
    },
  };

  // ------------------------------------------------------------------ events + pantry

  /** Soft rain comes and goes in 3-hour spells, the same for everyone on a given day (seeded by the date).
   *  R cycles auto -> rain -> clear -> auto (saved). In winter a "rainy" spell is a grey, snowy day. */
  const WEATHER_MODES = ['auto', 'rain', 'clear'];
  const RAIN_CHANCE = { spring: 0.35, summer: 0.2, autumn: 0.35, winter: 0.3 };
  const urlWeather = new URLSearchParams(window.location.search).get('weather');

  function hash01(text) {
    let hash = 2166136261;
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return ((hash >>> 0) % 10000) / 10000;
  }

  Cozy.weather = {
    mode: WEATHER_MODES.includes(urlWeather) ? urlWeather : Cozy.store.get('weatherMode', 'auto'),

    isRaining() {
      if (this.mode !== 'auto') {
        return this.mode === 'rain';
      }
      const now = new Date();
      const spell = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${Math.floor(now.getHours() / 3)}`;
      return hash01(spell) < RAIN_CHANCE[Cozy.season.current()];
    },
    label() {
      const raining = this.isRaining();
      const word = raining ? (Cozy.season.current() === 'winter' ? 'snowy' : 'rainy') : 'clear';
      return `${word}${this.mode === 'auto' ? ' (forecast)' : ''}`;
    },
    cycle() {
      this.mode = WEATHER_MODES[(WEATHER_MODES.indexOf(this.mode) + 1) % WEATHER_MODES.length];
      Cozy.store.set('weatherMode', this.mode);
    },
  };

  // ------------------------------------------------------------------ iPhone widget feed (optional)

  /** Shares a small snapshot (season, garden timers, focus timer, a few counts) with the iPhone
   *  home-screen widget that PocketDex, Haru and Cozy Island have in common. Nothing is fetched or
   *  sent until this browser is paired: a code saved by the setup page, or ?widget=<code> in the address. */
  const WIDGET_SYNC_URL = 'https://juw12.github.io/pocketdex/widget/sync.js';
  const WIDGET_CODE_KEY = 'juw12.widget.code';
  const WIDGET_BEDS = 16;          // garden beds are saved as garden.0, garden.1, ... (gaps are possible)
  const WIDGET_SETTLE_MS = 2000;   // many saves in a row become one snapshot
  let widgetLoading = null;
  let widgetTimer = 0;
  let widgetUrgent = false;

  Cozy.widget = {
    /** The focus timer as the widget should show it (set by main.js); null while no session runs. */
    focus: null,

    wanted() {
      try {
        return Boolean(localStorage.getItem(WIDGET_CODE_KEY)) || new URLSearchParams(window.location.search).has('widget');
      } catch (error) {
        return false;
      }
    },

    /** Fetch the shared relay script once. Resolves to null when it cannot be reached. */
    load() {
      if (window.Juw12Widget) {
        return Promise.resolve(window.Juw12Widget);
      }
      if (!widgetLoading) {
        widgetLoading = new Promise((resolve) => {
          const script = document.createElement('script');
          script.src = WIDGET_SYNC_URL;
          script.async = true;
          script.onload = () => resolve(window.Juw12Widget || null);
          script.onerror = () => {
            widgetLoading = null;
            script.remove();
            resolve(null);
          };
          document.head.appendChild(script);
        });
      }
      return widgetLoading;
    },

    /** Your own garden beds: { s: seed, b: bloom time } once watered enough to finish, else { s, t: thirsty from }. */
    garden() {
      const beds = [];
      if (typeof Cozy.seedMinutes !== 'function') {
        return beds;
      }
      for (let i = 0; i < WIDGET_BEDS; i++) {
        const bed = Cozy.store.get('garden.' + i, null);
        const minutes = bed && bed.seedId ? Cozy.seedMinutes(bed.seedId) : 0;
        if (!minutes) {
          continue;
        }
        const totalMs = minutes * 60000;
        const grownMs = Number(bed.grownMs) || 0;
        const lastTick = Number(bed.lastTick) || 0;
        const waterEnds = Number(bed.waterEnds) || 0;
        if (grownMs + Math.max(0, waterEnds - lastTick) >= totalMs) {
          beds.push({ s: bed.seedId, b: Math.round(lastTick + totalMs - grownMs) });
        } else {
          beds.push({ s: bed.seedId, t: Math.round(waterEnds) });
        }
      }
      return beds;
    },

    snapshot() {
      return {
        name: String(Cozy.store.get('name', '') || '').slice(0, 24),
        season: Cozy.season.current(),
        rain: Cozy.weather.isRaining(),
        fish: Cozy.progress.get('fish'),
        harvest: Cozy.progress.get('harvest'),
        sessions: Cozy.progress.get('focus_sessions'),
        mindfulMin: Math.floor(Cozy.progress.get('mindful_seconds') / 60),
        garden: this.garden(),
        focus: this.focus,
      };
    },

    send() {
      const urgent = widgetUrgent;
      window.clearTimeout(widgetTimer);
      widgetTimer = 0;
      widgetUrgent = false;
      try {
        if (window.Juw12Widget) {
          window.Juw12Widget.publish('cozy', this.snapshot(), { urgent });
        }
      } catch (error) {
        /* the widget is optional: the island never depends on it */
      }
    },

    /** Ask for a fresh snapshot soon. Cheap, and does nothing while this browser is not paired. */
    queue(urgent) {
      if (!window.Juw12Widget) {
        return;
      }
      widgetUrgent = widgetUrgent || Boolean(urgent);
      if (document.hidden) {
        this.send();   // a hidden page may not get another timer tick
      } else if (!widgetTimer) {
        widgetTimer = window.setTimeout(() => this.send(), WIDGET_SETTLE_MS);
      }
    },

    setFocus(state) {
      this.focus = state;
      this.queue(true);
    },
  };

  if (Cozy.widget.wanted()) {
    Cozy.widget.load().then(() => Cozy.widget.queue());
  }
  window.addEventListener('juw12-widget-code', () => Cozy.widget.queue(true));
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      Cozy.widget.queue();   // season, rain and garden timers may have moved on while away
    }
  });

  const eventHandlers = {};
  /** Tiny event bus: 'bite', 'catch' (fish), 'cooked' (recipe), 'harvest' (seed). */
  Cozy.events = {
    on(name, handler) {
      (eventHandlers[name] = eventHandlers[name] || []).push(handler);
    },
    emit(name, data) {
      (eventHandlers[name] || []).forEach((handler) => handler(data));
    },
  };

  /** Ingredients for cooking: fish by species name, crops by seed id; cooked dishes by recipe id. */
  Cozy.pantry = {
    KINDS: ['fish', 'crops', 'dishes'],
    read() {
      const pantry = Cozy.store.get('pantry', {});
      for (const kind of this.KINDS) {
        pantry[kind] = pantry[kind] || {};
      }
      return pantry;
    },
    count(kind, key) {
      return this.read()[kind][key] || 0;
    },
    add(kind, key, amount) {
      const pantry = this.read();
      pantry[kind][key] = Math.max(0, (pantry[kind][key] || 0) + (amount === undefined ? 1 : amount));
      Cozy.store.set('pantry', pantry);
    },
    take(kind, key, amount) {
      const needed = amount === undefined ? 1 : amount;
      if (this.count(kind, key) < needed) {
        return false;
      }
      this.add(kind, key, -needed);
      return true;
    },
  };

  // ------------------------------------------------------------------ input

  const Input = {
    keysDown: new Set(),
    keysPressed: new Set(),
    pointer: { x: 0, y: 0 },
    left: false,
    right: false,
    leftPressed: false,
    rightPressed: false,
    rightReleased: false,
    rightDragDistance: 0,
    dragX: 0,
    dragY: 0,
    wheel: 0,
    touchOrbit: false,   // set by the game: one-finger drag looks around (only while exploring the island)
    touches: new Map(),  // active touch pointers: id -> { x, y }
    pinchDistance: 0,

    /** On-screen buttons call this so a tap does exactly what the matching key does. */
    tap(code) {
      this.keysPressed.add(code);
    },

    init(canvas) {
      window.addEventListener('keydown', (event) => {
        if (isTyping(event)) {
          return;
        }
        if (!this.keysDown.has(event.code)) {
          this.keysPressed.add(event.code);
        }
        this.keysDown.add(event.code);
        if (event.code === 'Space' || event.code.startsWith('Arrow')) {
          event.preventDefault();
        }
      });
      window.addEventListener('keyup', (event) => {
        this.keysDown.delete(event.code);
      });
      window.addEventListener('blur', () => {
        this.keysDown.clear();
        this.left = false;
        this.right = false;
      });
      canvas.addEventListener('contextmenu', (event) => event.preventDefault());
      canvas.addEventListener('pointerdown', (event) => {
        canvas.setPointerCapture(event.pointerId);
        // a tap has no pointermove before it: aim where the finger (or pen) lands
        this.pointer.x = event.clientX;
        this.pointer.y = event.clientY;
        if (event.pointerType === 'touch') {
          this.touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
          if (this.touches.size === 2) {
            // a second finger means look / zoom, not a long press on the first spot
            this.left = false;
            this.leftPressed = false;
            this.pinchDistance = this.touchSpread();
            return;
          }
          if (this.touches.size > 2) {
            return;
          }
        }
        if (event.button === 0) {
          this.left = true;
          this.leftPressed = true;
        } else if (event.button === 2) {
          this.right = true;
          this.rightPressed = true;
          this.rightDragDistance = 0;
        }
      });
      const releaseTouch = (event) => {
        if (event.pointerType !== 'touch') {
          return;
        }
        this.touches.delete(event.pointerId);
        if (this.touches.size < 2) {
          this.pinchDistance = 0;
        }
      };
      canvas.addEventListener('pointercancel', (event) => {
        releaseTouch(event);
        this.left = false;
      });
      canvas.addEventListener('pointerup', (event) => {
        releaseTouch(event);
        if (event.button === 0) {
          this.left = false;
        } else if (event.button === 2) {
          this.right = false;
          this.rightReleased = true;
        }
      });
      canvas.addEventListener('pointermove', (event) => {
        if (event.pointerType === 'touch' && this.touches.has(event.pointerId)) {
          const last = this.touches.get(event.pointerId);
          const dx = event.clientX - last.x;
          const dy = event.clientY - last.y;
          last.x = event.clientX;
          last.y = event.clientY;
          if (this.touches.size >= 2) {
            // two fingers: drag to look around (averaged), pinch to zoom
            this.dragX += dx / this.touches.size;
            this.dragY += dy / this.touches.size;
            const spread = this.touchSpread();
            if (this.pinchDistance > 0 && spread > 0) {
              this.wheel += (this.pinchDistance / spread - 1) * 10;
            }
            this.pinchDistance = spread;
            return;
          }
          if (this.touchOrbit) {
            this.dragX += dx;
            this.dragY += dy;
          }
        }
        this.pointer.x = event.clientX;
        this.pointer.y = event.clientY;
        if (this.right) {
          this.dragX += event.movementX;
          this.dragY += event.movementY;
          this.rightDragDistance += Math.abs(event.movementX) + Math.abs(event.movementY);
        }
      });
      canvas.addEventListener('wheel', (event) => {
        event.preventDefault();
        this.wheel += Math.sign(event.deltaY);
      }, { passive: false });
    },

    touchSpread() {
      const points = [...this.touches.values()];
      if (points.length < 2) {
        return 0;
      }
      return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
    },

    pressed(code) {
      return this.keysPressed.has(code);
    },
    get primaryPressed() {
      return this.leftPressed || this.pressed('Space');
    },
    get primaryHeld() {
      return this.left || this.keysDown.has('Space');
    },

    endFrame() {
      this.keysPressed.clear();
      this.leftPressed = false;
      this.rightPressed = false;
      this.rightReleased = false;
      this.dragX = 0;
      this.dragY = 0;
      this.wheel = 0;
    },
  };

  function isTyping(event) {
    const tag = event.target && event.target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA';
  }

  Cozy.input = Input;

  // ------------------------------------------------------------------ UI helpers

  const TOUCH_SCREEN = !!(window.matchMedia && window.matchMedia('(hover: none) and (pointer: coarse)').matches);

  /** On phones and tablets the hints say "tap" instead of "click". */
  function forScreen(text) {
    if (!TOUCH_SCREEN || typeof text !== 'string') {
      return text;
    }
    return text
      .replace(/\bClick\b/g, 'Tap').replace(/\bclick\b/g, 'tap').replace(/\bclicking\b/g, 'tapping')
      // keyboard hints become the on-screen buttons' wording
      .replace(/\bQ\s+‹\s*/g, '‹ ').replace(/\s*›\s+E\b/g, ' ›')
      .replace(/\bQ\/E (pick|change|choose)\b/g, 'the ‹ › buttons $1')
      .replace(/\bQ\/E\b/g, '‹ ›').replace(/ or Space\b/g, '')
      .replace(/\bJ (journal|opens)\b/g, (match, word) => (word === 'journal' ? 'journal' : 'the Journal button opens'))
      .replace(/([.!?]\s+)the Journal button/g, '$1The Journal button');
  }

  const UI = {
    touchScreen: TOUCH_SCREEN,
    el(id) {
      return document.getElementById(id);
    },
    setText(element, text) {
      text = forScreen(text);
      if (element && element.textContent !== text) {
        element.textContent = text;
      }
    },
    show(element, visible) {
      if (!element) {
        return;
      }
      const display = visible ? '' : 'none';
      if (element.style.display !== display) {
        element.style.display = display;
      }
    },
    toastTimer: 0,
    clearToast() {
      this.toastTimer = 0;
      this.el('toast').classList.remove('visible');
    },
    toast(text, seconds) {
      const toast = this.el('toast');
      toast.textContent = forScreen(text);
      toast.classList.add('visible');
      this.toastTimer = seconds || 4;
    },
    tooltip(text) {
      const tip = this.el('tooltip');
      if (!text) {
        this.show(tip, false);
        return;
      }
      this.setText(tip, text);
      this.show(tip, true);
      tip.style.transform = `translate(${Input.pointer.x + 18}px, ${Input.pointer.y + 10}px)`;
    },
    update(dt) {
      if (this.toastTimer > 0) {
        this.toastTimer -= dt;
        if (this.toastTimer <= 0) {
          this.el('toast').classList.remove('visible');
        }
      }
    },
    bar(element, value) {
      if (element) {
        element.style.width = `${Math.round(Cozy.clamp01(value) * 1000) / 10}%`;
      }
    },
  };

  Cozy.ui = UI;

  // ------------------------------------------------------------------ procedural ASMR audio (no sound files needed)

  const Sound = {
    ctx: null,
    master: null,
    muted: false,
    buffers: {},
    timers: { lap: 2, bird: 3, frog: 9, cricket: 5, owl: 20, drip: 0, thunder: 40 },
    loops: {},
    night: 0,     // 0 = bright day, 1 = deep night (set by the world every frame)
    evening: 0.7, // lantern / firefly amount; crickets sing when this is high
    rain: 0,      // 0..1 rain amount (set by the world)
    roof: 0,      // 0..1 how close you are to the cabin roof (set by main)

    start() {
      if (this.ctx) {
        return;
      }
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtor) {
        return;
      }
      const ctx = new AudioCtor();
      this.ctx = ctx;
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -18;
      compressor.ratio.value = 3;
      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.85;
      this.master.connect(compressor);
      compressor.connect(ctx.destination);
      this.buffers.white = this.makeNoise('white');
      this.buffers.pink = this.makeNoise('pink');
      this.buffers.brown = this.makeNoise('brown');
      this.startAmbience();
    },

    toggleMute() {
      // remember the choice even before audio has started (or when it is blocked)
      this.muted = !this.muted;
      if (this.ctx && this.master) {
        this.master.gain.setTargetAtTime(this.muted ? 0 : 0.85, this.ctx.currentTime, 0.15);
      }
      return this.muted;
    },

    makeNoise(color) {
      const ctx = this.ctx;
      const length = ctx.sampleRate * 3;
      const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
      for (let i = 0; i < length; i++) {
        const white = Math.random() * 2 - 1;
        if (color === 'white') {
          data[i] = white * 0.5;
        } else if (color === 'pink') {
          b0 = 0.99886 * b0 + white * 0.0555179;
          b1 = 0.99332 * b1 + white * 0.0750759;
          b2 = 0.969 * b2 + white * 0.153852;
          b3 = 0.8665 * b3 + white * 0.3104856;
          b4 = 0.55 * b4 + white * 0.5329522;
          b5 = -0.7616 * b5 - white * 0.016898;
          data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
          b6 = white * 0.115926;
        } else {
          last = (last + 0.02 * white) / 1.02;
          data[i] = last * 3.5;
        }
      }
      return buffer;
    },

    noiseSource(color, loop) {
      const source = this.ctx.createBufferSource();
      source.buffer = this.buffers[color];
      source.loop = !!loop;
      return source;
    },

    /** gain node with attack / release envelope, routed through an optional panner. */
    envelope(startTime, attack, hold, release, peak, pan) {
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.0001, startTime);
      gain.gain.linearRampToValueAtTime(peak, startTime + attack);
      gain.gain.setValueAtTime(peak, startTime + attack + hold);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + attack + hold + release);
      if (pan !== undefined && this.ctx.createStereoPanner) {
        const panner = this.ctx.createStereoPanner();
        panner.pan.value = pan;
        gain.connect(panner);
        panner.connect(this.master);
      } else {
        gain.connect(this.master);
      }
      return gain;
    },

    // ---------------------------------------------------------------- ambience

    startAmbience() {
      const ctx = this.ctx;
      // water lapping bed: brown noise, low-passed, slowly breathing
      const water = this.noiseSource('brown', true);
      const waterFilter = ctx.createBiquadFilter();
      waterFilter.type = 'lowpass';
      waterFilter.frequency.value = 420;
      const waterGain = ctx.createGain();
      waterGain.gain.value = 0.22;
      const waterLfo = ctx.createOscillator();
      waterLfo.frequency.value = 0.11;
      const waterLfoDepth = ctx.createGain();
      waterLfoDepth.gain.value = 0.08;
      waterLfo.connect(waterLfoDepth);
      waterLfoDepth.connect(waterGain.gain);
      water.connect(waterFilter);
      waterFilter.connect(waterGain);
      waterGain.connect(this.master);
      water.start();
      waterLfo.start();

      // soft wind through leaves: pink noise with a slowly drifting band-pass
      const wind = this.noiseSource('pink', true);
      const windFilter = ctx.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.value = 650;
      windFilter.Q.value = 0.6;
      const windSweep = ctx.createOscillator();
      windSweep.frequency.value = 0.045;
      const windSweepDepth = ctx.createGain();
      windSweepDepth.gain.value = 260;
      windSweep.connect(windSweepDepth);
      windSweepDepth.connect(windFilter.frequency);
      const windGain = ctx.createGain();
      windGain.gain.value = 0.05;
      wind.connect(windFilter);
      windFilter.connect(windGain);
      windGain.connect(this.master);
      wind.start(0, 1.3);
      windSweep.start();
    },

    update(dt) {
      if (!this.ctx) {
        return;
      }
      const timers = this.timers;
      timers.lap -= dt;
      timers.bird -= dt;
      timers.frog -= dt;
      timers.cricket -= dt;
      timers.owl -= dt;
      timers.drip -= dt;
      timers.thunder -= dt;
      // rain: a soft hiss bed, drops on the roof near the cabin, and very rare far-away thunder
      if (this.rain > 0.04) {
        this.startLoop('rain');
        this.setLoopVolume('rain', this.rain);
        if (timers.drip <= 0) {
          timers.drip = 0.05 + Math.random() * 0.12 / Math.max(0.2, this.rain * (0.4 + this.roof));
          this.tick(0.012 + 0.05 * this.roof * Math.random(), 600 + Math.random() * (this.roof > 0.3 ? 900 : 2600));
        }
        if (timers.thunder <= 0) {
          timers.thunder = 70 + Math.random() * 90;
          if (this.rain > 0.7) {
            this.thunder();
          }
        }
      } else if (this.loops.rain) {
        this.stopLoop('rain');
      }
      if (timers.lap <= 0) {
        timers.lap = 1.8 + Math.random() * 3.5;
        this.lap();
      }
      if (timers.bird <= 0) {
        // birds by day, quiet at night
        timers.bird = (5 + Math.random() * 10) * (1 + this.night * 2);
        if (Math.random() > this.night) {
          this.birdSong(Math.random() * 1.6 - 0.8, 0.05);
        }
      }
      if (timers.frog <= 0) {
        timers.frog = (14 + Math.random() * 20) * (1 - this.night * 0.5);
        this.frog();
      }
      if (timers.cricket <= 0) {
        // crickets from the evening on, almost constant at night
        timers.cricket = this.night > 0.5 ? 1.2 + Math.random() * 2.5 : 6 + Math.random() * 9;
        if (this.evening > 0.4) {
          this.crickets();
        }
      }
      if (timers.owl <= 0) {
        timers.owl = 25 + Math.random() * 35;
        if (this.night > 0.7) {
          this.owl();
        }
      }
      if (this.loops.reel) {
        this.loops.reel.timer -= dt;
        if (this.loops.reel.timer <= 0) {
          this.loops.reel.timer = this.loops.reel.interval;
          this.tick(0.05, 3200 + Math.random() * 600);
        }
      }
    },

    lap() {
      const t = this.ctx.currentTime;
      const source = this.noiseSource('pink');
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(380 + Math.random() * 250, t);
      filter.frequency.linearRampToValueAtTime(220, t + 0.9);
      filter.Q.value = 1.2;
      const gain = this.envelope(t, 0.25, 0.1, 0.8, 0.07 + Math.random() * 0.05, Math.random() * 1.2 - 0.6);
      source.connect(filter);
      filter.connect(gain);
      source.start(t, Math.random() * 2, 1.4);
    },

    birdSong(pan, volume) {
      const t0 = this.ctx.currentTime;
      const notes = 2 + Math.floor(Math.random() * 4);
      const base = 2200 + Math.random() * 1600;
      for (let i = 0; i < notes; i++) {
        const t = t0 + i * (0.09 + Math.random() * 0.08);
        const osc = this.ctx.createOscillator();
        osc.type = 'sine';
        const start = base * (0.9 + Math.random() * 0.25);
        osc.frequency.setValueAtTime(start, t);
        osc.frequency.exponentialRampToValueAtTime(start * (1.15 + Math.random() * 0.35), t + 0.06);
        osc.frequency.exponentialRampToValueAtTime(start * 0.95, t + 0.1);
        const gain = this.envelope(t, 0.01, 0.04, 0.06, volume, pan);
        osc.connect(gain);
        osc.start(t);
        osc.stop(t + 0.2);
      }
    },

    frog() {
      const t0 = this.ctx.currentTime;
      for (let i = 0; i < 2; i++) {
        const t = t0 + i * 0.16;
        const osc = this.ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, t);
        osc.frequency.linearRampToValueAtTime(110, t + 0.1);
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 500;
        const gain = this.envelope(t, 0.01, 0.05, 0.06, 0.035, -0.5 + Math.random());
        osc.connect(filter);
        filter.connect(gain);
        osc.start(t);
        osc.stop(t + 0.2);
      }
    },

    crickets() {
      const t0 = this.ctx.currentTime;
      const pan = Math.random() * 1.6 - 0.8;
      const pulses = 6 + Math.floor(Math.random() * 6);
      for (let i = 0; i < pulses; i++) {
        const t = t0 + i * 0.07;
        const osc = this.ctx.createOscillator();
        osc.frequency.value = 4400 + Math.random() * 200;
        const gain = this.envelope(t, 0.005, 0.02, 0.03, 0.012, pan);
        osc.connect(gain);
        osc.start(t);
        osc.stop(t + 0.08);
      }
    },

    owl() {
      const t0 = this.ctx.currentTime;
      const pan = Math.random() * 1.4 - 0.7;
      [0, 0.42, 0.62].forEach((offset, i) => {
        const t = t0 + offset;
        const osc = this.ctx.createOscillator();
        osc.type = 'sine';
        const pitch = i === 0 ? 390 : 360;
        osc.frequency.setValueAtTime(pitch, t);
        osc.frequency.linearRampToValueAtTime(pitch * 0.9, t + 0.22);
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 900;
        const gain = this.envelope(t, 0.04, 0.08, 0.16, i === 0 ? 0.05 : 0.035, pan);
        osc.connect(filter);
        filter.connect(gain);
        osc.start(t);
        osc.stop(t + 0.35);
      });
    },

    /** A soft, distant rumble (never a crack). */
    thunder() {
      if (!this.ctx) {
        return;
      }
      const t = this.ctx.currentTime;
      const source = this.noiseSource('brown');
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(140, t);
      filter.frequency.linearRampToValueAtTime(70, t + 3.5);
      const gain = this.envelope(t, 0.8, 0.6, 2.6, 0.22, Math.random() * 1.2 - 0.6);
      source.connect(filter);
      filter.connect(gain);
      source.start(t, Math.random(), 4.5);
    },

    /** Wood crackle from the campfire: a few tiny bright clicks. */
    crackle() {
      if (!this.ctx) {
        return;
      }
      const pops = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < pops; i++) {
        setTimeout(() => this.tick(0.025 + Math.random() * 0.03, 900 + Math.random() * 1800), i * (30 + Math.random() * 90));
      }
    },

    chop() {
      if (!this.ctx) {
        return;
      }
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(210, t);
      osc.frequency.exponentialRampToValueAtTime(90, t + 0.08);
      const body = this.envelope(t, 0.002, 0.01, 0.08, 0.16);
      osc.connect(body);
      osc.start(t);
      osc.stop(t + 0.15);
      this.tick(0.07, 2400);
    },

    meow() {
      if (!this.ctx) {
        return;
      }
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(480, t);
      osc.frequency.linearRampToValueAtTime(760, t + 0.18);
      osc.frequency.linearRampToValueAtTime(430, t + 0.5);
      const formant = this.ctx.createBiquadFilter();
      formant.type = 'bandpass';
      formant.Q.value = 3;
      formant.frequency.setValueAtTime(900, t);
      formant.frequency.linearRampToValueAtTime(1600, t + 0.2);
      formant.frequency.linearRampToValueAtTime(800, t + 0.5);
      const gain = this.envelope(t, 0.05, 0.25, 0.2, 0.09, 0.3);
      osc.connect(formant);
      formant.connect(gain);
      osc.start(t);
      osc.stop(t + 0.6);
    },

    purr(seconds) {
      if (!this.ctx) {
        return;
      }
      const t = this.ctx.currentTime;
      const duration = seconds || 1.8;
      const source = this.noiseSource('brown', true);
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 220;
      const rumble = this.ctx.createGain();
      rumble.gain.value = 0.5;
      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = 24;
      const lfoDepth = this.ctx.createGain();
      lfoDepth.gain.value = 0.5;
      lfo.connect(lfoDepth);
      lfoDepth.connect(rumble.gain);
      const gain = this.envelope(t, 0.25, duration - 0.6, 0.35, 0.5, 0.25);
      source.connect(filter);
      filter.connect(rumble);
      rumble.connect(gain);
      source.start(t, Math.random() * 2);
      source.stop(t + duration + 0.1);
      lfo.start(t);
      lfo.stop(t + duration + 0.1);
    },

    // ---------------------------------------------------------------- one-shots

    tick(volume, frequency) {
      if (!this.ctx) {
        return;
      }
      const t = this.ctx.currentTime;
      const source = this.noiseSource('white');
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = frequency || 2500;
      filter.Q.value = 4;
      const gain = this.envelope(t, 0.002, 0.005, 0.03, volume || 0.08);
      source.connect(filter);
      filter.connect(gain);
      source.start(t, Math.random() * 2, 0.06);
    },

    whoosh() {
      if (!this.ctx) {
        return;
      }
      const t = this.ctx.currentTime;
      const source = this.noiseSource('pink');
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.Q.value = 1.5;
      filter.frequency.setValueAtTime(400, t);
      filter.frequency.exponentialRampToValueAtTime(2200, t + 0.25);
      filter.frequency.exponentialRampToValueAtTime(600, t + 0.6);
      const gain = this.envelope(t, 0.08, 0.1, 0.45, 0.18);
      source.connect(filter);
      filter.connect(gain);
      source.start(t, Math.random(), 0.8);
    },

    plop(size) {
      if (!this.ctx) {
        return;
      }
      const scale = size || 1;
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(520 / Math.sqrt(scale), t);
      osc.frequency.exponentialRampToValueAtTime(140 / Math.sqrt(scale), t + 0.12);
      const gain = this.envelope(t, 0.004, 0.02, 0.14, 0.25 * Math.min(1.5, scale));
      osc.connect(gain);
      osc.start(t);
      osc.stop(t + 0.3);
      this.splash(0.4 * scale);
    },

    splash(size) {
      if (!this.ctx) {
        return;
      }
      const t = this.ctx.currentTime;
      const source = this.noiseSource('white');
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(3000, t);
      filter.frequency.exponentialRampToValueAtTime(500, t + 0.4);
      const gain = this.envelope(t, 0.005, 0.03, 0.4, 0.12 * (size || 1));
      source.connect(filter);
      filter.connect(gain);
      source.start(t, Math.random() * 2, 0.6);
    },

    chime(notes, volume, spacing) {
      if (!this.ctx) {
        return;
      }
      const t0 = this.ctx.currentTime;
      notes.forEach((frequency, i) => {
        const t = t0 + i * (spacing || 0.12);
        [1, 2.01, 3.02].forEach((partial, j) => {
          const osc = this.ctx.createOscillator();
          osc.frequency.value = frequency * partial;
          const gain = this.envelope(t, 0.005, 0.02, 1.4 - j * 0.35, (volume || 0.1) / (j + 1));
          osc.connect(gain);
          osc.start(t);
          osc.stop(t + 2);
        });
      });
    },

    jingle() {
      this.chime([523, 659, 784, 1047], 0.09, 0.11);
    },

    softChime() {
      this.chime([659, 880], 0.07, 0.25);
    },

    bowl(frequency) {
      if (!this.ctx) {
        return;
      }
      const t = this.ctx.currentTime;
      [1, 2.71, 5.4].forEach((partial, i) => {
        const osc = this.ctx.createOscillator();
        osc.frequency.value = frequency * partial;
        const gain = this.envelope(t, 0.03, 0.1, 3.2 - i * 0.8, 0.06 / (i + 1));
        osc.connect(gain);
        osc.start(t);
        osc.stop(t + 4);
      });
    },

    snap() {
      this.tick(0.25, 1800);
      this.splash(0.5);
    },

    pop() {
      if (!this.ctx) {
        return;
      }
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      osc.frequency.setValueAtTime(380, t);
      osc.frequency.exponentialRampToValueAtTime(900, t + 0.06);
      const gain = this.envelope(t, 0.003, 0.02, 0.08, 0.15);
      osc.connect(gain);
      osc.start(t);
      osc.stop(t + 0.15);
    },

    thud() {
      if (!this.ctx) {
        return;
      }
      const t = this.ctx.currentTime;
      const source = this.noiseSource('brown');
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 300;
      const gain = this.envelope(t, 0.005, 0.03, 0.15, 0.35);
      source.connect(filter);
      filter.connect(gain);
      source.start(t, Math.random(), 0.25);
    },

    shutter() {
      this.tick(0.2, 4000);
      setTimeout(() => this.tick(0.15, 2500), 70);
    },

    sip() {
      if (!this.ctx) {
        return;
      }
      const t = this.ctx.currentTime;
      const source = this.noiseSource('pink');
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(900, t);
      filter.frequency.linearRampToValueAtTime(1400, t + 0.35);
      filter.Q.value = 3;
      const gain = this.envelope(t, 0.08, 0.15, 0.2, 0.09);
      source.connect(filter);
      filter.connect(gain);
      source.start(t, Math.random(), 0.6);
    },

    /** Continuous filtered-noise loops: 'pour' (watering / tea), 'kettle', 'sizzle' (pan), 'fire' (campfire). */
    startLoop(name) {
      if (!this.ctx || this.loops[name]) {
        return;
      }
      const LOOPS = {
        pour: { noise: 'pink', type: 'bandpass', frequency: 1500, q: 0.9, gain: 0.12 },
        kettle: { noise: 'brown', type: 'bandpass', frequency: 260, q: 2, gain: 0.25 },
        sizzle: { noise: 'white', type: 'bandpass', frequency: 4200, q: 0.8, gain: 0.05 },
        fire: { noise: 'brown', type: 'lowpass', frequency: 380, q: 0.7, gain: 0.16 },
        rain: { noise: 'pink', type: 'lowpass', frequency: 2800, q: 0.4, gain: 0.14 },
      };
      const config = LOOPS[name] || LOOPS.pour;
      const t = this.ctx.currentTime;
      const source = this.noiseSource(config.noise, true);
      const filter = this.ctx.createBiquadFilter();
      filter.type = config.type;
      filter.frequency.value = config.frequency;
      filter.Q.value = config.q;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(config.gain, t + 0.4);
      source.connect(filter);
      filter.connect(gain);
      gain.connect(this.master);
      source.start(t, Math.random() * 2);
      this.loops[name] = { source, gain, filter, base: config.gain };
    },

    /** 0..1 volume multiplier for a running loop. */
    setLoopVolume(name, amount) {
      const loop = this.loops[name];
      if (loop && loop.gain && loop.base) {
        loop.gain.gain.setTargetAtTime(Math.max(0.0001, loop.base * amount), this.ctx.currentTime, 0.15);
      }
    },

    setLoopPitch(name, frequency) {
      const loop = this.loops[name];
      if (loop && loop.filter) {
        loop.filter.frequency.setTargetAtTime(frequency, this.ctx.currentTime, 0.2);
      }
    },

    stopLoop(name) {
      const loop = this.loops[name];
      if (!loop || !this.ctx) {
        return;
      }
      const t = this.ctx.currentTime;
      if (loop.gain) {
        loop.gain.gain.cancelScheduledValues(t);
        loop.gain.gain.setTargetAtTime(0.0001, t, 0.12);
        loop.source.stop(t + 0.6);
      }
      delete this.loops[name];
    },

    startReel(interval) {
      this.loops.reel = { timer: 0, interval: interval || 0.07 };
    },

    stopReel() {
      delete this.loops.reel;
    },
  };

  // Audio only starts after a tap/click (browser rule). Until then - or if the browser blocks audio,
  // e.g. a phone on silent - every sound call is a quiet no-op instead of an error that stops the game loop.
  Object.keys(Sound).forEach((key) => {
    const method = Sound[key];
    if (typeof method !== 'function' || key === 'start' || key === 'toggleMute') {
      return;
    }
    Sound[key] = function soundIfReady(...args) {
      if (!this.ctx) {
        return undefined;
      }
      return method.apply(this, args);
    };
  });

  Cozy.sound = Sound;
})(window.Cozy);
