async () => {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const waitFor = async (check, ms = 10000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (check()) {
        return true;
      }
      await sleep(100);
    }
    return false;
  };
  const village = Cozy.debug.activities.find((activity) => activity.id === 'village');
  const panelBody = () => document.getElementById('village-panel-body');
  const buttonByText = (prefix) => [...panelBody().querySelectorAll('button')].find((b) => b.textContent.startsWith(prefix));
  const online = Cozy.online;
  await waitFor(() => online.enabled && online.snapshot);
  const before = JSON.stringify(Cozy.pantry.read());
  // headless dump mode renders very few frames: tick Mochi's update by hand while we wait
  let tick = 0;
  const home = await waitFor(() => {
    tick += 0.1;
    Cozy.debug.cat.update(0.1, tick);
    return !Cozy.store.get('catAway', null);
  }, 20000);
  await sleep(300);
  return {
    home, catVisits: Cozy.progress.get('cat_visits'), dockCatVisible: Cozy.debug.world.cat.root.visible,
    pantryBefore: before, pantryAfter: JSON.stringify(Cozy.pantry.read()), toasts: window.__toasts,
  };
}
