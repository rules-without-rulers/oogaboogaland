// The visitor's account and the island room, when the page is served by the Cloudflare Worker. One look
// at /api/me on start; a signed-in visitor then holds one socket to /room for the page life. A page with
// no backend behind it (GitHub Pages, a file, `npm run serve`) gets no JSON from /api/me and stays as it
// always was: `backend` false, nothing shown, no socket. Like the live feeds it stays off under nosim and
// can be disabled with net=0; the director starts it. The same look says whether the Worker takes real
// donations (`state.donations`), which the director hands to donations.js.
//
// The room answers who else is on the island: `remotes` (id → { login, display, body, zone, voice, muted, x, y, z, yaw }),
// updated in place from its snapshots (up to 15 a second while anyone moves). A scene reports the actor the visitor drives with `setBody`
// (null when none) and its feet and heading with `sendPose`, which throttles itself. A newer tab of the
// same account kicks this one with `replaced`: it stops reconnecting until `rejoin`. `setZone` reports
// the place the driven Ooga is in (out on the island, HQ, a cave), which decides who hears whom.
//
// Who drives which Ooga, on the page served by the Worker (`mayDrive`; the room enforces the same
// ownership through its own copy of the cast): a signed-in contributor drives only their own Ooga, and
// nobody else drives it while they are here. Signed-out visitors can drive available bundled Oogas
// locally, including working ones; temporary contributors must sign in. Ownership keys on the GitHub login
// alone (`github`, else the handle). A claim the room refuses, or an owner arriving, lands as `released`.
// A body is its Ooga's canonical handle, or `gorilla:<handle>` for that Ooga's companion. Signed-in
// visitors drive only their own gorilla; signed-out pages can still play companions locally.
// The NPC host: the room elects one page showing the island (`setHub`, which also counts a hidden tab
// out) to run the Oogas for everyone. `state.hostId` names it; the host sends its binary pose frames with
// `sendNpc`, and every other page reads the latest one from `npcFrame` (with `state.npcVersion` counting).
// `state.followers` is how many pages follow the host; with none, the host sends nothing.
// A tab hidden for HIDDEN_PAUSE_MS leaves the room (`paused`, voice stopped) and comes back when it is
// looked at again, so a forgotten tab does not hold the room, the host role or voice.
// The room's clock: `serverNow()` estimates it from the timestamps on `welcome` and `state`, keeping the
// sample that arrived fastest (the least delayed), and `state.loopEpoch` is when the pile's shared
// sound loop started, so every page can play the same moment of it.
// The roster's marks (who is in voice, muted, the host) follow `subscribeRoster`, which also fires on a
// body or voice change; `subscribe` stays for the account and the room. `setMuted` tells the room this
// page muted its microphone, and `state.body` is the actor this page reports driving.
// `setHealth` reports the driven actor's health (on a change, at most HP_MS apart), which other pages draw over
// it; remote records carry `hp` and `ko`.
// Gorilla poses optionally add `g`: flags (air, biped, climb, run, lab, office, sleep), speed, climb stride,
// climb direction, climb side and swim. Each remote reuses its six values; ordinary poses keep their format.
// Ooga Chat: `sendChat` sends a line (sanitized as donation messages are, CHAT_MAX characters at most) while the
// room is live; `subscribeChat` hears the room's lines as `fn(lines, joined, receipt)`: one new line, or on every
// (re)join the lines the room still holds, which chat.js merges; a rejection keeps the draft. The room names each line's
// speaker; the page keeps nothing (chat.js shows them).
// The Timechain Sphere's doorway (docs/timechain-sphere/doorway-contract.md): a room that knows it says so in `welcome`
// (`features` holds "door", `state.doorway`). `askDoor(dir, room)` asks for the shared doorway after a crossing is
// prepared, at most one request at a time; the room answers `wait` or `grant { cycle, exp }`, the page starts its
// crossing with `goDoor(cycle)` (the room then tells everyone `transit { cycle, actor, door, dir, at, exp }`) and ends
// it with `doneDoor(cycle)`, or gives it back with `cancelDoor()`. `passDoor(door, dir)` announces a walk through a
// room's own doors, which nobody reserves. `subscribeDoor` hears all of it, and `{ t: "door", op: "lost" }` when the
// socket goes. Without the feature these send nothing and return false, and the sphere crosses on this page alone.
// `recheck` looks at /api/me again after a look that went unanswered (the keypad's Retry), bounded as the first.
// `setPokerVoice(table)` scopes Ember Den voice to one table, or the floor when null, without moving the body.
// Exports start, recheck, subscribe, subscribeRoster, subscribeChat, subscribeDoor, dispose, login, logout, setDisplay, rejoin, setBody, setZone, setPokerVoice, setHub,
// setMuted, setHealth, sendNpc, sendChat, npcFrame, sendPose, askDoor, goDoor, doneDoor, cancelDoor, passDoor, mayDrive, mayDriveGorilla,
// ownCharacter, characterOf, gorillaBody, bodyName, bodyKind, serverNow, remotes, state, CHAT_MAX and CHAT_KEEP.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const POSE_MS = 1000 / 10;
  // Health in steps of the smallest hit, a few reports a second at most; the room's own bounds for poses.
  const HP_MS = 250, HP_STEP = 4, BOUND_XZ = 160, BOUND_Y_MIN = -130, BOUND_Y_MAX = 100;
  const PING_MS = 10000;
  const HIDDEN_PAUSE_MS = 5 * 60000;
  const BACKOFF_MS = 500, BACKOFF_MAX_MS = 15000;
  // The room's own limits (worker/src/protocol.js): characters in a line, lines it holds.
  const CHAT_MAX = 160, CHAT_KEEP = 100;
  const GORILLA_PREFIX = "gorilla:";
  const bodyKind = (name) => name ? name.startsWith(GORILLA_PREFIX) ? "gorilla" : "ooga" : null;
  const bodyName = (name) => name && name.startsWith(GORILLA_PREFIX) ? name.slice(GORILLA_PREFIX.length) : name;
  const gorillaBody = (name) => {
    const character = BL.characters.get(name);
    return GORILLA_PREFIX + (character ? character.handle : name);
  };
  const chatIdValid = (id) => typeof id === "string" && id.length > 0 && id.length <= 64 && !/[^\w-]/.test(id);
  const DOOR_NAME = /^[a-z0-9-]{1,24}$/;
  const subscribers = new Set();
  const doorSubscribers = new Set();
  const rosterSubscribers = new Set();
  const chatSubscribers = new Set();
  const remotes = new Map();
  // room: "off" (signed out or no backend), "connecting", "live", "paused" (hidden a while), or a kick that
