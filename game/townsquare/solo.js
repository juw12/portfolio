// Solo mode for static hosting (GitHub Pages, Cloudflare Pages): no backend, so the real Python
// server logic runs in this page with Pyodide and answers the game's api/* requests.
// Loaded as a classic script before main.js so the fetch shim is in place first.
(() => {
  const PYODIDE_VERSION = '0.27.7';
  const PYODIDE_BASE = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
  const ENGINE_FILES = [
    'server.py',
    'accounts.py',
    'economy.py',
    'goals.py',
    'moderation.py',
    'orders.py',
    'progress.py',
    'townlife.py',
    'solo_engine.py',
  ];
  const AUTOSAVE_MS = 10000;   // safety net
  const SAVE_AFTER_CHANGE_MS = 1500; // saves soon after a change so closing the tab loses almost nothing
  const realFetch = window.fetch.bind(window);
  let saveSoon = () => {}; // replaced once the engine is running

  // ------------------------------------------------------------------ loading banner
  const banner = document.createElement('div');
  banner.id = 'soloBanner';
  banner.setAttribute('role', 'status');
  banner.style.cssText = [
    'position:fixed', 'left:50%', 'bottom:16px', 'transform:translateX(-50%)', 'z-index:9999',
    'padding:8px 14px', 'border-radius:999px', 'background:rgba(20,30,50,.82)', 'color:#fff',
    'font:600 13px/1.3 system-ui,sans-serif', 'pointer-events:none', 'transition:opacity .6s',
    'max-width:92vw', 'text-align:center',
  ].join(';');
  function showBanner(text) {
    banner.textContent = text;
    banner.style.opacity = '1';
    if (!banner.isConnected && document.body) {
      document.body.appendChild(banner);
    }
  }
  document.addEventListener('DOMContentLoaded', () => {
    if (!banner.isConnected && banner.textContent) {
      document.body.appendChild(banner);
    }
  });

  // ------------------------------------------------------------------ engine start-up
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`could not load ${src}`));
      document.head.appendChild(script);
    });
  }

  function syncFs(pyodide, populate) {
    return new Promise((resolve) => {
      pyodide.FS.syncfs(populate, (error) => {
        if (error) {
          console.warn('Solo save sync failed', error);
        }
        resolve();
      });
    });
  }

  async function startEngine() {
    showBanner('Starting the town engine… (first visit downloads about 10 MB)');
    await loadScript(`${PYODIDE_BASE}pyodide.js`);
    const pyodide = await window.loadPyodide({ indexURL: PYODIDE_BASE });

    pyodide.FS.mkdirTree('/data');
    pyodide.FS.mount(pyodide.FS.filesystems.IDBFS, {}, '/data');
    await syncFs(pyodide, true); // restore saves from IndexedDB

    pyodide.FS.mkdirTree('/engine');
    const sources = await Promise.all(
      ENGINE_FILES.map(async (name) => {
        const response = await realFetch(`engine/${name}`, { cache: 'no-cache' });
        if (!response.ok) {
          throw new Error(`engine/${name}: HTTP ${response.status}`);
        }
        return [name, await response.text()];
      })
    );
    for (const [name, text] of sources) {
      pyodide.FS.writeFile(`/engine/${name}`, text);
    }
    pyodide.runPython("import sys\nsys.path.insert(0, '/engine')");
    const engine = pyodide.pyimport('solo_engine');

    let saving = false;
    async function save() {
      if (saving) {
        return;
      }
      saving = true;
      try {
        engine.save();
        await syncFs(pyodide, false);
      } finally {
        saving = false;
      }
    }
    let pendingSave = null;
    saveSoon = () => {
      if (!pendingSave) {
        pendingSave = setTimeout(() => {
          pendingSave = null;
          save();
        }, SAVE_AFTER_CHANGE_MS);
      }
    };
    setInterval(save, AUTOSAVE_MS);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        save();
      }
    });
    window.addEventListener('pagehide', save);

    showBanner('Solo town: the full game runs in your browser and saves here. Multiplayer needs the server.');
    setTimeout(() => {
      banner.style.opacity = '0';
    }, 7000);
    return engine;
  }

  let enginePromise = null;
  function engineReady() {
    if (!enginePromise) {
      enginePromise = startEngine().catch((error) => {
        console.error('Solo engine failed to start', error);
        showBanner('Could not start the town engine. Check your connection and reload.');
        enginePromise = null;
        throw error;
      });
    }
    return enginePromise;
  }

  // ------------------------------------------------------------------ fetch shim
  window.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href);
    const apiAt = url.pathname.lastIndexOf('/api/');
    if (url.origin !== location.origin || apiAt < 0) {
      return realFetch(input, init);
    }
    const route = url.pathname.slice(apiAt);
    const method = (init.method || (typeof input === 'string' ? 'GET' : input.method) || 'GET').toUpperCase();
    const body = typeof init.body === 'string' ? init.body : '';
    const engine = await engineReady();
    const [status, text] = JSON.parse(engine.handle(method, route, body));
    if (method === 'POST' && engine.is_dirty()) {
      saveSoon();
    }
    return new Response(text, { status, headers: { 'Content-Type': 'application/json' } });
  };

  window.TOWNSQUARE_SOLO = true;
  engineReady().catch(() => {});
})();
