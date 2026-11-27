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
      return await res.json();
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

  window.Api = { get, post, poll, setConnected };
})();