// stopped it ("replaced", "full").
  const offline = new URLSearchParams(location.search);
  const state = { backend: false, me: null, donations: false, logoutEpoch: 0, started: false,
    resolved: offline.has("nosim") || offline.get("net") === "0" || location.protocol !== "http:" && location.protocol !== "https:",
    room: "off", selfId: 0, online: 0, released: null, loopEpoch: 0, zone: "outside", body: null, bodyKind: null, bodyName: null, hostId: 0, followers: 0, npcVersion: 0, doorway: false };
  let ws = null, retry = 0, retryTimer = 0, pingTimer = 0, hiddenTimer = 0, stopped = false;
  let npcFrame = null, inHub = false, hubSent = null;
  let zone = "outside", body = null, muted = false, hpSent = 100, koSent = false, hpAt = 0, poseAt = 0, px = NaN, py = NaN, pz = NaN, pyaw = NaN;
  const gSent = new Float64Array(6);
  let gKnown = false, poseHasG = false;
  let clockOffset = 0, clockKnown = false;
  let pokerVoice = null;
  // A server timestamp minus the arrival time is the true offset less the trip; the largest such
  // sample is the one that travelled fastest, so it is the best estimate yet.
  const clockSample = (serverMs) => {
    if (typeof serverMs !== "number") return;
    const sample = serverMs - Date.now();
    if (!clockKnown || sample > clockOffset) clockOffset = sample;
    clockKnown = true;
  };
  const serverNow = () => Date.now() + clockOffset;

  const rosterChanged = () => {
    for (const fn of rosterSubscribers) fn();
  };
  const emit = () => {
    for (const fn of subscribers) fn(state);
    rosterChanged();
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
  const sendZone = () => send(JSON.stringify({ t: "zone", name: zone }));
  const sendPokerVoice = () => { if (zone === "ember-den") send(JSON.stringify({ t: "poker-voice", table: pokerVoice })); };
  const sendMute = () => send(muted ? '{"t":"mute","on":true}' : '{"t":"mute","on":false}');
  // What the room hears is "showing the island now": the hub scene, in a visible tab.
  const sendHub = () => {
    const on = inHub && !document.hidden;
    if (on === hubSent || !ws || ws.readyState !== WebSocket.OPEN) return;
    hubSent = on;
    send(on ? '{"t":"hub","on":true}' : '{"t":"hub","on":false}');
  };

  const readGorillaPose = (rec, values, offset = 0) => {
    if (rec.bodyKind !== "gorilla" || !Array.isArray(values) || values.length < offset + 6) return;
    for (let i = 0; i < 6; i++) if (!Number.isFinite(values[offset + i])) return;
    const flags = values[offset];
    if (!Number.isInteger(flags) || flags < 0 || flags > 127) return;
    const g = rec.gData || (rec.gData = new Float64Array(6));
    g[0] = flags;
    g[1] = Math.max(-20, Math.min(20, values[offset + 1]));
    g[2] = Math.max(-1e6, Math.min(1e6, values[offset + 2]));
    g[3] = Math.max(-1, Math.min(1, values[offset + 3]));
    g[4] = Math.max(-1, Math.min(1, values[offset + 4]));
    g[5] = Math.max(0, Math.min(1, values[offset + 5]));
    rec.g = g;
  };

  const upsert = (p) => {
    if (!p || !Number.isSafeInteger(p.id) || p.id === state.selfId) return;
    const rec = remotes.get(p.id) || { id: p.id, login: "", display: "", body: null, bodyKind: null, bodyName: null, zone: "outside", voice: false, muted: false, hp: 100, ko: false, x: 0, y: 0, z: 0, yaw: 0, g: null, gData: null };
    rec.login = String(p.login);
    rec.display = String(p.display || p.login);
    rec.body = typeof p.body === "string" ? p.body : null;
    rec.bodyKind = bodyKind(rec.body);
    rec.bodyName = bodyName(rec.body);
    rec.g = null;
    if (Array.isArray(p.g) && p.g.length === 6) readGorillaPose(rec, p.g);
    rec.zone = typeof p.zone === "string" ? p.zone : "outside";
    rec.voice = p.voice === true;
    rec.hp = Number.isFinite(p.hp) ? p.hp : 100;
    rec.ko = p.ko === true;
    rec.muted = p.muted === true;
    rec.x = +p.x || 0; rec.y = +p.y || 0; rec.z = +p.z || 0; rec.yaw = +p.yaw || 0;
    remotes.set(p.id, rec);
  };

  // Only the fields chat.js shows; the room already sanitized the text and named the speaker.
  const chatLine = (m) => m && Number.isSafeInteger(m.id) && typeof m.login === "string" && typeof m.text === "string"
    ? { id: m.id, at: Number.isFinite(m.at) ? m.at : 0, login: m.login, name: typeof m.name === "string" && m.name ? m.name : m.login, text: m.text.slice(0, CHAT_MAX) }
    : null;
  const chatHeard = (lines, replace, receipt = null) => {
    for (const fn of chatSubscribers) fn(lines, replace, receipt);
  };
  const doorHeard = (event) => {
    for (const fn of doorSubscribers) fn(event);
  };
  // Only well-formed doorway words reach the page.
  const transitOf = (m) => m && chatIdValid(m.cycle) && Number.isSafeInteger(m.actor) && typeof m.door === "string" && DOOR_NAME.test(m.door)
    && (m.dir === "in" || m.dir === "out") && Number.isFinite(m.at) && Number.isFinite(m.exp)
    ? { t: "transit", cycle: m.cycle, actor: m.actor, door: m.door, dir: m.dir, at: m.at, exp: m.exp } : null;

  const onMessage = (e) => {
    if (e.data instanceof ArrayBuffer) {
      npcFrame = e.data;
      state.npcVersion++;
      return;
    }
    if (e.data === "pong" || typeof e.data !== "string") return;
    let msg;
    try {
      msg = JSON.parse(e.data);
    } catch {
      return;
    }
    if (msg.t === "state") {
      clockSample(msg.now);
      const ps = msg.ps;
      for (let i = 0; i + 4 < ps.length; i += 5) {
        const rec = remotes.get(ps[i]);
        if (!rec) continue;
        rec.x = ps[i + 1]; rec.y = ps[i + 2]; rec.z = ps[i + 3]; rec.yaw = ps[i + 4];
      }
      const gs = msg.gs;
      if (Array.isArray(gs)) for (let i = 0; i + 6 < gs.length; i += 7) {
        const rec = remotes.get(gs[i]);
        if (rec) readGorillaPose(rec, gs, i + 1);
      }
    } else if (msg.t === "welcome") {
      retry = 0;
      clockKnown = false;
      clockSample(msg.now);
      state.loopEpoch = typeof msg.loopEpoch === "number" ? msg.loopEpoch : 0;
      state.hostId = Number.isSafeInteger(msg.host) ? msg.host : 0;
      state.followers = Number.isSafeInteger(msg.followers) ? msg.followers : 0;
      state.selfId = msg.you.id;
      state.doorway = Array.isArray(msg.features) && msg.features.includes("door");
      remotes.clear();
      for (const p of msg.players) upsert(p);
      setRoom("live");
      const transit = transitOf(msg.transit);
      if (transit && transit.actor !== state.selfId) doorHeard(transit);
      // A reconnect picks up where the page is: the actor still driven and where it stands, and voice,
      // whose sessions the room forgot with the old socket.
      sendBody();
      // Restore the actor before admitting it to the destination zone. A reconnect therefore cannot briefly
      // appear, or become voice-eligible, in a room without its last bounded pose.
      const restoredPose = body && Number.isFinite(px) && Number.isFinite(py) && Number.isFinite(pz) && Number.isFinite(pyaw);
      if (restoredPose) {
        const extra = state.bodyKind === "gorilla" && poseHasG ? `,"g":[${gSent[0]},${gSent[1].toFixed(3)},${gSent[2].toFixed(3)},${gSent[3].toFixed(3)},${gSent[4].toFixed(3)},${gSent[5].toFixed(3)}]` : "";
        send(`{"t":"pose","x":${px.toFixed(3)},"y":${py.toFixed(3)},"z":${pz.toFixed(3)},"yaw":${pyaw.toFixed(3)}${extra}}`);
      }
      sendZone();
      sendPokerVoice();
      if (muted) sendMute();
      // A fresh room record starts at full health; the next report sends ours if it differs.
      hpSent = 100; koSent = false; hpAt = 0;
      hubSent = null;
      sendHub();
      BL.voice.restart();
      if (restoredPose) poseAt = performance.now();
      else { poseAt = 0; px = NaN; gKnown = poseHasG = false; }
    } else if (msg.t === "join") {
      upsert(msg.p);
      setRoom("live");
    } else if (msg.t === "leave") {
      remotes.delete(msg.id);
      setRoom("live");
    } else if (msg.t === "body") {
      const rec = remotes.get(msg.id);
      if (rec) {
        rec.body = typeof msg.name === "string" ? msg.name : null;
        rec.bodyKind = bodyKind(rec.body);
        rec.bodyName = bodyName(rec.body);
        rec.g = null;
        rec.hp = 100;
        rec.ko = false;
      }
      rosterChanged();
    } else if (msg.t === "vstate") {
      const rec = remotes.get(msg.id);
      if (!rec) return;
      rec.voice = msg.voice === true;
      rec.muted = msg.muted === true;
      rosterChanged();
    } else if (msg.t === "hp") {
      const rec = remotes.get(msg.id);
      if (!rec || !Number.isFinite(msg.v)) return;
      rec.hp = msg.v;
      rec.ko = msg.ko === true;
    } else if (msg.t === "zone") {
      const rec = remotes.get(msg.id);
      if (rec && typeof msg.name === "string") rec.zone = msg.name;
    } else if (msg.t === "host") {
      state.hostId = Number.isSafeInteger(msg.id) ? msg.id : 0;
      state.followers = Number.isSafeInteger(msg.followers) ? msg.followers : 0;
      emit();
    } else if (msg.t === "chat") {
      const line = chatLine(msg);
      if (line) chatHeard([line], false);
    } else if (msg.t === "chat-ack" || msg.t === "chat-rejected") {
      if (chatIdValid(msg.clientId))
        chatHeard([], false, { clientId: msg.clientId, accepted: msg.t === "chat-ack", conflict: msg.reason === "conflict" });
    } else if (msg.t === "chat-history") {
      if (!Array.isArray(msg.messages)) return;
      const lines = [];
      for (const m of msg.messages.slice(-CHAT_KEEP)) {
        const line = chatLine(m);
        if (line) lines.push(line);
      }
      chatHeard(lines, true);
    } else if (msg.t === "door") {
      if (msg.op === "grant" && chatIdValid(msg.cycle) && Number.isFinite(msg.exp)) doorHeard({ t: "door", op: "grant", cycle: msg.cycle, exp: msg.exp });
      else if (msg.op === "started" && chatIdValid(msg.cycle) && Number.isFinite(msg.exp)) doorHeard({ t: "door", op: "started", cycle: msg.cycle, exp: msg.exp });
      else if (msg.op === "wait") doorHeard({ t: "door", op: "wait", ahead: Number.isSafeInteger(msg.ahead) && msg.ahead >= 0 ? msg.ahead : 0 });
      else if (msg.op === "denied") doorHeard({ t: "door", op: "denied", reason: typeof msg.reason === "string" ? msg.reason.slice(0, 32) : "" });
    } else if (msg.t === "transit") {
      const transit = transitOf(msg);
      if (transit && transit.actor !== state.selfId) doorHeard(transit);
    } else if (msg.t === "transit-end") {
      if (chatIdValid(msg.cycle)) doorHeard({ t: "transit-end", cycle: msg.cycle });
    } else if (msg.t === "voice") {
      if (Array.isArray(msg.peers)) BL.voice.setPeers(msg.peers, Array.isArray(msg.gens) ? msg.gens : null);
    } else if (msg.t === "release") {
      state.released = { name: String(msg.name), reason: String(msg.reason) };
      emit();
    } else if (msg.t === "kick") {
      // Revoked access stops reconnecting; the operator may later restore access.
      if (msg.reason === "revoked") state.me = null;
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
    state.hostId = 0;
    state.followers = 0;
    // Any request for the doorway went with the socket.
    if (state.doorway) doorHeard({ t: "door", op: "lost" });
    state.doorway = false;
    npcFrame = null;
    hubSent = null;
    // Out of the room for good (signed out, another tab, full): voice goes with it.
    if (room !== "connecting") BL.voice.stop();
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
    ws.binaryType = "arraybuffer";
    ws.onmessage = onMessage;
    ws.onopen = () => {
      pingTimer = window.setInterval(() => send("ping"), PING_MS);
    };
    ws.onclose = () => close("connecting");
  };

  // One look at the account; true when it found a backend to join.
  const look = async () => {
    try {
      const res = await fetch("/api/me", { credentials: "same-origin", headers: { accept: "application/json" }, signal: AbortSignal.timeout(6000) });
      // A static host's 404/HTML response establishes that no account exists
      // here. A timeout or failed account service does not establish sign-out.
      if (res.status === 404 || res.ok && !(res.headers.get("content-type") || "").startsWith("application/json")) { state.resolved = true; return false; }
      if (!res.ok) return false;
      const data = await res.json();
      if (!data || !("player" in data)) return false;
      state.backend = true;
      state.me = accept(data.player);
      state.donations = data.donations === true;
      state.resolved = data.player === null || !!state.me;
      if (state.me) BL.contributors.addTemporary(data.character, state.me.login);
    } catch {
      return false;
    } finally {
      emit();
    }
    return true;
  };
  const start = async () => {
    if (state.started) return;
    state.started = true;
    if (location.protocol !== "https:" && location.protocol !== "http:") return;
    state.resolved = false;
    if (await look()) connect();
  };
  // Again, only while the first look went unanswered; never more than one at a time.
  let rechecking = null;
  const recheck = () => {
    if (state.resolved || !state.started) return Promise.resolve(state);
    if (!rechecking) rechecking = look().then((found) => { if (found) connect(); rechecking = null; return state; });
    return rechecking;
  };

  // Sign-in is a full navigation through GitHub; the Worker brings the visitor back to this path, or to `next`
  // (a scene without an address of its own, such as the Ember Den's `/?scene=poker`).
  const login = (next = location.pathname + location.search) => {
    if (!state.backend) return;
    if (BL.pilot && BL.pilot.saveLoginView) BL.pilot.saveLoginView();
    location.assign(`/auth/login?next=${encodeURIComponent(next)}`);
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
    state.logoutEpoch++;
    close("off");
  };

  // Existing account API; rejoin with fresh authenticated headers so future lines use the new name.
  const setDisplay = async (display) => {
    const player = state.me;
    if (!state.backend || !player) return { ok: false, error: "Sign in first." };
    const clean = String(display).trim();
    if (clean.length < 3 || clean.length > 24 || /[^\w .,!?'@#:-]/.test(clean))
      return { ok: false, error: "Use 3–24 letters A–Z, digits, spaces or _ . , ! ? ' @ # : -" };
    try {
      const res = await fetch("/api/me", { method: "PATCH", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ display: clean }), signal: AbortSignal.timeout(6000) });
      const data = await res.json();
      if (!res.ok) return { ok: false, error: "Name could not be saved. Try again." };
      const updated = accept(data.player);
      if (!updated || updated.id !== player.id || state.me !== player) return { ok: false, error: "Account changed. Try again." };
      state.me = updated;
      const rejoinHere = !stopped;
      close(rejoinHere ? "connecting" : state.room);
      if (rejoinHere) { window.clearTimeout(retryTimer); retryTimer = 0; connect(); }
      return { ok: true };
    } catch {
      return { ok: false, error: "Name could not be saved. Try again." };
    }
  };

  // After a `replaced` or `full` kick, the visitor chooses to play here again.
  const rejoin = () => {
    if (!state.me || ws) return;
    stopped = false;
    retry = 0;
    connect();
  };

  // Where the driven Ooga is ("outside", "hq", "cave-<id>"): voice is shared within one place.
  // Zones are `<group>` or `<group>.<place>` (the Factory's tunnel and its hall); voice is shared within a group,
  // so only leaving the group lets go of every voice here. The room answers every zone with the list to hear.
  const groupLength = (name) => {
    const dot = name.indexOf(".");
    return dot < 0 ? name.length : dot;
  };
  const sameGroup = (a, b) => {
    const n = groupLength(a);
    return n === groupLength(b) && a.startsWith(b.slice(0, n));
  };
  const setZone = (name) => {
    if (name === zone) return;
    const moved = !sameGroup(name, zone);
    zone = state.zone = name;
    pokerVoice = null;
    poseAt = 0; px = NaN;
    if (moved) BL.voice.setPeers([]);
    sendZone();
  };
  // Voice changes without moving or hiding anybody on the shared floor.
  const setPokerVoice = table => {
    if (zone !== "ember-den" || table !== null && (!Number.isInteger(table) || table < 0 || table >= 10) || pokerVoice === table) return;
    pokerVoice = table;
    BL.voice.setPeers([]);
    sendPokerVoice();
  };

  // The hub says when it shows the island; a hidden tab stops counting until it is looked at again.
  const setHub = (on) => {
    inHub = on;
    sendHub();
  };
  // Hidden long enough, the tab leaves the room; shown again, it rejoins as a fresh connection.
  const onVisibility = () => {
    sendHub();
    window.clearTimeout(hiddenTimer);
    hiddenTimer = 0;
    if (document.hidden) {
      if (state.me && !stopped) hiddenTimer = window.setTimeout(pause, HIDDEN_PAUSE_MS);
    } else if (state.room === "paused") {
      rejoin();
    }
  };
  const pause = () => {
    hiddenTimer = 0;
    if (!document.hidden || stopped || !state.me) return;
    stopped = true;
    window.clearTimeout(retryTimer);
    close("paused");
  };
  document.addEventListener("visibilitychange", onVisibility);

  // The host's frame of Oogas, sent as bytes (a typed array view is sent as just its own bytes).
  const sendNpc = (view) => {
    if (ws && ws.readyState === WebSocket.OPEN && state.hostId === state.selfId) ws.send(view);
  };

  const setBody = (name) => {
    if (name === body) return;
    body = state.body = name;
    state.bodyKind = bodyKind(name);
    state.bodyName = bodyName(name);
    poseAt = 0; px = NaN;
    gKnown = poseHasG = false;
    sendBody();
    // The room starts another actor at full health.
    hpSent = 100; koSent = false; hpAt = 0;
    rosterChanged();
  };

  // The driven Ooga's health, called every frame: sent only when its step or knockout changed, HP_MS apart, so a
  // fight costs a few messages a second and an Ooga at full health none.
  const setHealth = (value, stunned) => {
    if (state.room !== "live" || !body) return;
    const v = Math.max(0, Math.min(100, Math.round(value / HP_STEP) * HP_STEP)), ko = !!stunned;
    if (v === hpSent && ko === koSent) return;
    const now = performance.now();
    if (now - hpAt < HP_MS) return;
    hpAt = now;
    hpSent = v;
    koSent = ko;
    send(`{"t":"hp","v":${v},"ko":${ko}}`);
  };

  // This page's own microphone muted or not, for every other page's roster.
  const setMuted = (on) => {
    if (on === muted) return;
    muted = on;
    sendMute();
  };

  // One line of Ooga Chat; false when it was not sent (not live, empty, or too long once sanitized).
  const sendChat = (text, clientId) => {
    const line = BL.donations.sanitize(text, Infinity);
    if (state.room !== "live" || !ws || ws.readyState !== WebSocket.OPEN || !line || line.length > CHAT_MAX) return false;
    if (clientId !== undefined && !chatIdValid(clientId)) return false;
    send(JSON.stringify({ t: "chat", text: line, ...(clientId === undefined ? {} : { clientId }) }));
    return true;
  };

  // Throttled to POSE_MS and skipped while nothing moved; a changed gorilla pose also earns a report.
  const sendPose = (x, y, z, yaw, g = null) => {
    const now = performance.now();
    if (state.bodyKind === "gorilla" && g && g.length === 6) {
      let valid = true;
      for (let i = 0; i < 6; i++) if (!Number.isFinite(g[i])) { valid = false; break; }
      if (valid) poseHasG = true;
    }
    if (now - poseAt < POSE_MS) return;
    // The room drops a pose outside its bounds, which would freeze this Ooga on other pages: hold it at the edge.
    x = Math.max(-BOUND_XZ, Math.min(BOUND_XZ, x));
    z = Math.max(-BOUND_XZ, Math.min(BOUND_XZ, z));
    y = Math.max(BOUND_Y_MIN, Math.min(BOUND_Y_MAX, y));
    if (state.bodyKind !== "gorilla") g = null;
    if (g) for (let i = 0; i < 6; i++) if (!Number.isFinite(g[i])) { g = null; break; }
    let changed = !!g && !gKnown;
    if (g && !changed) for (let i = 0; i < 6; i++) if (g[i] !== gSent[i]) { changed = true; break; }
    // Even when the complete pose is unchanged, remember that its cached locomotion is valid for reconnect.
    if (g) poseHasG = true;
    if (!changed && Math.abs(x - px) < 0.005 && Math.abs(y - py) < 0.005 && Math.abs(z - pz) < 0.005 && Math.abs(yaw - pyaw) < 0.01) return;
    poseAt = now;
    px = x; py = y; pz = z; pyaw = yaw;
    poseHasG = !!g;
    let extra = "";
    if (g) {
      for (let i = 0; i < 6; i++) gSent[i] = g[i];
      gKnown = true;
      extra = `,"g":[${g[0]},${g[1].toFixed(3)},${g[2].toFixed(3)},${g[3].toFixed(3)},${g[4].toFixed(3)},${g[5].toFixed(3)}]`;
    }
    if (state.room === "live") send(`{"t":"pose","x":${x.toFixed(3)},"y":${y.toFixed(3)},"z":${z.toFixed(3)},"yaw":${yaw.toFixed(3)}${extra}}`);
  };

  // The doorway: each sends only to a live room that knows it, and says whether it did.
  const doorSend = (text) => {
    if (state.room !== "live" || !state.doorway || !ws || ws.readyState !== WebSocket.OPEN) return false;
    ws.send(text);
    return true;
  };
  const askDoor = (dir, room) => (dir === "in" || dir === "out") && Number.isInteger(room) && room >= 1 && room <= 9
    && doorSend(JSON.stringify({ t: "door", op: "ask", dir, room }));
  const goDoor = (cycle) => chatIdValid(cycle) && doorSend(JSON.stringify({ t: "door", op: "go", cycle }));
  const doneDoor = (cycle) => chatIdValid(cycle) && doorSend(JSON.stringify({ t: "door", op: "done", cycle }));
  const cancelDoor = () => doorSend('{"t":"door","op":"cancel"}');
  const passDoor = (door, dir) => typeof door === "string" && DOOR_NAME.test(door) && (dir === "in" || dir === "out")
    && doorSend(JSON.stringify({ t: "door", op: "pass", door, dir }));

  const loginOf = (character) => (character.github || character.handle).toLowerCase();
  // The character whose GitHub login this is; a handle that only looks like the login does not count.
  const characterOf = (login) => {
    const character = BL.characters.get(login);
    return character && loginOf(character) === String(login).toLowerCase() ? character : null;
  };
  const ownCharacter = () => state.me && characterOf(state.me.login);

  /** null when this visitor may drive the Ooga named `name`; otherwise the words that say why not. */
  const mayDrive = (name) => {
    if (!state.backend) return null;
    const owner = BL.characters.get(name);
    if (state.me) return owner && ownCharacter() === owner ? null : "Drive your own Ooga";
    if (!owner || owner.handle.toLowerCase() !== String(name).toLowerCase()) return null;
    const who = owner.display || owner.handle;
    if (owner.temporary) return "Sign in to drive your Ooga";
    const ownerLogin = loginOf(owner), wanted = owner.handle.toLowerCase();
    for (const rec of remotes.values()) {
      if (rec.login.toLowerCase() === ownerLogin) return `${who} is here and drives this Ooga`;
      if (rec.body && rec.body.toLowerCase() === wanted) return `Someone is already driving ${who}`;
    }
    return null;
  };

  const mayDriveGorilla = (name) => {
    if (!state.backend) return null;
    const owner = BL.characters.get(name);
    if (state.me) return owner && ownCharacter() === owner ? null : "Drive your own gorilla";
    if (!owner) return null;
    const who = owner.display || owner.handle, ownerLogin = loginOf(owner), wanted = gorillaBody(owner.handle).toLowerCase();
    for (const rec of remotes.values()) {
      if (rec.login.toLowerCase() === ownerLogin) return `${who} is here and drives this gorilla`;
      if (rec.body && rec.body.toLowerCase() === wanted) return `Someone is already driving ${who}'s gorilla`;
    }
    return owner.temporary ? "Sign in to drive your gorilla" : null;
  };

  const subscribe = (fn) => {
    subscribers.add(fn);
    return () => subscribers.delete(fn);
  };
  const subscribeRoster = (fn) => {
    rosterSubscribers.add(fn);
    return () => rosterSubscribers.delete(fn);
  };
  const subscribeChat = (fn) => {
    chatSubscribers.add(fn);
    return () => chatSubscribers.delete(fn);
  };
  const subscribeDoor = (fn) => {
    doorSubscribers.add(fn);
    return () => doorSubscribers.delete(fn);
  };

  const dispose = () => {
    document.removeEventListener("visibilitychange", onVisibility);
    stopped = true;
    window.clearTimeout(retryTimer);
    window.clearTimeout(hiddenTimer);
    subscribers.clear();
    rosterSubscribers.clear();
    chatSubscribers.clear();
    doorSubscribers.clear();
    close("off");
  };

  BL.net = { start, recheck, subscribe, subscribeRoster, subscribeChat, subscribeDoor, dispose, login, logout, setDisplay, rejoin, setBody, setZone, setPokerVoice, setHub, setMuted, setHealth, sendNpc, sendChat, sendPose, askDoor, goDoor, doneDoor, cancelDoor, passDoor, mayDrive, mayDriveGorilla, ownCharacter, characterOf, gorillaBody, bodyName, bodyKind, serverNow, remotes, state, CHAT_MAX, CHAT_KEEP, get npcFrame() { return npcFrame; } };
})();
