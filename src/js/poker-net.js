// The Ember Den's live tables, on the page the Worker serves: one socket to /poker while a signed-in visitor plays
// or watches there (the dealer is worker/src/poker-den.js; its wire format is worker/src/poker-protocol.js). It
// keeps the dealer's latest view of every table and hands the scene and the HUD the same shape a practice table
// has (`tables[i].snapshot()`, `version`, `playing`), and turns the HUD's actions into the dealer's messages. A view
// carries this visitor's own two cards where they sit and nulls for everyone else's, so the page never holds a card
// it may not show. Reconnects back off as the island room's do (0.5 s × 1.7, up to 15 s); a newer tab's `replaced`
// kick stops this one. `connection` is connecting, live, reconnecting or failed; `busy` while a move awaits the
// dealer's answer, so a second click cannot send a second bet. Times on views are the dealer's: `now()` is its clock.
(() => {
  "use strict";
  const BL = window.BL;
  const TABLES = 10, PING_MS = 10000, WELCOME_MS = 10000, BACKOFF_MS = 500, BACKOFF_MAX_MS = 15000;
  const KICKED = {
    replaced: "Live tables opened in another tab. Reconnect to play here instead.",
    full: "The live floor is full right now. Try again in a little while.",
    revoked: "Live tables closed for this account.",
    "signed-out": "You signed out, so you left the live tables. Poker bananas start fresh at your next sign-in.",
  };
  const create = (changed, notice) => {
    let ws = null, retry = 0, retryTimer = 0, pingTimer = 0, welcomeTimer = 0, stopped = true, welcomed = null;
    let connection = "connecting", busy = false, watching = 0, identity = "", wallet = { bananas: 0, topUp: false };
    let offset = 0, offsetKnown = false;
    const empty = BL.pokerRules.create().snapshot();
    const snapshots = Array.from({ length: TABLES }, () => ({ ...empty, deadline: 0, dealAt: 0 }));
    const revisions = new Array(TABLES).fill(0);
    const playing = s => s.phase !== "waiting" && s.phase !== "showdown";
    const tables = snapshots.map((_, i) => ({ snapshot: () => snapshots[i], get version() { return revisions[i]; }, get playing() { return playing(snapshots[i]); } }));
    const mine = () => snapshots.findIndex(s => s.seats.some(p => p && p.id === identity));
    // The deal's commit-reveal (poker-rules.js): a seated page adds a random seed to each deal it sees committed, and
    // every page checks each hand the dealer reveals. `checked[i]` is the last revealed hand at table i and its verdict.
    const sentFor = new Array(TABLES).fill(""), checked = Array.from({ length: TABLES }, () => ({ hand: 0, ok: null }));
    const seedHex = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, "0")).join("");
    const afterView = i => {
      const s = snapshots[i];
      if (s.commit && !playing(s) && sentFor[i] !== s.commit && s.seats.some(p => p && p.id === identity) && !(s.seeded || []).includes(identity)) {
        if (send({ t: "seed", table: i, s: seedHex() })) sentFor[i] = s.commit;
      }
      if (s.reveal && checked[i].hand !== s.reveal.hand) {
        checked[i].hand = s.reveal.hand;
        try { checked[i].ok = BL.pokerRules.checkReveal(s.reveal, s); } catch { checked[i].ok = false; }
      }
    };
    // The fastest sample of the dealer's clock is the best estimate of it, as net.js keeps the room's.
    const clock = now => {
      if (typeof now !== "number") return;
      const sample = now - Date.now();
      if (!offsetKnown || sample > offset) offset = sample;
      offsetKnown = true;
    };
    const send = msg => {
      if (!ws || ws.readyState !== WebSocket.OPEN) return false;
      ws.send(JSON.stringify(msg));
      return true;
    };
    const close = () => {
      clearInterval(pingTimer); pingTimer = 0;
      if (!ws) return;
      ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
      if (ws.readyState <= WebSocket.OPEN) ws.close(1000);
      ws = null;
    };
    const settleWelcome = error => {
      clearTimeout(welcomeTimer); welcomeTimer = 0;
      const w = welcomed; welcomed = null;
      if (!w) return;
      if (error) { stopped = true; clearTimeout(retryTimer); close(); w.reject(error); }
      else w.resolve();
    };
    const onMessage = e => {
      if (typeof e.data !== "string" || e.data === "pong") return;
      let m;
      try { m = JSON.parse(e.data); } catch { return; }
      if (m.t === "welcome") {
        if (!m.you || !Array.isArray(m.tables) || m.tables.length !== TABLES) return;
        identity = String(m.you.id); wallet = { bananas: m.wallet.bananas, topUp: m.wallet.topUp === true }; clock(m.now);
        retry = 0; connection = "live"; busy = false;
        m.tables.forEach((s, i) => { snapshots[i] = s; revisions[i]++; afterView(i); });
        settleWelcome(null);
        changed();
      } else if (m.t === "table") {
        if (!Number.isInteger(m.i) || m.i < 0 || m.i >= TABLES || !m.s) return;
        clock(m.now);
        snapshots[m.i] = m.s; revisions[m.i]++;
        if (busy && m.i === mine()) busy = false;
        afterView(m.i);
        changed();
      } else if (m.t === "wallet") {
        wallet = { bananas: m.bananas, topUp: m.topUp === true };
        changed();
      } else if (m.t === "notice" || m.t === "error") {
        if (m.t === "error") busy = false;
        notice(String(m.text));
        changed();
      } else if (m.t === "kick") {
        // Swept as silent: this page is here after all, so it comes back as after any drop.
        if (m.reason === "stale") { close(); connection = "reconnecting"; busy = false; changed(); schedule(); return; }
        stopped = true; connection = "failed"; busy = false;
        clearTimeout(retryTimer); close();
        notice(KICKED[m.reason] || KICKED.revoked);
        changed();
      }
    };
    const schedule = () => {
      clearTimeout(retryTimer);
      const wait = Math.min(BACKOFF_MAX_MS, BACKOFF_MS * 1.7 ** retry++) * (0.75 + Math.random() * 0.5);
      retryTimer = setTimeout(open, wait);
    };
    const open = () => {
      retryTimer = 0;
      if (stopped || ws) return;
      ws = new WebSocket(`${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/poker`);
      ws.onmessage = onMessage;
      ws.onopen = () => { pingTimer = setInterval(() => { if (ws && ws.readyState === WebSocket.OPEN) ws.send("ping"); }, PING_MS); };
      ws.onclose = () => {
        close();
        if (welcomed) { settleWelcome(new Error("Live tables did not answer. Try again in a moment.")); connection = "failed"; changed(); return; }
        if (stopped) return;
        connection = "reconnecting"; busy = false;
        changed();
        schedule();
      };
    };
    // Resolves once the dealer has welcomed this page with every table; rejects when it cannot.
    const connect = table => {
      watching = table;
      if (!BL.net.state.backend) return Promise.reject(new Error("Live tables need the Ooga Booga Land site"));
      if (!BL.net.state.me) return Promise.reject(new Error("Sign in with GitHub to join the live tables"));
      return new Promise((resolve, reject) => {
        welcomed = { resolve, reject };
        welcomeTimer = setTimeout(() => settleWelcome(new Error("Live tables did not answer. Try again in a moment.")), WELCOME_MS);
        stopped = false; retry = 0; connection = "connecting";
        open();
      });
    };
    const action = (name, value, version) => {
      if (name === "watch") { watching = value; return; }
      if (connection !== "live") throw new Error("Wait for the live table to reconnect");
      const move = name === "fold" || name === "call" || name === "raise";
      if (move && busy) throw new Error("Your last move is still on its way to the dealer");
      let msg;
      if (name === "seat") msg = { t: "sit", table: watching, seat: value };
      else if (name === "join") msg = { t: "sit", table: watching, seat: -1 };
      else if (name === "stand") msg = { t: "stand" };
      else if (name === "fold") msg = { t: "act", a: "fold", v: version };
      else if (name === "call") msg = { t: "act", a: snapshots[mine()]?.legal?.check ? "check" : "call", v: version };
      else if (name === "raise") msg = { t: "act", a: "raise", n: value, v: version };
      else if (name === "start") msg = { t: "deal" };
      else if (name === "refill") msg = { t: "topup" };
      else if (name === "in" || name === "out") msg = { t: "out", on: name === "out" };
      else throw new Error("Live tables do not do that");
      if (!send(msg)) throw new Error("Wait for the live table to reconnect");
      if (move) busy = true;
      changed();
    };
    return {
      kind: "den", tables, connect, action, fairness: null,
      get identity() { return identity; }, get account() { return identity; }, get table() { const i = mine(); return i >= 0 ? i : watching; },
      get connection() { return connection; }, get busy() { return busy; }, get wallet() { return wallet; },
      get deadline() { return snapshots[watching].deadline || null; }, now: () => Date.now() + offset, deckCheck: i => checked[i],
      disconnect(message) { stopped = true; clearTimeout(retryTimer); close(); connection = "failed"; busy = false; notice(message); changed(); },
      dispose() { stopped = true; clearTimeout(retryTimer); retryTimer = 0; settleWelcome(new Error("Left the live tables")); close(); }
    };
  };
  BL.pokerNet = { create };
})();
