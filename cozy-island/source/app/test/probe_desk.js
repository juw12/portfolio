async () => {
  const debug = Cozy.debug;
  const fishing = debug.activities.find((activity) => activity.id === 'fishing');
  const renderer = debug.world.renderer;
  const out = {};
  out.inDesk = {
    on: debug.desk.on, bodyClass: document.body.className,
    hud: document.getElementById('desk-hud').style.display !== 'none',
    explorePanelHidden: getComputedStyle(document.getElementById('explore')).display === 'none',
    pixelRatio: renderer.getPixelRatio(), shadowAuto: renderer.shadowMap.autoUpdate,
  };
  let t = 0;
  const tickUntil = (check, seconds) => {
    for (let i = 0; i < seconds * 2 && !check(); i++) {
      t += 0.5;
      fishing.update(0.5, t, false);
    }
    return check();
  };
  out.nibbled = tickUntil(() => fishing.deskStatus().biting, 10);
  const fishBefore = Cozy.progress.get('fish');
  const caught = fishing.deskReel();
  out.caught = caught ? { name: caught.fish.name, kg: Math.round(caught.kg * 100) / 100 } : null;
  out.fishDelta = Cozy.progress.get('fish') - fishBefore;
  out.deskCatches = Cozy.progress.get('desk_catches');
  out.reelWithoutBite = fishing.deskReel();
  out.nibbledAgain = tickUntil(() => fishing.deskStatus().biting, 10);
  tickUntil(() => !fishing.deskStatus().biting, 14);
  out.missedPing = document.getElementById('desk-ping').textContent;
  debug.exitDesk();
  out.afterExit = {
    on: debug.desk.on, bodyClass: document.body.className,
    hud: document.getElementById('desk-hud').style.display !== 'none',
    canvasInApp: renderer.domElement.parentElement.id === 'app',
    shadowAuto: renderer.shadowMap.autoUpdate,
    fishingStillDesk: fishing.deskStatus().biting,
  };
  return out;
}