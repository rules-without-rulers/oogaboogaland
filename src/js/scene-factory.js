// The Lightning Factory: a Lightning node at work, shown as a factory in a tiered cavern behind the 2 o'clock
// mouth, run by gorillas in hard hats. Everything that moves is driven by the node's event stream through
// `factory-feed.js`; until a real node publishes, `factory-mock.js` plays a demo node, and the entrance says so.
//
// What each station shows, and what it may not (Foundry's consumer rules, docs/lightning-factory.md):
// - The node core glows while the node runs and goes dark when it says it stopped.
// - Four featured lines stand on the main and high levels, each with two capacitors: blue lights on a settled
//   forward, orange sputters on a failed one. A forward's sats ride inside the glass conduits: in along the line it
//   came in on, through the core, and out along the line it left by, when the event names that line (the demo
//   contract's `out`; Foundry's public events name one line only, and then the sats only go in). A failed forward's
//   sats reach the core and come back, glowing red, and the line they were bound for sputters. A large forward is a
//   stream of sats and a surge through the node: the chamber flares white, rings of light climb it and the Tesla
//   coils arc to it.
// - The on-chain forge fires when a line is opened or closed; its bay's lantern turns red while it is taken down. An
//   opening sends carts of sats up the left shaft from the chain for the forge to consume; a close has it mint a coin
//   that rolls back down the right shaft. The carts count the opening's bucketed size, never an amount.
// - The switchboard's screens light with every forward; its board carries the node's own counts and
//   Foundry's hourly summary, which is labelled as Foundry's.
// - The rebalancer spins for a rebalance, and never touches a line.
// - The treasury's gold is the node's public capacity; its belt carries each of the demo node's fees to the crate.
// - The banana cooker takes the tips, which are not the node's events and never ride a line: the core flashes green
//   and throws a tip's lime sats across the hall (in through the way out while the node is stopped), the jaw swallows
//   them, the cooker chews, and the bananas slide down its chute and fly out through the gate to the island, where the
//   level already counts them. Its board counts tips and bananas for the page, labelled simulated, and never names a
//   donor or a time. The rebalancer, the treasury and the cooker stand in a row on one platform along the right wall.
// - The donation kiosk built into the right wall at the walkway's end runs the whole simulated donation on its screen
//   (`factory-kiosk.js`): an amount, its quote in bananas, an invoice with its QR and expiry, the wait and the payment,
//   which sends the view round to watch the cooker take that very tip. A tip from the island's dialog turns the view to
//   the show too.
// - The watchtower's beam sweeps while the feed is live and goes dark when it falls silent: that is "no
//   signal", which is not the same as the node stopping.
// - The galleries under the vault hold the lines past the featured four; the study hall is locked for now.
//
// The first view stands on the entrance balcony and looks across at the core, the way the concept frames it.
// Escape, the Leave button and the tunnel behind the balcony all go back to the island.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { math, models, contributors, donations, qr, pile: pileMod, game: gameMod, hud: hudMod, interact: interactMod, pilot: pilotMod, fx: fxMod } = BL;
  const FM = BL.factoryModels;
  const { clamp, mat4 } = math;
  const { createNode, addChild, removeChild, createCamera, stepTweens, tweenCount, traverseVisible } = BL.scene;
  const { LAYOUT, LEVEL, HALL, CONDUIT_SAMPLES } = FM;

  const COARSE = window.matchMedia("(pointer: coarse)").matches;
  const PITCH = [-0.2, 1.3], DIST = [4, 30];
  const FOLLOW = { y: 0.9, min: 3, max: 7, pitch: [0.25, 0.8] };
  const FLY = { speed: 6, perDist: 0.4, climb: 4, yMax: HALL.h - 3 };
  // The shield across the way out, as wide as the mouth's opening, as on the hub's side; and how far past where the
  // hub took its picture of the island the picture hangs.
  const GATE_OPENING = { minX: -2.5, maxX: 2.5, floorY: 0, ceilingY: 3 }, OUTSIDE_DISTANCE = 34;
  // Paired peer mirrors share their arch coordinates. A half turn carries an
  // incoming walk out of the other face, retaining height and distance crossed.
  const PEER_OPENING = { minX: -2.1, maxX: 2.1, floorY: 0.1, ceilingY: 4.65 }, PEER_PLANE = 0.45, PEER_TINT = [0.3, 0.72, 1];
  const view = (x, y, z, yaw, pitch, dist) => ({ yaw, pitch, dist, target: { x, y, z } });
  const bay = (i, dist = 11) => { const b = LAYOUT.bays[i]; return view(b.x * 0.9, b.y + 2, b.z, b.x < 0 ? 0.55 : -0.55, 0.22, dist); };
  // Where whoever walked in stands: a step inside the gate, facing the core (yaw 0 turns the Ooga to PI), seen over
  // its shoulder looking horizontally across the hall.
  const ARRIVAL = { yaw: 0, pitch: 0, dist: FOLLOW.max, position: { x: 0, y: LAYOUT.entrance.y, z: LAYOUT.entrance.z + 1 } };
  // `entrance` is the balcony's view across the core; the rest frame one station each.
  const PRESETS = {
    entrance: view(0, 9, -6, 0, 0, 33),
    core: view(0, 8, -4, 0.35, 0.12, 15),
    lines: view(0, 8.5, -8, 0, 0.18, 20),
    lineA: bay(0), lineB: bay(1), lineC: bay(2), lineD: bay(3),
    forge: view(0, 2.2, 1.5, 0.75, 0.22, 10),
    switchboard: view(-12, 4, 6, 0.55, 0.22, 9),
    rebalancer: view(14, 4.6, 5, -0.8, 0.3, 10),
    // The nav's Treasury frames the whole platform: the rebalancer, the treasury and the cooker in a row.
    treasury: view(13.2, 3.6, 12.6, -0.7, 0.52, 15.5),
    cooker: view(13.75, 4, 19.9, -1.45, 0.28, 9),
    // After a tip from the dialog: from over the kiosk, down on the cooker's jaw with the core beyond it, the bananas
    // flying off to the left toward the way out.
    show: view(11.2, 5.7, 18.2, 0.848, 0.38, 12),
    lookout: view(-16, 19, -14, 0.7, 0.15, 14),
    study: view(19, 8.6, 12, -Math.PI / 2 + 0.2, 0.2, 11),
    galleries: view(4, 17, -16, 0, 0.14, 17)
  };
  const RENDER_OPTS = {
    clear: [0.07, 0.05, 0.04], sky: [0.42, 0.3, 0.2], ground: [0.16, 0.11, 0.08],
    direct: [0.6, 0.45, 0.32], directStrength: 0.35, ambientFloor: 0.34,
    sun: { x: 0.25, y: 0.9, z: 0.3 }, shadowCenter: { x: 0, y: 6, z: -4 }, shadowExtent: 30,
    lights: new Float32Array(BL.glRenderer.POINT_LIGHT_CAPACITY * 8), lightCount: 0, bloomStrength: 0.85,
    // Spotlight: origin/range, unit direction/outer cosine, colour/inner cosine.
    spotLight: new Float32Array(12),
    fog: [0.1, 0.07, 0.05], fogNear: 40, fogFar: 110
  };
  // Seconds a flash, a sputter, the forge's heat and the rebalancer's run last.
  const FLASH = 0.35, SPUTTER = 0.9, HEAT = 7, SPIN = 7;
  // The forge's lines: how many carts an opening sends by its bucketed size, how many can be out at once and how far
  // apart they leave, how many metres a cart takes to go into the fire, and how long the forge spins its sign to mint.
  const CARTS_FOR = { dust: 1, small: 1, medium: 1, large: 2, very_large: 3 }, CART_POOL = 4, CART_GAP = 1.1, CONSUME = 1.4, MINT_SPIN = 1.2;
  const FIRE = { x: LAYOUT.forge.x, y: 0.7, z: LAYOUT.forge.z + 0.4 }, AT = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };
  const SPARKS = ["#ffc83a", "#ff8a1f", "#fff2b8"].map((c) => models.particleGeometry(c, 0.1, 1));
  const SPARKS_CYAN = ["#7fe0ff", "#e8fbff", "#ffe07a"].map((c) => models.particleGeometry(c, 0.1, 1));
  const SURGE_SPARKS = ["#fff2c0", "#ffd27a", "#dffaff"].map((c) => models.particleGeometry(c, 0.1, 1));
  // A point `d` metres along one of the forge's lines, from the bottom of its shaft, into `out`: no allocation.
  const lineAt = (line, d, out) => {
    const f = Math.max(0, Math.min(line.n - 1.001, d / FM.LINE_STEP)), i = Math.floor(f), k = f - i, P = line.pts, a = i * 5, b = a + 5;
    out.x = P[a] + (P[b] - P[a]) * k;
    out.y = P[a + 1] + (P[b + 1] - P[a + 1]) * k;
    out.z = P[a + 2] + (P[b + 2] - P[a + 2]) * k;
    out.yaw = P[a + 3];
    out.pitch = P[a + 4];
    return out;
  };
  // The treasury's belt: how many nuggets ride it at once, and the seconds one takes up it.
  const BELT_CAP = 6, BELT_TIME = 1.8, BELT = FM.TRE.belt;
  // A rebalance's bucketed size, as its board reads it.
  const SIZES = { dust: "Dust", small: "Small", medium: "Medium", large: "Large", very_large: "Very large" };
  const NODE_STATES = { starting: "Starting", ready: "Ready", stopped: "Stopped" };
  const SAT_CAP = 160, GALLERY_N = LAYOUT.galleries.reduce((n, g) => n + g.stations, 0);
  // How many sats a forward sends through its conduits, by its bucketed size, and a sat's flags: part of a large
  // forward's stream, of a very large one's, of a failed forward, and the lead sat, whose arrival sets off the surge.
  const SATS_FOR = { dust: 1, small: 1, medium: 2, large: 10, very_large: 18 };
  const BIG = 1, HUGE = 2, FAILED = 4, LEAD = 8;
  // The banana cooker's show. Each tip waits its turn in a short ring as a batch of lime cubes, one a banana: with the
  // node running the core flashes green and throws them from its chamber's side, CUBE_GAP apart after LIME_LEAD; with
  // it stopped they come in through the way out. The jaw springs open to catch them, gulping as each lands, and snaps
  // shut once the last is in; the cooker chews CHOMPS times over CHURN, and the bananas leave by the chute FRUIT_GAP
  // apart, each sliding down it for SLIDE and launched straight up into the ceiling tube.
  // Every throw falls under gravity SHOW_G. The kiosk's screen thanks the tipper while the cooker works and for THANKS
  // after. The jaw's spring steps at most LID_STEP, so it holds at any frame rate.
  const TIP_RING = 8, CUBE_CAP = 32, FRUIT_CAP = 32, CUBE_GAP = 0.12, FRUIT_GAP = 0.16, LIME_LEAD = 0.45, GATE_LEAD = 0.2, CHURN = 2.6, SLIDE = 0.34;
  const CHOMPS = 4, THANKS = 3, LID_STEP = 1 / 120;
  const CATCH = 1, CLOSE = 2, COOKING = 3, FRUIT_SCALE = 0.62, SHOW_G = 9, LIME = [0.45, 1, 0.3];
  // The kiosk while a visitor works it: the view glides in square to its glass (AT_KIOSK) over EASE, the glass filling
  // FILL_H of the view's height or FILL_W of its width, and back out (LEAVING); after a payment it glides over
  // WATCH_EASE to the show (WATCHING), where the cooker takes the tip WATCH_LEAD into the glide, and comes back
  // WATCH_AFTER after the last banana is out.
  const AT_KIOSK = 1, LEAVING = 2, WATCHING = 3, EASE = 0.8, WATCH_EASE = 1.6, WATCH_LEAD = 0.7, WATCH_AFTER = 2, FILL_H = 0.66, FILL_W = 0.92;
  // How near the kiosk the walking visitor is told how to use it: the reach Space uses it from (the crew's REACH + 0.6).
  const KIOSK_HINT = 2.2;
  const SPARKS_LIME = ["#b6ff5a", "#e8ffb0", "#6fe03a"].map((c) => models.particleGeometry(c, 0.1, 1));
  const SMOKE = models.particleGeometry("#b9b1a6", 0.3, 0.1);
  // A throw from s to e over an apex at height `apex`, solved once a visit.
  const toss = (sx, sy, sz, ex, ey, ez, apex) => {
    const vy = Math.sqrt(2 * SHOW_G * (apex - sy)), T = vy / SHOW_G + Math.sqrt(2 * (apex - ey) / SHOW_G);
    return { sx, sy, sz, ex, ey, ez, vy, T };
  };
  const TIPS = {
    core: ["Node core · this Lightning node", "The node core is the Lightning node itself: lit while it runs, dark when it stops."],
    line: ["Line · a Lightning channel", "Each line is a channel to one peer. Blue flashes when a payment passes through it, orange when one fails."],
    forge: ["On-chain forge · open and close", "Channels are opened and closed with Bitcoin transactions. Opening one feeds the forge carts of sats from the chain; closing one mints a coin that goes back down to it."],
    shaftIn: ["From the chain · opening channels", "Sats come up this shaft from the Bitcoin chain. Each channel the node opens sends carts of them into the forge, more for a bigger channel."],
    shaftOut: ["To the chain · closing channels", "When a channel closes, its sats go back to the Bitcoin chain: the forge mints them into a coin that rolls down this shaft."],
    switchboard: ["Switchboard · routing", "Every payment the node passes on for someone else is a forward. The screens light as they go through."],
    rebalancer: ["Rebalancer · moving liquidity", "Rebalancing moves sats between channels so lines keep working. It is shown by the hour, never for one line."],
    treasury: ["Treasury · routing fees", "The gold under the glass is the node's public capacity, visible to anyone on the Lightning network. Each forward that earns the demo node a fee sends a nugget up the belt into the crate."],
    cooker: ["Banana cooker · tips into bananas", "Every tip is cooked here: the core throws its sats across, the cooker chomps and churns, and bananas shoot up the ceiling tube to the island's pile."],
    kiosk: ["Donation kiosk · tip the Ooga Boogas", "Walk up and press Space, or tap it: pick an amount, pay its invoice and watch the cooker turn it into bananas.", true],
    lookout: ["Watchtower · the node's signal", "The beam sweeps while the node's events are arriving. Dark means no signal: the node may be fine, but nothing is getting through."],
    study: ["Study Hall · locked", "Bananas first! The study hall opens in a later update."],
    tunnel: ["Peer tunnel", "Through here lives the peer at the other end of a line."],
    galleries: ["More channels", "Every line past the featured four stands up in the galleries."],
    exit: ["The way out", "Back to the island."]
  };

  let renderer, game, world, go, root, camera, hud, hooks, input, pilot, fx, agentPlay = null;
  // The page's one factory node (`world.factoryNode`), and its feed and demo node.
  let shared = null, feed = null, mock = null, unsubscribe = null, leaving = false, dust = null;
  // The Ooga the visitor walked in as: one playable actor from the shared crew, and the world it carries.
  let people = null, avatar = null, playerWorld = null, unsubscribeAccount = null, remotes = null, footsteps = null;
  const NO_ACTORS = [];
  let scene = null, greeter = null, actPrompt = false;
  // On the Worker's page the island's driving rules hold in here too, and the Ooga driven is reported to the
  // room every frame, so signed-in players in the hall hear each other (voice needs a driven Ooga).
  const mayPossess = (cave) => BL.net.mayDrive(cave.traits.name);
  const accountChanged = () => {
    if (!avatar) return;
    const released = BL.net.state.released;
    const denied = mayPossess(avatar) || (released && released.name === avatar.traits.name ? "That Ooga is no longer yours to drive" : null);
    BL.net.state.released = null;
    if (denied && people.player === avatar) {
      pilot.release(true);
      hud.toast(denied);
    }
  };
  const targets = [];
  const SAT_POS = { x: 0, y: 0, z: 0 }, SAT_ROT = { x: 0, y: 0, z: 0 }, SAT_SCALE = { x: 1, y: 1, z: 1 };
  const SAT_M = mat4.create();
  // The cooker's own scratch: the sats' loop leaves SAT_ROT.x and .z at 0 and relies on it.
  const SHOW_POS = { x: 0, y: 0, z: 0 }, SHOW_ROT = { x: 0, y: 0, z: 0 }, SHOW_SCALE = { x: 1, y: 1, z: 1 }, SHOW_M = mat4.create();
  // Where a throw is `t` seconds in, into SHOW_POS: (ax, ay, az) offsets its start, fading out, and (bx, by, bz) its end.
  const flight = (A, t, ax, ay, az, bx, by, bz) => {
    const u = t / A.T, v = 1 - u;
    SHOW_POS.x = A.sx + (A.ex - A.sx) * u + ax * v + bx * u;
    SHOW_POS.y = A.sy + A.vy * t - 0.5 * SHOW_G * t * t + ay * v + by * u;
    SHOW_POS.z = A.sz + (A.ez - A.sz) * u + az * v + bz * u;
  };
  const putShow = (data, at, highlight) => {
    mat4.fromTRS(SHOW_M, SHOW_POS, SHOW_ROT, SHOW_SCALE);
    data.set(SHOW_M, at);
    data[at + 16] = 1; data[at + 17] = highlight; data[at + 18] = 0; data[at + 19] = 0;
  };
  const PEER_ROTATION = math.quat.create();

  // The dressing: crates and coal by the forge, a gauge by the switchboard, and vines over the way
  // out. One set, built once for the page.
  const dressing = models.cached(() => {
    const set = BL.dressing.set(), L = LAYOUT;
    const [c0, c1, c2, c3] = FM.FORGE_STORES;
    set.put("coalCrate", c0[0], 0, c0[1], 1, 1); set.put("coalCrate", c1[0], 0, c1[1], 0, 2);
    set.put("crate", c2[0], 0, c2[1], 0, 0); set.put("crate", c2[0], 0.75, c2[1], 1, 1); set.put("barrel", c3[0], 0, c3[1], 0, 1);
    set.put("gauge", L.switchboard.x + 3.1, L.switchboard.y, L.switchboard.z - 0.4, 0, 0);
    const my = L.entrance.y, mz = FM.EXIT_Z;
    set.put("vine", -3.0, my + 3.5, mz + 1.06, 0, 0);
    set.put("vine", 2.6, my + 3.5, mz + 1.06, 0, 1);
    return set.build();
  });
  // The lanterns, hung as the concept hangs them: big ones on posts at the head of the stairway and lamps on arms
  // at its foot and by the stations, small ones on the rails of the lines, the balcony, the walkway, the core's
  // walkway and the porches, strings of them across the hall and over the way out, and a few on long chains
  // from the vault. A rail lantern stands on one of its rail's posts.
  const lighting = models.cached(() => {
    const L = LAYOUT, e = L.entrance, lamps = [];
    const onRail = (x0, z0, x1, z1, y, fractions) => {
      const n = Math.max(2, Math.round(Math.hypot(x1 - x0, z1 - z0) / 1.4) + 1);
      for (const f of fractions) { const k = Math.round(f * (n - 1)) / (n - 1); lamps.push(["rail", x0 + (x1 - x0) * k, y, z0 + (z1 - z0) * k]); }
    };
    const [sx, , foot, , , head, sw] = L.stairway;
    lamps.push(["top", -2.3, e.y, head + 0.5], ["top", 2.3, e.y, head + 0.5], ["post", -2.4, 0, foot - 0.7, 0], ["post", 2.4, 0, foot - 0.7, Math.PI]);
    // Down the stairway's rails, on their posts.
    for (let z = foot + 0.1 + 3; z < head - 1; z += 3) for (const s of [-1, 1]) lamps.push(["rail", sx + s * (sw / 2 + 0.1), e.y * (z - foot) / (head - foot), z]);
    // A lantern from each arm of every line's frame, two from the forge's header, two from each tunnel's.
    for (const b of L.bays) for (const s of [-1, 1]) lamps.push(["hang", FM.stationX(b) + s * 3.05, b.y + 3.88, FM.stationZ(b) - 0.6]);
    for (const s of [-1, 1]) lamps.push(["hang", L.forge.x + s * 3.05, 4.05, L.forge.z + 1.2]);
    for (const t of L.tunnels) for (const s of [-1, 1]) {
      const lx = s * 3.3, lz = 0.8, c = Math.cos(t.turn), sn = Math.sin(t.turn);
      lamps.push(["hang", t.x + lx * c + lz * sn, t.y + 5.9, t.z - lx * sn + lz * c]);
    }
    // Two from the study hall's header, which faces -x, two on chains either side of the donation kiosk, and two from
    // the ends of the donations board's top beam.
    for (const [lx, ly, lz] of FM.STUDY.lamps) lamps.push(["hang", L.study.x - lz, L.study.y + ly, L.study.z + lx]);
    if (FM.donationCorner()) for (const [x, y, z] of [...FM.KIOSK.hooks, ...FM.BOARD.hooks]) lamps.push(["hang", x, y, z]);
    lamps.push(["post", L.switchboard.x + 3.1, L.switchboard.y, L.switchboard.z - 1.9, Math.PI]);
    // Two from the arms at the ends of each forge shaft's header.
    for (const [x, z] of FM.SHAFTS) for (const s of [-1, 1]) lamps.push(["hang", x + s * 1.7, 2.76, z - 0.2]);
    // Two from each of the rebalancer's, the treasury's and the cooker's signs.
    for (const [d, spots] of [[L.rebalancer, FM.REB.lamps], [L.treasury, FM.TRE.lamps], [L.cooker, FM.COOK.lamps]]) for (const [x, y, z] of spots) lamps.push(["hang", d.x + x, d.y + y, d.z + z]);
    const [[w0, w1, a0], [s0, , s1]] = L.walk;
    onRail(w0, a0 + 0.1, w1, a0 + 0.1, e.y, [0.2, 0.5, 0.8]);
    onRail(s0 + 0.1, a0, s0 + 0.1, s1, e.y, [0.1, 0.3, 0.5, 0.7, 0.9]);
    onRail(-e.w / 2 + 0.1, e.z - e.d / 2 + 0.1, -e.w / 2 + 0.1, e.z + e.d / 2 - 0.1, e.y, [0.5]);
    const r = L.ring;
    for (const i of [5, 9, 16, 19, 23, 26]) { const a = i / 28 * Math.PI * 2; lamps.push(["rail", r.x + Math.cos(a) * (r.outer - 0.15), r.y - 0.05, r.z + Math.sin(a) * (r.outer - 0.15)]); }
    for (const t of L.tunnels) {
      const [x0, x1, z0, z1] = FM.porchOf(t);
      if (t.turn) onRail(x0, z0 + 0.1, x1, z0 + 0.1, t.y, [0.5]);
      else onRail(x0 + 0.1, z0, x0 + 0.1, z1, t.y, [0.5]);
    }
    for (const s of [-1, 1]) lamps.push(["chain", s * 6, 12.5, 8], ["chain", s * 13, 16.5, 3]);
    const my = e.y, mz = FM.EXIT_Z;
    return FM.lanterns(lamps, [
      [-14, 16, -12, 14, 16, -12, 1.6, [0.2, 0.4, 0.6, 0.8]], [-18, 13.5, -8, 18, 13.5, -8, 1.4, [0.2, 0.35, 0.65, 0.8]],
      [-20, 9, 8, -13, 9, 12, 0.6, [0.5]], [20, 9.5, 5, 13.5, 9, 7, 0.6, [0.5]],
      // Just past the rim, the mouth's own string of lamps, hung where the hub hangs it.
      [-3.05, my + 3.42, mz + 1.1, 3.05, my + 3.42, mz + 1.1, 0.3, [0.3, 0.7]]
    ]);
  });

  // Where a line stands: one of the four featured bays, a gallery stand, or nowhere shown (the overflow count). The
  // shared node places every line (`BL.factoryFeed.node`); this is the hall's bay or stand for one of its places,
  // taking up the line the node has just put there.
  const placeIn = (s, place) => {
    if (!place) return null;
    const mine = place.bay ? s.bays[place.index] : s.gallery[place.index];
    if (!place.line || mine.line === place.line) return mine;
    if (place.bay) return claimBay(s, place.index, place.line);
    if (mine.line) s.placeOf.delete(mine.line);
    mine.line = place.line;
    s.placeOf.set(place.line, mine);
    return mine;
  };
  // A bay takes a line and its labels name the line's peer; with no line they name the bay.
  const claimBay = (s, i, id) => {
    const b = s.bays[i];
    if (b.line) s.placeOf.delete(b.line);
    b.line = id;
    if (id) s.placeOf.set(id, b);
    const channel = mock && mock.snapshot.channels.find((c) => c.id === id);
    setBoard(b.label, `CHANNEL ${b.letter}`, channel ? `Peer: ${channel.peer}` : `Line ${b.letter}`, true);
    setBoard(s.tunnels[i].label, "PEER TUNNEL", channel ? channel.peer : `Line ${b.letter}`, true);
    return b;
  };

  const onEvent = (e) => {
    const s = scene, replay = e.stream === "replay", p = e.payload || {};
    const place = placeIn(s, shared.at);
    switch (e.type) {
      case "channel.opening":
        s.forgeHeat = HEAT;
        if (!replay) s.inQueue += CARTS_FOR[p.scale] || 1;
        if (place && place.bay) {
          place.state = "building";
          place.build = 0;
          nudge(s, place.gorilla);
        }
        nudge(s, s.forgeCrew);
        break;
      case "channel.active":
        if (place && place.bay) {
          place.state = "active";
          if (replay) place.build = 1;
          place.flashL = FLASH * 2;
        }
        break;
      case "channel.closing":
        s.forgeHeat = HEAT;
        if (place && place.bay) { place.state = "dismantling"; nudge(s, place.gorilla); }
        nudge(s, s.forgeCrew);
        break;
      case "channel.closed":
        if (!replay) s.outQueue++;
        if (place) {
          if (place.bay) { place.state = "empty"; place.build = 0; }
          s.placeOf.delete(place.line);
          place.line = null;
        }
        break;
      case "forward.settled":
        if (replay) break;
        s.switchBusy = FLASH;
        if (p.fee) dropNugget(s);
        forward(s, place, p.out ? placeIn(s, shared.indexOf(p.out)) : null, p.scale, false);
        break;
      case "forward.failed":
        if (replay) break;
        forward(s, place, p.out ? placeIn(s, shared.indexOf(p.out)) : null, p.scale, true);
        break;
      case "rebalance.succeeded":
        s.rebScale = p.scale || null;
        s.rebHour = e.bucket.slice(11, 16);
        if (replay) break;
        s.spin = SPIN;
        nudge(s, s.rebalanceCrew);
        break;
      case "rebalance.failed":
        s.rebFailed += p.count || 1;
        break;
    }
    s.dirty = true;
  };
  // A fee's nugget sets off up the treasury's belt; with the belt full, it lands in the crate at once.
  const dropNugget = (s) => {
    for (let i = 0; i < BELT_CAP; i++) {
      if (s.nuggetT[i] >= 0) continue;
      s.nuggetT[i] = 0;
      s.nuggets[i].visible = true;
      return;
    }
    s.hopper = Math.min(1, s.hopper + 0.05);
  };
  // A worker reacts to its station's event with a chest beat, if it is not already busy.
  const nudge = (s, g) => { if (g && !g.agent.driven) g.agent.poke(); };
  // A forward from the line it came in on (`from`) to the line it left by (`to`, or null when the event does not say):
  // its sats ride in along `from`'s conduit to the core and on out along `to`'s, or for a failed forward back out
  // along `from`'s, flashing each featured line as they leave and arrive. A line off the featured four flashes at once
  // in its gallery; with neither featured, the overflow count flashes. A large forward's stream packs its sats close.
  const forward = (s, from, to, scale, failed) => {
    const n = SATS_FOR[scale] || 1, big = scale === "large" || scale === "very_large", gap = big ? 0.06 : 0.18;
    const flags = (big ? BIG : 0) | (scale === "very_large" ? HUGE : 0) | (failed ? FAILED : 0);
    const inBay = from && from.bay ? from.index : -1, outBay = to && to.bay ? to.index : -1;
    if (from) from.flashL = FLASH;
    if (to && !to.bay) to[failed ? "sputter" : "flashL"] = failed ? SPUTTER : FLASH;
    if (!from && !to) s.overflowFlash = FLASH;
    if (inBay >= 0) for (let k = 0; k < n; k++) launchSat(s, inBay, 1, k * gap, failed ? inBay : outBay, flags | (k ? 0 : LEAD), failed ? outBay : -1);
    else if (outBay >= 0 && !failed) {
      for (let k = 0; k < n; k++) launchSat(s, outBay, -1, k * gap, -1, flags, -1);
      if (big) surge(s, flags);
    }
  };
  // A sat set on a conduit, `dir` 1 in toward the core or -1 out from it, `delay` in the conduit's length before it
  // starts; `next` the conduit it goes on out by from the core (-1 none), and `aim` the line a failed forward was
  // bound for, which sputters as the sat reaches the core.
  const launchSat = (s, bayIndex, dir, delay, next, flags, aim) => {
    const q = s.sats;
    for (let i = 0; i < SAT_CAP; i++) {
      if (q.bay[i] >= 0) continue;
      q.bay[i] = bayIndex;
      q.dir[i] = dir;
      q.t[i] = dir > 0 ? -delay : 1 + delay;
      q.next[i] = next;
      q.aim[i] = aim;
      q.flags[i] = flags;
      q.speed[i] = (flags & BIG ? 0.42 : 0.32) + Math.random() * 0.12;
      q.spin[i] = Math.random() * 6.28;
      return;
    }
  };
  // A big forward reaching the core: the surge starts, stronger for a very large one, with sparks off the crown.
  const surge = (s, flags) => {
    s.surge = flags & HUGE ? 1.5 : 1;
    s.surgeT = 0;
    const c = LAYOUT.core;
    fx.burst(c.x, c.chamber[1] + 4.4, c.z, flags & HUGE ? 26 : 16, SURGE_SPARKS, 3);
  };

  // A tip's cubes wait their turn; with the ring full they join the last tip's.
  const cook = (s, n, sats) => {
    if (s.tipCount < TIP_RING) {
      const i = (s.tipHead + s.tipCount++) % TIP_RING;
      s.tipN[i] = n;
      s.tipSats[i] = sats;
    } else {
      const last = (s.tipHead + TIP_RING - 1) % TIP_RING;
      s.tipN[last] += n;
      s.tipSats[last] += sats;
    }
  };
  // The core taking a tip: one lime ring climbs the chamber, fatter and slower than a surge's white three.
  const limeFrame = (s, dt) => {
    s.lime = Math.max(0, s.lime - dt * 0.8);
    if (s.limeT < 0) return;
    const p = (s.limeT += dt) / 1.1, r = s.limeRing, lo = LAYOUT.core.chamber[0], hi = LAYOUT.core.chamber[1];
    r.visible = p < 1;
    if (!r.visible) { s.limeT = -1; return; }
    r.position.y = lo - 0.2 + (hi - lo + 0.8) * p * (2 - p);
    r.scale.x = r.scale.z = 1 + 0.2 * Math.sin(p * Math.PI);
    r.scale.y = 1 + 0.9 * (1 - p);
  };
  // The cooker, once a frame: a waiting tip starts when the cooker is idle, its cubes fly into the open jaw, the jaw
  // shuts and the cooker chews, and bananas launch from the chute into the ceiling tube. The tally counts a tip as the jaw
  // shuts on it and each banana as it enters the tube.
  const cookerFrame = (s, dt, elapsed, running) => {
    const c = s.cook, q = s.cubes, f = s.fruit, ey = LAYOUT.entrance.y, ripples = s.gate.phase.ripples;
    if (c.phase === 0 && s.tipCount) {
      c.owed = c.batch = s.tipN[s.tipHead];
      c.caught = 0;
      c.sats = s.tipSats[s.tipHead];
      s.tipHead = (s.tipHead + 1) % TIP_RING;
      s.tipCount--;
      c.src = running ? 0 : 1;
      c.gap = running ? LIME_LEAD : GATE_LEAD;
      c.phase = CATCH;
      if (running) {
        s.lime = 1;
        s.limeT = 0;
        fx.burst(s.tossCore.sx, s.tossCore.sy, s.tossCore.sz, 14, SPARKS_LIME, 2.6);
      }
      nudge(s, s.cookCrew);
    }
    // The cubes leave CUBE_GAP apart; with the pool full, one goes straight into the pot.
    if (c.owed > 0 && (c.gap -= dt) <= 0) {
      c.owed--;
      c.gap = CUBE_GAP;
      let i = 0;
      while (i < CUBE_CAP && q.t[i] >= 0) i++;
      if (i === CUBE_CAP) c.load++;
      else {
        const gate = c.src === 1, A = gate ? s.tossGate : s.tossCore;
        q.t[i] = 0;
        q.src[i] = c.src;
        q.spin[i] = Math.random() * 6.28;
        q.jx[i] = (Math.random() - 0.5) * (gate ? 2.4 : 0.5);
        q.jy[i] = (Math.random() - 0.5) * (gate ? 1.2 : 0.5);
        q.jz[i] = gate ? 0 : (Math.random() - 0.5) * 0.5;
        if (gate) ripples.pulse(A.sx + q.jx[i], A.sy + q.jy[i] - ey, 0);
        else {
          s.lime = Math.max(s.lime, 0.7);
          fx.spawnParticle(SPARKS_LIME[i % 3], A.sx, A.sy, A.sz, (Math.random() - 0.5) * 1.2, 0.6 + Math.random(), (Math.random() - 0.5) * 1.2, 0.6);
        }
      }
    }
    // In the air: tumbling, shrinking into the mouth over the last stretch, each landing with a gulp.
    const cd = s.cubeNode.instanceData;
    let n = 0, flying = 0;
    for (let i = 0; i < CUBE_CAP; i++) {
      if (q.t[i] < 0) continue;
      const A = q.src[i] ? s.tossGate : s.tossCore, t = q.t[i] += dt;
      if (t >= A.T) { q.t[i] = -1; c.load++; c.caught++; c.kick = 1; continue; }
      flying++;
      flight(A, t, q.jx[i], q.jy[i], q.jz[i], 0, 0, 0);
      SHOW_ROT.x = q.spin[i] + t * 7; SHOW_ROT.y = q.spin[i] + t * 4; SHOW_ROT.z = 0;
      const k = Math.min(1, (A.T - t) / 0.25);
      SHOW_SCALE.x = SHOW_SCALE.y = SHOW_SCALE.z = 0.2 + 0.8 * k * k * (3 - 2 * k);
      putShow(cd, n++ * 20, 0);
    }
    s.cubeNode.instanceCount = n;
    s.cubeNode.visible = n > 0;
    s.cubeNode.instanceVersion++;
    // The jaw on a spring: it opens wide with a wobble while cubes are owed or flying, dips as each lands, and snaps
    // shut once the last is in, with a gulp; shut, the cooker chews.
    if (c.phase === CATCH && c.owed === 0 && flying === 0) c.phase = CLOSE;
    const wide = c.phase === CATCH, k = wide ? 60 : 320, damp = wide ? 8.5 : 8;
    for (let h = dt; h > 1e-6; h -= LID_STEP) {
      const e = Math.min(h, LID_STEP);
      c.lidV += (k * ((wide ? 1 : 0) - c.lid) - damp * c.lidV) * e;
      c.lid += c.lidV * e;
      if (c.lid < 0) c.lid = c.lidV = 0;
    }
    c.kick = Math.max(0, c.kick - dt * 5);
    c.gulp = Math.max(0, c.gulp - dt * 3);
    c.spit = Math.max(0, c.spit - dt * 8);
    const chomp = c.phase === COOKING ? Math.sin(Math.PI * CHOMPS * (1 - c.t / CHURN)) ** 2 : 0;
    s.lid.rotation.z = -(FM.COOK.open * c.lid * (1 - 0.12 * c.kick) + 0.2 * chomp);
    // The sats it has caught heap on its tongue until it swallows them; it squashes as it gulps, chews and spits.
    s.heap.visible = (wide || c.phase === CLOSE) && c.caught > 0 && c.lid > 0.15;
    if (s.heap.visible) s.heap.scale.x = s.heap.scale.y = s.heap.scale.z = (0.4 + 0.6 * Math.min(1, c.caught / Math.max(1, c.batch))) * Math.min(1, c.lid * 1.4);
    const squash = 0.05 * c.kick + 0.08 * c.gulp + 0.035 * c.spit + 0.025 * chomp;
    s.chest.scale.y = 1 - squash;
    s.chest.scale.x = s.chest.scale.z = 1 + squash * 0.5;
    if (c.phase === CLOSE && c.lid <= 0) {
      c.phase = COOKING;
      c.t = CHURN;
      c.gulp = 1;
      shared.cooker.tips++;
      shared.cooker.last = c.sats;
      s.refreshAt = 0;
      const lip = s.lidLip;
      for (let k = 0; k < 6; k++) fx.spawnParticle(SPARKS[k % 3], lip.x, lip.y, lip.z + (Math.random() - 0.5) * 1.6, -0.5 - Math.random(), 1 + Math.random(), (Math.random() - 0.5) * 2, 0.7, 6, 3.2, LAYOUT.cooker.y);
    }
    if (c.phase === COOKING && (c.t -= dt) <= 0) {
      c.phase = 0;
      c.out += c.load;
      c.load = 0;
      c.outGap = 0;
    }
    // The churn: gears, a shudder, the porthole lit, smoke up the stack, and the treasury's light borrowed to pulse here.
    const churn = c.phase === COOKING;
    c.heat += ((churn ? 1 : 0) - c.heat) * Math.min(1, dt * (churn ? 4 : 1.5));
    c.spin += ((churn ? 7 : 0) - c.spin) * Math.min(1, dt * 2.5);
    const ga = s.gears[0], gb = s.gears[1], G = FM.COOK.gears;
    ga.rotation.x = (ga.rotation.x + c.spin * dt) % (Math.PI * 2);
    gb.rotation.x = -ga.rotation.x * G[0][4] / G[1][4] + Math.PI / G[1][4];
    s.chest.position.x = churn ? Math.sin(elapsed * 41) * 0.012 : 0;
    const port = FM.cookerPort(), pg = (churn ? Math.sin(elapsed * 23) > -0.6 : c.kick > 0.3) ? port.lit : port.dim;
    if (s.port.geometry !== pg) s.port.geometry = pg;
    if (churn && (c.smoke -= dt) <= 0) {
      c.smoke = 0.08;
      const p = fx.spawnParticle(SMOKE, s.stackTop.x + (Math.random() - 0.5) * 0.12, s.stackTop.y, s.stackTop.z + (Math.random() - 0.5) * 0.12, (Math.random() - 0.5) * 0.3, 0.9 + Math.random() * 0.5, (Math.random() - 0.5) * 0.3, 1.8 + Math.random() * 0.7, 1.2);
      if (p) p.smoke = true;
    }
    const Lt = RENDER_OPTS.lights, B = LIGHT_BASE, o = LIGHT.treasury * 8, h = c.heat < 1e-3 ? 0 : c.heat, beat = h * (0.8 + 0.35 * Math.sin(elapsed * 13)), P = s.cookLight;
    Lt[o] = B[o] + (P.x - B[o]) * h; Lt[o + 1] = B[o + 1] + (P.y - B[o + 1]) * h; Lt[o + 2] = B[o + 2] + (P.z - B[o + 2]) * h;
    Lt[o + 4] = B[o + 4] * (1 - h) + 1.3 * beat; Lt[o + 5] = B[o + 5] * (1 - h) + 0.75 * beat; Lt[o + 6] = B[o + 6] * (1 - h) + 0.25 * beat;
    // Bananas out by the chute FRUIT_GAP apart, launched vertically into the overhead intake.
    // With the pool full, the next waits its turn.
    if (c.out > 0 && (c.outGap -= dt) <= 0) {
      let i = 0;
      while (i < FRUIT_CAP && f.t[i] >= 0) i++;
      if (i < FRUIT_CAP) {
        c.out--;
        c.outGap = FRUIT_GAP;
        f.t[i] = 0;
        f.jx[i] = (Math.random() - 0.5) * 2.2;
        f.jy[i] = (Math.random() - 0.5) * 1.1;
        f.spin[i] = Math.random() * 6.28;
      }
    }
    const fd = s.fruitNode.instanceData, A = s.tossOut, H = s.hatchW;
    let m = 0;
    for (let i = 0; i < FRUIT_CAP; i++) {
      if (f.t[i] < 0) continue;
      // Draw the final step inside the intake before returning this slot to the pool.
      if (f.t[i] - SLIDE >= A.T) {
        f.t[i] = -1;
        shared.cooker.bananas++;
        continue;
      }
      const t = f.t[i] += dt;
      if (t < SLIDE) {
        const k = t / SLIDE, u = k * k;
        SHOW_POS.x = H.x + (A.sx - H.x) * u; SHOW_POS.y = H.y + (A.sy - H.y) * u; SHOW_POS.z = H.z + (A.sz - H.z) * u;
        SHOW_SCALE.x = SHOW_SCALE.y = SHOW_SCALE.z = FRUIT_SCALE * Math.min(1, 0.4 + k * 2);
      } else {
        // Off the lip: the cooker spits, and a puff of steam follows it out.
        if (t - dt < SLIDE) {
          c.spit = 1;
          const p = fx.spawnParticle(SMOKE, A.sx, A.sy + 0.1, A.sz, (Math.random() - 0.5) * 0.4, 0.5 + Math.random() * 0.3, (Math.random() - 0.5) * 0.4, 0.8, 0.9);
          if (p) p.smoke = true;
        }
        const u = Math.min(1, (t - SLIDE) / A.T);
        SHOW_POS.x = A.sx; SHOW_POS.y = A.sy + (A.ey - A.sy) * u; SHOW_POS.z = A.sz;
        SHOW_SCALE.x = SHOW_SCALE.y = SHOW_SCALE.z = FRUIT_SCALE;
      }
      SHOW_ROT.x = 0; SHOW_ROT.y = s.outYaw; SHOW_ROT.z = f.spin[i] + t * 9;
      putShow(fd, m++ * 20, 0.35);
    }
    s.fruitNode.instanceCount = m;
    s.fruitNode.visible = m > 0;
    s.fruitNode.instanceVersion++;
    // The kiosk: its screen thanks the tipper in place of its attract screen while the cooker works and a moment
    // after, and its lights breathe, quicker and brighter then.
    s.thanks = c.phase || s.tipCount || c.out || m ? THANKS : Math.max(0, s.thanks - dt);
    if (!s.corner) return;
    const thanking = s.thanks > 0;
    s.kioskThanks.visible = thanking;
    s.kioskIdle.visible = !thanking;
    s.kioskGlow.glow = thanking ? 1.3 + 0.25 * Math.sin(elapsed * 9) : 0.92 + 0.08 * Math.sin(elapsed * 2.2);
  };
  // Leaving mid-show, the tips still on their way count as cooked and their bananas as gone out to the island, where
  // the level already holds them.
  const settleCooker = (s) => {
    const c = s.cook, t = shared.cooker;
    let bananas = c.owed + c.load + c.out, tips = c.phase === CATCH || c.phase === CLOSE ? 1 : 0;
    for (let i = 0; i < CUBE_CAP; i++) if (s.cubes.t[i] >= 0) bananas++;
    for (let i = 0; i < FRUIT_CAP; i++) if (s.fruit.t[i] >= 0) bananas++;
    for (let k = 0; k < s.tipCount; k++) {
      const i = (s.tipHead + k) % TIP_RING;
      bananas += s.tipN[i];
      t.last = s.tipSats[i];
      tips++;
    }
    if (tips && !s.tipCount) t.last = c.sats;
    t.tips += tips;
    t.bananas += bananas;
  };

  // The show for the checks: bananas still to come out of the cooker (waiting, owed, in the pot), those in the air,
  // and the page's tally.
  const cookerStats = (s) => {
    const c = s.cook;
    let queued = c.owed + c.load + c.out;
    for (let k = 0; k < s.tipCount; k++) queued += s.tipN[(s.tipHead + k) % TIP_RING];
    return { phase: c.phase, queued, cubes: s.cubeNode.instanceCount, bananas: s.fruitNode.instanceCount, out: shared.cooker.bananas, tips: shared.cooker.tips };
  };

  // ---- the kiosk, while a visitor works it ------------------------------------------------------------------------
  // The view glides in square to the kiosk's glass and holds there, the visitor's Ooga and the side sheet out of the
  // way, while the kiosk's flow is laid over the glass and takes the taps and keys; leaving, it glides back and hands
  // the controls back. A paid tip waits on the screen for the visitor to watch it: the view then glides round to the
  // show, the cooker takes the tip on the way, and the view comes back once the bananas are out or the visitor moves.
  // Poses are an eye and a heading, eased by smoothstep with the heading turning the short way round.
  const pose = () => ({ x: 0, y: 0, z: 0, yaw: 0, pitch: 0 });
  const readPose = (out) => {
    const p = camera.position, t = camera.target, dx = t.x - p.x, dy = t.y - p.y, dz = t.z - p.z;
    out.x = p.x; out.y = p.y; out.z = p.z;
    out.yaw = Math.atan2(dx, dz);
    out.pitch = Math.atan2(dy, Math.hypot(dx, dz));
  };
  const copyPose = (out, a) => { out.x = a.x; out.y = a.y; out.z = a.z; out.yaw = a.yaw; out.pitch = a.pitch; };
  const putPose = (a, b, k) => {
    const e = k * k * (3 - 2 * k), yaw = a.yaw + Math.atan2(Math.sin(b.yaw - a.yaw), Math.cos(b.yaw - a.yaw)) * e;
    const pitch = a.pitch + (b.pitch - a.pitch) * e, cp = Math.cos(pitch), p = camera.position, t = camera.target;
    p.x = a.x + (b.x - a.x) * e; p.y = a.y + (b.y - a.y) * e; p.z = a.z + (b.z - a.z) * e;
    t.x = p.x + Math.sin(yaw) * cp; t.y = p.y + Math.sin(pitch); t.z = p.z + Math.cos(yaw) * cp;
  };
  // Square on to the glass, from as far out as keeps it within FILL_H of the view's height and FILL_W of its width.
  const glassPose = (out) => {
    const G = FM.KIOSK.glass, N = G.normal, t = 2 * Math.tan(camera.fov / 2);
    const d = Math.max(G.h / (FILL_H * t), G.w / (FILL_W * t * renderer.size.width / renderer.size.height));
    out.x = G.at[0] + N[0] * d; out.y = G.at[1] + N[1] * d; out.z = G.at[2] + N[2] * d;
    out.yaw = Math.atan2(-N[0], -N[2]);
    out.pitch = Math.asin(-N[1]);
  };
  // Where the show is watched from: the `show` preset's eye and heading.
  const SHOW_VIEW = (() => {
    const v = PRESETS.show, cp = Math.cos(v.pitch);
    return { x: v.target.x + Math.sin(v.yaw) * cp * v.dist, y: v.target.y + Math.sin(v.pitch) * v.dist, z: v.target.z + Math.cos(v.yaw) * cp * v.dist, yaw: v.yaw + Math.PI, pitch: -v.pitch };
  })();
  const glide = (b, mode, ease) => {
    b.mode = mode;
    b.t = 0;
    b.ease = ease;
    readPose(b.from);
  };
  // The visitor's Ooga and the side sheet step out of the screen's way, and back.
  const boothAside = (s, aside) => {
    const b = s.booth;
    if (b.hidden === aside) return;
    b.hidden = aside;
    if (avatar) avatar.root.visible = !aside;
    if (aside) {
      b.sheet = hud.el.sheet.dataset.open;
      hud.el.sheet.dataset.open = "false";
    } else hud.el.sheet.dataset.open = b.sheet;
  };
  // The Ooga's controls (the act button, the aim's reticle and the equipment by the title) stay hidden while the kiosk
  // has the view, and come back as they were.
  const boothHud = (s, held) => {
    const b = s.booth, reticle = document.getElementById("weapon-reticle"), equipment = document.getElementById("equipment-hud");
    if (held) {
      b.act = hud.el.act.hidden;
      b.reticle = reticle.hidden;
      b.equipment = equipment.hidden;
      hud.el.act.hidden = reticle.hidden = equipment.hidden = true;
    } else {
      hud.el.act.hidden = b.act;
      reticle.hidden = b.reticle;
      equipment.hidden = b.equipment;
    }
  };
  // The visitor's paid tip, into the cooker.
  const releaseTip = (s) => {
    const b = s.booth;
    if (!b.held) return;
    cook(s, b.held, b.heldSats);
    b.held = b.heldSats = 0;
  };
  const openBooth = (s) => {
    const b = s.booth;
    if (b.mode) return;
    readPose(b.home);
    glide(b, AT_KIOSK, EASE);
    glassPose(b.to);
    // The screen needs the mouse: an aim's pointer lock lets it go, so the cursor shows and clicks land where it is.
    pilot.setExternalControl(true);
    if (document.pointerLockElement) document.exitPointerLock();
    pilot.controls.clearPointer();
    boothAside(s, true);
    boothHud(s, true);
    b.flow.start();
    hud.tooltip.hide();
    hud.hint(COARSE ? "Tap the screen · tap beside it to step away" : "Click or type on the screen · Enter goes on · Esc goes back");
  };
  const leaveBooth = (s) => {
    const b = s.booth;
    if (!b.mode || b.mode === LEAVING) return;
    releaseTip(s);
    b.flow.stop();
    boothAside(s, false);
    glide(b, LEAVING, EASE);
    copyPose(b.to, b.home);
  };
  const watchBooth = (s) => {
    const b = s.booth;
    b.flow.stop();
    boothAside(s, false);
    glide(b, WATCHING, WATCH_EASE);
    copyPose(b.to, SHOW_VIEW);
    b.after = WATCH_AFTER;
    hud.hint(COARSE ? "Watch the cooker · tap to walk on" : "Watch the cooker · any key or click to walk on");
  };
  // At once, for a preset or the scene's leave: the tip cooked, the Ooga back and the controls handed back.
  const endBooth = (s) => {
    const b = s.booth;
    if (!b.mode) return;
    releaseTip(s);
    b.flow.stop();
    boothAside(s, false);
    boothHud(s, false);
    b.mode = 0;
    pilot.setExternalControl(false);
  };
  // Per frame, after the pilot: the flow's clocks and the glide. Watching, the cooker takes the tip WATCH_LEAD into
  // the glide, and the view comes back WATCH_AFTER after the show or when the visitor moves. Walking up to the kiosk,
  // the visitor is told how to use it, once each time they come within reach.
  const boothFrame = (s, dt) => {
    const b = s.booth;
    if (s.corner && !b.mode && avatar && people.player === avatar) {
      const p = avatar.root.position, U = FM.KIOSK.use;
      const near = Math.abs(feetOf() - LAYOUT.kiosk.y) < 0.6 && Math.hypot(p.x - U[0], p.z - U[1]) < KIOSK_HINT;
      if (near && !b.near) hud.hint(COARSE ? "Donation kiosk · tap it or the act button to donate" : "Donation kiosk · press Space to donate");
      b.near = near;
    }
    if (!b.mode) return;
    b.clock += dt;
    b.flow.update(dt);
    if (b.mode === AT_KIOSK) glassPose(b.to);
    b.t = Math.min(1, b.t + dt / b.ease);
    if (b.mode === WATCHING) {
      if (b.held && b.t >= WATCH_LEAD) releaseTip(s);
      const c = s.cook, done = !b.held && !c.phase && !s.tipCount && !c.out && !s.fruitNode.instanceCount, a = pilot.controls.read();
      if (b.t >= 1 && (done && (b.after -= dt) <= 0 || Math.hypot(a.x, a.y) > 0.05)) leaveBooth(s);
    }
    putPose(b.from, b.to, b.t);
    if (b.mode === LEAVING && b.t >= 1) {
      boothHud(s, false);
      b.mode = 0;
      pilot.setExternalControl(false);
    }
  };
  // At the kiosk, keys go to its screen once the view is in; watching, any key walks on. Space and Backspace never
  // reach the page, nor does a character key the screen takes, so one that moves the typing into a field (A opens the
  // name) never types itself there. Keys with a modifier, and the browser's own (F5, F11), are left to the browser.
  const boothKey = (s, e) => {
    const b = s.booth;
    if (e.metaKey || e.ctrlKey || e.altKey) return false;
    if (e.key === " " || e.key === "Backspace") e.preventDefault();
    if (b.mode === WATCHING) leaveBooth(s);
    else if (b.mode === AT_KIOSK && b.t >= 1) {
      if (e.key.length === 1) e.preventDefault();
      b.flow.key(e);
    }
    return true;
  };
  // The kiosk's flow laid over its glass: the four corners projected, one affine map fitted to them (the view is
  // square on, so it is all but exact), the pixels unsmoothed, and what moves drawn over them. `BOOTH_MAP` keeps the
  // map for taps. Allocation-free.
  const BOOTH_MAP = { ux: 0, uy: 0, vx: 0, vy: 0, ex: 0, ey: 0, ok: false }, BOOTH_CORNER = [0, 1, 2, 3].map(() => ({ x: 0, y: 0, depth: 0 }));
  const drawBooth = (ctx) => {
    const s = scene, b = s.booth, M = BOOTH_MAP, C = s.glassCorners;
    M.ok = false;
    if (b.mode !== AT_KIOSK) return;
    for (let k = 0; k < 4; k++) if (!renderer.project(C[k * 3], C[k * 3 + 1], C[k * 3 + 2], BOOTH_CORNER[k])) return;
    const flow = b.flow, W = flow.W, H = flow.H, p = BOOTH_CORNER[0], q = BOOTH_CORNER[1], r = BOOTH_CORNER[2], u = BOOTH_CORNER[3];
    M.ux = (q.x - p.x + u.x - r.x) / (2 * W); M.uy = (q.y - p.y + u.y - r.y) / (2 * W);
    M.vx = (r.x - p.x + u.x - q.x) / (2 * H); M.vy = (r.y - p.y + u.y - q.y) / (2 * H);
    M.ex = (p.x + q.x + r.x + u.x) / 4 - (M.ux * W + M.vx * H) / 2; M.ey = (p.y + q.y + r.y + u.y) / 4 - (M.uy * W + M.vy * H) / 2;
    M.ok = true;
    flow.paint();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    ctx.setTransform(M.ux * dpr, M.uy * dpr, M.vx * dpr, M.vy * dpr, M.ex * dpr, M.ey * dpr);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(flow.canvas, 0, 0);
    ctx.imageSmoothingEnabled = true;
    flow.animate(ctx, b.clock);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  // A tap or click: on the screen, its button; beside it, the visitor steps away (or, paid, goes to watch); watching,
  // it walks on.
  const boothTap = (s, at) => {
    const b = s.booth, M = BOOTH_MAP;
    if (b.mode === WATCHING) return leaveBooth(s);
    if (b.mode !== AT_KIOSK || b.t < 1 || !M.ok) return;
    const det = M.ux * M.vy - M.vx * M.uy, dx = at.x - M.ex, dy = at.y - M.ey;
    const u = (dx * M.vy - dy * M.vx) / det, v = (dy * M.ux - dx * M.uy) / det;
    if (u >= 0 && v >= 0 && u <= b.flow.W && v <= b.flow.H) b.flow.tap(u, v);
    else if (b.flow.state === "paid") watchBooth(s);
    else leaveBooth(s);
  };

  // Whatever shows donations as real or simulated, for the mode they are in now: the kiosk's attract picture (this
  // visit's donation link as its QR, the one the dialog shows, or in real mode, with no fixed link, this site's own
  // Factory address, which opens the cave on a phone), its screen flow (simulated, each invoice a fresh donation request
  // and its payment this visitor's tip in the backend's shape; real, the API's invoices) with the screens' way out to
  // the show and back to the walk, and the donations board's face. Set in `enter`, and again from `update` when the
  // page's Worker turns real mode on after the visit has begun, when a visitor at the kiosk starts over on the new flow,
  // or when the API names a test network, which only the pictures need: the flow reads it as it goes.
  const showMode = (s) => {
    const real = donations.real, net = donations.testNetwork, link = real ? `${location.origin}/lightning` : s.donationLink, b = s.booth;
    if (!s.corner) {
      s.real = real;
      s.net = net;
      return;
    }
    s.kioskIdle.geometry = FM.kioskIdle(link, net);
    s.boardNote = !real ? "SIMULATED · THIS BROWSER'S TIPS" : net ? `${net.toUpperCase()} TEST · ALL DONATIONS` : "ALL DONATIONS";
    s.boardFace.geometry = FM.boardFace(s.boardNote);
    s.net = net;
    if (s.real === real) return;
    s.real = real;
    b.flow = BL.factoryKiosk.create({
      link: () => link,
      real,
      startDetails: () => BL.donationPopup.attachDetails(b.flow, BL.donationPopup.defaults(), true),
      details: () => BL.donationPopup.details(),
      closeDetails: () => BL.donationPopup.detachDetails(b.flow),
      editDetails: (field) => BL.donationPopup.focusDetails(field),
      typing: () => BL.donationPopup.typing(),
      restoreDetails: (value) => BL.donationPopup.restoreDetails(value),
      detailsState: (flow) => BL.donationPopup.detailsState(flow),
      invoice: (sats, value) => donations.invoice({ sats, ...value }),
      note: (request, value, changedHandle) => donations.note(request, value.message, changedHandle ? value.handle : undefined),
      onchain: (request) => donations.onchain(request),
      waitFor: (id) => donations.waitFor(id),
      open: () => donations.state.open,
      testNetwork: () => donations.testNetwork,
      limits: () => donations.state.limits,
      rate: () => BL.donationRate.current || donations.state.tally?.rate,
      watchRate: () => BL.donationRate.watch(),
      request: () => donations.createRequest(BL.donationPopup.details()),
      bananasFor: gameMod.bananasFor,
      price: () => BL.chain.snapshot.priceUsd,
      copy: (text, what = "Invoice") => {
        if (navigator.clipboard) navigator.clipboard.writeText(text).catch(() => {});
        hud.toast(real ? `${what} copied` : `${what} copied · payments are simulated in this build`);
      },
      pay: (id, sats) => onDonation({ ...tipEvent(id, sats), ...BL.donationPopup.details() }),
      release: () => releaseTip(s),
      watch: () => watchBooth(s),
      close: () => leaveBooth(s)
    });
    if (b.mode === AT_KIOSK) b.flow.start();
  };

  // A label hung at (x, y, z) under `parent`: the lettered face and the board behind it, which `setBoard` fills.
  const labelNode = (parent, x, y, z, turn = 0) => {
    const node = createNode({ position: { x, y, z }, rotation: { x: 0, y: turn, z: 0 } });
    node.face = createNode();
    node.back = createNode();
    addChild(node, node.back, node.face);
    addChild(parent, node);
    return node;
  };
  // The boards that read the stream: refreshed once a second, and only when their text changes. A board whose
  // reading moves (`keep` false) owns its label and releases it when the next one replaces it.
  const setBoard = (node, title, sub, keep, opts) => {
    const key = `${title}|${sub}`;
    if (node.printed === key) return;
    node.printed = key;
    if (node.owned) {
      renderer.releaseGeometry(node.face.geometry);
      renderer.releaseGeometry(node.back.geometry);
    }
    const l = FM.label(title, sub, { ...opts, keep });
    node.face.geometry = l.face;
    node.back.geometry = l.back;
    node.owned = !keep;
  };
  // A board of numbers, reprinted only when a row changes; it owns its picture and releases the one it replaces.
  const setData = (node, title, rows, width) => {
    const key = title + rows.join("|");
    if (node.printed === key) return;
    node.printed = key;
    if (node.owned) {
      renderer.releaseGeometry(node.face.geometry);
      renderer.releaseGeometry(node.back.geometry);
    }
    const d = FM.dataBoard(title, rows, { width, keep: false });
    node.face.geometry = d.face;
    node.back.geometry = d.back;
    node.owned = true;
  };
  // The donations board's figures, each row a list of runs (`FM.boardValues`), repainted only when one changes, and
  // whether they were; the node owns its picture and lets go of the one it replaces.
  const setFigures = (node, rows) => {
    const key = rows.map((runs) => runs.map((r) => r[0]).join("")).join("|");
    if (node.printed === key) return false;
    node.printed = key;
    if (node.geometry) renderer.releaseGeometry(node.geometry);
    node.geometry = FM.boardValues(rows);
    return true;
  };
  const sats = (n) => n.toLocaleString("en-US");
  const BANANA_COUNT = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const RATE_COUNT = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
  const bananaCount = (n) => BANANA_COUNT.format(n);
  // A tip as the cooker's board shows it: two significant figures, then K, M and B from a thousand up.
  const rounded = (n) => { const step = 10 ** Math.max(0, Math.floor(Math.log10(n)) - 1); return gameMod.formatLarge(Math.round(n / step) * step); };
  // Local midnight `back` days before the day of `now`, from one Date kept for it.
  const MIDNIGHT = new Date();
  const localMidnight = (now, back) => {
    MIDNIGHT.setTime(now);
    MIDNIGHT.setHours(0, 0, 0, 0);
    MIDNIGHT.setDate(MIDNIGHT.getDate() - back);
    return MIDNIGHT.getTime();
  };
  // The donations board before the API's first tally reaches a real page.
  const NO_TALLY = [[["NO READING YET", "note"]], [["-", "note"]], [["-", "note"]], [["-", "note"]], [["-", "note"]], [["-", "note"]]];
  // The donations board's rows. Real, the API's tally of every donation it holds, the same in every browser: its
  // totals, today and this week counted from its UTC hours by this page's clock, its latest price for a banana (a
  // dollar's worth of bitcoin) and the latest donation's sats. Simulated, this browser's tips (the game's tally).
  // Real amounts retain the recorded fractions and sats; the current rate never revalues earlier donations.
  // Neither mode names a donor or a time.
  const boardRows = () => {
    if (!donations.real) {
      const g = game.state, [todaySats, todayBananas] = game.tipsWithin(1), [weekSats, weekBananas] = game.tipsWithin(7);
      return [
        [[rounded(g.totalSats), "big"], [" SATS", "unit"]],
        [[bananaCount(g.bananas), "big"]],
        [[rounded(todaySats), "big"], [" SATS", "unit"], [` (${bananaCount(todayBananas)}`, "note"], ["", "banana"], [")", "note"]],
        [[rounded(weekSats), "big"], [" SATS", "unit"], [` (${bananaCount(weekBananas)}`, "note"], ["", "banana"], [")", "note"]],
        [[String(gameMod.SATS_PER_BANANA), "big"], [" SATS = 1", "unit"], ["", "banana"]],
        g.lastTip ? [[rounded(g.lastTip), "big"], [" SATS", "unit"]] : [["NONE YET", "note"]]
      ];
    }
    const t = donations.state.tally;
    if (!t) return NO_TALLY;
    const now = Date.now(), today = localMidnight(now, 0), week = localMidnight(now, 6), rate = t.rate;
    let todaySats = 0, todayBananas = 0, weekSats = 0, weekBananas = 0;
    for (const [at, hourSats, hourBananas] of t.hours) {
      if (at < week) continue;
      weekSats += hourSats;
      weekBananas += hourBananas;
      if (at >= today) { todaySats += hourSats; todayBananas += hourBananas; }
    }
    const price = rate ? [[RATE_COUNT.format(rate.satsPerBanana), "big"], [" SATS ≈ 1", "unit"], ["", "banana"]] : [["NO PRICE YET", "note"]];
    if (rate && rate.stale) price.push([" (LAST KNOWN)", "note"]);
    return [
      [[sats(t.sats), "big"], [" SATS", "unit"]],
      [[bananaCount(t.bananas), "big"]],
      [[sats(todaySats), "big"], [" SATS", "unit"], [` (${bananaCount(todayBananas)}`, "note"], ["", "banana"], [")", "note"]],
      [[sats(weekSats), "big"], [" SATS", "unit"], [` (${bananaCount(weekBananas)}`, "note"], ["", "banana"], [")", "note"]],
      price,
      t.last ? [[sats(t.last), "big"], [" SATS", "unit"]] : [["NONE YET", "note"]]
    ];
  };
  const refreshBoards = (s) => {
    const r = feed.reading, signal = feed.signal;
    setBoard(s.lookoutLabel, "WATCHTOWER\nOUTPOST", signal === "live" ? (r.stream === "replay" ? "(Catching Up)" : "(Signal: Live)") : signal === "silent" ? "(No Signal)" : "(Waiting)", true);
    const snap = mock.snapshot;
    // The rebalancer's boards never name a line: a rebalance says only its size and its hour.
    setData(s.rebBoards[0], "LAST REBALANCE", [["Size", s.rebScale ? SIZES[s.rebScale] : "None yet", "count"], ["Hour", s.rebHour ? `${s.rebHour} UTC` : "None yet", "count"], ["Lines", "Private", "plain"]], 1.6);
    setData(s.rebBoards[1], "REBALANCES", [["Done", r.rebalances, "ok"], ["Failed", s.rebFailed, "count"], ["Shown", "By the hour", "plain"]], 1.6);
    let low = Infinity, high = 0;
    for (const c of snap.channels) if (c.active) { low = Math.min(low, c.feePpm); high = Math.max(high, c.feePpm); }
    setData(s.feeBoard, "ROUTING FEES (PUBLIC)", [["Forwards settled", sats(r.settled), "count"], ["Earned a fee", sats(r.fees), "sats"], ["Hour's success", r.summary ? `${Math.round(r.summary.ratio * 100)}%` : "None yet", "ok"]], 1.9);
    setData(s.statsBoard, "NODE STATS (PUBLIC)", [["Channels", r.channels ?? snap.channelCount, "count"], ["Peers", r.peers ?? snap.peerCount, "count"], ["Total capacity", `${sats(snap.capacity)} sats`, "sats"], ["Fee policy", `${low} / ${high} ppm`, "plain"], ["Node", NODE_STATES[r.node] || "Unknown", "ok"]], 1.9);
    const summary = r.summary ? `Foundry hour: ${r.summary.count} fwd, ${Math.round(r.summary.ratio * 100)}% ok` : "(Routing & Forwarding)";
    setBoard(s.switchLabel, "SWITCHBOARD", summary, false);
    const shown = s.placeOf.size, total = r.channels ?? snap.channelCount;
    setBoard(s.galleryLabel, "MORE CHANNELS", `${Math.max(0, total - 4)} lines, ${Math.max(0, total - shown)} not shown`, false);
    // A real page shows the shared donation totals here too, rather than this visit's animation counters.
    const c = shared.cooker, t = donations.state.tally;
    const cooked = !donations.real
      ? [["Tips cooked", gameMod.formatLarge(c.tips), "count"], ["Bananas out", gameMod.formatLarge(c.bananas), "ok"], ["Last tip", c.last ? `${rounded(c.last)} sats` : "None yet", "sats"]]
      : [["Donations", t ? sats(t.count) : "No reading yet", "count"], ["Bananas donated", t ? bananaCount(t.bananas) : "-", "ok"], ["Last tip", t ? t.last ? `${sats(t.last)} sats` : "None yet" : "-", "sats"]];
    setData(s.cookBoard, !donations.real ? "DONATIONS (SIMULATED)" : donations.testNetwork ? "DONATIONS (TEST)" : "DONATIONS", cooked, 1.9);
    // The donations board, on the wall and, when its figures or its face change, in the board dialog's picture.
    if (s.corner) {
      const rows = boardRows(), view = s.boardView;
      if (setFigures(s.boardValues, rows) || view.painted !== s.boardNote) {
        view.painted = s.boardNote;
        view.note = donations.real ? "Every donation recorded by the shared feed. Banana totals use each donation's own recorded exchange rate; the current rate applies to new invoices."
          : "The tips this browser has seen, simulated. Each browser counts its own.";
        FM.paintBoard(view.canvas, s.boardNote, rows);
        view.version++;
      }
    }
    // The core names what it is: a demo node on simulated events, until a real node publishes.
    setBoard(s.coreLabel, "NODE CORE", r.node === "stopped" ? "(Node Stopped)" : r.contract === BL.factoryFeed.DEMO ? "(Demo Node, Simulated)" : "(Your LN Node)", true, { height: 1.6 });
  };

  const leaveCave = () => {
    if (leaving) return;
    leaving = true;
    go("hub");
  };
  const onKey = (e) => {
    if (scene.booth.mode) return boothKey(scene, e);
    if (e.key === "0" && !e.repeat && !e.metaKey && !e.ctrlKey && !e.altKey) return pilot.resetCamera();
    if ((e.key === "x" || e.key === "X") && !e.repeat && pilot.modeAction("mode-toggle")) return true;
    if ((e.key === "1" || e.key === "2") && pilot.weaponMode(Number(e.key))) return true;
    if (e.key === "g" || e.key === "G") return pilot.weaponAction("weapon-toggle");
    if (e.key === "v" || e.key === "V") return pilot.weaponAction("weapon-fire");
    if (e.key === "l" || e.key === "L") {
      demoTip(120000);
      return true;
    }
    if (e.key === "Escape") {
      // The guide closes before the cursor, the Ooga and the cave are left.
      if (greeter && greeter.escape()) return true;
      if (!pilot.escape()) leaveCave();
      return true;
    }
    return false;
  };
  // A tip, wherever the visitor stands in the hall: counted at once, its bananas on the shared level, thanked, and
  // queued for the cooker, which turns it into those bananas before everyone's eyes.
  // In real mode `counted` is the API's `{ exact, rounded }`: the donation counts its exact bananas (the pile itself
  // follows the API's), and the cooker still cooks the game's one to twelve, a show of them.
  const onDonation = (donation, counted = null) => {
    game.recordDonation(donation, counted && counted.exact);
    const bananas = gameMod.bananasFor(donation.sats), shown = counted ? counted.rounded : bananas;
    if (!donations.real) world.level = Math.min(pileMod.MAX_BANANAS, world.level + (counted ? counted.exact : bananas));
    const who = donation.handle ? `@${donation.handle}` : "anon";
    hud.toast(`+${gameMod.formatLarge(donation.sats)} sats · ${gameMod.formatLarge(shown)} banana${shown === 1 ? "" : "s"} · ${who}`);
    fx.showTicker(`THANKS ${donation.handle ? "@" + donation.handle.toUpperCase() : "ANON"} · ${gameMod.formatLarge(shown)} BANANAS`, 4.5);
    hud.setStats(game.state);
    // A real kiosk payment turns toward the cooker immediately, staying inside the Factory.
    // The demo keeps its paid screen so the visitor can walk through the flow at their own pace.
    const b = scene.booth;
    if (b.flow && b.flow.receive(donation.id, counted, donation.handle, donation.sats)) {
      b.held += bananas;
      b.heldSats += donation.sats;
      if (donations.real) watchBooth(scene);
    } else cook(scene, bananas, donation.sats);
  };
  // A tip from this visitor, in the shape the backend will push. A demo tip is the simulation's alone: in real mode it
  // would put a tip nobody paid on the boards.
  const tipEvent = (id, sats) => ({ id, sats, handle: donations.sanitize(game.state.handle, donations.HANDLE_MAX), message: donations.sanitize(game.state.message, donations.MESSAGE_MAX), at: Date.now() });
  const demoTip = (sats) => {
    if (!donations.real) onDonation(tipEvent(`demo-${Date.now()}`, sats));
  };
  const previewDonation = () => {
    if (!donations.real) return false;
    cook(scene, 12, 4800);
    return true;
  };
  // An on-chain payment seen before its block: true when the kiosk holding its invoice shows it.
  const onSeen = (id, sats, due, left, pricing) => !!(scene.booth.flow && scene.booth.flow.seen(id, sats, due, left, pricing));
  const onLootCleared = () => {};

  const build = () => {
    const L = LAYOUT, s = {
      bays: [], gallery: [], tunnels: [], placeOf: new Map(), crew: [], sats: null,
      forgeHeat: 0, switchBusy: 0, spin: 0, hopper: 0, glow: 0, overflowFlash: 0, beam: 0, dirty: true, refreshAt: 0,
      forgeCrew: null, rebalanceCrew: null, rebScale: null, rebHour: null, rebFailed: 0,
      nuggets: [], nuggetT: new Float32Array(BELT_CAP).fill(-1),
      // The forge's lines: carts waiting to come up and out on the line, coins waiting to be minted and the one rolling,
      // the flash and its rings, the sign's spin, and each shaft's glow.
      carts: [], inQueue: 0, inGap: 0, outQueue: 0, mintT: -1, coinD: -1, coinV: 0, trail: 0,
      flash: 0, flashKind: 0, waveT: -1, signTurn: 0, signPulse: 0, shaftGlow: [0, 0], shafts: [],
      // A big forward's surge through the node, and how long since it began (-1 idle).
      surge: 0, surgeT: -1,
      // The cooker: the core's green for a tip and its ring's time (-1 idle), the tips waiting their turn (bananas and
      // sats each), and the show in hand: its stage, the jaw, a gulp's kick, the churn's time, what is in the pot,
      // cubes still to throw and from where, bananas still to send out, the gears, the heat and the smoke.
      lime: 0, limeT: -1, tipHead: 0, tipCount: 0, tipN: new Uint16Array(TIP_RING), tipSats: new Float64Array(TIP_RING),
      thanks: 0, cook: { phase: 0, lid: 0, lidV: 0, kick: 0, gulp: 0, spit: 0, t: 0, load: 0, batch: 0, caught: 0, owed: 0, gap: 0, src: 0, sats: 0, out: 0, outGap: 0, spin: 0, heat: 0, smoke: 0 },
      // The kiosk while a visitor works it: the glide, its poses (from, to, and the walking view to come back to), the
      // visitor's paid tip held for the show, the states of the sheet and the Ooga's controls while put away, and the
      // flow, which enter makes.
      booth: { mode: 0, t: 0, ease: EASE, after: 0, clock: 0, near: false, hidden: false, sheet: "", act: true, reticle: true, equipment: false, held: 0, heldSats: 0, from: pose(), to: pose(), home: pose(), flow: null }
    };
    const hall = FM.hall(), cond = FM.conduits();
    s.ceiling = createNode({ geometry: hall.ceiling });
    s.walls = createNode({ geometry: hall.walls });
    addChild(root, s.ceiling, createNode({ geometry: hall.rock }), s.walls, createNode({ geometry: hall.glow, sightHidden: true }), createNode({ geometry: FM.scaffold() }),
      createNode({ geometry: FM.coreBody() }), createNode({ geometry: cond.pipe }), createNode({ geometry: cond.glass, sightHidden: true }), createNode({ geometry: cond.glow }), createNode({ geometry: FM.forge() }));
    // The surge's rings round the chamber and the coils' arcs, hidden until a big forward comes through.
    s.coreRings = [0, 1, 2].map(() => createNode({ position: { x: L.core.x, y: 0, z: L.core.z }, geometry: FM.coreRing(), visible: false, sightHidden: true }));
    s.arcs = FM.teslaArcs().map((shapes) => createNode({ geometry: shapes[0], visible: false, sightHidden: true }));
    addChild(root, ...s.coreRings, ...s.arcs);
    const peer = FM.peerPipes();
    addChild(root, createNode({ geometry: peer.pipe }), createNode({ geometry: peer.glow, sightHidden: true }));
    // Banners of the bolt hung either side of the core from the high lines' decks, as the concept hangs them.
    for (const x of [-12.5, 12.5]) addChild(root, createNode({ position: { x, y: LEVEL.high - 0.45, z: L.bays[0].z + L.bays[0].d / 2 + 0.1 }, geometry: FM.banner(2.2) }));
    s.chamber = createNode({ geometry: FM.coreChamber().lit });
    s.forgeFire = createNode({ geometry: FM.forgeFire().warm });
    s.forgeSign = createNode({ position: { x: L.forge.x, y: FM.FORGE_CY, z: L.forge.z + 0.14 }, geometry: FM.forgeSign().warm });
    s.waves = [0, 1].map(() => createNode({ position: { x: L.forge.x, y: FM.FORGE_CY, z: L.forge.z + 0.6 }, geometry: FM.forgeWave().gold, visible: false, sightHidden: true }));
    for (const [x, z] of FM.COILS) addChild(root, createNode({ position: { x, y: LEVEL.main, z }, geometry: FM.teslaCoil() }));
    addChild(root, s.chamber, s.forgeFire, s.forgeSign, ...s.waves, createNode({ geometry: FM.forgeTrack() }));
    // The forge's shafts, each with its sign, its glow and a target; the carts that come up the left and the coin that
    // goes down the right.
    FM.forgeShafts().forEach((sh, i) => {
      const [x, z] = FM.SHAFTS[i], rock = createNode({ geometry: sh.rock }), glow = createNode({ geometry: sh.glow.dim, sightHidden: true });
      addChild(root, rock, glow, createNode({ geometry: sh.crystals, sightHidden: true }));
      setBoard(labelNode(root, x, 3.62, z - 0.4, Math.PI), i ? "TO THE CHAIN" : "FROM THE CHAIN", i ? "(Closing Channels)" : "(Opening Channels)", true, { height: 0.95 });
      s.shafts.push({ rock, glow });
    });
    for (let i = 0; i < CART_POOL; i++) {
      const node = createNode({ geometry: FM.cart(), visible: false });
      addChild(root, node);
      s.carts.push({ node, active: false, d: 0, v: 0 });
    }
    s.coin = createNode({ geometry: FM.mintCoin(), visible: false });
    addChild(root, s.coin);
    s.coreLabel = labelNode(root, L.core.x, L.core.chamber[1] + 1.1, L.core.z + 3.3);
    setBoard(labelNode(root, L.forge.x, 4.5, L.ring.z + L.ring.outer + 0.8), "ON-CHAIN FORGE", "(Open / Close)", true);
    // Featured bays: frame, two capacitors and a label on a group at the deck's centre.
    const caps = FM.capacitor();
    L.bays.forEach((b, index) => {
      const node = createNode({ position: { x: FM.stationX(b), y: b.y, z: FM.stationZ(b) } });
      const frame = createNode({ geometry: FM.stationFrame() });
      // The blue tank, the peer's side, stands toward the line's tunnel; the orange one, the node's, toward the core.
      const out = Math.sign(b.x);
      const capL = createNode({ position: { x: out * 1.2, y: 0, z: 0 }, geometry: caps.blue.dim });
      const capR = createNode({ position: { x: -out * 1.2, y: 0, z: 0 }, geometry: caps.orange.dim });
      addChild(node, frame, capL, capR);
      const lbl = labelNode(node, 0, 5.1, -0.55);
      // The line's status lantern, under the frame's beam between the tanks.
      const status = createNode({ position: { x: 0, y: 4.0, z: -0.3 }, geometry: FM.statusLantern().alert });
      addChild(node, status);
      addChild(root, node);
      s.bays.push({ bay: true, index, letter: b.letter, node, frame, capL, capR, status, label: lbl, line: null, state: "empty", build: 0, flashL: 0, sputter: 0, gorilla: null });
    });
    // Peer tunnels, each behind its line.
    const tunnels = FM.tunnels();
    L.tunnels.forEach((t, i) => {
      const node = createNode({ position: { x: t.x, y: t.y, z: t.z }, rotation: { x: 0, y: t.turn, z: 0 } });
      const stone = createNode({ geometry: tunnels[i].stone });
      addChild(node, stone, createNode({ geometry: tunnels[i].glow, sightHidden: true }));
      const lbl = labelNode(node, 0, FM.TUNNEL_SIGN.y, FM.TUNNEL_SIGN.z);
      addChild(node, createNode({ position: { x: -(FM.TUNNEL_POST + 0.75), y: 5.9, z: 0.6 }, geometry: FM.banner(2.2) }));
      addChild(root, node);
      // The OBL mirror's exact mesh-section contact atlas highlights the limbs
      // touching this glass, over the peer's own blue reflection.
      const face = createNode({ geometry: FM.peerMirrors()[i], position: { x: 0, y: 0, z: PEER_PLANE }, rippleTint: PEER_TINT, sightHidden: true });
      addChild(node, face);
      const ripples = BL.mirrorRipples.create(face), body = BL.mirrorBody.create(face, new Map());
      const other = L.tunnels[i ^ 1], yaw = other.turn - t.turn + Math.PI, c = Math.cos(yaw), sn = Math.sin(yaw);
      const sx = t.x + Math.sin(t.turn) * PEER_PLANE, sz = t.z + Math.cos(t.turn) * PEER_PLANE;
      const transform = mat4.create();
      transform[0] = transform[10] = c; transform[2] = -sn; transform[8] = sn;
      transform[12] = other.x + Math.sin(other.turn) * PEER_PLANE - sx * c - sz * sn;
      transform[13] = other.y - t.y;
      transform[14] = other.z + Math.cos(other.turn) * PEER_PLANE + sx * sn - sz * c;
      s.tunnels.push({ at: t, node, stone, label: lbl, face, ripples, body, transform, yaw, crossings: 0, hum: Math.random() * 0.3 });
    });
    // Gallery stands along the top decks.
    const gcaps = FM.galleryCaps();
    for (const g of L.galleries) {
      for (let i = 0; i < g.stations; i++) {
        const node = createNode({ position: { x: g.x - g.w / 2 + (i + 0.5) * g.w / g.stations, y: g.y, z: g.z - 0.3 } });
        const caps2 = createNode({ geometry: gcaps.dim }), stand = createNode({ geometry: FM.galleryStation() });
        addChild(node, stand, caps2);
        addChild(root, node);
        s.gallery.push({ bay: false, index: s.gallery.length, node, stand, caps: caps2, line: null, flashL: 0, sputter: 0 });
      }
    }
    s.galleryLabel = labelNode(root, 0, L.LEVEL.top + 4.5, L.HALL.back + 4.9);
    // The switchboard, the rebalancer and the treasury on their decks.
    const sw = L.switchboard, rb = L.rebalancer, tr = L.treasury, lk = L.lookout, st = L.study;
    const switchNode = createNode({ position: { x: sw.x, y: sw.y, z: sw.z } });
    s.screens = createNode({ geometry: FM.switchScreens().calm });
    const switchBody = createNode({ geometry: FM.switchboard() });
    addChild(switchNode, switchBody, s.screens);
    s.switchLabel = labelNode(switchNode, 0, 4.55, -2.1);
    // The rebalancer: its rings spin and its arrows light while a rebalance runs.
    const REB = FM.REB, rebGeo = FM.rebalancerBase(), rebNode = createNode({ position: { x: rb.x, y: rb.y, z: rb.z } });
    s.ring = createNode({ position: { x: 0, y: 0.56, z: REB.cz }, geometry: FM.rebalancerRing().off });
    s.flow = createNode({ geometry: FM.rebalancerFlow().off });
    const rebBody = createNode({ geometry: rebGeo.body });
    addChild(rebNode, rebBody, createNode({ geometry: rebGeo.glow }), s.ring, s.flow);
    for (const [x, z] of REB.crates) addChild(rebNode, createNode({ position: { x, y: 0, z }, rotation: { x: 0, y: x * 0.06, z: 0 }, geometry: FM.goldCrate() }));
    const [rsx, rsy, rsz] = REB.sign, [rbl, rbm, rbr] = REB.boards;
    setBoard(labelNode(rebNode, rsx, rsy, rsz), "REBALANCER", "(Move Liquidity)", true, { height: 1.15 });
    s.rebBoards = [labelNode(rebNode, rbl[0], rbl[1], rbl[2]), labelNode(rebNode, rbr[0], rbr[1], rbr[2])];
    const move = FM.moveBoard(), moveNode = labelNode(rebNode, rbm[0], rbm[1], rbm[2]);
    moveNode.face.geometry = move.face;
    moveNode.back.geometry = move.back;
    // The treasury: the gold under the glass, the crate the belt fills, a cart and a crate of gold, and the belt's
    // nuggets, each hidden until a fee sets it off.
    const TRE = FM.TRE, trGeo = FM.treasuryBody(), trNode = createNode({ position: { x: tr.x, y: tr.y, z: tr.z } });
    s.pile = createNode({ position: { x: 0, y: TRE.top, z: TRE.vz }, geometry: FM.goldPile() });
    s.fill = createNode({ position: { x: TRE.crate[0], y: 0.1, z: TRE.crate[1] }, geometry: FM.hopperFill() });
    const trBody = createNode({ geometry: trGeo.body });
    addChild(trNode, trBody, createNode({ geometry: trGeo.glow }), s.pile, s.fill);
    addChild(trNode, createNode({ position: { x: TRE.cart[0], y: -0.14, z: TRE.cart[1] }, rotation: { x: 0, y: 0.35, z: 0 }, geometry: FM.cart() }));
    for (const [x, z] of TRE.crates) addChild(trNode, createNode({ position: { x, y: 0, z }, geometry: FM.goldCrate() }));
    for (let i = 0; i < BELT_CAP; i++) {
      const n = createNode({ geometry: FM.beltNugget(), position: { x: BELT[0][0], y: BELT[0][1], z: BELT[0][2] }, visible: false });
      s.nuggets.push(n);
      addChild(trNode, n);
    }
    const [tsx, tsy, tsz] = TRE.sign, [tbl, tbr] = TRE.boards;
    setBoard(labelNode(trNode, tsx, tsy, tsz), "TREASURY", "(Routing Fees)", true, { height: 1.15 });
    s.feeBoard = labelNode(trNode, tbl[0], tbl[1], tbl[2]);
    s.statsBoard = labelNode(trNode, tbr[0], tbr[1], tbr[2]);
    // The cooker: a chest that squashes as it gulps and chews, holding its jaw on the hinge, the porthole, the gears and
    // the heap of caught sats; the stack, chute and sign stand still round it, and the board of donations hangs under
    // the sign.
    const ck = L.cooker, COOK = FM.COOK, ckGeo = FM.cookerBody(), fix = FM.cookerFixtures(), ckNode = createNode({ position: { x: ck.x, y: ck.y, z: ck.z } });
    s.chest = createNode();
    const ckBody = createNode({ geometry: ckGeo.body });
    s.lid = createNode({ position: { x: COOK.hinge[0], y: COOK.hinge[1], z: COOK.hinge[2] }, geometry: FM.cookerLid() });
    s.port = createNode({ position: { x: COOK.port[0], y: COOK.port[1], z: COOK.port[2] }, rotation: { x: 0, y: -Math.PI / 2, z: 0 }, geometry: FM.cookerPort().dim });
    s.gears = COOK.gears.map(([x, y, z, r, teeth]) => createNode({ position: { x, y, z }, geometry: FM.cookerGear(r, teeth) }));
    s.heap = createNode({ position: { x: COOK.mouth[0], y: COOK.rim + 0.12, z: COOK.mouth[2] }, geometry: FM.cookerSats(), visible: false });
    addChild(s.chest, ckBody, createNode({ geometry: ckGeo.glow }), s.lid, s.port, s.heap, ...s.gears);
    addChild(ckNode, s.chest, createNode({ geometry: fix.body }), createNode({ geometry: fix.glow }));
    const [csx, csy, csz] = COOK.sign, [cbx, cby, cbz] = COOK.board;
    setBoard(labelNode(ckNode, csx + 0.45, csy, csz), "BANANA COOKER", "(Tips Into Bananas)", true, { height: 1 });
    s.cookBoard = labelNode(ckNode, cbx, cby, cbz);
    // The donation corner, where it stands (`FM.donationCorner`).
    s.corner = FM.donationCorner();
    let kioskNode = null, kioskBody = null, boardNode = null, boardBody = null;
    if (s.corner) {
      // The donation kiosk in the right wall at the walkway's end, facing back along it: its timber, its iron and lit
      // parts, and the screen leaning back, showing its attract screen (enter hangs this visit's), or its thanks while
      // the cooker works. The glass's corners in the cave's frame, for laying the flow over it.
      const K = FM.KIOSK, G = K.glass, kiosk = FM.donationKiosk(), screen = FM.kioskScreen(), kp = L.kiosk;
      kioskNode = createNode({ position: { x: kp.x, y: kp.y, z: kp.z }, rotation: { x: 0, y: kp.turn, z: 0 } });
      kioskBody = createNode({ geometry: kiosk.timber });
      const [sx0, sy0, sz0] = K.screen;
      s.kioskScreen = createNode({ position: { x: sx0, y: sy0, z: sz0 }, rotation: { x: K.lean, y: 0, z: 0 } });
      s.kioskIdle = createNode({ position: { x: 0, y: 0, z: G.z } });
      s.kioskThanks = createNode({ position: { x: 0, y: 0, z: G.z }, geometry: FM.kioskThanks(), visible: false });
      addChild(s.kioskScreen, createNode({ geometry: screen.frame }), createNode({ geometry: screen.glass }), s.kioskIdle, s.kioskThanks);
      s.kioskGlow = createNode({ geometry: kiosk.glow });
      addChild(kioskNode, kioskBody, createNode({ geometry: kiosk.iron }), s.kioskGlow, s.kioskScreen);
      s.kiosk = kioskNode;
      // The donations board between the study hall and the kiosk: its timber, iron, candles and ivy, the face painted once
      // and its figures, which `refreshBoards` paints.
      const BD = FM.BOARD, board = FM.donationBoard(), bp = L.board;
      boardNode = createNode({ position: { x: bp.x, y: bp.y, z: bp.z }, rotation: { x: 0, y: bp.turn, z: 0 } });
      boardBody = createNode({ geometry: board.timber });
      s.boardFace = createNode({ position: { x: BD.face[0], y: BD.face[1], z: BD.face[2] } });
      s.boardValues = createNode({ position: { x: BD.values[0], y: BD.values[1], z: BD.values[2] } });
      addChild(s.boardFace, s.boardValues);
      addChild(boardNode, boardBody, createNode({ geometry: board.iron }), createNode({ geometry: board.trim }), createNode({ geometry: board.glow }), s.boardFace);
      // The board as the board dialog shows it, one picture of its face and figures that `refreshBoards` paints.
      s.boardView = { title: "Banana Donation Board", help: "", canvas: document.createElement("canvas"), count: 1, index: 0, version: 0,
        caption: "Banana Donation Board", note: "", painted: null, wide: true, go() {} };
      s.glassCorners = [];
      for (const [u, v] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) for (let i = 0; i < 3; i++) s.glassCorners.push(G.at[i] + G.right[i] * u * G.w / 2 + G.up[i] * v * G.h / 2);
    }
    // The watchtower on the top deck: tower, lamp and the beam that sweeps round it.
    const lkNode = createNode({ position: { x: lk.x, y: lk.y, z: lk.z } });
    s.lamp = createNode({ position: { x: 0, y: lk.tower + 1, z: 0 }, rotation: { x: 0, y: 0, z: FM.LOOKOUT_BEAM.pitch }, geometry: FM.lookoutLamp().on });
    s.beam = createNode({ geometry: FM.lookoutBeam(), sightHidden: true });
    const optics = FM.lookoutOptics();
    addChild(s.lamp, createNode({ geometry: optics.frame }), createNode({ geometry: optics.lens }), s.beam);
    const lkBody = createNode({ geometry: FM.lookoutTower() });
    addChild(lkNode, lkBody, s.lamp);
    s.lookoutLabel = labelNode(lkNode, 0, 2.6, 2.3);
    // The study hall in the right wall, facing into the hall: locked for now.
    const stNode = createNode({ position: { x: st.x, y: st.y, z: st.z }, rotation: { x: 0, y: -Math.PI / 2, z: 0 } });
    const hallGeo = FM.studyHall();
    const stBody = createNode({ geometry: hallGeo.stone });
    addChild(stNode, stBody, createNode({ geometry: hallGeo.glow }));
    const [sgx, sgy, sgz] = FM.STUDY.sign, [nx, ny, nz, nLean] = FM.STUDY.note, [bx, by, bz, bLean] = FM.STUDY.board;
    setBoard(labelNode(stNode, sgx, sgy, sgz), "STUDY HALL", "", true, { style: "gold", height: 1.6 });
    const note = FM.studyNote(), noteNode = createNode({ position: { x: nx, y: ny, z: nz }, rotation: { x: 0, y: 0, z: nLean } });
    addChild(noteNode, createNode({ geometry: note.back }), createNode({ geometry: note.face }));
    const lesson = FM.studyBoard(), lessonNode = createNode({ position: { x: bx, y: by, z: bz }, rotation: { x: bLean, y: 0, z: 0 } });
    addChild(lessonNode, createNode({ geometry: lesson.back }), createNode({ geometry: lesson.face }));
    addChild(stNode, noteNode, lessonNode);
    addChild(root, switchNode, rebNode, trNode, ckNode, lkNode, stNode);
    if (s.corner) addChild(root, kioskNode, boardNode);
    // The cooker's flying things, each an instanced batch of fixed capacity on its own geometry: the tips' cubes and the
    // bananas; and the lime ring that climbs the core as it takes a tip.
    s.cubeNode = createNode({ geometry: { ...FM.satCube() }, instanceData: new Float32Array(CUBE_CAP * 20), instanceCount: 0, instanceVersion: 0, fixedInstanceCapacity: true, sightHidden: true, visible: false });
    s.fruitNode = createNode({ geometry: { ...FM.flyingBanana() }, instanceData: new Float32Array(FRUIT_CAP * 20), instanceCount: 0, instanceVersion: 0, fixedInstanceCapacity: true, sightHidden: true, visible: false });
    s.limeRing = createNode({ position: { x: L.core.x, y: 0, z: L.core.z }, geometry: FM.coreRingLime(), visible: false, sightHidden: true });
    addChild(root, s.cubeNode, s.fruitNode, s.limeRing);
    s.cubes = { t: new Float32Array(CUBE_CAP).fill(-1), src: new Uint8Array(CUBE_CAP), jx: new Float32Array(CUBE_CAP), jy: new Float32Array(CUBE_CAP), jz: new Float32Array(CUBE_CAP), spin: new Float32Array(CUBE_CAP) };
    s.fruit = { t: new Float32Array(FRUIT_CAP).fill(-1), jx: new Float32Array(FRUIT_CAP), jy: new Float32Array(FRUIT_CAP), spin: new Float32Array(FRUIT_CAP) };
    // The throws: from the chamber's side facing the cooker, and in through the way out, into the mouth; from the
    // chute's lip straight up into the ceiling intake.
    const core = L.core, mx = ck.x + COOK.mouth[0], my = ck.y + COOK.mouth[1], mz = ck.z + COOK.mouth[2], bearing = Math.atan2(mz - core.z, mx - core.x), shieldZ = HALL.front - 0.6;
    s.tossCore = toss(core.x + Math.cos(bearing) * 2.9, 9, core.z + Math.sin(bearing) * 2.9, mx, my, mz, 11.2);
    s.tossGate = toss(0, LAYOUT.entrance.y + 1.6, shieldZ - 0.2, mx, my, mz, 9);
    s.tossOut = { sx: ck.x + COOK.lip[0], sy: ck.y + COOK.lip[1], sz: ck.z + COOK.lip[2], ey: ck.y + COOK.intakeY + 0.7, T: 0.9 };
    s.outYaw = 0;
    s.hatchW = { x: ck.x + COOK.hatch[0], y: ck.y + COOK.hatch[1] - 0.02, z: ck.z + COOK.hatch[2] };
    s.stackTop = { x: ck.x + COOK.stack[0], y: ck.y + COOK.stackTop + 0.1, z: ck.z + COOK.stack[1] };
    s.cookLight = { x: ck.x - 1.2, y: ck.y + 2.2, z: ck.z + 0.4 };
    s.lidLip = { x: ck.x - COOK.w / 2 - 0.05, y: ck.y + COOK.h + 0.05, z: ck.z };
    // Sats riding the conduits: one instanced batch of fixed capacity.
    // Two batches: gold sats, and red ones for a failed forward's sats coming back.
    const satGeo = { ...FM.sat() }, redGeo = { ...FM.satFailed() };
    s.satNode = createNode({ geometry: satGeo, instanceData: new Float32Array(SAT_CAP * 20), instanceCount: 0, instanceVersion: 0, fixedInstanceCapacity: true, sightHidden: true });
    s.redNode = createNode({ geometry: redGeo, instanceData: new Float32Array(SAT_CAP * 20), instanceCount: 0, instanceVersion: 0, fixedInstanceCapacity: true, sightHidden: true });
    s.satGeo = satGeo;
    s.redGeo = redGeo;
    addChild(root, s.satNode, s.redNode);
    s.sats = {
      bay: new Int8Array(SAT_CAP).fill(-1), dir: new Int8Array(SAT_CAP), next: new Int8Array(SAT_CAP), aim: new Int8Array(SAT_CAP), flags: new Uint8Array(SAT_CAP),
      t: new Float32Array(SAT_CAP), speed: new Float32Array(SAT_CAP), spin: new Float32Array(SAT_CAP)
    };
    s.paths = cond.paths;
    // Station targets, for tooltips and taps: each on a node that has geometry, since picking needs its bounds.
    const target = (node, kind, preset, radius, extra = {}) => {
      input.add(node, { kind, preset, ...extra }, { radius });
      targets.push(node);
    };
    target(s.chamber, "core", "core", 3.5);
    s.bays.forEach((b, i) => target(b.frame, "line", ["lineA", "lineB", "lineC", "lineD"][i], 3, { place: b }));
    target(s.forgeFire, "forge", "forge", 2.6);
    s.shafts.forEach((sh, i) => target(sh.rock, i ? "shaftOut" : "shaftIn", "forge", 2.6));
    target(switchBody, "switchboard", "switchboard", 3);
    target(rebBody, "rebalancer", "rebalancer", 2.8);
    target(trBody, "treasury", "treasury", 3);
    target(ckBody, "cooker", "cooker", 2.2);
    if (s.corner) {
      target(kioskBody, "kiosk", null, 1.6);
      target(boardBody, "board", null, 2.4);
    }
    target(lkBody, "lookout", "lookout", 3.5);
    target(stBody, "study", "study", 3.2);
    s.tunnels.forEach((t, i) => target(t.stone, "tunnel", ["lineA", "lineB", "lineC", "lineD"][i], 3, { place: s.bays[i] }));
    for (const g of s.gallery) target(g.stand, "galleries", "galleries", 1.2);
    // The way out: behind the balcony the tunnel runs on to the rim, the same tunnel the hub dresses its mouth
    // with, and the shield hangs across it at the balcony's back edge, the lab's phase plane humming as the one
    // outside does. Past the rim hangs the picture of the island the hub took on the way in, or with no visit
    // from the hub, the island drawn simply.
    const e = LAYOUT.entrance, tunnel = FM.exitTunnel(), view = world.factoryView;
    const mouth = createNode({ position: { x: 0, y: e.y, z: FM.EXIT_Z } }), exit = createNode({ geometry: tunnel.timber });
    addChild(root, mouth);
    addChild(mouth, createNode({ geometry: tunnel.rock }), exit, createNode({ geometry: tunnel.glow, sightHidden: true }), view
      ? createNode({ geometry: FM.outsideView(view, OUTSIDE_DISTANCE), position: { x: 0, y: 0, z: view.from + OUTSIDE_DISTANCE }, rotation: { x: 0, y: Math.PI, z: 0 }, sightHidden: true })
      : createNode({ geometry: tunnel.outside, sightHidden: true }));
    target(exit, "exit", null, 2.5);
    const gz = HALL.front - 0.6, gateGroup = createNode({ position: { x: 0, y: e.y, z: gz } });
    addChild(root, gateGroup);
    s.gate = { hum: 0, phase: BL.labPhase.create(gateGroup, { x: 0, z: gz, ry: 0, floorY: e.y, room: { w: 5, h: 4, from: 0, to: 6 } }, GATE_OPENING, 0) };
    return s;
  };

  // Gorillas in hard hats, each working its own deck: they pace near their station and beat their chests when
  // something happens there.
  const hireCrew = (s) => {
    const L = LAYOUT, hat = FM.hardHat();
    const worker = (x, y, z, radius, w, d, heading = 0) => {
      const cx = x, cz = z;
      const walkable = (fx, fz, nx, nz) => Math.abs(nx - cx) < w / 2 - 0.5 && Math.abs(nz - cz) < d / 2 - 0.5;
      const agent = BL.agent.create({ groundAt: () => y, walkable, form: "ape", x, z, heading, scale: 0.72 });
      addChild(agent.parts.head, createNode({ position: { x: 0, y: 0.6, z: 0.05 }, geometry: hat }));
      agent.pace(x, z, radius);
      addChild(root, agent.root);
      const g = { agent };
      s.crew.push(g);
      return g;
    };
    s.forgeCrew = worker(-2.4, 0, 4, 1.4, 6, 6, Math.PI);
    worker(2.6, 0, 5, 1.4, 6, 6, Math.PI);
    s.bays.forEach((b, i) => {
      const d = L.bays[i];
      b.gorilla = worker(FM.stationX(d) + (d.x < 0 ? 1.8 : -1.8), d.y, FM.stationZ(d) + 2.1, 0.6, d.w, d.d);
    });
    worker(L.switchboard.x, L.switchboard.y, L.switchboard.z + 0.9, 0.8, L.switchboard.w, L.switchboard.d, Math.PI);
    s.rebalanceCrew = worker(L.rebalancer.x + FM.REB.operator[0], L.rebalancer.y, L.rebalancer.z + FM.REB.operator[1], 0.25, L.rebalancer.w, L.rebalancer.d, Math.PI);
    worker(L.treasury.x + FM.TRE.operator[0], L.treasury.y, L.treasury.z + FM.TRE.operator[1], 0.6, L.treasury.w, L.treasury.d);
    s.cookCrew = worker(L.cooker.x + FM.COOK.operator[0], L.cooker.y, L.cooker.z + FM.COOK.operator[1], 0.35, L.cooker.w, L.cooker.d, -Math.PI / 2);
    worker(L.lookout.x + 1.8, L.lookout.y, L.lookout.z + 1.6, 0.8, L.lookout.w, L.lookout.d);
  };

  // Point lights, most important first so the lowest tier keeps them: the core, the forge, the four lines, the
  // switchboard, rebalancer, treasury and watchtower. Every other light shares the rest of the slots by nearness to
  // the view (`glowNear`), as the mine shares its lamps: the study, the tunnels, the balcony, the galleries and the
  // daylight at the rim, and every lantern, which throws a wide, soft, warm pool and flickers like a flame.
  const LIGHT = { core: 0, forge: 1, bay: 2, switchboard: 6, rebalancer: 7, treasury: 8, lookout: 9, tess: 10 }, FIXED = 11;
  const lamp = (i, x, y, z, radius, r, g, b) => {
    const o = i * 8, l = RENDER_OPTS.lights;
    l[o] = x; l[o + 1] = y; l[o + 2] = z; l[o + 3] = radius; l[o + 4] = r; l[o + 5] = g; l[o + 6] = b; l[o + 7] = 0;
  };
  const lightUp = () => {
    const L = LAYOUT;
    lamp(LIGHT.core, L.core.x, 8.3, L.core.z + 3.4, 26, 1, 0.62, 0.25);
    lamp(LIGHT.forge, L.forge.x, 1.9, L.forge.z + 1.6, 12, 1, 0.45, 0.15);
    L.bays.forEach((b, i) => lamp(LIGHT.bay + i, FM.stationX(b), b.y + 2.2, b.z + 1.6, 9, 0.55, 0.75, 1));
    lamp(LIGHT.switchboard, L.switchboard.x, L.switchboard.y + 2.2, L.switchboard.z + 0.8, 9, 0.35, 0.6, 1);
    lamp(LIGHT.rebalancer, L.rebalancer.x, L.rebalancer.y + 1.6, L.rebalancer.z + 0.6, 9, 0.35, 0.9, 1);
    lamp(LIGHT.treasury, L.treasury.x, L.treasury.y + 2, L.treasury.z + 1, 9, 1, 0.8, 0.35);
    lamp(LIGHT.lookout, L.lookout.x, L.lookout.y + L.lookout.tower + 1, L.lookout.z, 3, 1, 0.82, 0.45);
    lamp(LIGHT.tess, 0, 0, 0, 0, 0, 0, 0);
    const spot = RENDER_OPTS.spotLight, beam = FM.LOOKOUT_BEAM;
    spot[0] = L.lookout.x; spot[1] = L.lookout.y + L.lookout.tower + 1; spot[2] = L.lookout.z; spot[3] = 0;
    spot[4] = Math.cos(beam.pitch); spot[5] = Math.sin(beam.pitch); spot[6] = 0; spot[7] = Math.cos(beam.outer);
    spot[8] = 12; spot[9] = 9.84; spot[10] = 5.4; spot[11] = Math.cos(beam.inner);
    RENDER_OPTS.lightCount = Math.min(BL.glRenderer.POINT_LIGHT_CAPACITY, FIXED + lightPool().length / 8);
  };
  // The shared lights, [x, y, z, radius, r, g, b, flicker] each: flicker 0 is steady, otherwise the flame's phase.
  const LANTERN_GLOW = [1.3, 0.8, 0.36], LANTERN_REACH = 7.5;
  const lightPool = models.cached(() => {
    const L = LAYOUT, e = L.entrance, out = [];
    out.push(L.study.x + 1, L.study.y + 2.8, L.study.z, 6, 1, 0.75, 0.4, 0);
    L.tunnels.forEach((t, i) => {
      const rgb = math.hexToRgb(FM.TUNNEL_THEMES[i].ring);
      out.push(t.x + Math.sin(t.turn) * 2, t.y + 2.4, t.z + Math.cos(t.turn) * 2, 8, rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, 0);
    });
    out.push(0, e.y + 2.2, e.z - 4, 12, 1, 0.66, 0.3, 0);
    for (const g of L.galleries) out.push(g.x, g.y + 2, g.z + 1, 10, 1, 0.66, 0.3, 0);
    // Daylight falling in at the rim, so the tunnel's far end is lit the way the island lights it.
    out.push(0, e.y + 2.2, FM.EXIT_Z - 0.6, 9, 1.15, 1.1, 1, 0);
    for (const hung of [lighting().lights, dressing().lights]) {
      for (let i = 0; i < hung.length; i += 4) out.push(hung[i], hung[i + 1], hung[i + 2], LANTERN_REACH, ...LANTERN_GLOW, 1 + (i * 0.37) % 6);
    }
    return new Float32Array(out);
  });
  let poolScore = null;
  // The shared slots go to the lights nearest the view, nearest first, by repeated minimum: no sort, no list.
  const glowNear = (elapsed) => {
    const P = lightPool(), n = P.length / 8, t = pilot.orbit.target, Lt = RENDER_OPTS.lights;
    if (!poolScore) poolScore = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const o = i * 8, dx = P[o] - t.x, dy = P[o + 1] - t.y, dz = P[o + 2] - t.z;
      poolScore[i] = dx * dx + dy * dy * 2 + dz * dz;
    }
    for (let slot = FIXED; slot < RENDER_OPTS.lightCount; slot++) {
      let best = 0, bestD = Infinity;
      for (let i = 0; i < n; i++) if (poolScore[i] < bestD) { bestD = poolScore[i]; best = i; }
      poolScore[best] = Infinity;
      const o = best * 8, f = P[o + 7], k = f ? 0.9 + Math.sin(elapsed * 9.3 + f) * 0.06 + Math.sin(elapsed * 23.7 + f * 3.1) * 0.04 : 1, w = slot * 8;
      Lt[w] = P[o]; Lt[w + 1] = P[o + 1]; Lt[w + 2] = P[o + 2]; Lt[w + 3] = P[o + 3];
      Lt[w + 4] = P[o + 4] * k; Lt[w + 5] = P[o + 5] * k; Lt[w + 6] = P[o + 6] * k; Lt[w + 7] = 0;
    }
  };
  const LIGHT_BASE = new Float32Array(BL.glRenderer.POINT_LIGHT_CAPACITY * 8);

  // The crew's support and step test on the hall's floor: the highest surface within a step of the feet, clear of
  // what stands there, and never off an edge.
  const groundFor = (x, z, feet) => FM.supportAt(x, z, feet);
  // There is no banana pile in the hall. Space must jump even when the rifle needs ammunition.
  const reloadPolicy = { near: () => false, available: () => false };
  const walkableFor = (ax, az, bx, bz, y, height, actor) => FM.walkable(ax, az, bx, bz, y, actor.bodyRadius || 0.35, height);
  const ceilingFor = (x, z, feet, actor) => FM.stairCeilingAt(x, z, feet, actor.bodyRadius || 0.35);
  // In the air, keep the same obstacle clearance without requiring the floor to be within a step.
  const flyableFor = (ax, az, bx, bz, y, height, actor) => {
    const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.2)), radius = actor.bodyRadius || 0.35;
    for (let i = 1; i <= steps; i++) {
      if (!FM.clearAt(ax + (bx - ax) * i / steps, az + (bz - az) * i / steps, y, radius, height,
        ax + (bx - ax) * (i - 1) / steps, az + (bz - az) * (i - 1) / steps)) return false;
    }
    return true;
  };
  const resolveLanding = (actor, x, y, z) => {
    if (actor.ladder && actor.ladder.plane) return;
    const p = actor.root.position, feet = p.y - actor.baseY;
    if (!FM.resolveFall(p, x, z, y - actor.baseY, feet, actor.bodyRadius || 0.35)) return;
    const floor = FM.supportAt(p.x, p.z, feet);
    p.y = actor.baseY + Math.max(feet, floor);
    actor.hop = Math.max(0, feet - floor);
    if (actor.hop === 0 && actor.hopV < 0) actor.hopV = 0;
  };
  // Clip against the nearest shield before scenery behind it, then emit at the actual banana crossing.
  // Both paths reuse the mirrors' cached transforms and fixed ripple pools.
  const clipProjectileTarget = (from, to) => {
    let clipped = scene.gate.phase.ripples.absorb(from.x, from.y, from.z, to);
    for (const t of scene.tunnels) if (t.ripples.absorb(from.x, from.y, from.z, to)) clipped = true;
    return clipped;
  };
  const absorbProjectile = (ax, ay, az, point, dt) => {
    const gate = scene.gate.phase.ripples, bx = point.x, by = point.y, bz = point.z;
    let hit = gate.absorb(ax, ay, az, point) ? gate : null;
    for (const t of scene.tunnels) {
      if (t.ripples.absorb(ax, ay, az, point)) hit = t.ripples;
    }
    return !!hit && hit.cross(ax, ay, az, bx, by, bz, dt);
  };
  const feetOf = () => avatar ? avatar.root.position.y - avatar.baseY : 0;
  // Space by the kiosk steps up to its screen, as a tap on it does.
  const nearKiosk = (x, z, reach, feet) => {
    if (!scene.corner) return false;
    const [ux, uz] = FM.KIOSK.use;
    if (Math.abs(feet - LAYOUT.kiosk.y) > 0.6 || Math.hypot(x - ux, z - uz) > reach) return false;
    openBooth(scene);
    return true;
  };
  const peerPassage = (p) => {
    for (const t of LAYOUT.tunnels) {
      const dx = p.x - t.x, dz = p.z - t.z, c = Math.cos(t.turn), sn = Math.sin(t.turn);
      const across = dx * c - dz * sn, along = dx * sn + dz * c;
      if (Math.abs(across) < PEER_OPENING.maxX && along >= -0.5 && along <= 2.5
        && p.y >= t.y && p.y <= t.y + PEER_OPENING.ceilingY) return true;
    }
    return false;
  };

  const enter = (ctx) => {
    ({ renderer, game, world, go, agentPlay } = ctx);
    camera = createCamera({ fov: 55, near: 0.3, far: 150 });
    root = createNode();
    hud = hudMod.create({ roster: contributors.activeRoster, catalog: models.SWAG, tierColors: models.TIER_COLORS, renderIcon: hudMod.renderIcon, lootEnabled: ctx.lootEnabled });
    hud.setAreaLabel("LF");
    if (window.matchMedia("(max-width: 720px), (max-height: 500px)").matches) hud.el.sheet.dataset.open = "false";
    hooks = {};
    input = interactMod.create({ canvas: ctx.canvas, renderer, camera, hooks });
    const clampTarget = (p) => {
      if (peerPassage(p)) return;
      p.x = clamp(p.x, -HALL.halfW + 3, HALL.halfW - 3);
      p.y = clamp(p.y, 0.5, HALL.h - 3);
      p.z = clamp(p.z, HALL.back + 2.5, HALL.front - 2);
    };
    // Out of the walls, which lean in as they rise; only the tunnel out lets the eye nearer the front.
    const clampCamera = (p) => {
      if (peerPassage(p)) return;
      p.y = clamp(p.y, 0.6, HALL.h - 2);
      const lean = p.y / HALL.h * FM.WALL_LEAN;
      p.x = clamp(p.x, -HALL.halfW + 2 + lean, HALL.halfW - 2 - lean);
      p.z = clamp(p.z, HALL.back + 2 + lean, HALL.front - (Math.abs(p.x) < 6 ? 1.2 : 2 + lean));
    };
    pilot = pilotMod.create({
      renderer, canvas: ctx.canvas, camera, hud, presets: PRESETS, landing: "entrance", pitch: PITCH, dist: DIST,
      follow: FOLLOW, fly: FLY, clampTarget, clampCamera, ceilingAt: () => HALL.h - 2, coarse: COARSE, mayPossess,
      close: { eyeHeight: 1.1, eyeRatio: 0.95, eyeForward: 0.16, pitch: [-1.35, 1.35], trailingDist: 4, orbitDist: 5, maxStep: 0.6, groundAt: (x, z) => FM.supportAt(x, z, feetOf()) }
    });
    const tipFor = (hit) => {
      const o = hit.owner, tip = TIPS[o.kind];
      if (o.kind === "board") return COARSE ? "Banana donation board · tap to read it" : "Banana donation board · click to read it";
      if (o.kind === "greeter") return COARSE ? `${BL.factoryGreeter.NAME} the guide · tap to talk` : `${BL.factoryGreeter.NAME} the guide · Space to talk`;
      if (o.kind === "line" || o.kind === "tunnel") {
        const b = o.place, c = b.line && mock.snapshot.channels.find((ch) => ch.id === b.line);
        return o.kind === "line" ? `Channel ${b.letter}${c ? ` · peer ${c.peer}` : ""}` : `Peer tunnel${c ? ` · ${c.peer}` : ""}`;
      }
      return tip ? tip[0] : "";
    };
    // While a visitor works the kiosk, its screen takes the taps and the view stays put.
    const { onOrbit, onZoom, onDoubleTap } = pilot.hooks;
    Object.assign(hooks, {
      ...pilot.hooks,
      onHover: (hit, p) => {
        if (hit && !scene.booth.mode) hud.tooltip.show(tipFor(hit), p.x, p.y);
        else hud.tooltip.hide();
      },
      onHoverMove: (hit, p) => {
        if (!scene.booth.mode) hud.tooltip.show(tipFor(hit), p.x, p.y);
      },
      onTap: (hit, p) => {
        if (scene.booth.mode) return boothTap(scene, p);
        if (!hit) return;
        const o = hit.owner;
        if (o.kind === "exit") return leaveCave();
        if (o.kind === "kiosk") return openBooth(scene);
        if (o.kind === "board") return hud.openBoard(scene.boardView);
        if (o.kind === "greeter") return greeter.greet();
        if (o.preset) pilot.goPreset(o.preset);
        // The kiosk's and the board's words own up to simulated or test payments, asked now: the page's Worker can turn
        // real mode on after the visit has begun.
        const tip = TIPS[o.kind], net = donations.testNetwork;
        if (tip) hud.toast(!tip[2] || donations.real && !net ? tip[1] : `${tip[1]} ${net ? `Payments here are on ${net}, a test network, with coins that have no value.` : "Payments are simulated in this build."}`);
      },
      onOrbit: (dx, dy) => {
        if (!scene.booth.mode) onOrbit(dx, dy);
        else if (scene.booth.mode === WATCHING && (dx || dy)) leaveBooth(scene);
      },
      onZoom: (factor, gesture, px, py) => {
        if (!scene.booth.mode) onZoom(factor, gesture, px, py);
        else if (scene.booth.mode === WATCHING) leaveBooth(scene);
      },
      onDoubleTap: (hit, p) => {
        if (scene.booth.mode) boothTap(scene, p);
        else onDoubleTap(hit, p);
      }
    });
    hud.onPreset((name) => {
      endBooth(scene);
      pilot.goPreset(name);
    });
    hud.onAction((action) => {
      // A tip from the dialog closes it and turns the view to the show, so the tipper watches it cook.
      if (action === "tip" || action === "tip-legendary") {
        demoTip(action === "tip" ? 1200 : 120000);
        hud.closeFeed();
        endBooth(scene);
        pilot.goPreset("show");
      }
      // In real mode the dialog sends the tip to the kiosk: the view glides on to its glass from wherever it is.
      else if (action === "kiosk" && scene.corner && scene.booth.mode !== AT_KIOSK) {
        endBooth(scene);
        openBooth(scene);
      }
      else if (action === "reset") { game.resetAll(); location.reload(); }
      else if (action === "leave") leaveCave();
      else if (action === "reset-view") pilot.resetCamera();
      else if (action === "act") { if (!greeter || !greeter.act()) pilot.action(); }
      else if (action.startsWith("mode-")) pilot.modeAction(action);
      else if (action.startsWith("weapon-") || action === "magazine-swap") pilot.weaponAction(action);
    });
    // Tips from the hall: the island's donation dialog, its link and the visitor's name and message.
    const donationRequest = donations.createRequest(game.state);
    qr.drawTo(hud.el.qr, donationRequest.url, { quiet: 3, dark: "#000000", light: "#f3efe4" });
    hud.setDonationUrl(donationRequest.url);
    hud.setIdentity(game.state);
    hud.onIdentityChange(({ handle, message }) => {
      game.setIdentity({ handle: donations.sanitize(handle, donations.HANDLE_MAX), message: donations.sanitize(message, donations.MESSAGE_MAX) });
      hud.setIdentity(game.state);
    });
    hud.setStats(game.state);
    fx = fxMod.create({ root, input, hooks, hud, game, world, renderer, camera, overlay: ctx.overlay, tickerAt: { x: 0, y: 14, z: -4 } });
    dust = BL.dressing.motes({ count: 240, span: 22, low: 0.5, high: 16 });
    addChild(root, dust.node);
    const dressed = dressing(), lit = lighting();
    addChild(root, ...BL.dressing.nodes(dressed, { glow: 1 }), createNode({ geometry: lit.frame }), createNode({ geometry: lit.glass, sightHidden: true }));
    scene = build();
    scene.donationLink = donationRequest.url;
    showMode(scene);
    hireCrew(scene);
    // Whoever walked in stays themselves: their Ooga stands on the balcony facing the core, under the visitor's
    // control. A page that opens here takes `character=` instead, as the island does. With nobody, the view stays
    // free.
    const asked = ctx.from === null ? new URLSearchParams(location.search).get("character")?.trim().toLowerCase() : null;
    const named = asked ? contributors.roster.find((c) => c.name.toLowerCase() === asked) : null;
    const returningOwn = pilot.loginViewRestored && BL.net.ownCharacter();
    const picked = returningOwn ? contributors.roster.find(c => c.name === returningOwn.handle)
      : named || world.pilot && contributors.roster.find((c) => c.name === world.pilot) || null;
    const playerName = picked && !BL.net.mayDrive(picked.name) ? picked.name : null;
    world.pilot = null;
    if (playerName) {
      // Keep the visitor's weapons and magazines across the doorway. The
      // factory has no banana pile, so its private pile level stays zero.
      playerWorld = { level: 0, weapons: world.weapons, magazine: world.magazine };
      const shared = { root, input, hud, game, world: playerWorld, playerName, fx, viewYaw: 0, outsideActors: () => remotes ? remotes.actors() : NO_ACTORS, outsideActorHeight: BL.remotePlayers.BODY_HEIGHT, groundAt: groundFor, walkable: walkableFor, flyable: flyableFor, ceilingAt: ceilingFor, ladders: LAYOUT.ladders, onBodyMove: resolveLanding, clipProjectileTarget, absorbProjectile, reloadPolicy, useNear: (x, z, reach, feet) => {
        if (nearKiosk(x, z, reach, feet)) return true;
        // Space talks to the guide when she offers it (she flies, so she judges her reach); on a ladder, or anywhere
        // else, it stays the visitor's own.
        return !!greeter && !(avatar && avatar.ladder && avatar.ladder.plane) && greeter.useNear(x, z, reach);
      } };
      shared.onModelChange = () => {
        if (!avatar) return;
        scene.gate.phase.body.refresh(avatar.root);
        for (const t of scene.tunnels) t.body.refresh(avatar.root);
      };
      people = shared.crew = BL.crew.create(shared);
      world.weapons = playerWorld.weapons;
      world.magazine = playerWorld.magazine;
      pilot.bind(shared);
      avatar = people.cavemen.get(playerName);
      if (pilot.loginViewRestored) {
        Object.assign(avatar.root.position, { x: ARRIVAL.position.x, y: ARRIVAL.position.y + avatar.baseY, z: ARRIVAL.position.z });
        avatar.root.rotation.y = ARRIVAL.yaw + Math.PI;
      }
      pilot.possess(avatar);
      people.selectWeapon(avatar.weapon.selectedSlot, avatar);
      // An arrival, as on the island: the Ooga stands a step inside the gate facing the core and the view starts
      // settled over its shoulder, never sweeping in from wherever the new camera began.
      if (!pilot.loginViewRestored) pilot.navigate(ARRIVAL);
      scene.gate.phase.body.track(avatar.root, avatar.traits.height * 2, Math.max(avatar.headOpen.verts.length, avatar.headClosed.verts.length));
      for (const t of scene.tunnels) t.body.track(avatar.root, avatar.traits.height * 2, Math.max(avatar.headOpen.verts.length, avatar.headClosed.verts.length));
    }
    unsubscribeAccount = BL.net.subscribe(accountChanged);
    // Other signed-in players in the hall, as the Oogas they drive.
    remotes = BL.remotePlayers.create({ root, crew: people });
    // The driven Ooga's own footsteps, heard by this page alone (footsteps.js).
    footsteps = BL.footsteps.create();
    lightUp();
    LIGHT_BASE.set(RENDER_OPTS.lights);

    // The page's one factory node: the show the island's window was showing goes on in here, with every line
    // standing where the node has placed it.
    shared = BL.factoryFeed.node(world);
    feed = shared.feed;
    mock = shared.mock;
    shared.bays.forEach((p, i) => {
      const b = claimBay(scene, i, p.line);
      b.state = p.state;
      b.build = p.state === "active" || p.state === "dismantling" ? 1 : 0;
    });
    shared.stands.forEach((p) => placeIn(scene, p));
    unsubscribe = feed.subscribe(onEvent);
    refreshBoards(scene);
    leaving = false;
    actPrompt = false;
    greeter = BL.factoryGreeter.create({ parent: root, input, fx, feed,
      visitor: () => people && people.player === avatar ? avatar : null,
      demoRunning: () => feed.reading.contract === "obl.factory.demo.v1" || feed.reading.contract === null && !!shared.mock, coarse: COARSE, camera, quality: () => renderer.quality });
    // With no Ooga the visitor cannot talk to the guide: a hint points them to the island to pick one.
    if (!avatar) hud.hint(`${BL.factoryGreeter.NAME} the guide gives tours here — pick an Ooga on the island first`);
    // Sent from the island's dialog to tip: on to the kiosk's glass at the first frame, once the pilot has placed the view.
    scene.toKiosk = !pilot.loginViewRestored && ctx.place === "kiosk" && scene.corner;

    factoryScene.root = root;
    factoryScene.camera = camera;
    factoryScene.input = input;
    factoryScene.debug = {
      hud, camera, controls: pilot.controls, pilot, crew: people, cavemen: people ? people.cavemen : null, demoTip, fx,
      factory: { node: shared, feed, mock, greeter, get scene() { return scene; }, simulate(seconds, dt = 1 / 30) { for (let t = 0; t < seconds; t += dt) shared.tick(dt); } }
    };
  };

  // Cross only the actual glass plane, using the movement segment so a long
  // step retains its overshoot. Emerging points face out and cannot bounce back
  // until the player turns and physically crosses the destination again.
  const peerPortal = (s, previousX, previousY, previousZ) => {
    if (people.player !== avatar) return;
    const p = avatar.root.position;
    for (let i = 0; i < s.tunnels.length; i++) {
      const t = s.tunnels[i], at = t.at, c = Math.cos(at.turn), sn = Math.sin(at.turn), dx = p.x - at.x, dz = p.z - at.z;
      const px = previousX - at.x, pz = previousZ - at.z;
      const from = px * sn + pz * c - PEER_PLANE, to = dx * sn + dz * c - PEER_PLANE;
      if (from < -1e-7 || to > 0 || from - to < 1e-8) continue;
      const fraction = from / (from - to), across = (px + (dx - px) * fraction) * c - (pz + (dz - pz) * fraction) * sn;
      const feet = previousY + (p.y - previousY) * fraction - avatar.baseY - at.y;
      if (across < PEER_OPENING.minX || across > PEER_OPENING.maxX || feet < PEER_OPENING.floorY - 0.12 || feet + avatar.bodyHeight > PEER_OPENING.ceilingY) continue;
      const m = t.transform, x = p.x, z = p.z, vx = avatar.leap.vx, vz = avatar.leap.vz;
      p.x = m[0] * x + m[8] * z + m[12]; p.y += m[13]; p.z = m[2] * x + m[10] * z + m[14];
      avatar.root.rotation.y += t.yaw;
      if (avatar.root.quaternion) {
        math.quat.fromEuler(PEER_ROTATION, 0, t.yaw, 0);
        math.quat.multiply(avatar.root.quaternion, PEER_ROTATION, avatar.root.quaternion);
      }
      avatar.leap.vx = m[0] * vx + m[8] * vz; avatar.leap.vz = m[2] * vx + m[10] * vz;
      pilot.transformView(m, t.yaw);
      t.crossings++;
      return;
    }
  };

  // Per frame, allocation-free: the stream, then every animated part eased toward what it last heard.
  // The forge's lines, a frame at a time. A queued cart comes up the left shaft once the last is clear of it, rolls
  // out and down the track, slows at the forge and goes into the fire, shrinking as it goes; the forge takes it with
  // a flash: its sign turns once, white, the light flares and two gold rings run out over the arch in a spray of
  // sparks. A queued coin is minted first: the sign spins three times, then the coin rolls out of the fire on a cyan
  // flash and away down the right line, trailing sparks, into its shaft, which lights as it goes.
  const forgeLines = (s, dt) => {
    const [inLine, outLine] = FM.forgeLines(), waves = FM.forgeWave();
    s.inGap -= dt;
    for (let i = 0; i < s.carts.length && s.inQueue > 0 && s.inGap <= 0; i++) {
      const c = s.carts[i];
      if (c.active) continue;
      c.active = true;
      c.d = 0;
      c.v = 0.6;
      c.node.visible = true;
      s.inQueue--;
      s.inGap = CART_GAP;
      s.shaftGlow[0] = 1;
    }
    for (let i = 0; i < s.carts.length; i++) {
      const c = s.carts[i];
      if (!c.active) continue;
      const left = inLine.length - c.d;
      c.v += Math.max(-2 * dt, Math.min(2 * dt, (left < 3 ? 1.3 : 2.4) - c.v));
      c.d += c.v * dt;
      if (c.d >= inLine.length) {
        c.active = false;
        c.node.visible = false;
        forgeFlash(s, 0, waves.gold, SPARKS);
        continue;
      }
      lineAt(inLine, c.d, AT);
      const k = Math.min(1, (inLine.length - c.d) / CONSUME), e = k * k * (3 - 2 * k), n = c.node;
      n.position.x = FIRE.x + (AT.x - FIRE.x) * e;
      n.position.y = FIRE.y + (AT.y - FIRE.y) * e;
      n.position.z = FIRE.z + (AT.z - FIRE.z) * e;
      n.rotation.y = AT.yaw;
      n.rotation.x = -AT.pitch;
      n.scale.x = n.scale.y = n.scale.z = 0.1 + 0.9 * e;
    }
    if (s.outQueue > 0 && s.mintT < 0 && s.coinD < 0) {
      s.outQueue--;
      s.mintT = 0;
      s.signTurn += Math.PI * 6;
      s.signPulse = 1;
    }
    if (s.mintT >= 0 && (s.mintT += dt) >= MINT_SPIN) {
      s.mintT = -1;
      s.coinD = 0;
      s.coinV = 0.3;
      s.coin.visible = true;
      forgeFlash(s, 1, waves.cyan, SPARKS_CYAN);
    }
    if (s.coinD >= 0) {
      s.coinV = Math.min(2.1, s.coinV + 1.6 * dt);
      s.coinD += s.coinV * dt;
      const d = outLine.length - s.coinD, c = s.coin;
      if (d <= 0) {
        s.coinD = -1;
        c.visible = false;
      } else {
        lineAt(outLine, d, AT);
        const k = Math.min(1, 0.2 + s.coinD / 0.9);
        c.position.x = AT.x;
        c.position.y = AT.y + (FM.COIN_R + 0.14) * k;
        c.position.z = AT.z;
        c.rotation.y = AT.yaw + Math.PI;
        c.rotation.x += s.coinV * dt / FM.COIN_R;
        c.scale.x = c.scale.y = c.scale.z = k;
        if (d < 4) s.shaftGlow[1] = 1;
        if ((s.trail -= dt) <= 0 && AT.y > -0.3) {
          s.trail = 0.06;
          fx.spawnParticle(SPARKS[s.coinD * 7 % 3 | 0], AT.x, 0.2, AT.z, (Math.random() - 0.5) * 0.6, 0.8 + Math.random() * 0.8, (Math.random() - 0.5) * 0.6, 0.7, 5, 2.5);
        }
      }
    }
    // The sign turns off what it owes, fastest at the start, and swells with a flash.
    const sign = s.forgeSign, fs = FM.forgeSign(), turn = Math.min(s.signTurn, dt * (3 + s.signTurn * 2.2));
    s.signTurn -= turn;
    sign.rotation.y = (sign.rotation.y + turn) % (Math.PI * 2);
    s.signPulse = Math.max(0, s.signPulse - dt * 1.5);
    sign.scale.x = sign.scale.y = sign.scale.z = 1 + 0.3 * Math.sin(s.signPulse * Math.PI);
    const signGeo = s.flash > 0.25 || s.mintT >= 0 ? fs.white : s.forgeHeat > 0 ? fs.hot : fs.warm;
    if (sign.geometry !== signGeo) sign.geometry = signGeo;
    if (s.waveT >= 0) {
      s.waveT += dt;
      for (let i = 0; i < s.waves.length; i++) {
        const p = (s.waveT - i * 0.16) / 0.6, w = s.waves[i];
        w.visible = p > 0 && p < 1;
        if (!w.visible) continue;
        const r = 1.95 + 1.25 * (1 - (1 - p) * (1 - p));
        w.scale.x = w.scale.y = r;
        w.scale.z = 1 - p * 0.6;
      }
      if (s.waveT > 0.8) s.waveT = -1;
    }
    s.flash = Math.max(0, s.flash - dt * 1.3);
    for (let i = 0; i < s.shafts.length; i++) {
      s.shaftGlow[i] = Math.max(0, s.shaftGlow[i] - dt * 0.8);
      const sh = FM.forgeShafts()[i].glow, geo = s.shaftGlow[i] > 0.2 ? sh.bright : sh.dim;
      if (s.shafts[i].glow.geometry !== geo) s.shafts[i].glow.geometry = geo;
    }
  };
  // The surge, a frame at a time: three rings of light climb the chamber one after another, swelling as they go, and
  // each coil's arc flickers between its shapes, while the surge fades.
  const surgeFrame = (s, dt) => {
    if (s.surgeT < 0) return;
    s.surgeT += dt;
    s.surge = Math.max(0, s.surge - dt * 0.9);
    const [lo, hi] = LAYOUT.core.chamber;
    for (let i = 0; i < s.coreRings.length; i++) {
      const p = (s.surgeT - i * 0.2) / 0.9, r = s.coreRings[i];
      r.visible = p > 0 && p < 1;
      if (!r.visible) continue;
      r.position.y = lo - 0.2 + (hi - lo + 0.8) * p * (2 - p);
      r.scale.x = r.scale.z = 1 + 0.12 * Math.sin(p * Math.PI);
      r.scale.y = 1 + 0.6 * (1 - p);
    }
    const arcs = FM.teslaArcs(), live = s.surgeT < (s.surge > 1 ? 1.5 : 1.1);
    for (let i = 0; i < s.arcs.length; i++) {
      const a = s.arcs[i], k = Math.floor(s.surgeT / 0.06 + i) % 3;
      a.visible = live && k !== 2;
      if (a.geometry !== arcs[i][k]) a.geometry = arcs[i][k];
    }
    if (s.surgeT > 1.6) {
      s.surgeT = -1;
      for (let i = 0; i < s.arcs.length; i++) s.arcs[i].visible = false;
    }
  };
  // The forge taking a cart (kind 0, gold) or minting a coin (kind 1, cyan).
  const forgeFlash = (s, kind, wave, sparks) => {
    s.flash = 1;
    s.flashKind = kind;
    s.waveT = 0;
    s.signPulse = 1;
    if (!kind) s.signTurn += Math.PI * 2;
    for (let i = 0; i < s.waves.length; i++) s.waves[i].geometry = wave;
    fx.burst(FIRE.x, 1.3, LAYOUT.forge.z + 1.2, 18, sparks, 3.2);
  };

  const update = (dt, elapsed) => {
    const s = scene;
    const previousX = avatar ? avatar.root.position.x : 0, previousY = avatar ? avatar.root.position.y : 0, previousZ = avatar ? avatar.root.position.z : 0;
    pilot.readInput(dt);
    if (people) people.update(dt, elapsed);
    pilot.update(dt);
    if (s.real !== donations.real || s.net !== donations.testNetwork) showMode(s);
    if (s.toKiosk) {
      s.toKiosk = false;
      openBooth(s);
    }
    boothFrame(s, dt);
    // The Ooga driven here goes to the room with where it stands and its health; other players here are shown.
    const drivenHere = people && people.player;
    BL.net.setBody(drivenHere ? drivenHere.traits.name : null);
    if (drivenHere) {
      const p = drivenHere.root.position;
      BL.net.sendPose(p.x, p.y - drivenHere.baseY, p.z, drivenHere.root.rotation.y);
      BL.net.setHealth(drivenHere.health.value, drivenHere.health.stunned);
    }
    remotes.update(dt);
    footsteps.update(drivenHere);
    // Cut the vault and inward-leaning walls away so the outer decks stay visible.
    // Restore them only after the birdseye blend fully returns, including reversals.
    s.ceiling.visible = s.walls.visible = !pilot.birdsEye && pilot.birdsEyeMix === 0;
    // The gate's shield hums, and shows the outline of whoever walks through it.
    const g = s.gate;
    g.phase.update(dt, elapsed);
    g.phase.body.update(dt);
    g.phase.body.time = g.phase.ripples.time;
    g.hum -= dt;
    if (g.hum <= 0) {
      g.hum = 0.1 + Math.random() * 0.22;
      g.phase.ripples.pulse(GATE_OPENING.minX + Math.random() * (GATE_OPENING.maxX - GATE_OPENING.minX), Math.random() * GATE_OPENING.ceilingY, 0);
    }
    // The peer tunnels' shields hum in their blue.
    for (let i = 0; i < s.tunnels.length; i++) {
      const t = s.tunnels[i];
      t.ripples.update(dt, elapsed);
      t.body.update(dt);
      t.body.time = t.ripples.time;
      t.hum -= dt;
      if (t.hum <= 0) {
        t.hum = 0.16 + Math.random() * 0.3;
        t.ripples.pulse(PEER_OPENING.minX + Math.random() * (PEER_OPENING.maxX - PEER_OPENING.minX), PEER_OPENING.floorY + Math.random() * (PEER_OPENING.ceilingY - PEER_OPENING.floorY), 0);
      }
    }
    shared.tick(dt);
    dust.update(elapsed, pilot.orbit.target.x, pilot.orbit.target.z);
    for (let i = 0; i < s.crew.length; i++) s.crew[i].agent.update(dt);
    // Out through the gate: walked into it, or flown into it with the free view.
    if (!leaving) {
      const driven = pilot.player, p = driven ? driven.root.position : camera.position, y = p.y - (driven ? driven.baseY : 0) - LAYOUT.entrance.y;
      const inOpening = p.x >= GATE_OPENING.minX && p.x <= GATE_OPENING.maxX && y >= GATE_OPENING.floorY - 0.12 && y < GATE_OPENING.ceilingY;
      if (driven) {
        if (inOpening && p.z > HALL.front - 1.3) leaveCave();
        else peerPortal(s, previousX, previousY, previousZ);
      } else if (!avatar) {
        const a = pilot.controls.read();
        if (inOpening && Math.hypot(a.x, a.y) > 0.05 && p.z > HALL.front - 2.2) leaveCave();
      }
    }
    const node = feed.reading.node, signal = feed.signal, running = node === "ready" || node === "starting";
    // The core: eased toward lit while the node runs, flickering as it starts, dark when it has stopped.
    const want = node === "ready" ? 1 : node === "starting" ? 0.45 + Math.sin(elapsed * 23) * 0.25 : 0;
    s.glow += (want - s.glow) * Math.min(1, dt * 3);
    const cc = FM.coreChamber(), chamberGeo = s.glow > 0.35 ? s.surge > 0.45 ? cc.surge : s.lime > 0.4 ? cc.lime : cc.lit : cc.dark;
    if (s.chamber.geometry !== chamberGeo) s.chamber.geometry = chamberGeo;
    surgeFrame(s, dt);
    limeFrame(s, dt);
    glowNear(elapsed);
    const L = RENDER_OPTS.lights, B = LIGHT_BASE;
    const pulse = 0.85 + Math.sin(elapsed * 2.1) * 0.08, co = LIGHT.core * 8, white = Math.min(1, s.surge), lime = Math.min(1, s.lime) * (1 - white);
    for (let k = 4; k < 7; k++) L[co + k] = ((B[co + k] * (1 - white * 0.5) + white * 0.5) * (1 - lime) + LIME[k - 4] * lime) * (0.12 + s.glow * pulse + s.surge * 2.2 + lime * 1.2);
    // The forge: hot while a line is opened or closed; carts come up to it and coins go down from it.
    s.forgeHeat = Math.max(0, s.forgeHeat - dt);
    const ff = FM.forgeFire(), fire = s.forgeHeat > 0 || s.flash > 0 ? ff.hot : ff.warm;
    if (s.forgeFire.geometry !== fire) s.forgeFire.geometry = fire;
    forgeLines(s, dt);
    const fo = LIGHT.forge * 8, cool = s.flashKind === 1 ? s.flash : 0, heat = (s.forgeHeat > 0 ? 1.4 + Math.sin(elapsed * 17) * 0.2 : 0.7) + 2.6 * s.flash;
    L[fo + 4] = (B[fo + 4] * (1 - cool) + 0.4 * cool) * heat;
    L[fo + 5] = (B[fo + 5] * (1 - cool) + 0.85 * cool) * heat;
    L[fo + 6] = (B[fo + 6] * (1 - cool) + cool) * heat;
    // The featured lines: their stations always stand; a line being built or taken down shows in its status lantern and
    // its light, and its capacitors flash and sputter.
    const caps = FM.capacitor(), statusLit = FM.statusLantern();
    for (let i = 0; i < s.bays.length; i++) {
      const b = s.bays[i];
      if (b.state === "building") b.build = Math.min(1, b.build + dt / 12);
      else if (b.state === "dismantling") b.build = Math.max(0.15, b.build - dt / 12);
      else if (b.state === "active") b.build = Math.min(1, b.build + dt);
      else b.build = Math.max(0, b.build - dt);
      const k = b.build;
      b.flashL = Math.max(0, b.flashL - dt);
      b.sputter = Math.max(0, b.sputter - dt);
      const blue = b.flashL > 0 && running ? caps.blue.lit : caps.blue.dim;
      const orange = b.sputter > 0 && Math.sin(b.sputter * 40) > 0 ? caps.orange.lit : caps.orange.dim;
      if (b.capL.geometry !== blue) b.capL.geometry = blue;
      if (b.capR.geometry !== orange) b.capR.geometry = orange;
      const status = b.state === "active" || b.state === "building" ? statusLit.ok : statusLit.alert;
      if (b.status.geometry !== status) b.status.geometry = status;
      const o = (LIGHT.bay + i) * 8, boost = (b.flashL > 0 ? 1.6 : 0.6) * (0.2 + 0.8 * k);
      for (let c = 4; c < 7; c++) L[o + c] = B[o + c] * boost;
    }
    const gc = FM.galleryCaps();
    for (let i = 0; i < s.gallery.length; i++) {
      const g = s.gallery[i];
      g.flashL = Math.max(0, g.flashL - dt);
      const geo = g.flashL > 0 ? gc.lit : gc.dim;
      if (g.caps.geometry !== geo) g.caps.geometry = geo;
      g.node.visible = !!g.line;
    }
    // The switchboard, the rebalancer and the treasury.
    s.switchBusy = Math.max(0, s.switchBusy - dt);
    const sc = FM.switchScreens(), screens = s.switchBusy > 0 ? sc.busy : sc.calm;
    if (s.screens.geometry !== screens) s.screens.geometry = screens;
    s.spin = Math.max(0, s.spin - dt);
    const rr = FM.rebalancerRing(), ring = s.spin > 0 ? rr.on : rr.off, rf = FM.rebalancerFlow(), flow = s.spin > 0 ? rf.on : rf.off;
    if (s.ring.geometry !== ring) s.ring.geometry = ring;
    if (s.flow.geometry !== flow) s.flow.geometry = flow;
    s.ring.rotation.y += dt * (s.spin > 0 ? 5 : 0.4);
    for (let k = 4; k < 7; k++) L[LIGHT.rebalancer * 8 + k] = B[LIGHT.rebalancer * 8 + k] * (s.spin > 0 ? 1.5 : 0.5);
    // The belt lifts each nugget from the chute to over the crate, where it drops in and the crate's gold rises.
    for (let i = 0; i < BELT_CAP; i++) {
      const t = s.nuggetT[i];
      if (t < 0) continue;
      const n = s.nuggets[i], next = t + dt / BELT_TIME;
      if (next >= 1) {
        s.nuggetT[i] = -1;
        n.visible = false;
        s.hopper = Math.min(1, s.hopper + 0.05);
        continue;
      }
      s.nuggetT[i] = next;
      n.position.y = BELT[0][1] + (BELT[1][1] - BELT[0][1]) * next + 0.1;
      n.position.z = BELT[0][2] + (BELT[1][2] - BELT[0][2]) * next;
      n.rotation.y = next * 2.4;
    }
    if (s.hopper >= 1) s.hopper = 0;
    s.fill.position.y = 0.1 + s.hopper * 0.55;
    // The heap under the glass grows with the public capacity, as far as the glass allows.
    const capacityScale = Math.min(0.9, (0.6 + Math.log10(Math.max(1e6, mock.snapshot.capacity) / 1e6) * 0.35) * 0.8);
    s.pile.scale.x = s.pile.scale.z = capacityScale;
    s.pile.scale.y = capacityScale * 0.9;
    // The cooker, on the tips its board counts.
    cookerFrame(s, dt, elapsed, running);
    // The watchtower: the beam sweeps while the feed is live; silent, the lamp goes out.
    const live = signal === "live";
    const ll = FM.lookoutLamp(), lampGeo = live ? ll.on : ll.off;
    if (s.lamp.geometry !== lampGeo) s.lamp.geometry = lampGeo;
    s.beam.visible = live;
    s.lamp.rotation.y += dt * 0.9;
    const spot = RENDER_OPTS.spotLight, beam = FM.LOOKOUT_BEAM, horizontal = Math.cos(beam.pitch);
    spot[3] = live ? beam.range : 0;
    spot[4] = Math.cos(s.lamp.rotation.y) * horizontal;
    spot[5] = Math.sin(beam.pitch);
    spot[6] = -Math.sin(s.lamp.rotation.y) * horizontal;
    for (let k = 4; k < 7; k++) L[LIGHT.lookout * 8 + k] = B[LIGHT.lookout * 8 + k] * (live ? 1 : 0.08);
    // Sats: in along a conduit to the core, then out along another to the line the forward left by, or back.
    const q = s.sats, data = s.satNode.instanceData, red = s.redNode.instanceData;
    let count = 0, reds = 0;
    for (let i = 0; i < SAT_CAP; i++) {
      if (q.bay[i] < 0) continue;
      q.t[i] += dt * q.speed[i] * q.dir[i];
      if (q.dir[i] > 0 && q.t[i] >= 1) {
        if ((q.flags[i] & (BIG | LEAD)) === (BIG | LEAD)) surge(s, q.flags[i]);
        if (q.aim[i] >= 0) s.bays[q.aim[i]].sputter = SPUTTER;
        if (q.next[i] < 0) { q.bay[i] = -1; continue; }
        q.bay[i] = q.next[i];
        q.dir[i] = -1;
        q.t[i] = 1;
      } else if (q.dir[i] < 0 && q.t[i] <= 0) {
        const b = s.bays[q.bay[i]];
        if (q.flags[i] & FAILED) b.sputter = SPUTTER;
        else b.flashL = FLASH;
        q.bay[i] = -1;
        continue;
      }
      if (q.t[i] < 0 || q.t[i] > 1) continue;
      const bi = q.bay[i], path = s.paths[bi], u = q.t[i] * CONDUIT_SAMPLES, j = Math.min(CONDUIT_SAMPLES - 1, Math.floor(u)), f = u - j, a = j * 3;
      SAT_POS.x = path[a] + (path[a + 3] - path[a]) * f;
      SAT_POS.y = path[a + 1] + (path[a + 4] - path[a + 1]) * f;
      SAT_POS.z = path[a + 2] + (path[a + 5] - path[a + 2]) * f;
      SAT_ROT.y = q.spin[i] + elapsed * 3;
      const size = (q.flags[i] & BIG ? 1.12 : 1) + Math.sin(q.t[i] * Math.PI) * 0.2;
      SAT_SCALE.x = SAT_SCALE.y = SAT_SCALE.z = size;
      mat4.fromTRS(SAT_M, SAT_POS, SAT_ROT, SAT_SCALE);
      const back = q.flags[i] & FAILED && q.dir[i] < 0, out = back ? red : data, at = (back ? reds++ : count++) * 20;
      out.set(SAT_M, at);
      out[at + 16] = 1; out[at + 17] = 0.4; out[at + 18] = 0; out[at + 19] = 0;
    }
    s.satNode.instanceCount = count;
    s.satNode.visible = count > 0;
    s.satNode.instanceVersion++;
    s.redNode.instanceCount = reds;
    s.redNode.visible = reds > 0;
    s.redNode.instanceVersion++;
    s.refreshAt -= dt;
    if (s.refreshAt <= 0) {
      s.refreshAt = 1;
      refreshBoards(s);
    }
    greeter.update(dt, elapsed);
    greeter.light(RENDER_OPTS.lights, LIGHT.tess * 8);
    // The act button talks to the guide in reach, starts the picked tour or skips a line ahead, or, within the
    // kiosk's hint reach, donates, the way the hub shows ENTER ARCADE by its door; the pilot's own label returns once
    // the offer is gone. The guide comes first, as the button tries the guide before the kiosk.
    const actLabel = avatar && (greeter.actLabel() || (s.booth.near && !s.booth.mode && people.player === avatar ? "DONATE!" : null));
    if (actLabel) { hud.setAct(actLabel); actPrompt = true; }
    else if (actPrompt) { actPrompt = false; pilot.showAct(); }
    stepTweens(dt);
    fx.update(dt, elapsed);
    hud.updateBoard(elapsed);
  };
  // Over the frame: the other players' names, then the kiosk's flow on its glass.
  const drawExtra = (ctx2d, project) => {
    remotes.drawNames(ctx2d, project);
    drawBooth(ctx2d);
  };
  const overlay = (dt) => fx.drawOverlay(dt, drawExtra);

  const leave = () => {
    // A visitor at the kiosk steps away first, and a tip of theirs still on its screen goes into the cooker.
    endBooth(scene);
    // Whoever walked in walks back out as themselves: the island takes the same Ooga back at this mouth.
    world.pilotDetached = !pilot.player;
    world.pilot = pilot.player ? pilot.player.traits.name : null;
    greeter.dispose();
    greeter = null;
    unsubscribe();
    unsubscribe = null;
    settleCooker(scene);
    unsubscribeAccount();
    unsubscribeAccount = null;
    BL.net.setBody(null);
    for (const node of [scene.switchLabel]) if (node.owned) {
      renderer.releaseGeometry(node.face.geometry);
      renderer.releaseGeometry(node.back.geometry);
    }
    for (const g of scene.crew) g.agent.dispose();
    scene.gate.phase.dispose();
    for (const t of scene.tunnels) { t.ripples.dispose(); t.body.dispose(); }
    // Save the carry/combat choice while the controlled actor still exists.
    pilot.dispose();
    remotes.dispose();
    remotes = null;
    footsteps.dispose();
    footsteps = null;
    if (people) people.dispose();
    fx.dispose();
    for (const node of targets) input.remove(node);
    targets.length = 0;
    while (root.children.length) removeChild(root, root.children[root.children.length - 1]);
    const count = input.targetCount;
    input.dispose();
    hud.closeBoard();
    hud.dispose();
    scene = shared = feed = mock = hud = hooks = input = pilot = fx = agentPlay = dust = people = avatar = playerWorld = null;
    factoryScene.input = factoryScene.debug = null;
    return { targets: count };
  };
  // Geometry kept off the graph but swapped in when something flashes, so it stays on the GPU.
  const liveGeometry = (set) => {
    for (const pair of [FM.coreChamber(), FM.forgeFire(), FM.forgeSign(), FM.forgeWave(), FM.switchScreens(), FM.rebalancerRing(), FM.rebalancerFlow(), FM.lookoutLamp(), FM.galleryCaps(), FM.capacitor().blue, FM.capacitor().orange, FM.cookerPort()]) {
      for (const k in pair) set.add(pair[k]);
    }
    for (const sh of FM.forgeShafts()) set.add(sh.glow.dim).add(sh.glow.bright);
    for (const shapes of FM.teslaArcs()) for (const g of shapes) set.add(g);
    if (scene) {
      for (const g of scene.crew) g.agent.liveGeometry(set);
      scene.gate.phase.liveGeometry(set);
    }
    if (avatar) set.add(avatar.headOpen).add(avatar.headClosed);
    if (greeter) greeter.liveGeometry(set);
    if (remotes) remotes.liveGeometry(set);
  };
  const stats = () => {
    let nodes = 0;
    traverseVisible(root, () => nodes++);
    const all = (n) => 1 + n.children.reduce((sum, c) => sum + all(c), 0);
    return { visibleNodes: nodes, allNodes: all(root), tweens: tweenCount(), targets: input.targetCount, ...fx.stats(), ...(remotes ? remotes.stats() : {}), feed: feed ? { ...feed.counts } : null, cooker: scene ? cookerStats(scene) : null };
  };

  const factoryScene = {
    // Voice zone: the Factory group, which its tunnel on the island shares (`factory`).
    voiceZone: "factory.hall",
    micKey: true,
    id: "factory", enter, update, overlay, onDonation, previewDonation, onSeen, onKey, onLootCleared, renderOpts: RENDER_OPTS, leave, stats, liveGeometry,
    root: null, camera: null, input: null, debug: null, agent: null, agentView: null, agentControls: null, agentHandoff: null,
    get inMotion() {
      return !!scene;
    }
  };
  BL.scenes = BL.scenes || {};
  BL.scenes.factory = factoryScene;
})();
