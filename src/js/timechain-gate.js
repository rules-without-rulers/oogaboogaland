// The Timechain Sphere's doorway on the island: the keypad, the doors and the crossing into a room and back, all of it
// seen from the Ooga's own eyes. The hub creates it with the sphere (`create`) and drives it every frame.
//
// Space beside the keypad (or a click on one of its buttons) engages it: the view glides into the Ooga's first person
// as the Ooga turns to face the keypad, and the physical buttons take the clicks and keys. 1–9 choose exactly one room
// (choosing another replaces it), Enter is off until one is chosen, Back or Escape lets go and glides the view back to
// the camera the player had. Enter commits: the visitor's account must already be resolved (signed in: a shared room;
// signed out: a solo copy); after an unanswered account look, the selected number retries and Enter explicitly
// continues solo.
//
// Committed, the keys lock and the Ooga turns, eyes and all, from the keypad to the seam of the doors while its room
// readies behind them, a slice a frame (timechain-interior.js `prepare`: the room's code, built and painted, then seen
// once from where the crossing hands over, a picture that hangs at the end of the passage filling exactly the view the
// eye will have there). Back cancels that and turns to the keypad again with the room still chosen. A room slower than
// usual sets the sphere's heartbeat going over the doors while the Ooga waits facing them. Only then does a shared
// crossing ask the island room for the doorway (net.js `askDoor`, docs/timechain-sphere/doorway-contract.md); a solo
// one asks nobody. The doors part (on every signed-in page in the sphere's zone too, from the room's `transit`), and
// from then on nothing cancels: the Ooga walks a smooth curve through the doorway onto the passage's axis, and where
// the hanging picture fills its view the room's scene takes over without a fade, from that same eye.
//
// Coming back, the room hands over in its vestibule where the island's view out of the passage (taken here before the
// crossing, doors shut) fills its eye; the Ooga appears there, in front of the curtain behind the shut doors, and walks
// on out as they part, asking for the doorway first when shared. Only after the doors close does the normal island
// view return, and its jetpack comes back as it was. The plug across the doorway (timechain-models.js) is lifted only
// for this page's own traveler, while it crosses.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const ROOMS = BL.timechainRooms, TM = BL.timechainModels, S = TM.SPOTS, P = TM.PASSAGE;
  const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)");
  // Seconds: the doors' slide, a preparation's limit, the room socket's grace before a shared crossing goes ahead
  // without a reservation, the longest any one walk may take, the glide into the eyes and back out, and how long a
  // settled Ooga waits on its room before the heartbeat shows it is working.
  const DOOR_TIME = 0.75, PREPARE_LIMIT = 15, CONNECT_GRACE = 6, WALK_LIMIT = 8, GLIDE = 0.45, SLOW = 1.2;
  const WALK_SPEED = 0.6, TURN_RATE = 6, HINT_GAP = 4, SETTLED = 0.05;
  // Where the room's picture hangs (just in front of the curtain), how far into the passage the crossing may hand
  // over (a step past the doors, out of sight of the bridge), and where the eye stands coming back out, in front of
  // the curtain behind the shut doors.
  const PICTURE_Z = P.curtain + 0.03, HAND_REACH = P.mouth - 1 - PICTURE_Z, OUT_Z = P.curtain + 0.55;
  const CURVE = 24;
  // The page's first sound wakes the browser's audio, tens of milliseconds on the main thread. Engaging the keypad is
  // a gesture and the view is still at that moment, so the pause is paid there rather than at the walk's first
  // footstep in the doorway.
  let audioAwake = false;
  const wakeAudio = () => {
    if (audioAwake || typeof AudioContext === "undefined" || navigator.userActivation && !navigator.userActivation.hasBeenActive) return false;
    audioAwake = true;
    new AudioContext().close().catch(() => {});
    return true;
  };

  const create = (h) => {
    const { site, place, pilot, crew, hud, camera, renderer, canvas, world, go } = h;
    const cos = Math.cos(place.ry), sin = Math.sin(place.ry);
    const worldX = (x, z) => place.x + x * cos + z * sin, worldZ = (x, z) => place.z - x * sin + z * cos;
    const localZ = (x, z) => (x - place.x) * sin + (z - place.z) * cos, localX = (x, z) => (x - place.x) * cos - (z - place.z) * sin;
    // idle, keypad, account, preparing, waiting, opening, crossing, gone, arriving, leaving.
    const g = {
      state: "idle", selection: 0, room: null, mode: null, prep: 0, stage: null, prepared: null, picture: null, t: 0, ask: 0,
      cycle: null, exp: 0, starting: false, dir: null, open: 0, want: 0, remoteUntil: 0, hintAt: -Infinity, jetpack: null, exit: null, failures: 0, login: null,
      // The view: null (the pilot's own), "eyes" (gliding into and held at the Ooga's eyes from engagement until the
      // crossing hands over, and coming back out) or "back" (gliding back to the pilot's, once free). `glide` runs 0
      // to 1 from the pose held in `from`; `pitch` is the eye's, easing toward `pitchTo`.
      lens: null, glide: 1, from: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 }, to: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 }, fromFov: 0,
      pitch: 0, pitchTo: 0, hidden: null, settledAt: 0, cued: 0, handZ: 0, outZ: OUT_Z, path: new Float64Array(CURVE * 2), along: 0, still: 0
    };
    const action = { kind: "sphere-keypad" };
    // A room chosen in advance (a signed-in arrival at its address, sent out here), lit when the keypad is next used.
    let preselect = ROOMS.parse(world.sphereKeypad) || 0;
    world.sphereKeypad = null;
    const at = (spot) => ({ x: worldX(spot.x, spot.z), z: worldZ(spot.x, spot.z) });
    // The walk back out ends far enough along the bridge that a camera behind the Ooga stands outside the doors.
    const WAIT = at(S.WAIT), PARK = at(S.PARK), SEAM = at({ x: 0, z: S.THRESHOLD }), OUTSIDE = at({ x: 0, z: S.WAIT.z + 3.8 });
    // A clear spot on the bridge directly in front of the keypad. The Ooga sidesteps here while keeping its eyes on
    // the panel, so every valid approach settles at the same readable distance and face-on angle.
    const KEYPAD_STAND = at({ x: S.KEYPAD.x, z: S.KEYPAD.z + 1.45 });
    const KEYPAD = { x: worldX(S.KEYPAD.x, S.KEYPAD.z), y: place.y + S.KEYPAD.y, z: worldZ(S.KEYPAD.x, S.KEYPAD.z) };
    // Facing the doors from the bridge, and out of them.
    const IN_HEADING = place.ry + Math.PI, OUT_HEADING = place.ry;
    const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

    const show = (status = "") => {
      if (status) hud.hint(status, 7000);
    };
    // The eye as the pilot's first person places it (pilot.js: the head's height, a little ahead of the face), so a
    // view held here and the pilot's own, here or in a room, are the same view.
    const eyeRise = (cave) => cave.headOffset * 0.95 + cave.viewLift;
    const eyeAhead = (cave, pitch) => 0.16 * cave.traits.height * Math.cos(pitch);
    const eyePose = (cave, out) => {
      const p = cave.root.position, heading = cave.root.rotation.y, ahead = eyeAhead(cave, g.pitch);
      out.x = p.x + Math.sin(heading) * ahead; out.z = p.z + Math.cos(heading) * ahead;
      out.y = p.y - cave.baseY + eyeRise(cave);
      out.yaw = heading; out.pitch = g.pitch;
    };
    const readPose = (out) => {
      const p = camera.position, t = camera.target, dx = t.x - p.x, dy = t.y - p.y, dz = t.z - p.z;
      out.x = p.x; out.y = p.y; out.z = p.z; out.yaw = Math.atan2(dx, dz); out.pitch = Math.atan2(dy, Math.hypot(dx, dz));
    };
    const putPose = (a, b, k) => {
      const e = k * k * (3 - 2 * k), yaw = a.yaw + wrap(b.yaw - a.yaw) * e;
      const pitch = a.pitch + (b.pitch - a.pitch) * e, cp = Math.cos(pitch), p = camera.position, t = camera.target;
      p.x = a.x + (b.x - a.x) * e; p.y = a.y + (b.y - a.y) * e; p.z = a.z + (b.z - a.z) * e;
      t.x = p.x + Math.sin(yaw) * cp; t.y = p.y + Math.sin(pitch); t.z = p.z + Math.cos(yaw) * cp;
      camera.up = null;
      return e;
    };
    const hideHead = (cave, on) => {
      if (on && !g.hidden) { g.hidden = { head: cave.parts.head, was: cave.parts.head.cameraHidden }; cave.parts.head.cameraHidden = true; }
      else if (!on && g.hidden) { g.hidden.head.cameraHidden = g.hidden.was; g.hidden = null; }
    };

    // Walks the Ooga as a held stick would, at a stroll.
    const steerTo = (x, z) => {
      const cave = crew.player, p = cave.root.position, dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz);
      if (d < 0.12) { crew.steer(0, 0, 0, 0, 0); return true; }
      crew.steer(dx / d, dz / d, 0, 1, 0, WALK_SPEED);
      return false;
    };
    // Turns the Ooga where it stands, the eyes with it; true once it faces `heading`.
    const turnTo = (heading, dt) => {
      const r = crew.player.root.rotation, off = wrap(heading - r.y);
      r.y += off * Math.min(1, dt * TURN_RATE);
      return Math.abs(off) < SETTLED;
    };
    const facing = (x, z) => { const p = crew.player.root.position; return Math.atan2(x - p.x, z - p.z); };
    const settleAtKeypad = (dt) => {
      const p = crew.player.root.position, dx = KEYPAD_STAND.x - p.x, dz = KEYPAD_STAND.z - p.z, d = Math.hypot(dx, dz);
      turnTo(facing(KEYPAD.x, KEYPAD.z), dt);
      if (d > 0.1) crew.steer(dx / d, dz / d, 1, 0, 1, WALK_SPEED);
      else crew.steer(0, 0, 0, 0, 0);
    };
    const hold = (on) => {
      pilot.setExternalControl(on);
      if (on) { crew.steer(0, 0, 0, 0, 0); crew.thrust(false); hud.el.act.hidden = true; }
      else { hud.el.act.hidden = !crew.player; pilot.showAct(); }
    };
    // Into the eyes from wherever the view is now, or back out to the pilot's.
    const lens = (name) => {
      readPose(g.from);
      g.fromFov = camera.fov;
      g.lens = name;
      g.glide = REDUCED.matches ? 1 : 0;
    };

    // ---------- the keypad ----------
    const nearKeypad = (x, y, z) => g.state === "idle" && !!crew.player && Math.hypot(x - KEYPAD.x, z - KEYPAD.z) < S.KEYPAD_REACH && Math.abs(y - KEYPAD.y) < 2;
    const keypadPitch = () => {
      const cave = crew.player, p = cave.root.position;
      return Math.atan2(KEYPAD.y - (p.y - cave.baseY + eyeRise(cave)), Math.max(0.3, Math.hypot(KEYPAD.x - p.x, KEYPAD.z - p.z) - 0.1));
    };
    const engage = () => {
      if (g.state !== "idle" || !crew.player) return false;
      g.state = "keypad";
      g.selection = preselect;
      preselect = 0;
      site.choose(g.selection);
      hold(true);
      if (document.pointerLockElement) document.exitPointerLock();
      const stall = wakeAudio();
      lens("eyes");
      // The audio's wake stalls the next frame or two; the glide starts after it, not across it.
      g.still = stall ? 2 : 0;
      g.pitch = g.from.pitch;
      g.pitchTo = keypadPitch();
      hud.tooltip.hide();
      show(g.selection ? `Room ${g.selection} selected · press Enter` : "Choose a room on the keypad · 1–9");
      return true;
    };
    // Back to walking, the view gliding back to the pilot's own camera.
    const disengage = () => {
      if (g.state !== "keypad" && g.state !== "account") return;
      g.state = "idle";
      site.choose(0);
      if (crew.player) hideHead(crew.player, false);
      lens("back");
      hold(false);
    };
    const choose = (digit) => {
      if (g.state !== "keypad" || !ROOMS.parse(digit)) return;
      g.selection = digit;
      site.choose(digit);
      show(`Room ${digit} selected · press Enter`);
    };
    // Enter: the room, the account's answer, then the turn to the doors while the room readies.
    const commit = (solo = false) => {
      const room = ROOMS.get(g.selection);
      if (!room || g.state !== "keypad" && g.state !== "account") return;
      const net = BL.net.state;
      if (!solo && !net.resolved) {
        g.state = "account";
        show("Account unavailable · selected number retries · Enter continues solo · Back changes room");
        return;
      }
      g.room = room;
      g.mode = !solo && net.me ? "shared" : "solo";
      g.login = g.mode === "shared" ? net.me.login : null;
      const cave = crew.player;
      g.jetpack = { equipped: !!cave.jet, fuel: cave.jetFuel };
      g.state = "preparing";
      g.t = 0;
      g.settledAt = 0;
      g.pitchTo = 0;
      show(`Preparing Room ${room.id}… · Back cancels`);
      prepare();
    };
    const retryAccount = () => {
      if (g.state !== "account") return;
      show("Looking up your account…");
      BL.net.recheck().then(() => {
        if (g.state !== "account") return;
        if (BL.net.state.resolved) { g.state = "keypad"; show(`Press Enter to go to Room ${g.selection}`); }
        else show("Still unavailable · selected number retries · Enter continues solo · Back changes room");
      });
    };

    // ---------- the room, readied behind the doors ----------
    // The room's code (deferred on a hosted page) and the room itself, built and painted over frames by its module;
    // then, a step a frame, its picture from the handover point, a frame for that picture to reach the GPU, and the
    // island's view out of the passage for the way back. A cancel or a newer preparation makes an older one's answer
    // moot. Nothing of the room loads before Enter.
    const prepare = () => {
      const stamp = ++g.prep;
      g.stage = "load";
      Promise.resolve(BL.deferred.load("timechain")).then(() => {
        if (stamp !== g.prep) return null;
        g.prepared = BL.timechainInterior.prepare(g.room.id, renderer);
        return g.prepared.ready;
      }).then(() => {
        if (stamp === g.prep) g.stage = "capture";
      }, () => {
        if (stamp === g.prep) g.stage = "failed";
      });
    };
    const dropPrepared = () => {
      g.prep++;
      g.stage = null;
      if (g.prepared) { g.prepared.dispose(); g.prepared = null; }
      if (g.picture) { site.picture.geometry = null; renderer.releaseGeometry(g.picture); g.picture = null; }
    };
    // A canvas's frame copied out at no more than 1280 pixels across, ready to hang as a picture: both renderers take
    // one once it reads as a loaded image, and a canvas is one already.
    const copyFrame = () => {
      const k = Math.min(1, 1280 / canvas.width), out = document.createElement("canvas");
      out.width = Math.round(canvas.width * k); out.height = Math.round(canvas.height * k);
      const c = out.getContext("2d");
      c.imageSmoothingQuality = "high";
      c.drawImage(canvas, 0, 0, out.width, out.height);
      out.complete = true;
      out.naturalWidth = out.width;
      return out;
    };
    const outShot = BL.scene.createCamera({ fov: 50, near: 0.12, far: 600 });
    const readyStep = () => {
      const cave = crew.player, eye = eyeRise(cave), fov = pilot.eyeFov(), aspect = canvas.width / Math.max(1, canvas.height);
      if (g.stage === "capture") {
        // The room from its handover point, hung where it fills the eye's whole view from `handZ`.
        const image = g.prepared.capture(canvas, eye, fov);
        if (!image) return;
        const q = ROOMS.fill(fov, aspect, eye, 2 * P.halfW, 0, P.top - P.floor, HAND_REACH), w = q.w / 2;
        const geo = { verts: [-w, eye - q.h / 2, 0, w, eye - q.h / 2, 0, w, eye + q.h / 2, 0, -w, eye + q.h / 2, 0], faces: [{ i: [0, 1, 2, 3], color: [0, 0, 0], emissive: 0 }], lines: [], castShadow: false };
        geo.imageSurface = { asset: { width: image.width, height: image.height, load: () => image }, rect: [-w, eye - q.h / 2, q.w, q.h] };
        g.picture = site.picture.geometry = geo;
        g.handZ = PICTURE_Z + q.D;
        g.stage = "upload";
      } else if (g.stage === "upload") g.stage = "out";
      else if (g.stage === "out") {
        // The island from where the way back hands over, level and facing the shut doors.
        const x = worldX(0, OUT_Z), z = worldZ(0, OUT_Z), y = place.y + P.floor + eye;
        outShot.fov = fov;
        outShot.position.x = x; outShot.position.y = y; outShot.position.z = z;
        outShot.target.x = x + Math.sin(OUT_HEADING); outShot.target.y = y; outShot.target.z = z + Math.cos(OUT_HEADING);
        if (h.renderView(outShot)) world.sphereOutView = { canvas: copyFrame(), fov, aspect };
        g.stage = "ready";
      }
    };
    // Back to the keypad with the room still chosen: a cancel, a failure, a lost connection, a stale grant.
    const fallBack = (words) => {
      dropPrepared();
      if (g.cycle !== null || g.ask) BL.net.cancelDoor();
      g.cycle = null; g.ask = 0; g.starting = false;
      g.want = 0;
      site.plug.visible = true;
      g.state = "keypad";
      g.pitchTo = keypadPitch();
      show(words);
    };

    // ---------- the doorway ----------
    // The island room's word on the doorway, for this page's own crossing and for anyone else's.
    const onDoor = (event) => {
      if (event.t === "transit") {
        if (event.door !== ROOMS.EXTERIOR_ZONE || event.cycle === g.cycle) return;
        g.remoteUntil = Math.max(g.remoteUntil, performance.now() + Math.max(0, Math.min(12000, event.exp - BL.net.serverNow())));
      } else if (event.t === "transit-end") {
        if (event.cycle !== g.cycle) g.remoteUntil = Math.min(g.remoteUntil, performance.now() + 1200);
      } else if (event.op === "wait") {
        if (g.state === "waiting") show(event.ahead ? `Door in use · waiting (${event.ahead} ahead)` : "Door in use · waiting");
        else if (g.state === "arriving") hud.hint("Door in use · waiting", 3000);
      } else if (event.op === "grant") {
        if (!g.ask) return;
        g.ask = 0;
        g.cycle = event.cycle;
        g.exp = event.exp;
        granted();
      } else if (event.op === "started") {
        if (!g.starting || event.cycle !== g.cycle) return;
        g.starting = false;
        g.exp = event.exp;
        if (g.state === "waiting" && crew.player) startOpening();
        else if (g.state === "arriving" && crew.player) startLeaving();
        else { BL.net.cancelDoor(); g.cycle = null; }
      } else if (event.op === "denied" && (g.ask || g.cycle !== null)) {
        g.ask = 0; g.cycle = null; g.starting = false;
        if (g.state === "waiting") fallBack("The doorway was not available · press Enter to try again");
        else if (g.state === "arriving") g.t = 0;
      } else if (event.op === "lost" && (g.ask || g.starting)) {
        if (g.state === "waiting") fallBack("Connection lost · press Enter to try again");
        else { g.ask = 0; g.cycle = null; g.starting = false; }
      }
    };
    const unsubscribeDoor = BL.net.subscribeDoor(onDoor);
    // Whether this crossing should wait its turn: shared, with a room that knows the doorway.
    const reserving = () => g.mode === "shared" && BL.net.state.doorway;
    const askDoor = (dir) => {
      g.dir = dir;
      g.ask = BL.net.askDoor(dir, g.room.id) ? performance.now() : 0;
      return !!g.ask;
    };
    // A grant is only permission to ask the room to begin. The doors wait for `started`, whose fresh expiry covers
    // the full animation; a rejected or lapsed grant never opens them on one page alone.
    const granted = () => {
      if ((g.state === "waiting" || g.state === "arriving") && crew.player && BL.net.goDoor(g.cycle)) g.starting = true;
      else { BL.net.cancelDoor(); g.cycle = null; }
    };
    // Committed from here on: the doors part as the view settles on them.
    const startOpening = () => {
      g.state = "opening";
      g.t = 0;
      g.want = 1;
      show(`Entering Room ${g.room.id}`);
    };
    // The walk: a curve from where the Ooga stands into the doorway's middle, leaving it square to the passage, then
    // straight along the axis on past the handover point, so the eye reaches it level and square to the picture
    // whatever side of the keypad it started from (and mid-stride, not where the steering would stop).
    const startCrossing = () => {
      const cave = crew.player, p = cave.root.position, x0 = localX(p.x, p.z), z0 = localZ(p.x, p.z), half = CURVE / 2;
      const az = S.THRESHOLD - 0.2, c1x = x0 * 0.5, c1z = z0 + (S.THRESHOLD - z0) * 0.5, c2z = Math.max(az + 0.6, Math.min(z0, az + 0.9));
      const end = g.handZ + eyeAhead(cave, 0) - 0.6;
      for (let i = 0; i < half; i++) {
        const t = (i + 1) / half, u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
        g.path[i * 2] = a * x0 + b * c1x;
        g.path[i * 2 + 1] = a * z0 + b * c1z + c * c2z + d * az;
      }
      for (let i = 0; i < half; i++) {
        g.path[(half + i) * 2] = 0;
        g.path[(half + i) * 2 + 1] = az + (end - az) * (i + 1) / half;
      }
      g.along = 0;
      g.state = "crossing";
      g.t = 0;
      site.plug.visible = false;
    };
    // Through: the room takes over from this same eye, the prepared room, the Ooga and what it carried with it, and
    // the island's meshes kept on the GPU (`keep`) for the way back.
    const handOff = () => {
      const cave = crew.player, p = camera.position, t = camera.target, dx = t.x - p.x, dz = t.z - p.z;
      const entry = { x: localX(p.x, p.z), dz: localZ(p.x, p.z) - g.handZ, heading: wrap(Math.atan2(dx, dz) - IN_HEADING), pitch: Math.atan2(t.y - p.y, Math.hypot(dx, dz)) };
      world.sphereVisit = { room: g.room.id, mode: g.mode, login: g.login, character: cave.traits.name, guided: true, jetpack: g.jetpack, prepared: g.prepared, entry };
      world.sphereKeep = h.keep();
      world.pilot = cave.traits.name;
      if (go("timechain", String(g.room.id), true)) { g.prepared = null; g.state = "gone"; g.t = 0; }
      else { world.sphereVisit = null; world.sphereKeep = null; }
    };

    // ---------- the way back out ----------
    // Called by the hub as it opens with the Ooga a room handed back. Walked out, the room handed over mid-stride
    // (`exit.pose`): the eye stands where the island's view out was taken, offset as it stood in the vestibule, and
    // the walk goes on. Otherwise (Back, the logo) the Ooga waits behind the curtain, out of sight, and walks out once
    // the doorway is its own.
    const arrive = (exit) => {
      const cave = crew.player;
      if (!cave) return false;
      g.exit = exit;
      g.room = ROOMS.get(exit.room);
      g.mode = exit.mode;
      g.jetpack = exit.jetpack || null;
      const pose = exit.pose;
      if (pose) {
        const heading = OUT_HEADING + pose.heading, ahead = eyeAhead(cave, pose.pitch), lx = pose.x - Math.sin(pose.heading) * ahead, lz = OUT_Z + pose.dz - Math.cos(pose.heading) * ahead;
        pilot.navigate({ position: { x: worldX(lx, lz), y: place.y + P.floor, z: worldZ(lx, lz) }, yaw: heading + Math.PI, pitch: -pose.pitch, dist: 4 });
        cave.root.rotation.y = heading;
        g.pitch = g.pitchTo = pose.pitch;
        g.t = 0;
      } else {
        pilot.navigate({ position: { x: PARK.x, y: place.y + P.floor, z: PARK.z }, yaw: OUT_HEADING + Math.PI, pitch: 0.05, dist: 4 });
        cave.root.rotation.y = OUT_HEADING;
        g.pitch = g.pitchTo = 0;
        // A beat behind the curtain first, so the room hears the sphere's zone with this pose before the doors part.
        g.t = -0.3;
      }
      hold(true);
      g.state = "arriving";
      g.lens = "eyes";
      g.glide = 1;
      hideHead(cave, true);
      return true;
    };
    const startLeaving = () => {
      g.state = "leaving";
      g.t = 0;
      g.want = 1;
      site.plug.visible = false;
    };
    const finishLeaving = () => {
      const cave = crew.player;
      g.state = "idle";
      g.want = 0;
      if (g.cycle !== null) BL.net.doneDoor(g.cycle);
      g.cycle = null; g.starting = false;
      hideHead(cave, false);
      lens("back");
      hold(false);
      // The pilot's own camera resumes behind the Ooga where it now stands on the bridge, not where it was left inside
      // the doors when the island opened.
      if (cave) pilot.navigate({ position: { x: cave.root.position.x, y: cave.root.position.y - cave.baseY, z: cave.root.position.z }, yaw: cave.root.rotation.y + Math.PI, pitch: 0.12, dist: 4.5 });
      if (g.jetpack && g.jetpack.equipped && cave && h.equipJetpack(cave)) cave.jetFuel = g.jetpack.fuel;
      else if (g.jetpack && cave) cave.jetFuel = g.jetpack.fuel;
      g.jetpack = null;
      g.exit = null;
    };

    // Per frame, before the crew moves: the turns and walks. After the pilot: the view.
    const update = (dt) => {
      const cave = crew.player, now = performance.now();
      g.t += dt;
      if (g.state !== "idle" && g.state !== "gone" && !cave) {
        if (g.state === "keypad" || g.state === "account") disengage();
        else if (g.state === "preparing" || g.state === "waiting") { fallBack("Walk an Ooga up to the keypad"); disengage(); }
      }
      if (g.state === "keypad" || g.state === "account") {
        if (cave) { settleAtKeypad(dt); g.pitchTo = keypadPitch(); }
      } else if (g.state === "preparing" || g.state === "waiting") {
        if (g.starting && BL.net.serverNow() > g.exp) { fallBack("The doorway grant expired · press Enter to try again"); return; }
        // Facing the doors' seam while the room readies; a room slower than usual sets the heartbeat going on them.
        const settled = turnTo(facing(SEAM.x, SEAM.z), dt) && Math.abs(g.pitch) < SETTLED;
        if (g.stage === "failed" || g.t > PREPARE_LIMIT) { g.failures++; fallBack(`Room ${g.room.id} could not be opened · press Enter to try again`); return; }
        if (g.stage && g.stage !== "load" && g.stage !== "ready") readyStep();
        if (!settled || g.stage !== "ready") {
          if (settled) g.settledAt += dt;
          if (g.settledAt > SLOW && now > g.cued && h.show) { h.show.cue(TM.HEARTBEAT); g.cued = now + 7000; }
        } else if (g.state === "preparing") {
          g.state = "waiting";
          g.t = 0;
          if (reserving()) { askDoor("in"); show("Waiting for the door…"); }
          else if (g.mode === "shared" && BL.net.state.room !== "live") show("Connecting to the island…");
          else startOpening();
        } else if (!g.ask && g.cycle === null && !g.starting) {
          // A shared crossing with no room to reserve from goes ahead after a grace; one whose request vanished asks again.
          if (reserving()) askDoor("in");
          else if (g.mode !== "shared" || BL.net.state.room === "live" || g.t > CONNECT_GRACE) startOpening();
        }
      } else if (g.state === "opening") {
        // A grant that expired while the tab slept is not resumed: back to the keypad.
        if (g.cycle !== null && BL.net.serverNow() > g.exp && g.t > 0.5) { fallBack("The door closed again · press Enter to try again"); return; }
        turnTo(facing(SEAM.x, SEAM.z), dt);
        if (g.open > 0.55) startCrossing();
      } else if (g.state === "crossing") {
        // Steer for a point a little ahead along the curve; the body's heading, and the eyes with it, follows its bend.
        const p = cave.root.position, x = localX(p.x, p.z), z = localZ(p.x, p.z);
        while (g.along < CURVE - 1 && Math.hypot(g.path[g.along * 2] - x, g.path[g.along * 2 + 1] - z) < 0.5) g.along++;
        const tx = g.path[g.along * 2], tz = g.path[g.along * 2 + 1];
        steerTo(worldX(tx, tz), worldZ(tx, tz));
        if (localZ(camera.position.x, camera.position.z) <= g.handZ || g.t > WALK_LIMIT) handOff();
      } else if (g.state === "gone") {
        if (cave) steerTo(PARK.x, PARK.z);
        // The room's scene takes over in the next frame; one that could not leaves the island running.
        if (g.t > 4) {
          world.sphereVisit = null;
          world.sphereKeep = null;
          fallBack(`Room ${g.room.id} could not be opened · press Enter to try again`);
          if (cave) pilot.navigate({ position: { x: WAIT.x, y: place.y, z: WAIT.z }, yaw: IN_HEADING + Math.PI, pitch: 0.1, dist: 4 });
        }
      } else if (g.state === "arriving") {
        // Standing a beat facing the shut doors (the room's hand over built the island on a still frame; a frame's
        // clamped step after it moves nothing), then they part.
        if (cave) crew.steer(0, 0, 0, 0, 0);
        if (g.starting && BL.net.serverNow() > g.exp) { BL.net.cancelDoor(); g.cycle = null; g.starting = false; g.t = 0; }
        if (g.t > 0.15 && !g.ask && g.cycle === null && !g.starting && !(reserving() && askDoor("out"))) startLeaving();
      } else if (g.state === "leaving") {
        // The walk goes on once the doors are open enough and on while they close behind it.
        if (cave && (g.open > 0.55 || g.want === 0)) {
          const out = steerTo(OUTSIDE.x, OUTSIDE.z), z = localZ(cave.root.position.x, cave.root.position.z);
          if (z > S.THRESHOLD + 1.2) { g.want = 0; site.plug.visible = true; }
          // Hold the eye through the walk and the doors closing; the ordinary island camera returns afterward.
          if (out && g.open === 0 || g.t > WALK_LIMIT) { site.plug.visible = true; finishLeaving(); }
        } else if (cave) crew.steer(0, 0, 0, 0, 0);
      } else if (g.state === "idle" && cave) {
        // Pressing against the doorway: it only opens from the keypad.
        const lx = localX(cave.root.position.x, cave.root.position.z), lz = localZ(cave.root.position.x, cave.root.position.z);
        if (Math.abs(lx) < P.halfW && lz > S.THRESHOLD && lz < S.THRESHOLD + 1.1 && now - g.hintAt > HINT_GAP * 1000) {
          g.hintAt = now;
          hud.hint("Use keypad to choose a room", 3000);
        }
      }
      // The eye's pitch eases toward where it looks: the keypad, then level.
      g.pitch += (g.pitchTo - g.pitch) * Math.min(1, dt * TURN_RATE);
      // The doors: open for this page's crossing or another player's, closed otherwise.
      const want = Math.max(g.want, now < g.remoteUntil ? 1 : 0), step = REDUCED.matches ? 1 : dt / DOOR_TIME;
      g.open = g.open < want ? Math.min(want, g.open + step) : Math.max(want, g.open - step);
      site.setDoors(g.open * g.open * (3 - 2 * g.open));
    };
    const view = (dt) => {
      const cave = crew.player;
      if (g.lens === "eyes" && cave) {
        // From the first glide in until the crossing hands over, and all the way back out, the view is the Ooga's eye,
        // its field of view the pilot's own first person's; the head hides once the view is inside it.
        if (g.still > 0) g.still--;
        else g.glide = Math.min(1, g.glide + dt / GLIDE);
        eyePose(cave, g.to);
        const e = putPose(g.from, g.to, g.glide), fov = pilot.eyeFov();
        camera.fov = g.fromFov ? g.fromFov + (fov - g.fromFov) * e : fov;
        if (g.glide > 0.5) hideHead(cave, true);
      } else if (g.lens === "back") {
        // The pilot is free again and has set its own view this frame: glide from where the doorway left it.
        g.glide = Math.min(1, g.glide + dt / GLIDE);
        readPose(g.to);
        const fov = camera.fov, e = putPose(g.from, g.to, g.glide);
        camera.fov = g.fromFov + (fov - g.fromFov) * e;
        if (g.glide >= 1) g.lens = null;
      }
    };
    const keyOf = (e) => e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const press = (key) => {
      const digit = Number(key);
      if (digit >= 1 && digit <= 9) {
        if (g.state === "account" && digit === g.selection) retryAccount();
        else if (g.state === "account") { g.state = "keypad"; choose(digit); }
        else choose(digit);
      } else if (key === "enter") {
        if (g.state === "keypad") commit();
        else if (g.state === "account") commit(true);
      } else if (key === "back") {
        if (g.state === "account") { g.state = "keypad"; show(`Room ${g.selection} selected · press Enter`); }
        else if (g.state === "keypad") disengage();
        else if (g.state === "preparing" || g.state === "waiting") fallBack(`Cancelled · Room ${g.selection} remains selected`);
      }
    };
    // From the keypad until the Ooga is through, the doorway has the keys: nothing reaches the Ooga, the camera or
    // the hub's shortcuts (a chat line being typed still gets its own). Once committed only Back is heard, until the
    // doors part.
    const onKey = (e) => {
      if (g.state === "idle" || e.metaKey || e.ctrlKey || e.altKey || e.target && e.target.closest && e.target.closest("input, textarea, [contenteditable]")) return false;
      const k = keyOf(e);
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.repeat) return true;
      if (g.state === "keypad" || g.state === "account") {
        if (/^[1-9]$/.test(k)) press(k);
        else if (k === "Enter") press("enter");
        else if (k === "Escape" || k === "Backspace") press("back");
      } else if ((g.state === "preparing" || g.state === "waiting") && (k === "Escape" || k === "Backspace")) press("back");
      return true;
    };
    window.addEventListener("keydown", onKey, true);
    // A hidden tab can come back long after a grant ran out; a waiting request is then given up rather than kept.
    const onVisibility = () => {
      if (!document.hidden && g.state === "waiting" && g.ask && performance.now() - g.ask > 60000) fallBack("The wait ran out · press Enter to try again");
    };
    document.addEventListener("visibilitychange", onVisibility);
    // A readied room and its picture stay on the GPU until the crossing takes them or they are let go.
    const liveGeometry = (set) => {
      if (g.prepared) g.prepared.liveGeometry(set);
      if (g.picture) set.add(g.picture);
    };
    const dispose = () => {
      window.removeEventListener("keydown", onKey, true);
      document.removeEventListener("visibilitychange", onVisibility);
      unsubscribeDoor();
      // Through the passage the crossing is done; anything short of that gives the doorway back.
      if (g.state === "gone" && g.cycle !== null) BL.net.doneDoor(g.cycle);
      else if (g.cycle !== null || g.ask) BL.net.cancelDoor();
      g.starting = false;
      dropPrepared();
      if (crew.player) hideHead(crew.player, false);
      g.state = "idle";
    };
    show();
    return {
      action, nearKeypad, engage, update, view, arrive, dispose, onKey, liveGeometry, get preselected() { return preselect; },
      get busy() { return g.state !== "idle"; },
      get crossing() { return g.state === "opening" || g.state === "crossing" || g.state === "gone" || g.state === "leaving" || g.state === "arriving"; },
      debug: g, choose, commit, disengage, press
    };
  };
  BL.timechainGate = { create };
})();
