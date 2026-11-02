// Game feel: floating numbers where things happen, small synthesized sounds, phone buzz,
// the level chip with its XP bar and a level-up banner. The server sends `fx` (what just
// happened to you) and `you.level`; this file only makes those moments feel good.
import * as THREE from 'three';
import { GOOD_ICONS } from './economy.js';

const FLOAT_SECONDS = 1.4;
const SOUND_KEY = 'townsquare-sound';

export function createJuice({ $, camera, getPlayerPosition, isTouch }) {
  const layer = document.createElement('div');
  layer.id = 'fxLayer';
  document.body.append(layer);

  const floats = [];
  const projected = new THREE.Vector3();
  let audio = null;
  let soundOn = localStorage.getItem(SOUND_KEY) !== '0';
  let shownLevel = null;

  // ------------------------------------------------------------- sound (no files: tiny synth)
  function unlockAudio() {
    if (!audio) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        audio = new AudioContextClass();
      }
    }
    if (audio && audio.state === 'suspended') {
      audio.resume();
    }
  }
  window.addEventListener('pointerdown', unlockAudio, { passive: true });
  window.addEventListener('keydown', unlockAudio);

  function tone(frequency, start, length, type = 'sine', volume = 0.12) {
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    const at = audio.currentTime + start;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(volume, at + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start(at);
    oscillator.stop(at + length + 0.02);
  }

  const SOUNDS = {
    collect: () => {
      tone(523, 0, 0.12, 'triangle');
      tone(784, 0.06, 0.16, 'triangle');
    },
    coin: () => {
      tone(988, 0, 0.08, 'square', 0.05);
      tone(1319, 0.07, 0.22, 'square', 0.05);
    },
    bumper: () => {
      [659, 784, 988, 1319].forEach((f, i) => tone(f, i * 0.06, 0.18, 'triangle'));
    },
    level: () => {
      [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.09, 0.3, 'triangle', 0.14));
    },
    chime: () => {
      tone(880, 0, 0.3, 'sine', 0.1);
      tone(1320, 0.1, 0.4, 'sine', 0.08);
    },
  };

  function play(name) {
    if (!soundOn || !audio || audio.state !== 'running') {
      return;
    }
    try {
      SOUNDS[name]();
    } catch (error) {
      // audio is a bonus; never let it break the game
    }
  }

  function buzz(pattern) {
    if (isTouch && navigator.vibrate) {
      navigator.vibrate(pattern);
    }
  }

  function renderSoundButton() {
    $('soundToggle').textContent = soundOn ? '🔊' : '🔇';
    $('soundToggle').title = soundOn ? 'Sound on' : 'Sound off';
  }
  $('soundToggle').addEventListener('click', () => {
    soundOn = !soundOn;
    localStorage.setItem(SOUND_KEY, soundOn ? '1' : '0');
    renderSoundButton();
    unlockAudio();
    play('coin');
  });
  renderSoundButton();

  // ------------------------------------------------------------- floating text in the world
  function floatAt(x, y, z, text, className = '') {
    const element = document.createElement('div');
    element.className = `fx-float ${className}`;
    element.textContent = text;
    layer.append(element);
    floats.push({ element, x, y, z, age: 0 });
  }

  function floatOverPlayer(text, className = '') {
    const position = getPlayerPosition();
    floatAt(position.x, position.y + 2.4, position.z, text, className);
  }

  function update(dt) {
    const width = window.innerWidth;
    const height = window.innerHeight;
    for (let i = floats.length - 1; i >= 0; i -= 1) {
      const item = floats[i];
      item.age += dt;
      const t = item.age / FLOAT_SECONDS;
      if (t >= 1) {
        item.element.remove();
        floats.splice(i, 1);
        continue;
      }
      projected.set(item.x, item.y + t * 1.4, item.z).project(camera);
      const visible = projected.z < 1;
      item.element.style.display = visible ? '' : 'none';
      const screenX = (projected.x * 0.5 + 0.5) * width;
      const screenY = (-projected.y * 0.5 + 0.5) * height;
      const scale = t < 0.15 ? 0.6 + (t / 0.15) * 0.5 : 1.1 - Math.min(0.1, (t - 0.15) * 0.3);
      item.element.style.transform = `translate(-50%, -50%) translate(${screenX}px, ${screenY}px) scale(${scale})`;
      item.element.style.opacity = String(t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1);
    }
  }

  // ------------------------------------------------------------- level chip and banner
  function renderLevel(level) {
    const chip = $('levelChip');
    chip.hidden = false;
    const fraction = level.need ? level.into / level.need : 1;
    $('levelText').textContent = `Lv ${level.level} · ${level.title}`;
    $('levelFill').style.width = `${Math.round(fraction * 100)}%`;
    chip.title = level.need ? `${level.into} / ${level.need} XP to level ${level.level + 1}` : 'Max level';
    if (shownLevel !== null && level.xp > shownLevel.xp) {
      chip.classList.remove('pulse');
      void chip.offsetWidth; // restart the animation
      chip.classList.add('pulse');
    }
    shownLevel = level;
  }

  function levelBanner(effect) {
    const banner = $('levelBanner');
    $('levelBannerTitle').textContent = `LEVEL ${effect.level}`;
    $('levelBannerText').textContent = `${effect.title} · +${effect.coins} 💰`;
    banner.hidden = false;
    banner.classList.remove('show');
    void banner.offsetWidth;
    banner.classList.add('show');
    const confetti = $('levelConfetti');
    confetti.replaceChildren();
    const colors = ['#e9c46a', '#f4a261', '#2a9d8f', '#e76f51', '#a8dadc', '#ffd6e0'];
    for (let i = 0; i < 36; i += 1) {
      const piece = document.createElement('span');
      piece.style.left = `${Math.random() * 100}%`;
      piece.style.background = colors[i % colors.length];
      piece.style.animationDelay = `${Math.random() * 0.4}s`;
      piece.style.setProperty('--drift', `${(Math.random() - 0.5) * 160}px`);
      confetti.append(piece);
    }
    clearTimeout(levelBanner.timer);
    levelBanner.timer = setTimeout(() => {
      banner.hidden = true;
    }, 3200);
    play('level');
    buzz([30, 60, 30, 60, 80]);
  }

  // ------------------------------------------------------------- server effects
  function applyEffect(effect) {
    if (effect.kind === 'collect') {
      const icon = GOOD_ICONS[effect.item] || '📦';
      const text = effect.bumper ? `🍀 +${effect.n} ${icon}` : `+${effect.n} ${icon}`;
      floatAt(effect.x, 1.4, effect.z, text, effect.bumper ? 'bumper' : '');
      play(effect.bumper ? 'bumper' : 'collect');
      buzz(effect.bumper ? [20, 40, 20] : 15);
    } else if (effect.kind === 'coins') {
      floatOverPlayer(`+${effect.amount} 💰`, 'coins');
      play('coin');
      buzz(10);
    } else if (effect.kind === 'xp') {
      floatOverPlayer(`+${effect.amount} XP`, 'xp');
    } else if (effect.kind === 'level') {
      levelBanner(effect);
    } else if (effect.kind === 'goal') {
      floatOverPlayer(`🎯 +${effect.coins} 💰`, 'coins');
      play('chime');
    } else if (effect.kind === 'star') {
      floatOverPlayer(`⭐ ${effect.from}`, 'star');
      play('chime');
      buzz(20);
    }
  }

  function applyReply(data) {
    if (data.you?.level) {
      renderLevel(data.you.level);
    }
    const effects = Array.isArray(data.fx) ? data.fx : [];
    effects.forEach((effect, index) => {
      // Stagger several effects from one sync so they read as separate moments.
      setTimeout(() => applyEffect(effect), index * 180);
    });
  }

  return {
    applyReply,
    update,
    level: () => shownLevel?.level ?? null,
  };
}
