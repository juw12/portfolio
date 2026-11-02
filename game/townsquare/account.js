// Accounts: log in, create an account (keeps the guest's progress) and log out.
// The server (accounts.py) links a username + password to the private owner key
// this browser plays with, so land, builds and coins follow the account.

const ACCOUNT_STORAGE = 'townsquare-account';
const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,16}$/;
const MIN_PASSWORD = 6;

async function postJson(route, payload) {
  const response = await fetch(route, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  let data = {};
  try {
    data = await response.json();
  } catch (error) {
    data = {}; // non-JSON error page
  }
  if (!response.ok) {
    throw new Error(data.error || `The server said ${response.status}`);
  }
  return data;
}

export function createAccountUI({ $, toast, getOwnerKey, setOwnerKey, newGuestKey, isInWorld, onLoggedIn }) {
  const panel = $('accountPanel');
  const form = $('accountForm');
  const userInput = $('accountUser');
  const passInput = $('accountPass');
  const message = $('accountMessage');
  const state = {
    account: localStorage.getItem(ACCOUNT_STORAGE) || null,
    busy: false,
    warnedName: false,
  };

  function setMessage(text, isError = false) {
    message.textContent = text;
    message.classList.toggle('error', isError);
  }

  function saveAccount(name) {
    state.account = name || null;
    if (state.account) {
      localStorage.setItem(ACCOUNT_STORAGE, state.account);
    } else {
      localStorage.removeItem(ACCOUNT_STORAGE);
    }
    render();
  }

  function render() {
    const signedIn = Boolean(state.account);
    form.hidden = signedIn;
    $('accountSignedIn').hidden = !signedIn;
    $('accountName').textContent = state.account || '';
    $('accountGuestNote').hidden = signedIn;
    $('accountButton').textContent = signedIn ? `👤 ${state.account}` : '👤 Guest · save progress';
    $('accountButton').classList.toggle('guest', !signedIn);
    $('joinAccount').textContent = signedIn ? `👤 Signed in as ${state.account} · switch` : '🔑 Log in or create an account';
    const nameInput = $('nameInput');
    if (signedIn) {
      nameInput.value = state.account;
    }
    nameInput.disabled = signedIn;
    nameInput.title = signedIn ? 'Your account name is shown to everyone' : '';
  }

  function open() {
    panel.hidden = false;
    setMessage('');
    render();
    if (!state.account) {
      userInput.focus();
    }
  }

  function close() {
    panel.hidden = true;
    userInput.blur();
    passInput.blur();
  }

  function readForm() {
    const username = userInput.value.trim();
    const password = passInput.value;
    if (!USERNAME_PATTERN.test(username)) {
      setMessage('Usernames are 3-16 letters, numbers or _', true);
      return null;
    }
    if (password.length < MIN_PASSWORD) {
      setMessage(`Passwords need at least ${MIN_PASSWORD} characters`, true);
      return null;
    }
    return { username, password };
  }

  async function run(label, task) {
    if (state.busy) {
      return;
    }
    state.busy = true;
    setMessage(label);
    try {
      await task();
    } catch (error) {
      setMessage(error.message || 'Something went wrong', true);
    } finally {
      state.busy = false;
    }
  }

  function register() {
    const fields = readForm();
    if (!fields) {
      return;
    }
    run('Creating account…', async () => {
      const data = await postJson('api/register', { ...fields, ownerKey: getOwnerKey() });
      if (data.ownerKey !== getOwnerKey()) {
        setOwnerKey(data.ownerKey);
      }
      passInput.value = '';
      saveAccount(data.username);
      setMessage(`Welcome, ${data.username}! Your land, builds and coins are now saved to your account.`);
      if (isInWorld()) {
        toast(`Account created: ${data.username}`);
      }
    });
  }

  function login() {
    const fields = readForm();
    if (!fields) {
      return;
    }
    run('Logging in…', async () => {
      const data = await postJson('api/login', fields);
      passInput.value = '';
      setOwnerKey(data.ownerKey);
      saveAccount(data.username);
      if (isInWorld()) {
        // Everything (plots, wallet, builds) belongs to the account's key: start fresh with it.
        setMessage('Logged in. Loading your town…');
        location.reload();
        return;
      }
      close();
      onLoggedIn(data.username);
    });
  }

  function logout() {
    const ok = window.confirm(
      'Log out on this device? You can log back in any time; this device will continue as a new guest.'
    );
    if (!ok) {
      return;
    }
    setOwnerKey(newGuestKey());
    saveAccount(null);
    location.reload();
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    login();
  });
  $('accountRegister').addEventListener('click', register);
  $('accountLogout').addEventListener('click', logout);
  $('accountClose').addEventListener('click', close);
  $('accountButton').addEventListener('click', () => (panel.hidden ? open() : close()));
  $('joinAccount').addEventListener('click', open);
  panel.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      close();
    }
  });

  // The server is the source of truth for which account this key belongs to.
  function applyReply(data) {
    const you = data.you;
    if (!you || !('account' in you)) {
      return;
    }
    if ((you.account || null) !== state.account) {
      saveAccount(you.account);
    }
    if (!you.account && you.name === 'Guest' && !state.warnedName) {
      state.warnedName = true;
      toast('That name belongs to a registered player, so others see you as "Guest".');
    }
  }

  render();
  return {
    open,
    close,
    applyReply,
    get account() {
      return state.account;
    },
    get isOpen() {
      return !panel.hidden;
    },
  };
}
