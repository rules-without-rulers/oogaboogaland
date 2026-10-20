(() => {
  "use strict";
  const BL = window.BL, S = BL.scene, PM = BL.pokerModels, R = BL.pokerRules, Themes = BL.pokerThemes;
  const presets = { entrance: { yaw: 0, pitch: 0.48, dist: 18, target: { x: 0, y: 1, z: 17 } } };
  const renderOpts = { clear: [0.1, 0.12, 0.09], sky: [0.62, 0.57, 0.45], ground: [0.31, 0.36, 0.27],
    direct: [0.88, 0.77, 0.58], directStrength: 0.38, ambientFloor: 0.48, sun: { x: 0.2, y: 1, z: 0.3 },
    shadowCenter: { x: 0, y: 1.5, z: 0 }, shadowExtent: 35, bloomStrength: 0.24,
    lights: new Float32Array(BL.glRenderer.POINT_LIGHT_CAPACITY * 8), lightCount: 13 };
  let root, camera, input, hud, panel, pilot, fx, people, avatar, room, mirror, game, world, session, go;
  let leaving = false, timer = 0, selected = 0, pendingStand = false, seatTable = -1, shownCountdown = -1;
  const targets = [], snapshots = new Array(10);
  let HERO = "local-player", connecting = false, unsubscribeAccount = null, remotes = null, footsteps = null;
  let visit = 0, pendingLive = null, unsubscribeRoster = null, shared = null;
  const NO_ACTORS = [];
  // The look each chair's model was built with, by table; the players seated at the dealer's tables.
  const looks = Array.from({ length: 10 }, () => new Array(9).fill(null)), seatedIds = new Set();
  // On the Worker's page the island's driving rules hold in here too, and the Ooga driven is reported to the room
  // every frame, so signed-in players on the floor hear each other (voice needs a driven Ooga).
  const mayPossess = cave => BL.net.mayDrive(cave.traits.name, BL.contributors.stateFor(cave.contributor) === "working");
  const mayPick = c => !BL.net.mayDrive(c.name, BL.contributors.stateFor(c) === "working");
  const accountChanged = () => {
    if (!avatar) return;
    if (session?.live?.account && session.live.account !== String(BL.net.state.me?.id)) session.live.disconnect(session.live.kind === "den" ? "You signed out, so you left the live tables. Your seat and bananas wait for you." : "Account changed. Reload and sign in to the original account to recover this game.");
    const released = BL.net.state.released;
    const denied = mayPossess(avatar) || (released && released.name === avatar.traits.name ? "That Ooga is no longer yours to drive" : null);
    BL.net.state.released = null;
    if (!denied || people.player !== avatar) return;
    const was = avatar.traits.name;
    if (repick()) hud.toast(`${was} is taken, so you’re driving ${avatar.traits.name} here`);
    else { pilot.release(true); hud.toast(denied); }
  };
  // The Ooga this page drives in here was refused (picked before the island room said who drives what, or taken back
  // by its arriving owner): drive a free one instead, in the same spot, so the player keeps voice and a look at the table.
  const repick = () => {
    const next = BL.contributors.activeRoster.find(c => c.name !== avatar.traits.name && mayPick(c));
    if (!next) return false;
    const old = avatar, x = old.root.position.x, z = old.root.position.z, yaw = old.root.rotation.y;
    pilot.release(true);
    mirror.body.untrack(old.root);
    remotes.dispose(); people.dispose();
    shared.playerName = next.name;
    people = shared.crew = BL.crew.create(shared); pilot.bind(shared); avatar = people.cavemen.get(next.name);
    avatar.root.position.x = x; avatar.root.position.y = avatar.baseY; avatar.root.position.z = z; avatar.root.rotation.y = yaw;
    pilot.possess(avatar); avatarHidden = false;
    remotes = BL.remotePlayers.create({ root, crew: people, visible: showWalker });
    mirror.body.track(avatar.root, avatar.traits.height * 2, Math.max(avatar.headOpen.verts.length, avatar.headClosed.verts.length));
    if (seatTable >= 0 && !pendingStand) sit(session.tables[seatTable].snapshot().seats.findIndex(s => s?.id === HERO));
    scene.debug.crew = people; scene.debug.cavemen = people.cavemen;
    return true;
  };
  const showWalker = rec => BL.remotePlayers.sameZone(rec) && !seatedIds.has(rec.id);
  // Banana chips by size: a stack, a round's bet and the pot each show a hand of one to six bananas.
  const STACK_STEPS = [400, 1000, 2000, 4000, 8000], BET_STEPS = [25, 80, 200, 500, 1000], POT_STEPS = [40, 120, 300, 800, 2000];
  const handFor = (n, steps) => { let k = 1; for (let i = 0; i < steps.length; i++) if (n >= steps[i]) k++; return PM.bunch(k); };
  // Seat view: the camera at the visitor's chair (over the dealer for a spectator), the 3D table in sight with only the
  // table's head and the dock over it. The choice is kept in this browser, a convenience a blocked storage only resets.
  const VIEW_KEY = "ooga-poker-view";
  let seatView = false, viewOn = false, viewGlide = 1, avatarHidden = false;
  const viewFrom = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 }, viewTo = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };
  const loadView = () => {
    try { const v = localStorage.getItem(VIEW_KEY); if (v === "seat" || v === "table") return v === "seat"; } catch { /* the default below */ }
    return !matchMedia("(pointer: coarse)").matches;
  };
  const saveView = () => { try { localStorage.setItem(VIEW_KEY, seatView ? "seat" : "table"); } catch { /* this visit only */ } };
  const readPose = out => {
    const p = camera.position, t = camera.target, dx = t.x - p.x, dy = t.y - p.y, dz = t.z - p.z;
    out.x = p.x; out.y = p.y; out.z = p.z; out.yaw = Math.atan2(dx, dz); out.pitch = Math.atan2(dy, Math.hypot(dx, dz));
  };
  // As the Lightning Factory's kiosk glides its view: eased position, heading and pitch.
  const putPose = (a, b, k) => {
    const e = k * k * (3 - 2 * k), yaw = a.yaw + Math.atan2(Math.sin(b.yaw - a.yaw), Math.cos(b.yaw - a.yaw)) * e;
    const pitch = a.pitch + (b.pitch - a.pitch) * e, cp = Math.cos(pitch), p = camera.position, t = camera.target;
    p.x = a.x + (b.x - a.x) * e; p.y = a.y + (b.y - a.y) * e; p.z = a.z + (b.z - a.z) * e;
    t.x = p.x + Math.sin(yaw) * cp; t.y = p.y + Math.sin(pitch); t.z = p.z + Math.cos(yaw) * cp;
  };
  // Behind and above the visitor's chair, aimed a little short of the table's middle so the whole felt sits between
  // the table's head and the dock; a spectator's view stands over the dealer's shoulder.
  const EYE = { back: 2.2, up: 4.2, aim: 0.6, aimY: 1.5, dealerBack: 7.4, dealerUp: 5.4 };
  const seatPose = out => {
    const t = PM.TABLES[selected], own = seatTable === selected && !pendingStand ? mySeat : -1;
    let ex = t.x, ey = EYE.dealerUp, ez = t.z - EYE.dealerBack, tx = t.x, ty = EYE.aimY, tz = t.z - EYE.aim;
    if (own >= 0) {
      const s = PM.SEATS[own], l = Math.hypot(s.x, s.z), ux = s.x / l, uz = s.z / l;
      ex = t.x + s.x + ux * EYE.back; ey = EYE.up; ez = t.z + s.z + uz * EYE.back; tx = t.x + ux * EYE.aim; ty = EYE.aimY; tz = t.z + uz * EYE.aim;
    }
    const dx = tx - ex, dy = ty - ey, dz = tz - ez;
    out.x = ex; out.y = ey; out.z = ez; out.yaw = Math.atan2(dx, dz); out.pitch = Math.atan2(dy, Math.hypot(dx, dz));
  };
  // Name plates over the chosen table's chairs in the 3D view: written when that table changes, drawn every frame.
  const plates = Array.from({ length: 9 }, () => ({ on: false, me: false, acting: false, faded: false, name: "", info: "" }));
  const CLOCK = Array.from({ length: 61 }, (_, i) => `${Math.floor(i / 60)}:${String(i % 60).padStart(2, "0")}`);
  const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
  const PLATE_NAME = "bold 12px ui-monospace, monospace", PLATE_INFO = "11px ui-monospace, monospace", PLATE_POT = "bold 13px ui-monospace, monospace";
  let mySeat = -1, potText = "";
  const platesFor = s => {
    const live = s.phase !== "waiting" && s.phase !== "showdown";
    for (let j = 0; j < plates.length; j++) {
      const p = s.seats[j], pl = plates[j];
      pl.on = !!p;
      if (!p) continue;
      const tags = (s.hand && j === s.dealer ? " · D" : "") + (live && j === s.smallBlind ? " · SB" : "") + (live && j === s.bigBlind ? " · BB" : "");
      const state = p.folded ? "Folded" : p.inHand && !p.stack ? "All in" : p.out && !p.inHand ? "Sitting out" : live && p.inHand ? p.lastAction : "";
      pl.me = p.id === HERO; pl.acting = live && j === s.turn; pl.faded = p.folded || p.out && !p.inHand;
      pl.name = p.name; pl.info = number.format(p.stack) + tags + (state ? " · " + state : "");
    }
    potText = live && s.pot ? `Pot ${number.format(s.pot)}` : "";
  };
  const drawPlates = (ctx, project) => {
    const s = snapshots[selected];
    if (!room || !s || panel.focused && !viewOn) return;
    const t = PM.TABLES[selected], now = session.live && session.live.now ? session.live.now() : 0;
    ctx.save();
    ctx.textAlign = "center"; ctx.textBaseline = "alphabetic"; ctx.lineJoin = "round"; ctx.lineWidth = 3; ctx.strokeStyle = "rgba(20, 14, 8, 0.85)";
    for (let j = 0; j < plates.length; j++) {
      const pl = plates[j];
      if (!pl.on || pl.me && viewOn) continue;
      const seat = PM.SEATS[j], pos = project(t.x + seat.x * 0.97, 2.4, t.z + seat.z * 0.97);
      if (!pos) continue;
      const x = Math.round(pos.x), y = Math.round(pos.y);
      ctx.globalAlpha = pl.faded ? 0.6 : 1;
      ctx.font = PLATE_NAME; ctx.fillStyle = pl.acting ? "#ffd27a" : "#f3efe4";
      ctx.strokeText(pl.name, x, y); ctx.fillText(pl.name, x, y);
      ctx.font = PLATE_INFO; ctx.fillStyle = "#e9dcc0";
      ctx.strokeText(pl.info, x, y + 14); ctx.fillText(pl.info, x, y + 14);
      if (pl.acting && s.deadline && now) {
        const left = Math.max(0, Math.min(60, Math.ceil((s.deadline - now) / 1000)));
        ctx.font = PLATE_NAME; ctx.fillStyle = left <= 10 ? "#ff9b6a" : "#ffd27a";
        ctx.strokeText(CLOCK[left], x, y + 29); ctx.fillText(CLOCK[left], x, y + 29);
      }
    }
    if (potText) {
      const pos = project(t.x, 1.95, t.z - 1.1);
      if (pos) { ctx.globalAlpha = 1; ctx.font = PLATE_POT; ctx.fillStyle = "#ffd27a"; ctx.strokeText(potText, Math.round(pos.x), Math.round(pos.y)); ctx.fillText(potText, Math.round(pos.x), Math.round(pos.y)); }
    }
    ctx.restore();
  };
  const nextHand = new Float64Array(10), completed = new Int32Array(10);
  let theme = Themes.get("gatsby");
  const clamp = BL.math.clamp;
  const clampTarget = p => { p.x = clamp(p.x, -22, 22); p.z = clamp(p.z, -34, 34); p.y = clamp(p.y, 0.5, 7); };
  const clampCamera = p => { p.x = clamp(p.x, -23.5, 23.5); p.z = clamp(p.z, -35.7, 35.7); p.y = clamp(p.y, 0.8, 8.5); };
  const activeTable = () => session.tables[selected];
  const setTheme = id => {
    theme = Themes.get(id); room.setTheme(theme.id); panel.setTheme(theme.id);
    session.theme = theme.id;
    renderOpts.sky = theme.sky; renderOpts.ground = theme.ground; renderOpts.direct = theme.direct; renderOpts.ambientFloor = theme.ambient;
  };
  const leaveFloor = () => { if (leaving) return; if (session.live && seatTable >= 0) { panel.notice(session.live.kind === "den" ? "Leave your seat before you go: it’s under Table options in the table view. Your bananas come with you." : "Stand between hands before leaving. You can walk the floor while connected."); return; } if (go("bifrost", null, true)) leaving = true; };
  const setView = focused => {
    panel.setFocused(focused); pilot.controls.reset();
    BL.net.setPokerVoice(focused ? selected : null);
    pilot.setActive(!focused);
  };
  const modeAction = name => !leaving && !panel.focused && (seatTable < 0 || pendingStand) && pilot.modeAction(name);
  const placeInAisle = () => {
    if (!avatar) return;
    const p = PM.TABLES[selected];
    avatar.root.position.x = 0; avatar.root.position.y = avatar.baseY; avatar.root.position.z = p.z;
    avatar.root.rotation.y = Math.PI; avatar.root.visible = true;
    pilot.setActive(true); pilot.controls.reset();
    document.body.removeAttribute("data-poker-seated");
  };
  const sit = index => {
    const p = PM.TABLES[selected], s = PM.SEATS[index];
    avatar.root.position.x = p.x + s.x; avatar.root.position.z = p.z + s.z;
    avatar.root.position.y = avatar.baseY + 0.45; avatar.root.rotation.y = s.yaw;
    pilot.controls.reset(); pilot.setActive(false);
    document.body.dataset.pokerSeated = "true";
  };
  // Who sits in a chair. A practice bot, or an anonymous player of the encrypted-deck service, gets a look hashed from
  // its seat, never a real contributor's. At the dealer's tables a player is the Ooga they drive, as the island room
  // shows it (`net.remotes`), or a look hashed from their name until the room has them.
  const seatLook = (p, j) => {
    if (p.bot || session.live?.kind !== "den") return "Banana Bot " + j;
    const rec = BL.net.remotes.get(Number(p.id));
    return rec && rec.body || p.name;
  };
  const seatActors = (i, s) => {
    const view = room.tables[i], kept = looks[i];
    for (let j = 0; j < PM.SEATS.length; j++) {
      const p = s.seats[j], slot = PM.SEATS[j];
      const visibleActor = !!p && (p.bot || !!session.live && p.id !== HERO);
      const look = visibleActor ? seatLook(p, j) : kept[j];
      if (view.actors[j] && kept[j] !== look) { S.removeChild(view.root, view.actors[j].root); view.actors[j] = null; }
      if (visibleActor && !view.actors[j]) {
        const actor = BL.models.caveman(BL.contributors.traitsFor(look));
        actor.root.position.x = slot.x; actor.root.position.z = slot.z; actor.root.position.y = 0.6;
        actor.root.rotation.y = slot.yaw; actor.root.scale.x = actor.root.scale.y = actor.root.scale.z = 0.82;
        for (const key of ["club", "gun", "snack", "jetpack", "jetFlame"]) if (actor.parts[key]) actor.parts[key].visible = false;
        if (actor.parts.legR) actor.parts.legR.rotation.x = -1.35;
        if (actor.parts.legL) actor.parts.legL.rotation.x = -1.35;
        view.actors[j] = actor; kept[j] = look; S.addChild(view.root, actor.root);
      }
      if (view.actors[j]) view.actors[j].root.visible = visibleActor;
    }
  };
  // Players seated at the dealer's tables, by the island room's id: their walking Ooga is hidden while it sits.
  const noteSeated = () => {
    seatedIds.clear();
    if (session.live?.kind !== "den") return;
    for (const s of snapshots) if (s) for (const p of s.seats) if (p && p.id !== HERO) seatedIds.add(Number(p.id));
  };
  const syncTable = i => {
    const t = session.tables[i], view = room.tables[i], s = t.snapshot(i === seatTable && !pendingStand ? HERO : null);
    snapshots[i] = s; view.version = t.version; view.pulse = 0.7;
    if (s.result && completed[i] !== s.hand) { completed[i] = s.hand; nextHand[i] = 5; }
    let bets = 0;
    for (let j = 0; j < PM.SEATS.length; j++) {
      const p = s.seats[j], cards = view.backs[j];
      // A card this page may see lies face up, upright from its owner's chair: the visitor's own two, and at a
      // showdown the hands still in. Every other card shows its back.
      cards.visible = !!p && p.inHand && !p.folded;
      if (cards.visible) for (let k = 0; k < 2; k++) {
        const c = p.cards[k], face = Number.isInteger(c), n = cards.children[k];
        n.geometry = PM.card(face ? c : null); n.rotation.y = face ? Math.PI : 0;
      }
      view.chips[j].visible = !!p && p.stack > 0;
      if (view.chips[j].visible) view.chips[j].geometry = handFor(p.stack, STACK_STEPS);
      view.bets[j].visible = !!p && p.roundBet > 0;
      if (view.bets[j].visible) { view.bets[j].geometry = handFor(p.roundBet, BET_STEPS); bets += p.roundBet; }
    }
    // The pot gathered from earlier streets sits by the board; this round's bets stay out in front of their chairs.
    const gathered = s.phase !== "waiting" && s.phase !== "showdown" ? s.pot - bets : 0;
    view.pot.visible = gathered > 0;
    if (view.pot.visible) view.pot.geometry = handFor(gathered, POT_STEPS);
    if (i === selected) { mySeat = s.seats.findIndex(p => p?.id === HERO); platesFor(s); }
    seatActors(i, s);
    for (let j = 0; j < 5; j++) { view.board[j].visible = j < s.board.length && Number.isInteger(s.board[j]); if (view.board[j].visible) view.board[j].geometry = PM.card(s.board[j]); }
    view.button.visible = s.dealer >= 0;
    if (s.dealer >= 0) { const p = PM.SEATS[s.dealer]; view.button.position.x = p.x * 0.72; view.button.position.z = p.z * 0.65; view.button.position.y = 1.4; }
  };
  const updatePanel = () => {
    panel.setLive(session.live ? { ...(session.live.fairness || { phase: "connecting" }), kind: session.live.kind, wallet: session.live.wallet, connection: session.live.connection, busy: session.live.busy } : null);
    panel.update(selected, snapshots, seatTable >= 0 && (!pendingStand || session.live) ? HERO : null, session.live ? false : pendingStand, session.paused, session.autoDeal[selected]);
    shownCountdown = -1;
  };
  const refresh = (force = false) => {
    for (let i = 0; i < 10; i++) if (force || !snapshots[i] || room.tables[i].version !== session.tables[i].version) syncTable(i);
    noteSeated();
    updatePanel();
  };
  // A player's Ooga can reach the room after their seat reached the dealer's view: the chairs look again.
  const rosterChanged = () => {
    if (!room || session.live?.kind !== "den") return;
    for (let i = 0; i < 10; i++) if (snapshots[i]) seatActors(i, snapshots[i]);
  };
  const select = i => {
    if (!Number.isInteger(i) || i < 0 || i >= 10) return;
    if (seatTable >= 0 && i !== seatTable) { panel.notice("Stand from your current table before switching tables."); return; }
    if (session.live && i !== selected) { try { session.live.action("watch", i); } catch (e) { panel.notice(e.message); return; } }
    selected = i;
    if (snapshots[i]) { mySeat = snapshots[i].seats.findIndex(p => p?.id === HERO); platesFor(snapshots[i]); }
    if (seatTable >= 0 && !pendingStand) sit(session.tables[i].snapshot().seats.findIndex(s => s?.id === HERO));
    updatePanel(); setView(true);
  };
  // The page the Worker serves plays its dealer's tables (poker-net.js) under the GitHub sign-in; anywhere else the
  // live tables are the local encrypted-deck service's (poker-live.js).
  const connectLive = async (retry = false) => {
    if (connecting || session.live && !retry) return;
    if (!session.live && seatTable >= 0) throw new Error("Leave your practice seat before connecting");
    if (retry && session.live?.connection !== "failed") return;
    const site = BL.net.state.backend;
    if (site && !BL.net.state.me) { BL.net.login("/?scene=poker"); return; }
    if (retry) session.live.dispose();
    const visitId = visit;
    connecting = true;
    panel.setConnecting(true); updatePanel();
    let restoring = true;
    const seated = live => live.tables.findIndex(t => t.snapshot().seats.some(s => s?.id === live.identity));
    const live = (site ? BL.pokerNet : BL.pokerLive).create(() => {
      if (!panel || session?.live !== live) return;
      HERO = live.identity || "connecting";
      if (restoring && (live.connected || live.connection === "live")) { selected = live.table; restoring = false; if (panel.focused) BL.net.setPokerVoice(selected); }
      const previous = seatTable;
      seatTable = seated(live);
      if (seatTable >= 0 && previous < 0) { selected = seatTable; pendingStand = false; sit(live.tables[seatTable].snapshot().seats.findIndex(s => s?.id === HERO)); setView(true); }
      if (previous >= 0 && seatTable < 0) { pendingStand = false; placeInAisle(); }
      refresh(live.kind !== "den" || seatTable !== previous);
    }, message => { if (panel && session?.live === live) panel.notice(message); });
    pendingLive = live;
    try {
      await live.connect(selected);
      if (visitId !== visit || !panel || leaving) { live.dispose(); return; }
      if (seatTable >= 0) placeInAisle();
      session = { tables: live.tables, live, selected, paused: false, pendingStand: false, autoDeal: new Array(10).fill(false), theme: theme.id };
      HERO = live.identity || "connecting"; seatTable = -1; pendingStand = false; snapshots.fill(null);
      // The dealer keeps a seat through a reload: sit back down in it.
      seatTable = seated(live);
      if (seatTable >= 0) { selected = seatTable; live.action("watch", selected); sit(live.tables[seatTable].snapshot().seats.findIndex(s => s?.id === HERO)); }
      refresh(true);
      if (seatTable >= 0) setView(true);
      if (scene.debug) scene.debug.poker.session = session;
    } catch (error) { live.dispose(); if (visitId === visit) throw error; }
    finally { if (visitId === visit) { pendingLive = null; connecting = false; if (panel) { panel.setConnecting(false); updatePanel(); } } }
  };
  const addBots = (table, count) => {
    const s = table.snapshot(); let added = 0;
    for (let i = 0; i < BL.pokerRules.SEATS && added < count; i++) if (!s.seats[i]) { table.join(`bot-${selected}-${i}`, `Bot ${i + 1}`, true, i); added++; }
  };
  const action = (name, value, expectedVersion) => {
    let table = activeTable();
    try {
      // A cosmetic switch must not reset turn timing, raise input or hand state.
      if (name === "theme") { setTheme(value); Themes.save(theme.id); return; }
      if (name === "connect") { connectLive().catch(error => panel?.notice(error.message)); return; }
      if (name === "reconnect") { connectLive(true).catch(error => panel?.notice(error.message)); return; }
      if (name === "return") { select(seatTable >= 0 ? seatTable : selected); return; }
      if (name === "walk") { if (seatTable >= 0) placeInAisle(); setView(false); return; }
      if (name === "view") { seatView = !seatView; saveView(); panel.setView(seatView); return; }
      if (session.live) {
        if (name === "practice") {
          if (seatTable >= 0) throw new Error("Stand before returning to practice");
          session.live.dispose(); session = world.poker; HERO = "local-player"; pendingStand = false; selected = session.selected || 0;
          seatTable = session.tables.findIndex(t => t.snapshot().seats.some(s => s?.id === HERO));
          snapshots.fill(null); refresh(true); setView(false); if (scene.debug) scene.debug.poker.session = session; return;
        }
        if (name === "exit") { leaveFloor(); return; }
        // The dealer's tables: its own messages, the player named by the session.
        if (session.live.kind === "den") { session.live.action(name, value, expectedVersion); return; }
        if (name === "verify" || name === "export" || name === "verify-file") { session.live.action(name === "verify-file" ? "verify" : name, name === "verify-file" ? value : null); return; }
        const nickname = document.querySelector('[data-poker="nickname"]').value.trim() || "Ooga";
        session.live.action(name, name === "seat" ? { name: nickname, seat: value } : name === "join" ? { name: nickname } : value, expectedVersion); return;
      }
      if (name === "fold" || name === "call" || name === "raise") {
        if (session.paused || pendingStand) throw new Error("Resume your game before acting");
        if (expectedVersion !== undefined && expectedVersion !== table.version) { refresh(); throw new Error("The table changed. Please choose your action again."); }
      }
      if (name === "quick") {
        if (pendingStand) throw new Error("Your previous seat releases after the hand");
        if (seatTable < 0) {
          const available = t => !t.playing && t.snapshot().seats.some(s => !s);
          if (!available(table)) selected = session.tables.findIndex(available);
          if (selected < 0) { selected = 0; throw new Error("Every table is playing. Watch a table and join between hands."); }
          table = activeTable(); table.join(HERO, "You"); seatTable = selected;
        }
        session.paused = false;
        if (!table.playing) {
          const occupied = table.snapshot().seats.filter(Boolean).length;
          addBots(table, Math.max(0, 4 - occupied));
          for (const p of table.snapshot().seats) if (p?.bot && p.stack === 0) table.refill(p.id);
          table.refill(HERO); table.start();
        }
        sit(table.snapshot().seats.findIndex(p => p?.id === HERO)); setView(true);
      } else if (name === "join" || name === "seat") {
        if (seatTable >= 0) throw new Error("You already have a seat");
        const index = table.join(HERO, "You", false, name === "seat" ? value : -1);
        seatTable = selected; pendingStand = false; sit(index); setView(true);
      } else if (name === "bots") addBots(table, 3);
      else if (name === "start") table.start();
      else if (name === "refill") table.refill(HERO);
      else if (name === "stand") {
        if (seatTable >= 0 && !pendingStand) {
          if (table.playing) pendingStand = true;
          else { table.leave(HERO); seatTable = -1; }
          placeInAisle();
        }
        setView(false);
      } else if (name === "call") { const l = table.snapshot(HERO).legal; table.act(HERO, l?.check ? "check" : "call"); }
      else if (name === "fold" || name === "raise") table.act(HERO, name, value);
      else if (name === "auto") { session.autoDeal[selected] = !!value; if (value) nextHand[selected] = 5; }
      else if (name === "pause") session.paused = !session.paused;
      else if (name === "exit") { leaveFloor(); return; }
      timer = 0; refresh(name === "stand" || name === "walk");
    } catch (error) { panel.notice(error.message); }
  };
  const enter = ctx => {
    visit++;
    game = ctx.game; world = ctx.world; go = ctx.go; leaving = false; timer = 0; HERO = "local-player"; connecting = false;
    if (ctx.from === "bifrost") document.querySelector('[data-intro="poker"]').hidden = true;
    session = world.poker || (world.poker = { tables: Array.from({ length: 10 }, () => R.create()), selected: 0, pendingStand: false });
    if (!session.autoDeal) session.autoDeal = new Array(10).fill(true);
    theme = Themes.get(session.theme || Themes.load());
    session.paused = !!session.paused; nextHand.fill(5); completed.fill(0); shownCountdown = -1;
    selected = session.selected; pendingStand = session.pendingStand;
    seatTable = session.tables.findIndex(t => t.snapshot().seats.some(s => s?.id === HERO));
    if (seatTable >= 0) selected = seatTable;
    for (const l of looks) l.fill(null);
    seatedIds.clear();
    root = S.createNode(); camera = S.createCamera({ fov: 55, near: 0.2, far: 110 });
    hud = BL.hud.create({ roster: BL.contributors.activeRoster, catalog: BL.models.SWAG, tierColors: BL.models.TIER_COLORS, renderIcon: BL.hud.renderIcon, lootEnabled: ctx.lootEnabled });
    const hooks = {};
    input = BL.interact.create({ canvas: ctx.canvas, renderer: ctx.renderer, camera, hooks });
    pilot = BL.pilot.create({ renderer: ctx.renderer, canvas: ctx.canvas, camera, hud, presets, landing: "entrance", pitch: [-0.1, 1.3], dist: [3, 32],
      follow: { y: 0.9, min: 3, max: 7, pitch: [0.25, 0.8] }, fly: { speed: 6, perDist: 0.4, climb: 4, yMax: 8 },
      clampTarget, clampCamera, ceilingAt: () => 8.5, coarse: matchMedia("(pointer: coarse)").matches, mayPossess,
      close: { eyeHeight: 1.1, eyeRatio: 0.95, eyeForward: 0.16, pitch: [-1.35, 1.35], trailingDist: 4, orbitDist: 5, maxStep: 0.6, groundAt: () => 0 } });
    Object.assign(hooks, pilot.hooks, {
      onHover: (hit, p) => { if (hit?.owner.kind === "poker") hud.tooltip.show(`Table ${hit.owner.index + 1} · select to play or watch`, p.x, p.y); else hud.tooltip.hide(); },
      onTap: hit => { if (hit?.owner.kind === "poker") select(hit.owner.index); else if (hit?.owner.kind === "poker-exit") leaveFloor(); }
    });
    hud.onPreset(pilot.goPreset);
    hud.onAction((a, v) => { if (a === "leave") leaveFloor(); else if (a === "reset-view") pilot.resetCamera(); else if (a === "act") pilot.action(); else if (a.startsWith("mode-")) modeAction(a); });
    fx = BL.fx.create({ root, input, hooks, hud, game: ctx.game, world, renderer: ctx.renderer, camera, overlay: ctx.overlay, tickerAt: { x: 0, y: 5, z: -34 } });
    room = PM.build(theme.id); S.addChild(root, room.root);
    for (let i = 0; i < 10; i++) { input.add(room.tables[i].top, { kind: "poker", index: i }); targets.push(room.tables[i].top); }
    // The return mirror is set into the far wall, facing down the central aisle.
    const BM = BL.bifrostModels, face = BM.mirror(4);
    const frame = S.createNode({ position: { x: 0, y: 0, z: 35.2 }, rotation: { x: 0, y: Math.PI, z: 0 } });
    const stone = S.createNode({ geometry: BM.archStone() });
    const glass = S.createNode({ geometry: face.glass, position: { x: 0, y: 0, z: -BM.MIRROR_Z }, sightHidden: true, rippleTint: [0.3, 0.62, 1] });
    const label = BL.factoryModels.label("BIFROST", "", { height: 1.1 });
    const board = S.createNode({ position: { x: 0, y: BM.WINDOW_TOP + BM.FRAME.band + 1.15, z: BM.FRAME.front + 0.2 } });
    S.addChild(board, S.createNode({ geometry: BM.hanger(label.width, 1.35, BM.FRAME.front + 0.2) }), S.createNode({ geometry: label.back }), S.createNode({ geometry: label.face }));
    S.addChild(frame, stone, S.createNode({ geometry: BM.archGlow(), sightHidden: true }), S.createNode({ geometry: face.backing }), glass, board);
    S.addChild(root, frame);
    const opening = { minX: -BM.WINDOW.halfW, maxX: BM.WINDOW.halfW, floorY: 0, ceilingY: BM.WINDOW_TOP };
    const phase = BL.labPhase.create(frame, { x: 0, z: 35.2, ry: Math.PI, floorY: 0, room: { w: 2 * BM.WINDOW.halfW, h: BM.WINDOW_TOP, from: 0, to: 1 } }, opening, -BM.MIRROR_Z, [0.3, 0.62, 1]);
    phase.node.visible = false;
    glass.mirrorRipples = phase.ripples;
    mirror = { phase, glass, body: BL.mirrorBody.create(glass, new Map()) };
    input.add(stone, { kind: "poker-exit" }); targets.push(stone);
    // The Ooga to drive here: the one driven last, or asked for, else a signed-in contributor's own, else a free one.
    // A page arriving before the island room has said who drives what spreads that pick by the visitor's login, so
    // friends landing together rarely reach for the same Ooga; `repick` settles the rest.
    const requested = new URLSearchParams(location.search).get("character"), own = BL.net.ownCharacter();
    const free = BL.contributors.activeRoster.filter(mayPick), me = BL.net.state.me;
    const spread = me && free.length ? free[BL.math.fnv1a(me.login) % free.length] : null;
    const name = [world.pilot, requested, own && own.handle].find(n => BL.contributors.activeRoster.some(c => c.name === n && mayPick(c))) || (spread || free[0] || BL.contributors.activeRoster[0]).name;
    world.pilot = null;
    const playerWorld = { level: 0, weapons: new Map(), magazine: { owned: false, count: 0, ammo: 0, carrier: null } };
    shared = { root, input, hud, game: ctx.game, world: playerWorld, playerName: name, fx, viewYaw: 0, outsideActors: () => remotes ? remotes.actors() : NO_ACTORS, outsideActorHeight: BL.remotePlayers.BODY_HEIGHT, groundAt: () => 0, walkable: PM.walkable, useNear: () => select(selected) };
    people = shared.crew = BL.crew.create(shared); pilot.bind(shared); avatar = people.cavemen.get(name);
    avatar.root.position.x = 0; avatar.root.position.y = avatar.baseY; avatar.root.position.z = 29;
    avatar.root.rotation.y = Math.PI; pilot.possess(avatar);
    if (!pilot.loginViewRestored) pilot.navigate({ position: { x: 0, y: 0, z: 29 }, yaw: 0, pitch: 0.18, dist: 4 });
    unsubscribeAccount = BL.net.subscribe(accountChanged);
    unsubscribeRoster = BL.net.subscribeRoster(rosterChanged);
    // Other signed-in players on the floor, as the Oogas they drive; one seated at a live table is drawn in its chair.
    remotes = BL.remotePlayers.create({ root, crew: people, visible: showWalker });
    // The driven Ooga's own footsteps, heard by this page alone (footsteps.js).
    footsteps = BL.footsteps.create();
    mirror.body.track(avatar.root, avatar.traits.height * 2, Math.max(avatar.headOpen.verts.length, avatar.headClosed.verts.length));
    if (seatTable >= 0 && !pendingStand) sit(session.tables[seatTable].snapshot().seats.findIndex(s => s?.id === HERO));
    seatView = loadView(); viewOn = false; avatarHidden = false; mySeat = -1;
    panel = BL.pokerHud.create(action, select); panel.setView(seatView); setTheme(theme.id); refresh(); setView(seatTable >= 0 && !pendingStand);
    scene.root = root; scene.camera = camera; scene.input = input;
    scene.debug = { camera, pilot, hud, crew: people, cavemen: people.cavemen, controls: pilot.controls, poker: { session, room, action, select, snapshots, eye: EYE } };
    if (new URLSearchParams(location.search).get("pokerLive") === "1") action("connect");
  };
  const update = (dt, elapsed) => {
    pilot.readInput(dt);
    if (!panel.focused) people.update(dt, elapsed);
    pilot.update(dt);
    // The seat view takes the camera from the pilot while the table is open in it, gliding to the chair, and hides the
    // visitor's own seated Ooga, whose head would fill the view.
    const viewing = seatView && panel.focused;
    if (viewing !== viewOn) { viewOn = viewing; pilot.setExternalControl(viewing); if (viewing) { readPose(viewFrom); viewGlide = 0; } }
    if (viewOn) { seatPose(viewTo); viewGlide = Math.min(1, viewGlide + dt / 0.7); putPose(viewFrom, viewTo, viewGlide); }
    const hide = viewOn && seatTable === selected && !pendingStand;
    if (hide !== avatarHidden) { avatarHidden = hide; avatar.root.visible = !hide; }
    // The Ooga driven here goes to the room with where it stands and its health; other players here are shown.
    const drivenHere = people.player;
    BL.net.setBody(drivenHere ? drivenHere.traits.name : null);
    if (drivenHere) { const p = drivenHere.root.position; BL.net.sendPose(p.x, p.y - drivenHere.baseY, p.z, drivenHere.root.rotation.y); BL.net.setHealth(drivenHere.health.value, drivenHere.health.stunned); }
    remotes.update(dt);
    footsteps.update(drivenHere);
    mirror.phase.update(dt, elapsed); mirror.body.update(dt); mirror.body.time = mirror.phase.ripples.time;
    if (!leaving && pilot.player && (seatTable < 0 || pendingStand) && Math.abs(avatar.root.position.x) < BL.bifrostModels.WINDOW.halfW
      && avatar.root.position.z > PM.EXIT_Z) leaveFloor();
    // All ten table lights fit the lowest renderer tier; selected table goes first.
    const near = selected, lights = renderOpts.lights;
    for (let slot = 0; slot < 10; slot++) {
      const i = (near + slot) % 10, p = PM.TABLES[i], o = slot * 8;
      lights[o] = p.x; lights[o + 1] = 5.1; lights[o + 2] = p.z; lights[o + 3] = 14;
      lights[o + 4] = theme.tableLight[0]; lights[o + 5] = theme.tableLight[1]; lights[o + 6] = theme.tableLight[2];
      const v = room.tables[i]; v.pulse = Math.max(0, v.pulse - dt);
      v.agent.parts.armL.rotation.x = -0.5 - Math.sin(v.pulse / 0.7 * Math.PI) * 0.75;
      v.agent.parts.armR.rotation.x = -0.45;
      v.dealCard.visible = v.pulse > 0 && snapshots[i].phase !== "waiting";
      v.dealCard.position.z = -2.4 + (1 - v.pulse / 0.7) * 2.1;
    }
    for (let i = 0; i < 3; i++) {
      const o = (10 + i) * 8;
      lights[o] = 0; lights[o + 1] = 6.15; lights[o + 2] = (i - 1) * 24; lights[o + 3] = 13;
      lights[o + 4] = theme.roomLight[0]; lights[o + 5] = theme.roomLight[1]; lights[o + 6] = theme.roomLight[2];
    }
    if (!session.live && !session.paused) {
      timer += dt;
      for (let i = 0; i < 10; i++) if (session.autoDeal[i] && snapshots[i].result) nextHand[i] = Math.max(0, nextHand[i] - dt);
    }
    if (!session.live && timer >= 0.8) {
      timer %= 0.8;
      let changed = false;
      for (let i = 0; i < 10; i++) {
        const t = session.tables[i], s = snapshots[i], player = s.seats[s.turn];
        try {
          if (s.result && session.autoDeal[i] && nextHand[i] === 0) {
            const hero = s.seats.find(p => p?.id === HERO);
            if (hero && hero.stack === 0 && !pendingStand) session.autoDeal[i] = false;
            else {
              for (const p of s.seats) if (p?.bot && p.stack === 0) t.refill(p.id);
              if (t.snapshot().seats.filter(p => p && p.stack > 0).length >= 2) t.start();
              else session.autoDeal[i] = false;
            }
            changed = true;
          } else if (player?.bot) R.botAction(t, player.id);
          else if (i === seatTable && pendingStand && player?.id === HERO) { const l = t.snapshot(HERO).legal; if (l) t.act(HERO, l.check ? "check" : "fold"); }
        } catch (error) { session.autoDeal[i] = false; panel.notice(error.message); }
        if (i === seatTable && pendingStand && !t.playing) { t.leave(HERO); seatTable = -1; pendingStand = false; }
        if (t.version !== room.tables[i].version) { syncTable(i); changed = true; }
      }
      if (changed) updatePanel();
    }
    if (session.live?.kind === "den") {
      // The dealer's clocks: the turn's while a hand plays, the next deal's between hands.
      const s = snapshots[selected], at = s.deadline || s.dealAt, seconds = at ? Math.max(0, Math.ceil((at - session.live.now()) / 1000)) : -1;
      if (shownCountdown !== seconds) { shownCountdown = seconds; panel.countdown(seconds, false, s.deadline ? "turn" : "deal"); }
    } else {
      const seconds = session.live ? session.live.deadline === null ? -1 : Math.max(0, Math.ceil((session.live.deadline - BL.net.serverNow()) / 1000)) : Math.ceil(nextHand[selected]);
      if (shownCountdown !== seconds) { shownCountdown = seconds; panel.countdown(seconds, session.autoDeal[selected]); }
    }
    S.stepTweens(dt); fx.update(dt, elapsed);
  };
  const extra = (c, project) => { remotes.drawNames(c, project); drawPlates(c, project); };
  const onKey = e => { if ((e.key === "x" || e.key === "X") && !e.repeat && !e.metaKey && !e.ctrlKey && !e.altKey && modeAction("mode-toggle")) { e.preventDefault(); return true; } if (e.key === "Escape") { if (panel.focused) action("walk"); else if (seatTable >= 0 && !pendingStand) action("stand"); else if (!pilot.escape()) leaveFloor(); return true; } if (e.key === "0" && !e.repeat && !e.metaKey && !e.ctrlKey && !e.altKey) return pilot.resetCamera(); return false; };
  const leave = () => {
    visit++; pendingLive?.dispose(); pendingLive = null;
    session.selected = selected; session.pendingStand = pendingStand;
    if (session.live) session.live.dispose();
    BL.net.setPokerVoice(null);
    world.pilotDetached = !pilot.player;
    world.pilot = pilot.player ? pilot.player.traits.name : null;
    unsubscribeAccount(); unsubscribeAccount = null; unsubscribeRoster(); unsubscribeRoster = null; BL.net.setBody(null);
    seatedIds.clear();
    for (const t of room.tables) t.agent.dispose();
    remotes.dispose(); remotes = null; footsteps.dispose(); footsteps = null;
    people.dispose(); fx.dispose(); pilot.dispose();
    for (const n of targets) input.remove(n); targets.length = 0;
    mirror.phase.dispose(); mirror.body.dispose(); mirror.glass.mirrorRipples = null;
    panel.dispose(); hud.dispose();
    while (root.children.length) S.removeChild(root, root.children[root.children.length - 1]);
    const count = input.targetCount; input.dispose();
    document.body.removeAttribute("data-poker-seated");
    document.body.removeAttribute("data-poker-table-view");
    scene.input = scene.debug = null;
    hud = panel = pilot = fx = people = avatar = room = mirror = input = session = game = world = go = shared = null;
    viewOn = avatarHidden = false; mySeat = -1;
    snapshots.fill(null);
    return { targets: count };
  };
  const liveGeometry = set => { if (room) for (const t of room.tables) t.agent.liveGeometry(set); if (avatar) set.add(avatar.headOpen).add(avatar.headClosed); if (remotes) remotes.liveGeometry(set); };
  const stats = () => { let allNodes = 0, visibleNodes = 0; const walk = n => { allNodes++; for (const c of n.children) walk(c); }; walk(root); S.traverseVisible(root, () => visibleNodes++); return { allNodes, visibleNodes, targets: input.targetCount, tweens: S.tweenCount(), ...fx.stats(), ...(remotes ? remotes.stats() : {}) }; };
  // Voice zone: the Ember Den, a portal of its own off the Bifrost chamber.
  const scene = { id: "poker", voiceZone: "ember-den", micKey: true, enter, update, overlay: dt => fx.drawOverlay(dt, extra), onKey, leave, liveGeometry, stats, renderOpts,
    onDonation(donation, counted = null) {
      game.recordDonation(donation, counted && counted.exact);
      world.level = Math.min(BL.pile.MAX_BANANAS, world.level + (counted ? counted.exact : BL.game.bananasFor(donation.sats)));
    }, onLootCleared() {}, root: null, camera: null, input: null, debug: null,
    agent: null, agentView: null, agentControls: null, agentHandoff: null, get inMotion() { return !!room; } };
  BL.scenes.poker = scene;
})();
