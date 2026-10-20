// Live estimates only. The server independently prices each full receipt; the browser never
// submits a price. One 2140data socket is shared by open kiosks and the Bananas panel,
// and closed when hidden or unused.
(() => {
  "use strict";
  const BL = window.BL;
  const URL = "wss://2140data.io/", STALL = 30000, RETRY_MAX = 30000;
  let users = 0, socket = null, retry = 0, watchTimer = 0, backoff = 1000, rate = null;
  const listeners = new Set();
  const emit = () => { for (const listener of listeners) listener(); };
  const drop = () => {
    window.clearTimeout(watchTimer); watchTimer = 0;
    if (rate && !rate.stale) { rate.stale = true; emit(); }
    if (!socket) return;
    const ws = socket; socket = null;
    ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null;
    try { ws.close(); } catch { /* The connection may still be opening. */ }
  };
  const reconnect = () => {
    drop();
    if (!users || document.hidden || retry) return;
    retry = window.setTimeout(connect, backoff);
    backoff = Math.min(RETRY_MAX, backoff * 2);
  };
  const watchdog = () => {
    window.clearTimeout(watchTimer);
    watchTimer = window.setTimeout(reconnect, STALL);
  };
  const connect = () => {
    retry = 0;
    if (!users || document.hidden || socket || typeof WebSocket === "undefined") return;
    try { socket = new WebSocket(URL); } catch { return reconnect(); }
    const ws = socket;
    watchdog();
    ws.onmessage = (event) => {
      if (socket !== ws || typeof event.data !== "string" || event.data.length > 8192) return;
      let data;
      try { data = JSON.parse(event.data); } catch { return; }
      const text = String(data?.weightedPrice ?? "");
      if (!/^\d{1,12}(?:\.\d{1,8})?$/.test(text)) return;
      const cents = Math.round(Number(text) * 100);
      if (!(cents > 0)) return;
      rate = { usdPerBtc: cents / 100, satsPerBanana: 1e10 / cents, at: Date.now(), stale: false, live: true };
      backoff = 1000;
      watchdog();
      emit();
    };
    ws.onclose = ws.onerror = reconnect;
  };
  const visibility = () => {
    window.clearTimeout(retry); retry = 0;
    if (document.hidden) drop();
    else connect();
  };
  const watch = (onRate) => {
    const listener = typeof onRate === "function" ? () => onRate(rate) : null;
    if (listener) listeners.add(listener);
    if (++users === 1) {
      document.addEventListener("visibilitychange", visibility);
      connect();
    }
    if (listener) listener();
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      if (listener) listeners.delete(listener);
      if (--users) return;
      document.removeEventListener("visibilitychange", visibility);
      window.clearTimeout(retry); retry = 0;
      drop();
    };
  };
  BL.donationRate = { watch, get current() { return rate; } };
})();
