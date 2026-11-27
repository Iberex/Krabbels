// Femto Bolt bridge (stub). The real camera/pose code lives in a separate
// process that talks to the demo over a WebSocket on ws://localhost:8765.
//
// Accepted messages (JSON):
//   {"anim": "11_springen"}   -> play that animation by folder key
//   {"event": "jump"}         -> play the animation mapped in EVENTS
//
// The demo works fully without a server: failed connections retry silently every 3 s.

import { EVENTS } from './animations.js';

const RETRY_MS = 3000;

/**
 * @param {(name: string) => boolean} playAnim  same function the buttons call
 * @param {{ url?: string, onStatus?: (connected: boolean) => void }} [options]
 */
export function connectTracking(playAnim, { url = 'ws://localhost:8765', onStatus = () => {} } = {}) {
  let socket = null;
  let retryTimer = null;

  function handleMessage(raw) {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return; // ignore non-JSON
    }
    if (!msg || typeof msg !== 'object') return;

    if (typeof msg.anim === 'string') {
      playAnim(msg.anim);
    } else if (typeof msg.event === 'string' && EVENTS[msg.event]) {
      playAnim(EVENTS[msg.event]);
    }
  }

  function scheduleRetry() {
    clearTimeout(retryTimer);
    retryTimer = setTimeout(connect, RETRY_MS);
  }

  function connect() {
    try {
      socket = new WebSocket(url);
    } catch {
      scheduleRetry();
      return;
    }
    socket.addEventListener('open', () => onStatus(true));
    socket.addEventListener('message', (e) => handleMessage(e.data));
    socket.addEventListener('error', () => {}); // close follows; keep quiet
    socket.addEventListener('close', () => {
      onStatus(false);
      scheduleRetry();
    });
  }

  connect();

  return {
    send(obj) {
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(obj));
    },
  };
}
