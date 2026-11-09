// "Doom rendering": a live feed of what is happening in town right now. Every entry is a place:
// tap it and you are there. Plus the goal pill that always shows your next rewarded step.
// The server (server.py: goals & town feed) owns both; this file only displays them.
import { setLabel } from './icons.js';

const MAX_SHOWN = 6;

function timeAgo(seconds) {
  if (seconds < 60) {
    return 'just now';
  }
  if (seconds < 3600) {
    return `${Math.floor(seconds / 60)}m ago`;
  }
  if (seconds < 86400) {
    return `${Math.floor(seconds / 3600)}h ago`;
  }
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function createTownFeed({ $, teleport, toast, isTouch }) {
  const state = {
    since: 0,
    entries: [],
    open: !isTouch, // phones start collapsed to keep the view clear
    unread: 0,
    serverOffset: 0, // serverTime - local time (s)
    goalKey: '',
    order: null, // Rosa's order of the day (with .filled for this person)
    top: [], // most-starred plots
    topVersion: 0,
  };

  // Land 2.5 m from the spot, on the side facing the town centre, looking at it.
  function jumpTo(entry) {
    const length = Math.hypot(entry.x, entry.z) || 1;
    const x = entry.x - (entry.x / length) * 2.5;
    const z = entry.z - (entry.z / length) * 2.5;
    teleport(x, z, entry.x, entry.z);
    toast(entry.text);
  }

  function render() {
    const panel = $('townFeed');
    panel.classList.toggle('open', state.open);
    const badge = state.unread && !state.open ? ` · ${state.unread} new` : '';
    setLabel($('feedToggle'), 'news', `Town${badge}`);
    const list = $('feedList');
    list.hidden = !state.open;
    if (!state.open) {
      return;
    }
    list.replaceChildren();
    if (state.order) {
      list.append(orderRow(state.order));
    }
    if (!state.entries.length) {
      const empty = document.createElement('p');
      empty.className = 'feed-empty';
      empty.textContent = 'Quiet so far. Claim a plot and build something!';
      list.append(empty);
    }
    const now = Date.now() / 1000 + state.serverOffset;
    for (const entry of state.entries.slice(-MAX_SHOWN).reverse()) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = `feed-row${entry.fresh ? ' fresh' : ''}`;
      const text = document.createElement('span');
      text.className = 'feed-text';
      text.textContent = entry.text;
      const meta = document.createElement('span');
      meta.className = 'feed-meta';
      setLabel(meta, 'pin', timeAgo(Math.max(0, now - entry.at)));
      row.append(text, meta);
      row.addEventListener('click', () => jumpTo(entry));
      list.append(row);
      entry.fresh = false;
    }
    if (state.top.length) {
      list.append(topPlots(state.top));
    }
  }

  function orderRow(order) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = `feed-row feed-order${order.filled ? ' done' : ''}`;
    const text = document.createElement('span');
    text.className = 'feed-text';
    setLabel(
      text,
      order.filled ? 'check' : 'box',
      order.filled
        ? "You filled Rosa's order today"
        : `Rosa wants ${order.qty} ${order.label.toLowerCase()} · pays ${order.pay} coins`,
    );
    const meta = document.createElement('span');
    meta.className = 'feed-meta';
    setLabel(meta, order.filled ? '' : 'pin', order.filled ? 'A new order every day' : 'Market stall · today only');
    row.append(text, meta);
    row.addEventListener('click', () => jumpTo({ x: order.x, z: order.z, text: "Rosa's market stall" }));
    return row;
  }

  function topPlots(top) {
    const box = document.createElement('div');
    box.className = 'feed-top';
    const title = document.createElement('span');
    title.className = 'feed-top-title';
    setLabel(title, 'star', 'Top plots');
    box.append(title);
    top.slice(0, 3).forEach((plot, index) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'feed-top-row';
      row.textContent = `${index + 1}. ${plot.name}'s plot · ${plot.likes} ${plot.likes === 1 ? 'star' : 'stars'}`;
      row.addEventListener('click', () => jumpTo({ x: plot.x, z: plot.z, text: `${plot.name}'s plot` }));
      box.append(row);
    });
    return box;
  }

  function renderGoal(goal) {
    const pill = $('goalPill');
    const key = goal ? `${goal.id}` : 'done';
    if (key === state.goalKey) {
      return;
    }
    const first = state.goalKey === '';
    state.goalKey = key;
    pill.hidden = false;
    if (!goal) {
      setLabel(pill, 'trophy', 'Every goal done. You run this town!');
      return;
    }
    setLabel(pill, 'target', `${goal.text} · +${goal.reward} coins (${goal.step}/${goal.total})`);
    if (!first) {
      pill.classList.remove('pop');
      void pill.offsetWidth; // restart the animation
      pill.classList.add('pop');
    }
  }

  $('feedToggle').addEventListener('click', () => {
    state.open = !state.open;
    if (state.open) {
      state.unread = 0;
    }
    render();
  });

  setInterval(() => {
    if (state.open && state.entries.length) {
      render(); // keep "2m ago" labels honest
    }
  }, 30000);

  function applyReply(data) {
    if (typeof data.serverTime === 'number') {
      state.serverOffset = data.serverTime - Date.now() / 1000;
    }
    if ('goal' in (data.you || {})) {
      renderGoal(data.you.goal);
    }
    let changed = false;
    if (data.order) {
      const before = JSON.stringify(state.order);
      state.order = data.order;
      changed = before !== JSON.stringify(state.order);
    }
    if (data.top) {
      state.top = data.top.plots || [];
      state.topVersion = data.top.version;
      changed = true;
    }
    const incoming = Array.isArray(data.feed) ? data.feed : [];
    if (!incoming.length) {
      if (changed) {
        render();
      }
      return;
    }
    const joining = state.since === 0;
    for (const entry of incoming) {
      state.entries.push({ ...entry, fresh: !joining });
      state.since = Math.max(state.since, entry.id);
    }
    state.entries = state.entries.slice(-40);
    if (!joining && !state.open) {
      state.unread += incoming.length;
    }
    render();
  }

  function show() {
    $('townFeed').hidden = false;
    render();
  }

  return {
    applyReply,
    show,
    since: () => state.since,
    topSince: () => state.topVersion,
    jumpTo,
    entries: () => state.entries,
  };
}
