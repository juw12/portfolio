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
  Cozy.store.set('name', 'Ana');
  await online.act('hello', {});
  const data = await online.act('claim', { plot: 0 });
  return { ok: data.ok, owner: data.plots[0].ownerName, toasts: window.__toasts };
}
