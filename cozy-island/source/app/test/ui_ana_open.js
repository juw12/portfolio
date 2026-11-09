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
  // tick the village update by hand too (headless dump mode renders very few frames)
  await waitFor(() => {
    village.update(0.016, 1, false);
    return village.visitorsShown()[0];
  });
  const visitorShown = village.visitorsShown();
  const gifts = (online.snapshot.gifts || []).map((g) => ({ from: g.fromName, item: g.item, note: g.note }));
  village.openPanel('mail', 0);
  const mailText = panelBody().textContent;
  const openButton = buttonByText('Open');
  const dishBefore = Cozy.pantry.count('dishes', 'grilled_fish');
  if (openButton) {
    openButton.click();
  }
  const opened = await waitFor(() => Cozy.pantry.count('dishes', 'grilled_fish') > dishBefore);
  village.openPanel('visit', 0);
  village.openPanel('invite', 0);
  village.petVisitor(0);
  await sleep(300);
  village.update(1.0, 10, false);   // headless dump mode barely renders frames: tick the pet cooldown by hand
  village.petVisitor(0);
  await waitFor(() => online.snapshot.plots[0].catVisit && online.snapshot.plots[0].catVisit.pets >= 2);
  const visit = online.snapshot.plots[0].catVisit;
  return {
    visitorShown, gifts, mailHasPresent: mailText.includes('Campfire Grilled Fish'), opened,
    dishAfter: Cozy.pantry.count('dishes', 'grilled_fish'), giftsReceived: Cozy.progress.get('gifts_received'),
    giftsLeft: (online.snapshot.gifts || []).length, pets: visit.pets, petBy: visit.petBy, toasts: window.__toasts,
  };
}
