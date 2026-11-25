// fetch helpers, polling and the connection status dot. Used by all pages.

(function () {
  const TIMEOUT_MS = 4000;

  // fetch + JSON. Throws on network errors, timeouts and HTTP errors.
  // On an HTTP error the thrown error has error.status (so the server did answer).
  async function request(url, options) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, Object.assign({ signal: controller.signal, cache: 'no-store' }, options));
      if (!res.ok) {
        const error = new Error('HTTP ' + res.status);
        error.status = res.status;
        throw error;
      }
      const text = await res.text(); // Supabase answers an insert with an empty body
      return text ? JSON.parse(text) : null;
    } finally {
      clearTimeout(timer);
    }
  }

  function get(url) {
    return request(url);
  }

  function post(url, body) {
    return request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
  }

  // Small dot in the corner: filled = connected, empty = no connection.
  let dot = null;
  function setConnected(connected) {
    if (!dot) {
      dot = document.createElement('div');
      dot.id = 'status-dot';
      document.body.appendChild(dot);
    }
    dot.className = connected ? 'on' : 'off';
    dot.title = connected ? 'Connected to the server' : 'No connection with the server';
  }

  // Calls task() again and again, with intervalMs between two calls.
  // An error never stops the loop: the next try comes after the same pause.
  function poll(task, intervalMs) {
    async function tick() {
      try {
        await task();
        setConnected(true);
      } catch (error) {
        setConnected(Boolean(error && error.status));
      }
      setTimeout(tick, intervalMs);
    }
    tick();
  }

  // ---------- Cloud mode (GitHub Pages version of /draw) ----------
  // config.js sets window.KRABBELS_CLOUD = { url, key } (Supabase project URL + publishable key).
  // The iPad then never talks to the laptop: it puts the wobbel in the Supabase table "krabbels",
  // and the hub on the laptop picks it up there (lib/cloud.js). Without config.js nothing changes.
  const cloud = window.KRABBELS_CLOUD;
  if (cloud && cloud.url && cloud.key) {
    const base = cloud.url.replace(/\/+$/, '');
    const headers = { apikey: cloud.key, Authorization: 'Bearer ' + cloud.key };
    window.Api = {
      poll,
      setConnected,
      async get(url) {
        if (url === '/api/health') return request(base + '/auth/v1/health', { headers });
        throw new Error('Not available in cloud mode: ' + url);
      },
      async post(url, body) {
        if (url !== '/api/wobbels') throw new Error('Not available in cloud mode: ' + url);
        try {
          await request(base + '/rest/v1/krabbels', {
            method: 'POST',
            headers: Object.assign({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }, headers),
            body: JSON.stringify({ client_id: body.clientId, data: body }),
          });
        } catch (error) {
          // 409: this clientId is already in the table (a retry after a lost answer). That is fine.
          if (error.status !== 409) throw error;
        }
        return Object.assign({ id: body.clientId }, body);
      },
    };
    return;
  }

  window.Api = { get, post, poll, setConnected };
})();
