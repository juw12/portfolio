// Social features on the client: friends list, plot co-builders, /visit and share links.
// The server (server.py, "social" section) owns the data; this file displays it and sends requests.
import { setLabel } from './icons.js';

const HELP_LINES = [
  '/visit name: go to someone\'s plot (or to them)',
  '/home: go to your own plot',
  '/friend name, /unfriend name: manage friends',
  '/invite name, /uninvite name: let someone build on your plot',
  '/leave: stop building on the plot you stand on',
  '/friends: open the friends panel',
  '/mute name, /unmute name: hide or show someone\'s chat (only for you)',
  '/report name reason: tell the moderators about bad behaviour',
];

export function createSocialUI({
  $,
  toast,
  say,
  network,
  plots,
  plotBounds,
  getOwnerTag,
  getAccount,
  getPlayerCell,
  findPlayer,
  teleport,
}) {
  const state = {
    friends: [],
    open: false,
    renderedFriends: '',
    renderedBuilders: '',
    pendingVisit: new URLSearchParams(location.search).get('visit'),
  };

  const clean = (name) => String(name || '').trim().replace(/^@/, '').slice(0, 16);
  const same = (a, b) => a.toLowerCase() === b.toLowerCase();

  function ownPlotKeys() {
    const tag = getOwnerTag();
    return [...plots.values()].filter((p) => p.data.owner === tag).map((p) => p.data.key).sort();
  }

  function isBuilderOn(plot) {
    const tag = getOwnerTag();
    return Boolean(plot && plot.data.builders?.some((b) => b.tag === tag));
  }

  function standingPlot() {
    const { x, z, key } = getPlayerCell();
    return { x, z, key, plot: plots.get(key) || null };
  }

  // The plot whose co-builders the panel manages: the one you stand on if it's yours, else your first.
  function managedPlotKey() {
    const here = standingPlot();
    if (here.plot && here.plot.data.owner === getOwnerTag()) {
      return here.key;
    }
    return ownPlotKeys()[0] || null;
  }

  // Arrive just inside the plot edge that faces the town centre, looking into the plot.
  function plotArrival(key) {
    const b = plotBounds(key);
    const inset = 0.9;
    let x = b.centerX;
    let z = b.centerZ;
    if (Math.abs(b.centerX) >= Math.abs(b.centerZ)) {
      x = b.centerX > 0 ? b.minX + inset : b.maxX - inset;
    } else {
      z = b.centerZ > 0 ? b.minZ + inset : b.maxZ - inset;
    }
    return { x, z, faceX: b.centerX, faceZ: b.centerZ };
  }

  function goToPlot(key, label) {
    const arrival = plotArrival(key);
    teleport(arrival.x, arrival.z, arrival.faceX, arrival.faceZ);
    toast(`Welcome to ${label}`);
  }

  function visit(rawName) {
    const name = clean(rawName);
    if (!name) {
      toast('Usage: /visit name');
      return false;
    }
    const friend = state.friends.find((f) => same(f.name, name));
    if (friend?.plot && plots.has(friend.plot)) {
      goToPlot(friend.plot, `${friend.name}'s plot`);
      return true;
    }
    const plot = [...plots.values()]
      .filter((p) => same(p.data.ownerName, name))
      .sort((a, b) => a.data.claimedAt - b.data.claimedAt)[0];
    if (plot) {
      goToPlot(plot.data.key, `${plot.data.ownerName}'s plot`);
      return true;
    }
    const person = findPlayer(name);
    if (person) {
      teleport(person.x + 1.5, person.z + 1.5, person.x, person.z);
      toast(`You joined ${person.name}`);
      return true;
    }
    toast(`Couldn't find ${name}: they have no plot and aren't online`);
    return false;
  }

  function goHome() {
    const key = ownPlotKeys()[0];
    if (!key) {
      toast("You don't own a plot yet. Find a free one and claim it.");
      return;
    }
    goToPlot(key, 'your plot');
  }

  function send(op) {
    if (!network.online) {
      toast('You are offline');
      return;
    }
    network.outgoingBuild.push(op);
  }

  function invite(rawName, kind = 'invite') {
    const name = clean(rawName);
    const key = managedPlotKey();
    if (!name) {
      toast(`Usage: /${kind} name`);
    } else if (!key) {
      toast('Claim a plot first, then invite co-builders to it');
    } else {
      send({ op: kind, plot: key, name });
    }
  }

  function leave() {
    const here = standingPlot();
    if (!isBuilderOn(here.plot)) {
      toast("Stand on a plot you co-build to leave it");
      return;
    }
    if (confirm(`Stop building on ${here.plot.data.ownerName}'s plot?`)) {
      send({ op: 'leave', plot: here.key });
    }
  }

  function friend(rawName, kind = 'friend') {
    const name = clean(rawName);
    if (!name) {
      toast(`Usage: /${kind} name`);
      return;
    }
    send({ op: kind, name });
  }

  // ---------- share links ----------
  function shareLinkFor(key) {
    const plot = plots.get(key);
    const arrival = plotArrival(key);
    const url = new URL(location.pathname, location.origin);
    if (plot) {
      url.searchParams.set('visit', plot.data.ownerName);
    }
    url.searchParams.set('at', `${arrival.x.toFixed(1)},${arrival.z.toFixed(1)}`);
    return url.toString();
  }

  async function copyText(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (error) {
      // fall through to the legacy copy below
    }
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    let copied = false;
    try {
      copied = document.execCommand('copy');
    } catch (error) {
      copied = false;
    }
    area.remove();
    return copied;
  }

  async function share(key) {
    if (!key) {
      toast('Stand on a plot (or claim one) to share it');
      return;
    }
    const link = shareLinkFor(key);
    state.lastLink = link;
    if (await copyText(link)) {
      toast('Link copied: send it to a friend');
    } else {
      prompt('Copy this link:', link);
    }
  }

  // ---------- chat commands ----------
  function handleCommand(text) {
    const [command, ...rest] = text.trim().split(/\s+/);
    const argument = rest.join(' ');
    switch (command.toLowerCase()) {
      case '/help':
        HELP_LINES.forEach((line) => say('Help', ` ${line}`));
        return true;
      case '/visit':
      case '/tp':
        visit(argument);
        return true;
      case '/home':
        goHome();
        return true;
      case '/friend':
      case '/addfriend':
        friend(argument, 'friend');
        return true;
      case '/unfriend':
        friend(argument, 'unfriend');
        return true;
      case '/invite':
        invite(argument, 'invite');
        return true;
      case '/uninvite':
        invite(argument, 'uninvite');
        return true;
      case '/leave':
        leave();
        return true;
      case '/friends':
        setOpen(true);
        return true;
      case '/mute':
      case '/unmute': {
        const name = clean(rest[0]);
        if (!name) {
          toast(`Usage: ${command.toLowerCase()} name`);
          return true;
        }
        send({ op: command.toLowerCase().slice(1), name });
        return true;
      }
      case '/report': {
        const name = clean(rest[0]);
        const reason = rest.slice(1).join(' ').slice(0, 200);
        if (!name || !reason) {
          toast('Usage: /report name what happened');
          return true;
        }
        send({ op: 'report', name, reason });
        return true;
      }
      default:
        toast(`Unknown command ${command}. Type /help`);
        return true;
    }
  }

  // ---------- panel ----------
  function button(label, className, onClick, iconName = '') {
    const element = document.createElement('button');
    element.type = 'button';
    setLabel(element, iconName, label);
    if (className) {
      element.className = className;
    }
    element.addEventListener('click', onClick);
    return element;
  }

  function renderFriends() {
    const signature = JSON.stringify(state.friends);
    if (signature === state.renderedFriends) {
      return;
    }
    state.renderedFriends = signature;
    const list = $('friendList');
    list.replaceChildren();
    if (!state.friends.length) {
      const empty = document.createElement('p');
      empty.className = 'social-empty';
      empty.textContent = 'No friends yet. Add someone by their username.';
      list.append(empty);
    }
    const sorted = [...state.friends].sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name));
    for (const entry of sorted) {
      const row = document.createElement('div');
      row.className = 'social-row';
      const dot = document.createElement('span');
      dot.className = `social-dot${entry.online ? ' online' : ''}`;
      dot.title = entry.online ? 'online' : 'offline';
      const label = document.createElement('span');
      label.className = 'social-name';
      label.textContent = entry.name;
      const visitButton = button('Visit', 'social-visit', () => {
        if (visit(entry.name)) {
          setOpen(false);
        }
      }, 'pin');
      visitButton.disabled = !entry.plot && !entry.online;
      const removeFriend = button('', 'social-remove', () => friend(entry.name, 'unfriend'), 'x');
      removeFriend.title = `Remove ${entry.name}`;
      removeFriend.setAttribute('aria-label', removeFriend.title);
      row.append(dot, label, visitButton, removeFriend);
      list.append(row);
    }
    setLabel($('socialButton'), 'users', `${state.friends.filter((f) => f.online).length}/${state.friends.length}`);
  }

  function renderBuilders() {
    const key = managedPlotKey();
    const plot = key ? plots.get(key) : null;
    const here = standingPlot();
    const coBuilding = isBuilderOn(here.plot) ? here.plot.data.ownerName : '';
    const signature = JSON.stringify([key, plot?.data.builders || [], coBuilding]);
    if (signature === state.renderedBuilders) {
      return;
    }
    state.renderedBuilders = signature;

    $('builderPlot').textContent = plot ? `on plot ${key}` : '';
    $('builderForm').hidden = !plot;
    $('shareButton').hidden = !plot;
    const list = $('builderList');
    list.replaceChildren();
    const note = document.createElement('p');
    note.className = 'social-empty';
    if (!plot) {
      note.textContent = 'Claim a plot to invite co-builders.';
      list.append(note);
    } else if (!plot.data.builders?.length) {
      note.textContent = 'Only you build here. Invite friends (they need an account).';
      list.append(note);
    }
    for (const builder of plot?.data.builders || []) {
      const row = document.createElement('div');
      row.className = 'social-row';
      const label = document.createElement('span');
      label.className = 'social-name';
      setLabel(label, 'hammer', builder.name);
      const removeBuilder = button('', 'social-remove', () => invite(builder.name, 'uninvite'), 'x');
      removeBuilder.title = `Remove ${builder.name}`;
      removeBuilder.setAttribute('aria-label', removeBuilder.title);
      row.append(label, removeBuilder);
      list.append(row);
    }
    $('coBuildNote').hidden = !coBuilding;
    $('coBuildText').textContent = coBuilding ? `You can build on ${coBuilding}'s plot.` : '';
  }

  function render() {
    renderFriends();
    if (state.open) {
      renderBuilders();
      $('socialGuestNote').hidden = Boolean(getAccount());
    }
  }

  function setOpen(open) {
    state.open = open;
    $('socialPanel').hidden = !open;
    if (open) {
      state.renderedBuilders = '';
      render();
    }
  }

  $('socialButton').addEventListener('click', () => setOpen(!state.open));
  $('socialClose').addEventListener('click', () => setOpen(false));
  $('friendForm').addEventListener('submit', (event) => {
    event.preventDefault();
    friend($('friendName').value, 'friend');
    $('friendName').value = '';
  });
  $('builderForm').addEventListener('submit', (event) => {
    event.preventDefault();
    invite($('builderName').value, 'invite');
    $('builderName').value = '';
  });
  $('shareButton').addEventListener('click', () => share(managedPlotKey()));
  $('coBuildLeave').addEventListener('click', leave);

  function applyReply(data) {
    if (Array.isArray(data.you?.friends)) {
      state.friends = data.you.friends;
    }
    render();
    // ?visit=name links: jump once the plots have arrived (the ?at= spawn is the fallback).
    if (state.pendingVisit && data.plotSnapshot) {
      const name = state.pendingVisit;
      state.pendingVisit = null;
      visit(name);
    }
  }

  return {
    applyReply,
    handleCommand,
    isBuilderOn,
    share,
    shareLinkFor,
    visit,
    isOpen: () => state.open,
    close: () => setOpen(false),
  };
}
