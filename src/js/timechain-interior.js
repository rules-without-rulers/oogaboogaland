// One Timechain Sphere room, entered through the island's keypad (timechain-gate.js) and the scene shell
// (scene-timechain.js), which has already resolved the visit: the room's number and whether it is shared (signed in,
// `sphere-<id>`) or a solo copy (signed out: no presence, poses, voice or remote players at all). Only the room
// entered is built; it starts its own readers, sound and inputs on entry and drops every one of them on leaving.
//
// First person is the only view in here: the pilot is made with `close.only`, so scroll, pinch, the mode buttons, X,
// Escape and possession never leave the eye, and the Ooga walks empty-handed, as in the arcade, with no jetpack (a
// built-in pack is taken off for the visit; the island gives the visitor's pack back on the way out). A guided arrival
// starts where the island's crossing handed over, from the same eye, and walks in from the vestibule as the doors
// close behind; Space at the Exit button (or Leave, or Escape) walks back out through them into the vestibule, comes to
// rest where the island's view out of its passage (hung at the vestibule's end) fills the eye, and hands the same Ooga
// to the island without a fade, which walks it out onto the bridge. A room the island prepared after Enter (`prepare`)
// is adopted as it stands, built, painted and on the GPU.
//
// The screens are native charts (timechain-charts.js) of mempool.space's public block and mining data
// (timechain-blocks.js), repainted only when what they print changes, one picture a frame at most, plus the six
// Timechain Index holdings readings at the desk's terminal. Sani sits in his recliner in every room with his beer.
(() => {
  "use strict";
  const BL = window.BL;
  const { math, models, contributors, hud: hudMod, interact: interactMod, pilot: pilotMod, fx: fxMod } = BL;
  const { clamp } = math;
  const { createNode, addChild, removeChild, createCamera, stepTweens, tweenCount, traverseVisible } = BL.scene;
  const ROOMS = BL.timechainRooms, RM = BL.timechainRoomModels, CH = BL.timechainCharts, DOOR = ROOMS.DOOR;
  const COARSE = window.matchMedia("(pointer: coarse)").matches;
  const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)");
  // The doors take DOOR_TIME to slide; a guided walk goes at WALK_SPEED of a walk (the island's doorway's own, so a
  // crossing keeps its pace through the hand over) and gives up after GUIDE_LIMIT.
  // The way out stands still EXIT_HOLD at the handover point before the island takes over.
  const DOOR_TIME = 0.7, WALK_SPEED = 0.6, GUIDE_LIMIT = 7, TURN_RATE = 6, EXIT_HOLD = 0.12;
  // What the HUD's jetpack button shows in here: no pack at all.
  const NO_JETPACK = { owned: false, equipped: false, fuel: 1, blocked: false };
  const RENDER_OPTS = {
    clear: [0.018, 0.016, 0.02], sky: [0.5, 0.46, 0.42], ground: [0.24, 0.2, 0.17], direct: [0.52, 0.46, 0.4], directStrength: 0.2,
    ambientFloor: 0.4, sun: { x: 0.2, y: 0.95, z: 0.25 }, shadowCenter: { x: 0, y: 2, z: 0 }, shadowExtent: 14,
    lights: new Float32Array(BL.glRenderer.POINT_LIGHT_CAPACITY * 8), lightCount: 0, bloomStrength: 0.65
  };
  // The room's hum: a low drone and a soft fan hiss, pitched a little apart in each room, honouring the page-wide
  // mute and the tab's visibility; a context only after a gesture, closed on leaving.
  const STORAGE_KEY = "oogaboogaland.audio";
  const ambience = (room) => {
    let context = null, bus = null, sources = [], nodes = [], connected = false, disposed = false, muted = false;
    try { muted = localStorage.getItem(STORAGE_KEY) === "off"; } catch { muted = false; }
    const gate = () => {
      if (!bus) return;
      const on = !muted && !document.hidden && !disposed;
      if (on && !connected) { bus.connect(context.destination); connected = true; }
      if (!on && connected) { bus.disconnect(); connected = false; }
    };
    const wake = () => {
      if (context || disposed || muted || typeof AudioContext === "undefined" || navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
      context = new AudioContext();
      bus = context.createGain();
      bus.gain.value = 0.5;
      const pitch = 1 + (room.id - 5) * 0.012;
      for (const [hz, level] of [[49 * pitch, 0.03], [73.5 * pitch, 0.016]]) {
        const tone = context.createOscillator(), gain = context.createGain();
        tone.type = "sine"; tone.frequency.value = hz; gain.gain.value = level;
        tone.connect(gain); gain.connect(bus); tone.start();
        sources.push(tone); nodes.push(gain);
      }
      const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate), data = buffer.getChannelData(0);
      let seed = 4111 + room.id * 97;
      for (let i = 0; i < data.length; i++) { seed = (Math.imul(seed, 1103515245) + 12345) | 0; data[i] = (seed >>> 0) / 2147483648 - 1; }
      const noise = context.createBufferSource(), filter = context.createBiquadFilter(), gain = context.createGain();
      noise.buffer = buffer; noise.loop = true;
      filter.type = "lowpass"; filter.frequency.value = 520 * pitch;
      gain.gain.value = 0.012;
      noise.connect(filter); filter.connect(gain); gain.connect(bus); noise.start();
      sources.push(noise); nodes.push(filter, gain);
      gate();
    };
    const gesture = () => { wake(); if (context && context.state === "suspended") context.resume().catch(() => {}); };
    document.addEventListener("pointerdown", gesture);
    document.addEventListener("keydown", gesture);
    document.addEventListener("visibilitychange", gate);
    wake();
    return {
      get stats() { return { contexts: context ? 1 : 0, sources: sources.length, connected }; },
      dispose() {
        disposed = true;
        gate();
        document.removeEventListener("pointerdown", gesture);
        document.removeEventListener("keydown", gesture);
        document.removeEventListener("visibilitychange", gate);
        for (const source of sources) { source.stop(); source.disconnect(); }
        for (const node of [...nodes, bus]) if (node) node.disconnect();
        sources = []; nodes = [];
        if (context) context.close().catch(() => {});
        context = bus = null;
      }
    };
  };

  // A picture slot: a canvas the painters draw, and the node that shows it once its image has decoded. A slot is
  // repainted only when its `key` (what it prints) changes; the old picture's GPU record goes when the new one hangs.
  const slot = (node, w, h, pw, ph, painted = null) => ({ node, canvas: painted ? painted.canvas : CH.canvas(pw, ph), w, h, key: painted ? painted.key : "", live: true, loading: 0 });
  const hang = (renderer, s) => {
    const image = new Image(), stamp = ++s.loading;
    image.onload = () => {
      if (!s.live || stamp !== s.loading) return;
      const old = s.node.geometry;
      s.node.geometry = RM.picture(image, s.canvas.width, s.canvas.height, s.w, s.h);
      if (old) renderer.releaseGeometry(old);
    };
    image.src = s.canvas.toDataURL("image/png");
  };
  // A ray against a slot's own rectangle, for picking a screen exactly rather than by its bounding sphere.
  const INVERSE = math.mat4.create();
  const rectPick = (node, w, h) => (ray) => {
    math.mat4.invert(INVERSE, node.world);
    const m = INVERSE;
    const ox = m[0] * ray.ox + m[4] * ray.oy + m[8] * ray.oz + m[12], oy = m[1] * ray.ox + m[5] * ray.oy + m[9] * ray.oz + m[13], oz = m[2] * ray.ox + m[6] * ray.oy + m[10] * ray.oz + m[14];
    const dx = m[0] * ray.dx + m[4] * ray.dy + m[8] * ray.dz, dy = m[1] * ray.dx + m[5] * ray.dy + m[9] * ray.dz, dz = m[2] * ray.dx + m[6] * ray.dy + m[10] * ray.dz;
    if (Math.abs(dz) < 1e-9) return Infinity;
    const t = -oz / dz, x = ox + dx * t, y = oy + dy * t;
    return t >= 0 && Math.abs(x) <= w / 2 && Math.abs(y) <= h / 2 ? t : Infinity;
  };

  // What a screen or a ribbon card would print now, as a key: a slot is repainted only when its key moves. A room
  // prepared at the island's doorway paints with the same keys, so the visit keeps what was painted there.
  const minute = () => Math.floor(Date.now() / 60000);
  const screenKey = (reader, i) => {
    let k = "";
    for (const name of CH.PANELS[i].sets) k += name === "history" ? `${reader.historyStatus()}:${reader.summary ? reader.summary.coverage + "/" + reader.summary.tip : ""}|` : `${reader.status(name)}:${reader.at(name)}|`;
    return k + minute();
  };
  const cardKey = (reader, i) => {
    if (i === 0) return `label|${reader.status("recent")}`;
    const blocks = reader.value("recent"), b = blocks && blocks[i - 1];
    return b ? `${b.id}|${b.pool}|${Math.floor((Date.now() / 1000 - b.time) / 60)}` : `none|${reader.status("recent")}`;
  };

  const TIPS = {
    exit: "Exit · press Space beside it to walk out",
    screen: "Timechain display · tap for a close-up",
    card: "Latest blocks · tap for the charts",
    terminal: "Holdings desk · tap for Timechain Index holdings",
    sani: "Sani · tap to spin his chair",
    beer: "500 ml beer · tap to chug",
    recliner: "Sani's recliner · tap to spin and spill the glass",
    door: "The way out · use the Exit button",
    table: "Meeting table · jump up on it",
    chair: COARSE ? "Chair · tap SIT beside it" : "Chair · Space beside it sits"
  };
  // How close to a chair an Ooga reaches to sit in it (past its own body and the chair's) and how squarely the view
  // must face it (the cosine of the angle off), so Space by the table between two chairs still jumps; how high it sits
  // (the crew's `sitPlayer`), and how far behind the chair's middle it stands up, room enough for the widest Ooga.
  const SIT_REACH = 0.45, SIT_FACING = Math.cos(0.7), SEAT_Y = 0.5, SEAT_BACK = 1.35, CHAIR_R = 0.48;

  // The visit. `shell` is the scene object the director knows (scene-timechain.js), `visit` what the shell resolved.
  const create = (shell, ctx, visit) => {
    const { renderer, game, world, go, canvas } = ctx;
    const room = ROOMS.get(visit.room), L = ROOMS.layout(room.scale), shared = visit.mode === "shared";
    const camera = createCamera({ fov: 58, near: 0.12, far: L.radius * 3 + 20 });
    const root = createNode();
    const hud = hudMod.create({ roster: contributors.activeRoster, catalog: models.SWAG, tierColors: models.TIER_COLORS, renderIcon: hudMod.renderIcon, lootEnabled: ctx.lootEnabled });
    const hooks = {};
    const input = interactMod.create({ canvas, renderer, camera, hooks });
    // A room the island's doorway prepared for this visit (`prepare`) is taken as it stands: built, painted and already
    // on the GPU, so arriving costs no build, no paint and no upload.
    const prepared = visit.prepared && visit.prepared.room.id === room.id ? visit.prepared : null;
    if (visit.prepared && !prepared) visit.prepared.dispose();
    visit.prepared = null;
    const built = prepared ? prepared.built : RM.build(room.scale);
    addChild(root, built.root);
    RENDER_OPTS.shadowExtent = L.radius * 1.2;
    let n = 0;
    for (const l of built.lights) { RENDER_OPTS.lights.set([l[0], l[1], l[2], l[3], l[4], l[5], l[6], 0], n * 8); n++; }
    RENDER_OPTS.lightCount = n;

    // Walking: inside the round wall, short of the closed doors and clear of the furniture, which the table is only
    // for feet below its top; the doorway and the vestibule open to the guided walk alone.
    let guided = false;
    const walkable = (ax, az, bx, bz, y, height, actor) => {
      const r = actor && actor.bodyRadius || 0.35, steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.2));
      for (let i = 1; i <= steps; i++) if (!ROOMS.clearAt(L, ax + (bx - ax) * i / steps, az + (bz - az) * i / steps, r, guided, y)) return false;
      return true;
    };
    // What a body stands on: the floor, or the table's top once its feet are up there, as far out as the table stands
    // in its way below, so stepping off the edge lands it clear of the table.
    const T = L.table, tableSolid = L.solids.find((o) => o.top !== undefined);
    const groundAt = (x, z, feet, _, actor) => feet >= T.top - 0.02 && Math.hypot(x - T.x, z - T.z) < tableSolid.r + (actor ? actor.bodyRadius : 0.35) ? T.top : 0;
    // Under the dome: the ceiling `margin` lower than it stands over (x, z), read that far further out too, so a
    // point keeps clear of the curve above and the cornice beside it. The vestibule's flat ceiling is the doorway's.
    const roof = (x, z, margin) => {
      if (z > L.doorZ) return DOOR.height - margin;
      const r = Math.hypot(x, z), k = r > 1e-6 ? (r + margin) / r : 1;
      return ROOMS.ceilingAt(L, x * k, z * k) - margin;
    };
    // A guided walk takes the view through the doorway into the vestibule; otherwise it stays inside the round wall.
    const corridor = (p) => guided && Math.abs(p.x) < DOOR.halfW - 0.2 && p.z > L.doorZ - 1;
    const clampTarget = (p) => {
      const r = Math.hypot(p.x, p.z), max = L.walkRadius - 0.2;
      if (r > max && !corridor(p)) { p.x *= max / r; p.z *= max / r; }
      if (!guided) p.z = Math.min(p.z, L.doorZ - 0.3);
      p.y = clamp(p.y, 0.4, roof(p.x, p.z, 0.5));
    };
    const clampCamera = (p) => {
      const r = Math.hypot(p.x, p.z), max = L.radius - 0.25;
      if (r > max && !corridor(p)) { p.x *= max / r; p.z *= max / r; }
      if (!guided || Math.abs(p.x) > DOOR.halfW - 0.2) p.z = Math.min(p.z, L.doorZ - 0.2);
      else p.z = Math.min(p.z, L.doorZ + DOOR.vestibule - 0.3);
      p.y = clamp(p.y, 0.3, roof(p.x, p.z, 0.3));
    };
    const view = { yaw: 0, pitch: 0.05, dist: 4, target: { x: L.arrival.x, y: 1.6, z: L.arrival.z } };
    const pilot = pilotMod.create({
      renderer, canvas, camera, hud, presets: { entrance: view }, landing: "entrance", pitch: [-0.2, 1.2], dist: [3, 8],
      follow: { y: 0.9, min: 3, max: 6, pitch: [0.2, 0.7] }, fly: { speed: 4, perDist: 0.4, climb: 2, yMax: L.wall - 1 },
      clampTarget, clampCamera, ceilingAt: (x, z) => roof(x, z, 0), coarse: COARSE, mayPossess: (cave) => BL.net.mayDrive(cave.traits.name),
      jetpackStatus: () => NO_JETPACK,
      close: { eyeHeight: 1.1, eyeRatio: 0.95, eyeForward: 0.16, pitch: [-1.35, 1.35], trailingDist: 4, orbitDist: 5, maxStep: 0.6, groundAt, only: true }
    });
    const fx = fxMod.create({ root, input, hooks, hud, game, world, renderer, camera, overlay: ctx.overlay, tickerAt: { x: 0, y: 4, z: 0 } });
    const targets = [];
    const target = (node, owner, radius = 0) => { input.add(node, owner, { radius }); targets.push(node); return owner; };

    // The screens, the ribbon and the terminal, each a picture slot.
    // The block and mining readings repaint a slot through its key (what it would print), never by callback.
    const reader = BL.timechainBlocks.create();
    const screens = built.screens.map((node, i) => slot(node, L.screens[i].w, L.screens[i].h, CH.PANEL_W, CH.PANEL_H, prepared && prepared.screens[i]));
    const cards = built.cards.map((node, i) => slot(node, L.ribbon[i].w, L.ribbon[i].h, CH.CARD_W, CH.CARD_H, prepared && prepared.cards[i]));
    const terminal = slot(built.terminal, RM.DESK_SCREEN.w, RM.DESK_SCREEN.h, CH.PANEL_W, CH.PANEL_H);
    const all = [...screens, ...cards, terminal];
    screens.forEach((s, i) => { const owner = target(s.node, { kind: "screen", index: i }); owner.pickRay = rectPick(s.node, s.w, s.h); });
    cards.forEach((s, i) => { const owner = target(s.node, { kind: "card", index: i }); owner.pickRay = rectPick(s.node, s.w, s.h); });
    target(built.desk, { kind: "terminal" }, 1.3);
    target(built.exitButton, { kind: "exit" }, 0.45);
    target(built.table, { kind: "table" }, T.r + 0.05);
    built.chairs.forEach((node, i) => target(node, { kind: "chair", index: i }, 0.6));
    // Each chair a seat for the visitor's Ooga, facing the table; standing up leaves it to the chair's back.
    const seats = L.chairs.map((c) => {
      const k = (Math.hypot(c.x, c.z) + SEAT_BACK) / Math.hypot(c.x, c.z);
      return { kind: "chair", x: c.x, y: SEAT_Y, z: c.z, floor: 0, ry: c.heading, sitter: null, walkAt: { x: c.x * k, z: c.z * k } };
    });
    for (const leaf of built.doors) target(leaf, { kind: "door" }, 1.6);
    // The holdings readings the old sphere's walls showed, one canvas each; the terminal shows the one chosen.
    const holdingsCanvases = BL.timechainData.TITLES.map(() => CH.canvas(CH.PANEL_W, CH.PANEL_H));
    let holdingsIndex = 0, holdingsVersion = 0, chartIndex = 0, chartVersion = 0;
    const holdingsKeys = holdingsCanvases.map(() => "");
    const holdings = BL.timechainData.create(() => { holdingsDirty = true; });
    let holdingsDirty = true;

    // Slots are looked at only after a reading, a new minute (the ages printed) or a new holdings page: `sweep` runs
    // until no key moved, so a quiet frame builds no key and paints nothing.
    let seenVersion = -1, seenMinute = -1, sweep = true;
    const keyOf = (s, i) => s === terminal ? `${holdingsIndex}|${holdingsKeys[holdingsIndex]}` : screens[i] === s ? screenKey(reader, i) : cardKey(reader, i);
    // At most one picture a frame: the first slot whose key moved.
    const paintNext = () => {
      const m = minute();
      if (reader.version !== seenVersion || m !== seenMinute || holdingsDirty) { seenVersion = reader.version; seenMinute = m; sweep = true; }
      if (!sweep) return;
      if (holdingsDirty) {
        holdingsDirty = false;
        holdings.boards.forEach((board, i) => {
          const k = `${board.status}|${board.asof}|${board.lines.join("|")}`;
          if (k === holdingsKeys[i]) return;
          holdingsKeys[i] = k;
          CH.holdings(holdingsCanvases[i].getContext("2d"), board);
          holdingsVersion++;
        });
      }
      const now = Date.now();
      for (let i = 0; i < screens.length; i++) {
        const s = screens[i], k = keyOf(s, i);
        if (k === s.key) continue;
        s.key = k;
        CH.PANELS[i].paint(s.canvas.getContext("2d"), reader, now);
        chartVersion++;
        hang(renderer, s);
        return;
      }
      for (let i = 0; i < cards.length; i++) {
        const s = cards[i], k = keyOf(s, i);
        if (k === s.key) continue;
        s.key = k;
        const ctx2d = s.canvas.getContext("2d"), blocks = reader.value("recent");
        if (i === 0) CH.ribbonLabel(ctx2d, reader.status("recent"));
        else CH.card(ctx2d, blocks && blocks[i - 1], now);
        hang(renderer, s);
        return;
      }
      const k = keyOf(terminal, -1);
      if (k !== terminal.key) {
        terminal.key = k;
        terminal.canvas.getContext("2d").drawImage(holdingsCanvases[holdingsIndex], 0, 0);
        hang(renderer, terminal);
        return;
      }
      sweep = false;
    };
    const chartBoard = {
      title: "Timechain Sphere", help: "Live block and mining charts, drawn here from mempool.space's public API. Arrow keys flip the screens.", wide: true,
      get canvas() { return screens[chartIndex].canvas; }, get count() { return screens.length; }, get index() { return chartIndex; },
      get caption() { return CH.PANELS[chartIndex].title; }, get note() { return CH.PANELS[chartIndex].note; }, get version() { return chartVersion; },
      go: (i) => { chartIndex = i; chartVersion++; }
    };
    const holdingsBoard = {
      title: "Holdings desk", help: "Timechain Index holdings and distributions. Arrow keys flip the readings.", wide: true,
      get canvas() { return holdingsCanvases[holdingsIndex]; }, get count() { return holdingsCanvases.length; }, get index() { return holdingsIndex; },
      get caption() { return BL.timechainData.TITLES[holdingsIndex]; },
      get note() { const b = holdings.boards[holdingsIndex]; return `${b.note ? b.note + "\n" : ""}Source: ${b.source}`; },
      get version() { return holdingsVersion; },
      go: (i) => { holdingsIndex = i; holdingsVersion++; sweep = true; }
    };

    // Sani in his recliner with his beer, in every room, unless the visitor drives him in.
    const lounge = built.lounge, beer = BL.timechainBeer.create(lounge);
    const seat = { x: lounge.spots.chair.x, z: lounge.spots.chair.z, angle: Math.PI, speed: 0, phase: 0, active: true };
    target(lounge.chair, { kind: "recliner" }, 1.2);
    target(beer.mug, { kind: "beer" }, 0.3);
    let sani = null;
    const saniActor = { x: 0, y: 0, z: 0, radius: 0.35, height: 1.8 };
    const NO_ACTORS = [], actors = [];

    // The visitor's Ooga: the one handed over, else the visit's, else `character=` on a page that opens here, else
    // their own (signed in) or the roster's first they may drive.
    const mayPick = (entry) => !BL.net.mayDrive(entry.name);
    const asked = ctx.from === null ? new URLSearchParams(location.search).get("character")?.trim().toLowerCase() : null;
    const own = BL.net.ownCharacter();
    const wanted = [visit.character, world.pilot, asked && contributors.roster.find((c) => c.name.toLowerCase() === asked)?.name, own && own.handle];
    let playerName = null;
    for (const name of wanted) {
      const entry = name && contributors.roster.find((c) => c.name === name);
      if (entry && mayPick(entry)) { playerName = entry.name; break; }
    }
    if (!playerName) playerName = contributors.activeRoster.find(mayPick)?.name || null;
    world.pilot = null;
    const playerWorld = { level: 0, weapons: new Map(), magazine: { owned: false, count: 0, ammo: 0, carrier: null } };
    let remotes = null, people = null, avatar = null;
    const outsideActors = () => {
      actors.length = 0;
      if (remotes) { const list = remotes.actors(); for (let i = 0; i < list.length; i++) actors.push(list[i]); }
      if (sani && sani.root.visible) actors.push(saniActor);
      return actors.length ? actors : NO_ACTORS;
    };
    // Space beside the Exit button walks out, beside a free chair and facing it (standing on the floor) sits in it;
    // anywhere else it jumps. Seated, Space or a step stands up (the crew's own).
    const nearExit = () => {
      if (!avatar) return false;
      const p = avatar.root.position, E = L.exitButton;
      return Math.hypot(p.x - E.x, p.z - E.z) < L.exitReach;
    };
    const nearChair = () => {
      if (!avatar || avatar.camp.seat || avatar.hop > 0 || avatar.root.position.y - avatar.baseY > 0.1) return null;
      const p = avatar.root.position, c = camera.position, t = camera.target, fx = t.x - c.x, fz = t.z - c.z, f = Math.hypot(fx, fz) || 1;
      let near = null, best = CHAIR_R + avatar.bodyRadius + SIT_REACH;
      for (const s of seats) {
        const dx = s.x - p.x, dz = s.z - p.z, d = Math.hypot(dx, dz);
        if (!s.sitter && d < best && (dx * fx + dz * fz) / (d * f) > SIT_FACING) { near = s; best = d; }
      }
      return near;
    };
    const useNear = () => {
      if (guide.stage) return false;
      if (nearExit()) { walkOut(); return true; }
      const chair = nearChair();
      return !!chair && people.sitPlayer(chair);
    };
    if (playerName) {
      const sharedCtx = { root, input, hud, game, world: playerWorld, playerName, fx, viewYaw: 0, outsideActors, outsideActorHeight: BL.remotePlayers.BODY_HEIGHT, groundAt, walkable, useNear, jetpackAllowed: () => false };
      people = sharedCtx.crew = BL.crew.create(sharedCtx);
      pilot.bind(sharedCtx);
      avatar = people.cavemen.get(playerName);
      // Empty-handed, as in the arcade: no rifle on the back, no aiming; and no jetpack, built in or not.
      avatar.weapon.secondaryOwned = false;
      people.selectWeapon(0, avatar);
      avatar.weapon.aiming = false;
      avatar.parts.gun.visible = false;
      if (avatar.jet) people.removeJetpack(avatar);
      avatar.root.position.y = avatar.baseY;
      pilot.possess(avatar);
      pilot.enterClose();
    }
    if (playerName !== "SaniExp") {
      sani = models.caveman(contributors.traitsFor("SaniExp"));
      sani.baseY = sani.root.position.y;
      for (const key of ["snack", "gun", "jetpack", "jetFlame"]) if (sani.parts[key]) sani.parts[key].visible = false;
      addChild(root, sani.root);
      for (const key of ["head", "torso", "legL", "legR", "armL", "armR"]) if (sani.parts[key]) target(sani.parts[key], { kind: "sani" });
    }
    // In the room, as the visit has it: a guided arrival from the vestibule, or (a reload, a link, a history step)
    // standing at the arrival facing the screens.
    const arrive = (at, yaw = 0, pitch = 0.04) => pilot.navigate({ position: { x: at.x, y: 0, z: at.z }, yaw, pitch, dist: 4 });
    const guide = { stage: visit.guided && avatar ? "arrive" : null, t: 0, hold: 0, quick: false };
    const doors = { open: guide.stage ? 1 : 0, want: guide.stage ? 1 : 0, until: 0 };
    const eyeForward = (cave, pitch) => 0.16 * cave.traits.height * Math.cos(pitch);
    // Guided, the doorway and vestibule are walkable for the arrival, before it is placed in them.
    if (guide.stage) guided = true;
    if (avatar) {
      const e = guide.stage && visit.entry;
      // Handed over mid-stride by the island: the same eye, heading and pitch it last drew, in the vestibule facing the
      // room through the open doors (`entry`, offset as the island's eye stood from its handover point), so the
      // crossing has no cut. A reload or a link lands at the old spots.
      if (e) arrive({ x: e.x + Math.sin(e.heading) * eyeForward(avatar, e.pitch), z: L.entry.z + e.dz + Math.cos(e.heading) * eyeForward(avatar, e.pitch) }, e.heading, -e.pitch);
      else arrive(guide.stage ? L.threshold : L.arrival);
    }
    // The island's view back out of its passage (taken there before this crossing), hung at the vestibule's far end so
    // the walk out sees it fill the view as it reaches the handover point; without one, the hand over is between two
    // dark corridors.
    const outView = world.sphereOutView;
    let exitEye = L.doorZ + 1;
    if (avatar && outView) {
      const eye = avatar.headOffset * 0.95 + avatar.viewLift, q = ROOMS.fill(outView.fov, outView.aspect, eye, 2 * DOOR.halfW, 0, DOOR.height, DOOR.vestibule - 0.63);
      const node = createNode({ geometry: RM.picture(outView.canvas, outView.canvas.width, outView.canvas.height, q.w, q.h), position: { x: 0, y: eye, z: L.veil }, rotation: { x: 0, y: Math.PI, z: 0 } });
      addChild(root, node);
      exitEye = L.veil - q.D;
    }
    if (guide.stage) pilot.setActive(false);
    // Presence: a shared room is its own zone, published once the Ooga stands in it, and a guided arrival opens the
    // doors for whoever is already here; a solo copy publishes nothing at all.
    if (shared) {
      BL.net.setBody(avatar ? avatar.traits.name : null);
      if (avatar) {
        const p = avatar.root.position;
        BL.net.sendPose(p.x, p.y - avatar.baseY, p.z, avatar.root.rotation.y);
      }
      BL.net.setZone(room.zone);
      if (guide.stage) BL.net.passDoor(room.zone, "in");
    } else { BL.net.setBody(null); BL.net.setZone("none"); }
    remotes = shared ? BL.remotePlayers.create({ root, crew: people, hide: (name, on) => { if (sani && name === "SaniExp") sani.root.visible = !on; } }) : null;
    const footsteps = BL.footsteps.create();
    const sound = ambience(room);
    // Another player crossing this room's own doorway opens its doors here too (net.js `subscribeDoor`).
    const unsubscribeDoor = shared ? BL.net.subscribeDoor((event) => {
      if (event.t !== "transit" || event.door !== room.zone) return;
      doors.until = Math.max(doors.until, performance.now() + Math.max(0, Math.min(8000, event.exp - BL.net.serverNow())));
    }) : null;
    let leaving = false;
    // Leaving: the same Ooga goes back out to the island's passage behind the sphere's doors.
    const exitNote = (signedOut) => ({ room: room.id, mode: signedOut ? "solo" : visit.mode, character: avatar ? avatar.traits.name : null, jetpack: visit.jetpack || null });
    // A walked-out exit hands over mid-stride without the fade, with where its eye stood from the handover point
    // (`pose`), so the island starts from the same view; any other way out (signed out, Leave far from the doors)
    // fades as before.
    const handOff = (signedOut = false, pose = null) => {
      if (leaving) return;
      world.sphereExit = { ...exitNote(signedOut), pose };
      world.pilot = avatar ? avatar.traits.name : null;
      world.pilotDetached = !avatar;
      BL.net.setBody(null);
      BL.net.setZone("none");
      leaving = go("hub", "timechain", !!pose);
      if (!leaving) world.sphereExit = null;
    };
    const exitPose = () => {
      const p = camera.position, t = camera.target, dx = t.x - p.x, dy = t.y - p.y, dz = t.z - p.z;
      return { x: p.x, dz: p.z - exitEye, heading: Math.atan2(dx, dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) };
    };
    // Space at the button: turn to the doorway, the doors part, walk through into the vestibule, then the island.
    const walkOut = () => {
      if (guide.stage || leaving) return;
      if (!avatar || !nearExit() && Math.hypot(avatar.root.position.x - L.doorStep.x, avatar.root.position.z - L.doorStep.z) > 3) { handOff(); return; }
      guide.stage = "toDoor"; guide.t = 0;
      guided = true;
      pilot.setActive(false);
      hud.tooltip.hide();
      if (shared) BL.net.passDoor(room.zone, "out");
    };
    const accountChanged = () => {
      if (shared && !BL.net.state.me && !leaving) {
        hud.toast("Signed out · back outside");
        handOff(true);
      }
    };
    const unsubscribeAccount = BL.net.subscribe(accountChanged);
    // Weapon keys and right-click aiming do nothing in here (registered before the pilot's, in the capture phase).
    const WEAPON_KEYS = new Set(["1", "2", "r", "x", "f", "g"]);
    const armsKeys = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey || !WEAPON_KEYS.has(e.key.toLowerCase()) || e.target && e.target.closest && e.target.closest("input, textarea, [contenteditable]")) return;
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    const rightClick = (e) => {
      if (e.button !== 2) return;
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    window.addEventListener("keydown", armsKeys, true);
    canvas.addEventListener("pointerdown", rightClick, true);

    const tipFor = (hit) => {
      const o = hit.owner;
      return o.kind === "screen" ? `${CH.PANELS[o.index].title} · tap for a close-up` : TIPS[o.kind] || "";
    };
    Object.assign(hooks, {
      onHover: (hit, p) => { if (hit && !guide.stage) hud.tooltip.show(tipFor(hit), p.x, p.y); else hud.tooltip.hide(); },
      onHoverMove: (hit, p) => { if (!guide.stage) hud.tooltip.show(tipFor(hit), p.x, p.y); },
      onTap: (hit) => {
        if (!hit || guide.stage) return;
        const o = hit.owner;
        if (o.kind === "exit") { if (nearExit()) walkOut(); else hud.toast("Walk up to the Exit button, then press it"); }
        else if (o.kind === "screen" || o.kind === "card") { chartIndex = o.kind === "screen" ? o.index : 2; chartVersion++; hud.openBoard(chartBoard); }
        else if (o.kind === "terminal") { holdingsVersion++; hud.openBoard(holdingsBoard); }
        else if (o.kind === "sani" || o.kind === "recliner") beer.act("spin", seat);
        else if (o.kind === "beer") beer.act("chug", seat);
        else if (o.kind === "door") hud.toast(COARSE ? "Tap EXIT beside the doors to walk out" : "Press Space at the Exit button to walk out");
        else if (o.kind === "chair") {
          const s = seats[o.index], p = avatar && avatar.root.position;
          if (!p || s.sitter || nearChair() !== s || !people.sitPlayer(s)) hud.toast(COARSE ? "Walk up to a free chair, then tap SIT" : "Walk up to a free chair and press Space to sit");
        } else if (o.kind === "table") hud.toast(`${room.name} · ${room.scale}× · ${shared ? "shared with whoever chose it" : "a solo copy, just for you"}`);
      },
      ...pilot.hooks
    });
    hud.onAction((action) => {
      if (action === "leave") walkOut();
      else if (action === "reset-view") pilot.resetCamera();
      else if (action === "jetpack-toggle") hud.toast("No jetpacks in the Sphere");
      else if (action.startsWith("mode-")) pilot.modeAction(action);
    });
    const mode = document.getElementById("sphere-mode"), subtitle = document.getElementById("sphere-subtitle");
    if (subtitle) subtitle.textContent = `Timechain Sphere · ${room.name}`;
    // The chip under the title: the room and its size, or that this is a solo copy; checked once a second.
    let modeWait = 0;
    const showMode = () => {
      if (!mode) return;
      let others = 0;
      if (shared) for (const rec of BL.net.remotes.values()) if (rec.zone === room.zone && rec.body) others++;
      const text = shared ? `${room.name} · ${room.scale}×${others ? ` · ${others + 1} here` : ""}` : `${room.name} · Solo visit · not signed in`;
      if (mode.textContent !== text) mode.textContent = text;
    };
    showMode();
    hud.hint(guide.stage ? `Entering ${room.name}` : COARSE ? "Stick walks · drag to look · EXIT by the doors leaves" : "W A S D walk · mouse looks · Space at the Exit button leaves", 5000);

    // The guided walks, steered as a held stick would steer them; the view turns with the walk, its pitch easing to
    // `pitch` (level on the way out, so the island's view, hung level, lines up).
    const steerTo = (x, z, dt, pitch = 0.04) => {
      const p = avatar.root.position, dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz), o = pilot.orbit, k = Math.min(1, dt * TURN_RATE);
      o.pitch = o.tPitch = o.pitch + (pitch - o.pitch) * k;
      if (d < 0.12) { people.steer(0, 0, 0, 0, 0); return true; }
      people.steer(dx / d, dz / d, 0, 1, 0, WALK_SPEED);
      const yaw = Math.atan2(-dx, -dz);
      o.yaw = o.tYaw = o.yaw + Math.atan2(Math.sin(yaw - o.yaw), Math.cos(yaw - o.yaw)) * k;
      return false;
    };
    // Square to the doors and level, the view with the body.
    const faceDoor = (dt) => {
      const o = pilot.orbit, k = Math.min(1, dt * TURN_RATE), r = avatar.root.rotation;
      o.yaw = o.tYaw = o.yaw + Math.atan2(Math.sin(Math.PI - o.yaw), Math.cos(Math.PI - o.yaw)) * k;
      o.pitch = o.tPitch = o.pitch * (1 - k);
      r.y += Math.atan2(Math.sin(-r.y), Math.cos(-r.y)) * k;
    };
    const finishGuide = () => {
      guide.stage = null;
      guided = false;
      people.steer(0, 0, 0, 0, 0);
      pilot.setActive(true);
      hud.hint(COARSE ? "Stick walks · drag to look · EXIT by the doors leaves" : "W A S D walk · mouse looks · Space at the Exit button leaves", 5000);
    };
    const runGuide = (dt) => {
      guide.t += dt;
      const p = avatar.root.position;
      if (guide.stage === "arrive") {
        if (p.z < L.doorZ - 0.9) doors.want = 0;
        if (steerTo(L.arrival.x, L.arrival.z, dt) || guide.t > GUIDE_LIMIT) {
          if (guide.t > GUIDE_LIMIT) arrive(L.arrival);
          doors.want = 0;
          finishGuide();
        }
      } else if (guide.stage === "toDoor") {
        if (steerTo(L.doorStep.x, L.doorStep.z, dt) || guide.t > GUIDE_LIMIT) { guide.stage = "open"; guide.t = 0; doors.want = 1; }
      } else if (guide.stage === "open") {
        faceDoor(dt);
        if (doors.open >= 0.85) { guide.stage = "through"; guide.t = 0; guide.hold = 0; }
      } else if (guide.stage === "through") {
        // Straight on through the doors into the vestibule, to where the island's view fills the eye, and still there a
        // moment: the island builds itself on a frame that does not move, then walks on from the same view.
        if (camera.position.z < exitEye && guide.t < GUIDE_LIMIT) steerTo(0, L.veil, dt, 0);
        else {
          people.steer(0, 0, 0, 0, 0);
          if ((guide.hold += dt) > EXIT_HOLD) { guide.stage = "out"; handOff(false, exitPose()); }
        }
      } else if (guide.stage === "out") people.steer(0, 0, 0, 0, 0);
    };
    // Sani at his laptop, in the pose the island used to give him there, his beer gear doing the rest.
    const poseSani = (dt) => {
      if (!sani) return;
      seat.phase = (seat.phase + dt * 7) % (Math.PI * 2);
      const decay = Math.exp(-1.15 * dt);
      seat.angle = (seat.angle + seat.speed * (1 - decay) / 1.15) % (Math.PI * 2);
      seat.speed *= decay;
      if (seat.speed < 0.005) seat.speed = 0;
      lounge.swivel.rotation.y = seat.angle;
      const h = sani.traits.height, parts = sani.parts;
      sani.root.position.x = seat.x; sani.root.position.z = seat.z; sani.root.position.y = 0.88 * h;
      sani.root.rotation.x = -0.23; sani.root.rotation.z = 0; sani.root.rotation.y = seat.angle;
      lounge.chair.scale.x = lounge.chair.scale.y = lounge.chair.scale.z = h;
      parts.legR.rotation.x = parts.legL.rotation.x = -1.05;
      parts.armR.rotation.x = -0.95 + Math.sin(seat.phase) * 0.035;
      parts.armL.rotation.x = -0.95 - Math.sin(seat.phase) * 0.035;
      parts.armR.rotation.z = -0.12; parts.armL.rotation.z = 0.12;
      parts.head.rotation.x = 0.28;
      if (parts.club) parts.club.visible = false;
      beer.update(sani, seat, dt);
      saniActor.x = sani.root.position.x; saniActor.z = sani.root.position.z;
    };

    const update = (dt, elapsed) => {
      pilot.readInput(dt);
      if (guide.stage && avatar) runGuide(dt);
      if (people) people.update(dt, elapsed);
      pilot.update(dt);
      // The doors: open for a guided walk or another player's crossing here, closed otherwise.
      const want = Math.max(doors.want, performance.now() < doors.until ? 1 : 0);
      const step = REDUCED.matches ? 1 : dt / DOOR_TIME;
      doors.open = doors.open < want ? Math.min(want, doors.open + step) : Math.max(want, doors.open - step);
      const slide = doors.open * doors.open * (3 - 2 * doors.open) * DOOR.halfW;
      built.doors[0].position.x = -DOOR.halfW / 2 - slide;
      built.doors[1].position.x = DOOR.halfW / 2 + slide;
      // A shared room hears and shows whoever drives an Ooga in it; a solo copy reports nothing.
      const driven = people && people.player;
      if (shared && !leaving) {
        BL.net.setBody(driven ? driven.traits.name : null);
        if (driven) {
          const p = driven.root.position;
          BL.net.sendPose(p.x, p.y - driven.baseY, p.z, driven.root.rotation.y);
          BL.net.setHealth(driven.health.value, driven.health.stunned);
        }
      }
      if (remotes) remotes.update(dt);
      footsteps.update(driven);
      poseSani(dt);
      if (avatar && !guide.stage) {
        const near = avatar.camp.seat ? "stand" : nearExit() ? "exit" : nearChair() ? "sit" : null;
        if (near !== guide.near) {
          guide.near = near;
          if (near === "exit") { hud.setAct("EXIT"); hud.hint(COARSE ? "Tap EXIT to walk out" : "Space · Exit"); }
          else if (near === "sit") { hud.setAct("SIT"); hud.hint(COARSE ? "Tap SIT to take the chair" : "Space · Sit"); }
          else if (near === "stand") { hud.setAct("STAND UP!"); hud.hint(COARSE ? "Move or tap STAND UP! to get up" : "Move or press Space to stand up"); }
          else pilot.showAct();
        }
      }
      if ((modeWait -= dt) <= 0) { modeWait = 1; showMode(); }
      paintNext();
      stepTweens(dt);
      fx.update(dt, elapsed);
    };
    const drawExtra = (ctx2d, project) => { if (remotes) remotes.drawNames(ctx2d, project); };
    const overlay = (dt) => fx.drawOverlay(dt, drawExtra);
    const onKey = (e) => {
      if (e.key === "0" && !e.repeat && !e.metaKey && !e.ctrlKey && !e.altKey && !guide.stage) return pilot.resetCamera();
      if (e.key === "Escape") {
        if (!pilot.escape() && !guide.stage) walkOut();
        return true;
      }
      return false;
    };
    const onDonation = (donation, counted = null) => {
      game.recordDonation(donation, counted && counted.exact);
      world.level = Math.min(BL.pile.MAX_BANANAS, world.level + (counted ? counted.exact : BL.game.bananasFor(donation.sats)));
      hud.toast(`${donation.handle || "anon"} tipped ${BL.game.formatLarge(donation.sats)} sats · the island's pile grows`);
    };
    reader.start();
    holdings.start();

    shell.root = root;
    shell.camera = camera;
    shell.input = input;
    shell.debug = {
      hud, camera, controls: pilot.controls, pilot, crew: people, cavemen: people ? people.cavemen : null,
      timechain: {
        room, visit, layout: L, built, reader, holdings, guide, doors, beer, seat, seats,
        get avatar() { return avatar; }, get sani() { return sani; }, get remotes() { return remotes; }, get sound() { return sound.stats; },
        get slots() { return all.map((s) => ({ key: s.key, shown: !!s.node.geometry })); }, get exitEye() { return exitEye; },
        exit: walkOut, chartBoard, holdingsBoard
      }
    };

    const leave = () => {
      // Left by Back or Forward rather than the doors, the Ooga still goes out by the passage if the island is next.
      if (!leaving) {
        world.pilotDetached = !avatar;
        world.pilot = avatar ? avatar.traits.name : null;
        world.sphereExit = exitNote(!BL.net.state.me);
      }
      world.sphereKeep = null;
      reader.dispose();
      holdings.dispose();
      sound.dispose();
      if (unsubscribeDoor) unsubscribeDoor();
      unsubscribeAccount();
      window.removeEventListener("keydown", armsKeys, true);
      canvas.removeEventListener("pointerdown", rightClick, true);
      BL.net.setBody(null);
      for (const s of all) {
        s.live = false;
        if (s.node.geometry) renderer.releaseGeometry(s.node.geometry);
        s.node.geometry = null;
      }
      beer.dispose();
      if (remotes) remotes.dispose();
      footsteps.dispose();
      if (people) people.dispose();
      fx.dispose();
      pilot.dispose();
      for (const node of targets) input.remove(node);
      targets.length = 0;
      while (root.children.length) removeChild(root, root.children[root.children.length - 1]);
      const count = input.targetCount;
      input.dispose();
      hud.dispose();
      shell.input = shell.debug = null;
      return { targets: count };
    };
    // The island's own meshes stay on the GPU while the visit lasts (`world.sphereKeep`, set as it handed over), so
    // walking back out does not upload the whole island again in the frame it appears.
    const liveGeometry = (set) => {
      if (avatar) set.add(avatar.headOpen).add(avatar.headClosed);
      if (remotes) remotes.liveGeometry(set);
      if (world.sphereKeep) for (const geometry of world.sphereKeep) set.add(geometry);
    };
    const stats = () => {
      let visible = 0;
      traverseVisible(root, () => visible++);
      const count = (node) => 1 + node.children.reduce((sum, c) => sum + count(c), 0);
      return { visibleNodes: visible, allNodes: count(root), tweens: tweenCount(), targets: input.targetCount, ...fx.stats(), ...(remotes ? remotes.stats() : {}), requests: reader.pending, timers: reader.timers };
    };
    return { update, overlay, onKey, onDonation, leave, liveGeometry, stats, renderOpts: RENDER_OPTS, get inMotion() { return true; } };
  };

  // A room readied at the island's doorway once Enter commits to it, so that arriving costs no build, paint or upload:
  // built off the graph (one frame), its screens and ribbon painted from the page's cache a picture at a time, each
  // decode a pause so the island keeps its frames (`ready`), then seen once from its handover point (`capture`), which
  // uploads it, and kept on the GPU (`liveGeometry`) until the visit takes it (`create`) or it is let go (`dispose`).
  const prepare = (roomId, renderer) => {
    const room = ROOMS.get(roomId), L = ROOMS.layout(room.scale), built = RM.build(room.scale), reader = BL.timechainBlocks.create();
    const screens = [], cards = [], pictures = [];
    let live = true;
    const paint = async (node, list, w, h, pw, ph, key, draw) => {
      const canvas = CH.canvas(pw, ph);
      draw(canvas.getContext("2d"));
      const image = new Image();
      image.src = canvas.toDataURL("image/png");
      await image.decode();
      if (!live) return;
      node.geometry = RM.picture(image, pw, ph, w, h);
      pictures.push(node.geometry);
      list.push({ key, canvas });
    };
    const ready = (async () => {
      const now = Date.now(), blocks = reader.value("recent");
      for (let i = 0; i < built.screens.length && live; i++) await paint(built.screens[i], screens, L.screens[i].w, L.screens[i].h, CH.PANEL_W, CH.PANEL_H, screenKey(reader, i), (g) => CH.PANELS[i].paint(g, reader, now));
      for (let i = 0; i < built.cards.length && live; i++) await paint(built.cards[i], cards, L.ribbon[i].w, L.ribbon[i].h, CH.CARD_W, CH.CARD_H, cardKey(reader, i), (g) => i ? CH.card(g, blocks && blocks[i - 1], now) : CH.ribbonLabel(g, reader.status("recent")));
    })();
    const lights = { ...RENDER_OPTS, lights: new Float32Array(BL.glRenderer.POINT_LIGHT_CAPACITY * 8), lightCount: built.lights.length, shadowExtent: L.radius * 1.2 };
    built.lights.forEach((l, i) => lights.lights.set([l[0], l[1], l[2], l[3], l[4], l[5], l[6], 0], i * 8));
    const shot = createCamera({ fov: 50, near: 0.12, far: L.radius * 3 + 20 });
    return {
      room, built, screens, cards, ready,
      // The room from its handover point (`L.entry`), level and facing the screens through its open doors, the eye
      // `eye` metres up and the view `fov` high (radians), drawn into the page's canvas before that frame's own render
      // and copied out: the picture the island hangs at the end of its passage.
      capture: (canvas, eye, fov) => {
        if (!live || !renderer.ready || !canvas.width || !canvas.height) return null;
        built.doors[0].position.x = -DOOR.halfW * 1.5;
        built.doors[1].position.x = DOOR.halfW * 1.5;
        shot.fov = fov;
        shot.position.x = 0; shot.position.y = eye; shot.position.z = L.entry.z;
        shot.target.x = 0; shot.target.y = eye; shot.target.z = L.entry.z - 1;
        if (!renderer.render(built.root, shot, lights)) return null;
        const k = Math.min(1, 1280 / canvas.width), out = CH.canvas(Math.round(canvas.width * k), Math.round(canvas.height * k)), g = out.getContext("2d");
        g.imageSmoothingQuality = "high";
        g.drawImage(canvas, 0, 0, out.width, out.height);
        // Both renderers hang a picture once it reads as a loaded image; a canvas is one already.
        out.complete = true;
        out.naturalWidth = out.width;
        return out;
      },
      liveGeometry: (set) => {
        if (!live) return;
        for (const geometry of RM.geometries(room.scale)) set.add(geometry);
        for (const geometry of pictures) set.add(geometry);
      },
      dispose: () => {
        if (!live) return;
        live = false;
        for (const geometry of [...RM.geometries(room.scale), ...pictures]) renderer.releaseGeometry(geometry);
      }
    };
  };
  BL.timechainInterior = { create, prepare };
})();
