// =====================================================================
// sources/femto.js - SOURCE 1: Femto Bolt depth camera.
// The skeleton comes from bridge/skeleton_bridge.py (Azure Kinect Body Tracking on the GPU),
// over a WebSocket. Override the address with ?brug=ws://host:port
//
// Contract (same as sources/webcam.js): start(cb), then
//   cb.frame(bodies, imageSize, latencyMs), cb.image(bitmap), cb.status({connected, text})
// =====================================================================

const URL_BRIDGE = new URLSearchParams(location.search).get('brug') || 'ws://localhost:8765';

export function start(cb) {
  let ws = null;
  let everConnected = false;

  function connect() {
    cb.status({ connected: false, text: everConnected ? 'brug kwijt, opnieuw verbinden...' : 'verbinden met de brug...' });
    ws = new WebSocket(URL_BRIDGE);
    ws.binaryType = 'blob';

    ws.onopen = () => {
      everConnected = true;
      ws.send('beeld'); // also send the IR image for the preview
    };

    ws.onmessage = async (ev) => {
      if (typeof ev.data !== 'string') {
        try {
          cb.image(await createImageBitmap(ev.data));
        } catch { /* broken jpeg: skip */ }
        return;
      }
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.status !== 'ok') {
        cb.status({ connected: false, text: msg.text || msg.status });
        return;
      }
      cb.status({ connected: true, text: 'verbonden' });
      const bodies = (msg.bodies || []).map((b) => ({
        id: b.id,
        joints: b.joints,
        joints2d: b.joints2d,
        // bridge: 0 = none, 1 = low (estimated), 2 = good  ->  0, 0.5, 1
        confidence: Object.fromEntries(Object.entries(b.confidence).map(([k, v]) => [k, v / 2])),
      }));
      cb.frame(bodies, msg.image_size, msg.latency_ms ?? 0);
    };

    ws.onclose = () => {
      cb.status({
        connected: false,
        text: everConnected ? 'brug kwijt, opnieuw verbinden...' : 'geen brug op ' + URL_BRIDGE + ' (draait start_femto.bat?)',
      });
      setTimeout(connect, 1000);
    };
    ws.onerror = () => ws.close();
  }

  connect();
}
