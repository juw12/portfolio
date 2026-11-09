// Economy on the client: wallet HUD, market panel, collecting from producers and "ready" badges.
// The server (economy.py) is the source of truth; this file only displays and sends requests.
import * as THREE from 'three';

export const GOOD_ICONS = { wheat: '🌾', wood: '🌲', stone: '🧱', bread: '🍞', planks: '🟫' };

// Defaults until the server sends its rules (keep in sync with economy.py).
export const MARKET = { x: -9.475, z: -9.475, angle: (5 * Math.PI) / 4, reach: 5 };

// Display-only copy of the production rule in economy.py `settle`.
export function producerStatus(data, spec, now) {
  const stock = data.stock || 0;
  const since = data.since ?? now;
  const elapsed = Math.max(0, now - since);
  const cycles = Math.floor(elapsed / spec.seconds);
  let feedable = Infinity;
  for (const [item, need] of Object.entries(spec.inputs || {})) {
    feedable = Math.min(feedable, Math.floor(((data.hopper || {})[item] || 0) / need));
  }
  const made = Math.max(0, Math.min(cycles, spec.cap - stock, feedable));
  const ready = stock + made;
  const starved = feedable - made <= 0 && Object.keys(spec.inputs || {}).length > 0;
  const full = ready >= spec.cap;
  const progress = full || starved ? 0 : (elapsed % spec.seconds) / spec.seconds;
  return { ready, full, starved, progress };
}

const badgeTextures = new Map();
function badgeTexture(text) {
  if (!badgeTextures.has(text)) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(20, 24, 32, 0.78)';
    ctx.beginPath();
    ctx.roundRect(4, 8, 120, 48, 22);
    ctx.fill();
    ctx.font = '600 30px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.fillText(text, 64, 34);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    badgeTextures.set(text, texture);
  }
  return badgeTextures.get(text);
}

