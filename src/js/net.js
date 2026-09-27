// The visitor's account and the island room, when the page is served by the Cloudflare Worker. One look
// at /api/me on start; a signed-in visitor then holds one socket to /room for the page life. A page with
// no backend behind it (GitHub Pages, a file, `npm run serve`) gets no JSON from /api/me and stays as it
// always was: `backend` false, nothing shown, no socket. Like the live feeds it stays off under nosim and
// can be disabled with net=0; the director starts it.
//
// The room answers who else is on the island: `remotes` (id → { login, display, body, x, y, z, yaw }),
// updated in place from its 15 Hz snapshots. A scene reports the Ooga the visitor drives with `setBody`
// (null when none) and its feet and heading with `sendPose`, which throttles itself. A newer tab of the
// same account kicks this one with `replaced`: it stops reconnecting until `rejoin`.
//
// Who drives which Ooga, on the page served by the Worker (`mayDrive`; the room enforces the same
// ownership through its own copy of the cast): a signed-in contributor drives only their own Ooga, and
// nobody else drives it while they are here; everyone else, signed in or not, drives an Ooga only while
// its owner is away, nobody else holds it, and it is not working. Ownership keys on the GitHub login
// alone (`github`, else the handle). A claim the room refuses, or an owner arriving, lands as `released`.
// Exports start, subscribe, dispose, login, logout, rejoin, setBody, sendPose, mayDrive, ownCharacter,
// remotes and state.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const POSE_MS = 1000 / 15;
  const PING_MS = 10000;
  const BACKOFF_MS = 500, BACKOFF_MAX_MS = 15000;
  const subscribers = new Set();
  const remotes = new Map();
  // room: "off" (signed out or no backend), "connecting", "live", or a kick that stopped it ("replaced", "full").
  const state = { backend: false, me: null, started: false, room: "off", selfId: 0, online: 0, released: null };
  let ws = null, retry = 0, retryTimer = 0, pingTimer = 0, stopped = false;
  let body = null, poseAt = 0, px = NaN, py = NaN, pz = NaN, pyaw = NaN;

  const emit = () => {
    for (const fn of subscribers) fn(state);
  };

  // Only the fields the page uses; anything else /api/me grows later stays out.
  const accept = (player) => {
    if (!player || !Number.isSafeInteger(player.id) || typeof player.login !== "string") return null;
    return { id: player.id, login: player.login, display: typeof player.display === "string" ? player.display : player.login };
  };

  const setRoom = (room) => {
    state.room = room;
    state.online = room === "live" ? remotes.size + 1 : 0;
    emit();
  };

  const send = (text) => {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(text);
  };

  const sendBody = () => send(JSON.stringify({ t: "body", name: body }));

  const upsert = (p) => {
    if (!p || !Number.isSafeInteger(p.id) || p.id === state.selfId) return;
    const rec = remotes.get(p.id) || { id: p.id, login: "", display: "", body: null, x: 0, y: 0, z: 0, yaw: 0 };
    rec.login = String(p.login);
    rec.display = String(p.display || p.login);
    rec.body = typeof p.body === "string" ? p.body : null;
    rec.x = +p.x || 0; rec.y = +p.y || 0; rec.z = +p.z || 0; rec.yaw = +p.yaw || 0;
    remotes.set(p.id, rec);
  };

  const onMessage = (e) => {
    if (e.data === "pong" || typeof e.data !== "string") return;
    let msg;
    try {
      msg = JSON.parse(e.data);
    } catch {
      return;
    }
    if (msg.t === "state") {
      const ps = msg.ps;
      for (let i = 0; i + 4 < ps.length; i += 5) {
        const rec = remotes.get(ps[i]);
        if (!rec) continue;
        rec.x = ps[i + 1]; rec.y = ps[i + 2]; rec.z = ps[i + 3]; rec.yaw = ps[i + 4];
      }
    } else if (msg.t === "welcome") {
      retry = 0;
      state.selfId = msg.you.id;
      remotes.clear();
      for (const p of msg.players) upsert(p);
      setRoom("live");
      // A reconnect picks up where the page is: the Ooga still driven and where it stands.
      sendBody();
      poseAt = 0;
      px = NaN;
    } else if (msg.t === "join") {
      upsert(msg.p);
      setRoom("live");
    } else if (msg.t === "leave") {
      remotes.delete(msg.id);
      setRoom("live");
    } else if (msg.t === "body") {
      const rec = remotes.get(msg.id);
      if (rec) rec.body = typeof msg.name === "string" ? msg.name : null;
    } else if (msg.t === "release") {
      state.released = { name: String(msg.name), reason: String(msg.reason) };
      emit();
    } else if (msg.t === "kick") {
      // replaced and full stop here; stale reconnects like any drop.
      if (msg.reason !== "stale") stopped = true;
      close(msg.reason === "stale" ? "connecting" : msg.reason);
    }
  };

  const close = (room) => {
    window.clearInterval(pingTimer);
    pingTimer = 0;
    if (ws) {
      ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
      if (ws.readyState <= WebSocket.OPEN) ws.close(1000);
      ws = null;
    }
    remotes.clear();
    setRoom(room);
    if (!stopped && room === "connecting") schedule();
  };

  // Backoff as the prototype tuned it: ×1.7 from half a second, capped at 15 s, ±25% jitter.
  const schedule = () => {
    window.clearTimeout(retryTimer);
    const wait = Math.min(BACKOFF_MAX_MS, BACKOFF_MS * 1.7 ** retry++) * (0.75 + Math.random() * 0.5);
    retryTimer = window.setTimeout(connect, wait);
  };

  const connect = () => {
    retryTimer = 0;
    if (stopped || ws || !state.me) return;
    setRoom("connecting");
    ws = new WebSocket(`${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/room`);
    ws.onmessage = onMessage;
    ws.onopen = () => {
      pingTimer = window.setInterval(() => send("ping"), PING_MS);
    };
    ws.onclose = () => close("connecting");
  };

  const start = async () => {
    if (state.started) return;
    state.started = true;
    if (location.protocol !== "https:" && location.protocol !== "http:") return;
    try {
      const res = await fetch("/api/me", { credentials: "same-origin", headers: { accept: "application/json" } });
      if (!res.ok || !(res.headers.get("content-type") || "").startsWith("application/json")) return;
      const data = await res.json();
      if (!data || !("player" in data)) return;
      state.backend = true;
      state.me = accept(data.player);
    } catch {
      return;
    }
    emit();
    connect();
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
    stopped = true;
    window.clearTimeout(retryTimer);
    state.me = null;
    close("off");
  };

  // After a `replaced` or `full` kick, the visitor chooses to play here again.
  const rejoin = () => {
    if (!state.me || ws) return;
    stopped = false;
    retry = 0;
    connect();
  };

  const setBody = (name) => {
    if (name === body) return;
    body = name;
    sendBody();
  };

  // Throttled to POSE_MS and skipped while nothing moved, so a standing Ooga costs nothing.
  const sendPose = (x, y, z, yaw) => {
    if (state.room !== "live") return;
    const now = performance.now();
    if (now - poseAt < POSE_MS) return;
    if (Math.abs(x - px) < 0.005 && Math.abs(y - py) < 0.005 && Math.abs(z - pz) < 0.005 && Math.abs(yaw - pyaw) < 0.01) return;
    poseAt = now;
    px = x; py = y; pz = z; pyaw = yaw;
    send(`{"t":"pose","x":${x.toFixed(3)},"y":${y.toFixed(3)},"z":${z.toFixed(3)},"yaw":${yaw.toFixed(3)}}`);
  };

  const loginOf = (character) => (character.github || character.handle).toLowerCase();
  // The character whose GitHub login this is; a handle that only looks like the login does not count.
  const characterOf = (login) => {
    const character = BL.characters.get(login);
    return character && loginOf(character) === String(login).toLowerCase() ? character : null;
  };
  const ownCharacter = () => state.me && characterOf(state.me.login);

  /** null when this visitor may drive the Ooga named `name`; otherwise the words that say why not. */
  const mayDrive = (name, working) => {
    if (!state.backend) return null;
    const owner = BL.characters.get(name);
    if (!owner || owner.handle.toLowerCase() !== String(name).toLowerCase()) return null;
    const who = owner.display || owner.handle;
    const mine = ownCharacter();
    if (mine) return mine === owner ? null : "Contributors drive only their own Ooga";
    const ownerLogin = loginOf(owner), wanted = owner.handle.toLowerCase();
    for (const rec of remotes.values()) {
      if (rec.login.toLowerCase() === ownerLogin) return `${who} is here and drives this Ooga`;
      if (rec.body && rec.body.toLowerCase() === wanted) return `Someone is already driving ${who}`;
    }
    return working ? `${who} is working: pick a resting or sleeping Ooga` : null;
  };

  const subscribe = (fn) => {
    subscribers.add(fn);
    return () => subscribers.delete(fn);
  };

  const dispose = () => {
    stopped = true;
    window.clearTimeout(retryTimer);
    subscribers.clear();
    close("off");
  };

  BL.net = { start, subscribe, dispose, login, logout, rejoin, setBody, sendPose, mayDrive, ownCharacter, remotes, state };
})();
