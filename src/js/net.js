// The visitor's account, when the page is served by the Cloudflare Worker: one look at /api/me on
// start, then sign-in and sign-out. A page with no backend behind it (GitHub Pages, a file, `npm run
// serve`) gets no JSON from /api/me and stays as it always was: `backend` false, nothing shown.
// Like the live feeds it stays off under nosim and can be disabled with net=0; the director starts it.
// Exports start, subscribe, dispose, login, logout and state ({ backend, me }).
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const subscribers = new Set();
  const state = { backend: false, me: null, started: false };

  const emit = () => {
    for (const fn of subscribers) fn(state);
  };

  // Only the fields the page uses; anything else /api/me grows later stays out.
  const accept = (player) => {
    if (!player || !Number.isSafeInteger(player.id) || typeof player.login !== "string") return null;
    return { id: player.id, login: player.login, display: typeof player.display === "string" ? player.display : player.login };
  };

  const start = async () => {
    if (state.started) return;
    state.started = true;
    if (location.protocol !== "https:" && location.protocol !== "http:") return;
    try {
      const res = await fetch("/api/me", { credentials: "same-origin", headers: { accept: "application/json" } });
      if (!res.ok || !(res.headers.get("content-type") || "").startsWith("application/json")) return;
      const body = await res.json();
      if (!body || !("player" in body)) return;
      state.backend = true;
      state.me = accept(body.player);
    } catch {
      return;
    }
    emit();
  };

  // Sign-in is a full navigation through GitHub; the Worker brings the visitor back to this path.
  const login = () => {
    if (!state.backend) return;
    location.assign(`/auth/login?next=${encodeURIComponent(location.pathname + location.search)}`);
  };

  const logout = async () => {
    if (!state.backend || !state.me) return;
    try {
      const res = await fetch("/auth/logout", { method: "POST", credentials: "same-origin" });
      if (!res.ok) return;
    } catch {
      return;
    }
    state.me = null;
    emit();
  };

  const subscribe = (fn) => {
    subscribers.add(fn);
    return () => subscribers.delete(fn);
  };

  const dispose = () => {
    subscribers.clear();
  };

  BL.net = { start, subscribe, dispose, login, logout, state };
})();
