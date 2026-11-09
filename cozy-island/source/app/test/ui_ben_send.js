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
  Cozy.store.set('name', 'Ben');
  await online.act('hello', {});
  await waitFor(() => online.snapshot.plots[0].ownerName === 'Ana');
  Cozy.pantry.add('dishes', 'grilled_fish', 1);
  Cozy.pantry.add('fish', 'Bluegill', 2);
  const dishBefore = Cozy.pantry.count('dishes', 'grilled_fish');

  // wrap a present through the real mailbox panel
  village.openPanel('mail', 0);
  const select = panelBody().querySelector('select.gift-select');
  const optionLabels = [...select.options].map((option) => option.textContent);
  select.value = String(optionLabels.findIndex((label) => label.startsWith('Campfire Grilled Fish')));
  panelBody().querySelector('input[placeholder^="Tag"]').value = 'for your focus sessions';
  buttonByText('Wrap & send').click();
  const wrapped = await waitFor(() => window.__toasts.some((t) => t.includes('wrapped')));
  const dishAfter = Cozy.pantry.count('dishes', 'grilled_fish');

  // send Mochi over from the homestead panel
  village.openPanel('visit', 0);
  const sendButton = buttonByText('Send Mochi');
  const hadSendButton = !!sendButton;
  if (sendButton) {
    sendButton.click();
  }
  const left = await waitFor(() => Cozy.store.get('catAway', null));
  await sleep(600);
  const panelAfter = panelBody().textContent;
  const dockCatVisible = Cozy.debug.world.cat.root.visible;
  const again = await online.call('sendcat', { plot: 0, cat: 'Mochi' });
  return {
    optionLabels, wrapped, dishBefore, dishAfter, giftsSent: Cozy.progress.get('gifts_sent'),
    hadSendButton, left: !!left, away: Cozy.store.get('catAway', null), dockCatVisible,
    panelAfter: panelAfter.slice(-140), secondSendError: again.error || null, toasts: window.__toasts,
  };
}