export function createEconomy({ $, toast, network, player, placed, rules, getOwnerTag }) {
  const state = {
    wallet: null,
    prices: {},
    plotPrice: 0,
    clockOffset: 0, // serverTime - local time (s)
    marketOpen: false,
    badgeTimer: 0,
    order: null, // Rosa's daily order
  };

  const econ = () => rules.economy || null;
  const serverNow = () => Date.now() / 1000 + state.clockOffset;
  const market = () => econ()?.market || MARKET;

  function costOf(type) {
    return econ()?.buildCosts?.[type] ?? 0;
  }

  // Coins already promised to builds the server hasn't confirmed yet.
  function pendingSpend() {
    let total = 0;
    for (const entry of placed.values()) {
      if (entry.pending) {
        total += costOf(entry.data.type);
      }
    }
    return total;
  }

  function canAfford(type) {
    if (!state.wallet || !network.online) {
      return true; // offline / not loaded yet: the server decides later
    }
    return state.wallet.coins - pendingSpend() >= costOf(type);
  }

  // ------------------------------------------------------------- HUD
  function renderWallet() {
    const element = $('wallet');
    if (!state.wallet) {
      element.hidden = true;
      return;
    }
    element.hidden = false;
    const parts = [`💰 ${state.wallet.coins}`];
    for (const [item, count] of Object.entries(state.wallet.goods)) {
      parts.push(`${GOOD_ICONS[item] || '📦'} ${count}`);
    }
    element.textContent = parts.join('   ');
    if (state.lastCoins !== undefined && state.wallet.coins > state.lastCoins) {
      element.classList.remove('bump');
      void element.offsetWidth; // restart the animation
      element.classList.add('bump');
    }
    state.lastCoins = state.wallet.coins;
  }

  // ------------------------------------------------------------- market panel
  function nearMarket() {
    const m = market();
    return Math.hypot(player.position.x - m.x, player.position.z - m.z) <= m.reach;
  }

  function trade(op, item, qty) {
    network.outgoingBuild.push({ op, item, qty });
  }

  const marketRows = new Map(); // item -> { owned, sellOne, sellAll, buyOne }

  function marketRow(item, label) {
    if (marketRows.has(item)) {
      return marketRows.get(item);
    }
    const row = document.createElement('div');
    row.className = 'market-row';
    const name = document.createElement('span');
    name.className = 'market-name';
    name.textContent = `${GOOD_ICONS[item] || ''} ${label}`;
    const owned = document.createElement('span');
    owned.className = 'market-have';
    const sellOne = document.createElement('button');
    sellOne.addEventListener('click', () => trade('sell', item, 1));
    const sellAll = document.createElement('button');
    sellAll.textContent = 'Sell all';
    sellAll.addEventListener('click', () => trade('sell', item, Math.min(state.wallet?.goods?.[item] || 0, 99)));
    const buyOne = document.createElement('button');
    buyOne.className = 'buy';
    buyOne.addEventListener('click', () => trade('buy', item, 1));
    row.append(name, owned, sellOne, sellAll, buyOne);
    $('marketRows').append(row);
    const parts = { owned, sellOne, sellAll, buyOne };
    marketRows.set(item, parts);
    return parts;
  }

  function renderMarket() {
    const panel = $('marketPanel');
    panel.hidden = !state.marketOpen;
    if (!state.marketOpen) {
      return;
    }
    // Update rows in place so a click is never lost to a re-render.
    for (const [item, label] of Object.entries(econ()?.goods || {})) {
      const parts = marketRow(item, label);
      const price = state.prices[item] || { sell: 0, buy: 0 };
      const have = state.wallet?.goods?.[item] || 0;
      parts.owned.textContent = `×${have}`;
      parts.sellOne.textContent = `Sell ${price.sell.toFixed(1)}`;
      parts.sellOne.disabled = have < 1;
      parts.sellAll.disabled = have < 1;
      parts.buyOne.textContent = `Buy ${price.buy.toFixed(1)}`;
      parts.buyOne.disabled = !state.wallet || state.wallet.coins < Math.ceil(price.buy);
    }
    $('marketCoins').textContent = state.wallet ? `You have 💰 ${state.wallet.coins}` : '';
    renderOrder();
  }

  // Rosa's order of the day: a batch of one good for a premium, once per person per day.
  function renderOrder() {
    const order = state.order;
    $('marketOrder').hidden = !order;
    if (!order) {
      return;
    }
    const have = state.wallet?.goods?.[order.item] || 0;
    const icon = GOOD_ICONS[order.item] || '📦';
    $('marketOrderText').textContent = order.filled
      ? "✅ Rosa's order is done for today. Come back tomorrow!"
      : `📦 Rosa's order: ${order.qty} ${icon} ${order.label} → ${order.pay} 💰 (you have ${have})`;
    $('marketOrderButton').hidden = order.filled;
    $('marketOrderButton').disabled = have < order.qty;
  }
  $('marketOrderButton').addEventListener('click', () => network.outgoingBuild.push({ op: 'order' }));

  function setMarketOpen(open) {
    state.marketOpen = open;
    renderMarket();
  }
  $('marketClose').addEventListener('click', () => setMarketOpen(false));

  // ------------------------------------------------------------- producers
  function nearestOwnProducer() {
    const reach = econ()?.collectReach ?? 3.5;
    const producers = econ()?.producers || {};
    const ownerTag = getOwnerTag();
    let best = null;
    let bestDistance = reach;
    for (const entry of placed.values()) {
      if (entry.pending || !producers[entry.data.type] || entry.data.owner !== ownerTag) {
        continue;
      }
      const distance = Math.hypot(entry.data.x - player.position.x, entry.data.z - player.position.z);
      if (distance < bestDistance) {
        best = entry;
        bestDistance = distance;
      }
    }
    return best;
  }

  // The contextual action for E / the action button (null when nothing economic is nearby).
  function nearestAction() {
    if (!network.online || !econ()) {
      return null;
    }
    if (nearMarket()) {
      return {
        label: state.marketOpen ? '✖ Close market' : '🛒 Market',
        run: () => setMarketOpen(!state.marketOpen),
      };
    }
    const entry = nearestOwnProducer();
    if (entry) {
      const spec = econ().producers[entry.data.type];
      const status = producerStatus(entry.data, spec, serverNow());
      const icon = GOOD_ICONS[spec.output] || '';
      const label = status.ready ? `🧺 Collect ${status.ready} ${icon}` : status.starved ? `📥 Load ${entry.def.label}` : `🧺 Check ${entry.def.label}`;
      return {
        label,
        run: () => network.outgoingBuild.push({ op: 'collect', id: entry.data.id }),
      };
    }
    return null;
  }

  function updateBadges() {
    const producers = econ()?.producers;
    if (!producers) {
      return;
    }
    const now = serverNow();
    const ownerTag = getOwnerTag();
    for (const entry of placed.values()) {
      const spec = producers[entry.data.type];
      if (!spec) {
        continue;
      }
      const status = producerStatus(entry.data, spec, now);
      let text = '';
      if (status.ready > 0) {
        text = `${GOOD_ICONS[spec.output]} ${status.ready}`;
      } else if (status.starved && entry.data.owner === ownerTag) {
        text = `needs ${Object.keys(spec.inputs).map((i) => GOOD_ICONS[i]).join('')}`;
      }
      if (entry.badgeText === text) {
        continue;
      }
      entry.badgeText = text;
      if (!text) {
        if (entry.badge) {
          entry.badge.visible = false;
        }
        continue;
      }
      if (!entry.badge) {
        entry.badge = new THREE.Sprite(new THREE.SpriteMaterial({ depthWrite: false, transparent: true }));
        entry.badge.scale.set(0.9, 0.45, 1);
        entry.badge.position.set(0, entry.def.size[1] + 0.45, 0);
        entry.badge.renderOrder = 5;
        entry.root.add(entry.badge);
      }
      entry.badge.material.map = badgeTexture(text);
      entry.badge.material.needsUpdate = true;
      entry.badge.visible = true;
    }
  }

  // ------------------------------------------------------------- per frame / per sync
  function update(dt) {
    if (state.marketOpen && !nearMarket()) {
      setMarketOpen(false);
    }
    state.badgeTimer -= dt;
    if (state.badgeTimer <= 0) {
      state.badgeTimer = 0.5;
      updateBadges();
    }
  }

  function applyReply(data) {
    if (typeof data.serverTime === 'number') {
      state.clockOffset = data.serverTime - Date.now() / 1000;
    }
    const before = JSON.stringify([state.wallet, state.prices, state.order]);
    if (data.you?.wallet) {
      state.wallet = data.you.wallet;
      state.plotPrice = data.you.plotPrice;
    }
    if (data.market) {
      state.prices = data.market;
    }
    if (data.order) {
      state.order = data.order;
    }
    if (data.events?.length) {
      toast(data.events.join(' · '));
    }
    if (JSON.stringify([state.wallet, state.prices, state.order]) !== before) {
      renderWallet();
      renderMarket();
    }
  }

  function goOffline() {
    state.wallet = null;
    renderWallet();
    setMarketOpen(false);
  }

  return {
    state,
    costOf,
    canAfford,
    nearestAction,
    update,
    applyReply,
    goOffline,
    plotPrice: () => state.plotPrice,
    coins: () => state.wallet?.coins ?? null,
  };
}
