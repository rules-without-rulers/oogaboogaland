// Tess on the island (her rig is `tess.js`). She works the island's own machines with her beam; a few seconds after a
// visitor lands, while they are still taking in the view they landed on, she notices them and comes to them, in front
// of their view and to one side, or ahead of the Ooga they drive. One who moves the view or their Ooga first is busy
// with the island, and she leaves them be. A visitor who is not signed in gets a quick look round the island; a signed-in one, once the page knows who
// they are, gets what is new since their last visit in this browser, and nothing at all when nothing is. A tour stops
// at each landmark: the view glides there each time the visitor goes on (the camera moves only on input), and she flies
// ahead and points her soft beam at it. She greets once a page, and offers the island tour unasked only until this
// browser has answered it; a tap on her brings it at any time. The view is the visitor's again when the tour ends.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const NAME = "Tess";
  const LINES = {
    greeting: "Hi! I'm Tess. New here? Want a quick look round the island?",
    again: "Want a look round the island?",
    declined: "No problem! Tap me any time for a tour.",
    pile: "This is the pile. Donations become bananas for the crew.",
    crew: "Every Ooga stands for one of the crew's contributors.",
    jumbotron: "The jumbotron shows the crew's activity, live.",
    totems: "The totems light up when Bitcoin Core, BTCPay, LND or CLN merge a PR.",
    timechain: "Out west, the Timechain Sphere: nine rooms behind one door.",
    timechainWalls: "Walk over the bridge and pick a room at the keypad: 1 to 3 are normal sized, 4 to 6 bigger, 7 to 9 biggest.",
    timechainBoards: "Inside, a wall of live block and mining charts, and the holdings desk.",
    timechainSani: "Sani's in every room in his recliner. Signed in, you share a room with whoever picks the same number.",
    bca: "B.C.A., Banana Certified Accounting: the island's own accounting office.",
    bcaInside: "Gorillas walk in through its veil, put on suits and count the bananas at two walnut desks.",
    bcaMotto: "Abacuses, ledger screens, filing cabinets. Their motto: count bananas, keep receipts, build in public.",
    lab: "EntropyLab, the crew's lab. Donated bananas feed the Oogas who work there.",
    labInside: "Inside: dice to roll, cards to flip, flasks to stir and an air-gapped node.",
    labCrew: "Oogas who contributed lately are at work; the quiet ones chill or sleep.",
    bifrost: "Up the north pass, ₿IFRÖST: windows to other worlds.",
    factory: "The Lightning Factory: a live Lightning node, shown in 3D. My home!",
    factoryLines: "Each line is a channel. Payments ride through the core as glowing sats.",
    factoryForge: "The forge opens and closes channels on-chain, and tips at the kiosk come out as bananas.",
    arcade: "Ooga Arcade: games, tickets and prizes.",
    mempool: "The vine bridge leads to the Mempool island: the live Bitcoin mempool.",
    mempoolWeather: "Arriving transactions make its weather, from dry to downpour.",
    mempoolLake: "Everything waiting fills its lake. A deep backlog floods the shore and spills over the cliffs.",
    mempoolBlock: "Each block strikes lightning and drops a cube of the lake into the chamber below.",
    mempoolChamber: "Down there, wall paintings read the chain out. Walk in through the hill by the bridge.",
    done: "That's the island! Off you go, and come find me any time.",
    newsDone: "That's what's new! Have fun out there.",
    cancelled: "All good. Back to work!",
    newsSphereRooms: "The Timechain Sphere has nine rooms now. Pick one at the keypad by its doors!",
    newsBca: "New at 10 o'clock: B.C.A., Banana Certified Accounting. Suited gorillas count the bananas!",
    newsMainland: "You can tip from right here now, no trip to the Factory. Your bananas fly out of its roof tube onto the pile!",
    newsPanels: "The Bananas, Oogas and Chat panels have one new look, and the Bananas panel ranks the top donors.",
    newsOnchain: "The kiosk takes tips on-chain now, as well as over Lightning, and tells you when yours confirms.",
    newsDonations: "New in the Factory: a donation kiosk. Your sats come out as bananas!",
    newsArcadeFront: "Ooga Arcade has a brand-new front.",
    newsTotems: "The totems now light up for a day after Bitcoin Core, BTCPay, LND or CLN merge a PR.",
    newsChat: "Ooga Chat is open: it's the last pull tab on the island's drawer.",
    newsTess: "And me! I fly round the Factory now, and give tours there.",
    newsVoice: "Voice now follows you into every cave, with health bars and online dots.",
    newsDsb: "Through ₿IFRÖST, DSB Land has jetpacks and open exploring now.",
    newsRainforest: "The Mempool island is a rainforest now, round a lake as deep as the backlog.",
    newsShared: "The island is shared now: signed in, you see other players and can talk.",
    newsPoker: "Through ₿IFRÖST's poker window: Banana Poker.",
    newsBifrost: "₿IFRÖST is open: walk through the arch to other worlds.",
    newsArcade: "Ooga Arcade opened: games, tickets and prizes.",
    newsFactory: "The Lightning Factory opened: a Lightning node at work.",
    newsTimechain: "The Timechain Sphere opened out west. Walk inside!"
  };
  // The island tour, one stop a landmark: where the view looks from (`eye`) and at (`look`), and the lines she says
  // there. She hovers between the view and the landmark, off to its right, and her beam lands on `look`.
  const STOPS = [
    { id: "pile", title: "The pile", eye: [6, 8, 11], look: [0, 1.2, 0], lines: ["pile", "crew"] },
    { id: "totems", title: "Jumbotron and totems", eye: [7, 8, 7], look: [0, 5, 26], lines: ["jumbotron", "totems"] },
    { id: "timechain", title: "Timechain Sphere", eye: [-15, 16, 4], look: [-42, 5, 17], lines: ["timechain", "timechainWalls", "timechainBoards", "timechainSani"] },
    { id: "bca", title: "B.C.A.", eye: [-11, 9.5, -6.5], look: [-19, 4.5, -11], lines: ["bca", "bcaInside", "bcaMotto"] },
    { id: "lab", title: "EntropyLab", eye: [-6.5, 9.5, -11], look: [-11, 4.5, -19], lines: ["lab", "labInside", "labCrew"] },
    { id: "bifrost", title: "₿IFRÖST", eye: [3, 11, -8], look: [0, 9, -34], lines: ["bifrost"] },
    { id: "factory", title: "Lightning Factory", eye: [11, 9.5, -6.5], look: [19, 4.5, -11], lines: ["factory", "factoryLines", "factoryForge"] },
    { id: "arcade", title: "Ooga Arcade", eye: [10, 7, 3], look: [22, 4, 0], lines: ["arcade"] },
    { id: "mempool", title: "Mempool island", eye: [24, 14, 4], look: [46, 6, 16], lines: ["mempool", "mempoolWeather", "mempoolLake", "mempoolBlock", "mempoolChamber"] }
  ];
  // What is new on the island, newest first: the day it shipped, the stop it is shown at (none for what is everywhere)
  // and her line. A new feature worth showing a returning visitor is one entry here, added at the top: a visitor's news
  // is everything listed above the newest entry they were last offered.
  const NEWS = [
    { date: "2026-10-19", at: "timechain", line: "newsSphereRooms" },
    { date: "2026-10-18", at: "bca", line: "newsBca" },
    { date: "2026-10-17", at: "pile", line: "newsMainland" },
    { date: "2026-10-17", at: null, line: "newsPanels" },
    { date: "2026-10-16", at: "factory", line: "newsOnchain" },
    { date: "2026-10-15", at: "factory", line: "newsDonations" },
    { date: "2026-10-13", at: "arcade", line: "newsArcadeFront" },
    { date: "2026-10-12", at: "totems", line: "newsTotems" },
    { date: "2026-10-12", at: null, line: "newsChat" },
    { date: "2026-10-10", at: "factory", line: "newsTess" },
    { date: "2026-10-07", at: null, line: "newsVoice" },
    { date: "2026-10-07", at: "bifrost", line: "newsDsb" },
    { date: "2026-10-05", at: "mempool", line: "newsRainforest" },
    { date: "2026-10-03", at: null, line: "newsShared" },
    { date: "2026-10-02", at: "bifrost", line: "newsPoker" },
    { date: "2026-09-29", at: "bifrost", line: "newsBifrost" },
    { date: "2026-09-29", at: "arcade", line: "newsArcade" },
    { date: "2026-09-26", at: "factory", line: "newsFactory" },
    { date: "2026-09-25", at: "timechain", line: "newsTimechain" }
  ];
  // A first signed-in visit in this browser has no last visit to count from: it sees this many of the newest.
  const FIRST_NEWS = 5;
  // Where she works with nobody to guide, near the plaza, where a newcomer looks first: hovering at `at`, her working
  // beam on `aim`.
  const WORK = [
    { at: [2.6, 3.6, 2.8], aim: [0.6, 0.9, 0.6] },
    { at: [2.4, 7.6, 24.6], aim: [0.6, 6.6, 28.2] },
    { at: [5.6, 6.6, 16.4], aim: [7.6, 5.6, 18.3] },
    { at: [7, 3, 5.6], aim: [8.8, 0.5, 7.4] },
    { at: [-2.8, 5.2, 17], aim: [-4.6, 4.2, 19.3] }
  ];
  const NOTICE_AFTER = 2.5, OFFER_TIME = 12, GLIDE = 1.8, RETURN = 1.2, VISITS = "ooga-tess-visits", TOURED = "ooga-tess-tour";
  // The view counts as moved past half a metre or about three degrees, after a second to settle on arrival and on an
  // Ooga handed to the visitor (the island hands a signed-in contributor their own).
  const SETTLE = 1, MOVED = 0.5, TURNED = 0.05;
  const pose = () => ({ x: 0, y: 0, z: 0, yaw: 0, pitch: 0 });
  // A stop's view: its eye, heading at its look.
  const viewOf = (stop, out) => {
    const dx = stop.look[0] - stop.eye[0], dy = stop.look[1] - stop.eye[1], dz = stop.look[2] - stop.eye[2];
    out.x = stop.eye[0]; out.y = stop.eye[1]; out.z = stop.eye[2];
    out.yaw = Math.atan2(dx, dz); out.pitch = Math.atan2(dy, Math.hypot(dx, dz));
    return out;
  };
  const VIEWS = STOPS.map((stop) => viewOf(stop, pose()));
  // How far to the view's side she can hover `ahead` metres out and still be in it: 65% of the way to the screen's edge,
  // so a narrow (portrait) screen keeps her in view. The camera's field of view is vertical.
  const sideRoom = (camera, ahead) => 0.65 * ahead * Math.tan(camera.fov / 2) * innerWidth / innerHeight;
  // Where she hovers at a stop: half way from the view to the landmark, up to 2.2 m to the view's right (less on a
  // narrow screen), a little up. Laid for the screen's shape as a tour starts.
  const SPOTS = STOPS.map(() => [0, 0, 0]);
  const laySpots = (camera) => {
    STOPS.forEach((stop, i) => {
      const dx = stop.look[0] - stop.eye[0], dz = stop.look[2] - stop.eye[2], d = Math.hypot(dx, dz), side = Math.min(2.2, sideRoom(camera, d * 0.5));
      SPOTS[i][0] = stop.eye[0] + dx * 0.5 - dz / d * side;
      SPOTS[i][1] = stop.eye[1] + (stop.look[1] - stop.eye[1]) * 0.5 + 0.4;
      SPOTS[i][2] = stop.eye[2] + dz * 0.5 + dx / d * side;
    });
  };
  // A tour is a list of legs, each a stop (-1: where the visitor is) with its title and what she says there: its
  // lines, each starting a new bubble, and the line each bubble belongs to (`lineAt`), for her beam.
  const legOf = (stop, title, ids) => ({ stop, title, text: ids.map((id) => LINES[id]).join("\n"),
    lineAt: ids.flatMap((id) => BL.fx.beatsOf(LINES[id]).map(() => id)) });
  const ISLAND = STOPS.map((stop, i) => legOf(i, stop.title, stop.lines));
  // Lines about something beside a stop's landmark: while she says one she faces the middle of what the place hands
  // her under that name (`targets`) and points a beam at each of them at once, then goes back to the landmark.
  const POINT_AT = { totems: "totems", newsTotems: "totems" };
  // What is new after `seen`, the newest entry last answered (its `line` and `date`; null for none yet, which gets the
  // newest few): every entry listed above it, so one added later the same day still counts. If that entry has left the
  // list, every entry dated after it.
  const freshAfter = (seen) => {
    if (!seen) return NEWS.slice(0, FIRST_NEWS);
    const at = NEWS.findIndex((n) => n.line === seen.line);
    return at >= 0 ? NEWS.slice(0, at) : NEWS.filter((n) => n.date > seen.date);
  };
  // News as legs: what is everywhere first, said where the visitor is, then each place in the island tour's order, the
  // newest of its news first.
  const legsOf = (fresh) => {
    const legs = [], here = fresh.filter((n) => !n.at).map((n) => n.line);
    if (here.length) legs.push(legOf(-1, "All over the island", here));
    STOPS.forEach((stop, i) => {
      const lines = fresh.filter((n) => n.at === stop.id).map((n) => n.line);
      if (lines.length) legs.push(legOf(i, stop.title, lines));
    });
    return legs;
  };
  // The newest entry offered to each signed-in login in this browser. Kept in localStorage only; anything unreadable there
  // counts as none.
  const DAY = /^\d{4}-\d{2}-\d{2}$/;
  const visits = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(VISITS) || "{}");
      if (saved && typeof saved === "object" && !Array.isArray(saved)) return saved;
    } catch { /* Unreadable: no visits. */ }
    return {};
  };
  // The newest entry a login has answered her about, or null for none. News counts as seen once the visitor answers her
  // offer (Show me or Not now), so news they ignored, or were too busy to be offered, waits for the next visit.
  const lastSeen = (login) => {
    const seen = visits()[login];
    return seen && typeof seen.line === "string" && typeof seen.date === "string" && DAY.test(seen.date) ? seen : null;
  };
  const markSeen = (login, entry) => {
    const all = visits();
    all[login] = { line: entry.line, date: entry.date };
    try { localStorage.setItem(VISITS, JSON.stringify(all)); } catch { /* A private window keeps no visits. */ }
  };
  // Whether this browser has answered her island tour, Show me or Not now: a visitor who is not signed in is then not
  // offered it again unasked. Kept in localStorage only; anything unreadable there counts as not yet.
  const toured = () => {
    try { return localStorage.getItem(TOURED) === "1"; } catch { return false; }
  };
  const markToured = () => {
    try { localStorage.setItem(TOURED, "1"); } catch { /* Storage unavailable: she offers it again next visit. */ }
  };
  // Under debug, `tessnews=YYYY-MM-DD` plays the signed-in greeting as if the visitor's last visit were that day: the
  // news from that day on.
  const DEBUG_NEWS = (() => {
    const params = new URLSearchParams(location.search), day = params.get("tessnews");
    return params.get("debug") === "1" && day && DAY.test(day) ? day : null;
  })();

  const create = ({ parent, input, fx, camera, pilot, visitor, world, hud, busy, coarse, quality, landing, targets = {} }) => {
    const rig = BL.tess.create({ parent, input, fx, camera, kind: "tess", coarse, quality }), position = rig.position;
    const state = {
      phase: "work", stage: "beam", timer: 3, site: 0, seen: 0, again: false, kind: "island", legs: ISLAND, welcome: null,
      stop: -1, arrived: false, closing: null, holding: false, tourGuest: false, glide: 0, glideTime: GLIDE,
      login: null, newest: null, still: landing, settle: SETTLE, driven: null
    };
    const spot = { x: 0, y: 0, z: 0 }, home = pose(), from = pose(), to = pose();
    position.x = WORK[0].at[0]; position.y = WORK[0].at[1]; position.z = WORK[0].at[2];
    // The offer and the tour's controls live on screen, in the HUD's wood, built for the visit and removed on leave.
    const panel = document.createElement("div");
    panel.className = "greeter-menu";
    panel.hidden = true;
    const heading = document.createElement("p");
    heading.className = "greeter-menu-title";
    const go = document.createElement("button"), skip = document.createElement("button");
    go.type = skip.type = "button";
    go.className = skip.className = "greeter-choice";
    const row = document.createElement("div"), help = document.createElement("p");
    row.className = "greeter-row";
    help.className = "greeter-menu-help";
    row.append(go, skip);
    panel.append(heading, row, help);
    document.body.append(panel);
    go.addEventListener("click", () => { go.blur(); forward(); });
    skip.addEventListener("click", () => { skip.blur(); back(); });
    const show = (phase) => {
      state.phase = phase;
      panel.hidden = phase !== "offer" && phase !== "tour";
      panel.classList.toggle("greeter-tour", phase === "tour");
      const news = state.kind === "news";
      if (phase === "offer") {
        heading.textContent = news ? `${NAME} · what's new` : `${NAME} · island guide`;
        go.textContent = "Show me"; skip.textContent = "Not now";
        help.textContent = coarse ? "Tap to choose" : "Enter starts · Esc closes";
      } else if (phase === "tour") {
        heading.textContent = `${news ? "What's new" : "Island tour"} · ${state.stop + 1} / ${state.legs.length}\n${state.legs[state.stop].title}`;
        label(); skip.textContent = "End tour";
        help.textContent = coarse ? "Tap to go on" : "Enter or → goes on · Esc ends";
      }
    };
    // Next goes on through what she says at a stop before it moves on: Finish only on the last stop's last bubble.
    const label = () => {
      go.textContent = state.stop === state.legs.length - 1 && !(state.arrived && rig.more) ? "Finish" : "Next";
    };
    const say = (id) => rig.say(LINES[id]);
    // What she says at a stop, a bubble at a time: each goes on by itself, Next skips ahead, and the last stays up
    // until the tour moves on.
    const tell = () => { rig.say(state.legs[state.stop].text, true); label(); };
    // Flying to the visitor or a tour's stop she keeps her own pace `base` close by, and goes faster from far off, so
    // the trip takes about COME_TIME however far out the view is.
    const COME_TIME = 2.5, COME_MAX = 60;
    const pace = (base, x, y, z) => Math.max(base, Math.min(COME_MAX, Math.hypot(x - position.x, y - position.y, z - position.z) / COME_TIME));
    // A flight to (x, y, z) over an arc: up from where she is, over, and down onto it.
    const flyTo = (x, y, z, speed, track = false) => {
      const d = Math.hypot(x - position.x, z - position.z), rise = Math.max(2, Math.min(8, d * 0.25));
      rig.clearPath(speed, 1.2);
      if (d > 3) rig.push((position.x + x) / 2, Math.max(position.y, y) + rise, (position.z + z) / 2);
      rig.push(x, y, z);
      if (track) rig.track();
    };
    const toWork = () => {
      let site = state.site;
      while (site === state.site) site = Math.floor(Math.random() * WORK.length);
      state.site = site;
      const w = WORK[site].at;
      flyTo(w[0], w[1], w[2], 4);
      state.stage = "fly";
      show("work");
    };
    // In front of the view and to its right, a little below its middle; or ahead of the Ooga the visitor drives, off to
    // its right at head height, where the view over its shoulder shows her.
    const placeBy = () => {
      const actor = visitor();
      if (actor) {
        const p = actor.root.position, ax = Math.sin(actor.root.rotation.y), az = Math.cos(actor.root.rotation.y);
        spot.x = p.x - az + ax * 1.8; spot.z = p.z + ax + az * 1.8; spot.y = p.y - actor.baseY + (actor.bodyHeight || 1.2) * 0.8;
        return;
      }
      const e = camera.position, t = camera.target, fx0 = t.x - e.x, fy0 = t.y - e.y, fz0 = t.z - e.z, f = Math.hypot(fx0, fy0, fz0) || 1;
      const rx = -fz0, rz = fx0, r = Math.hypot(rx, rz) || 1, side = Math.min(1.5, sideRoom(camera, 4.2));
      spot.x = e.x + fx0 / f * 4.2 + rx / r * side; spot.y = e.y + fy0 / f * 4.2 - 0.35; spot.z = e.z + fz0 / f * 4.2 + rz / r * side;
    };
    // Who the visitor is, once the page knows: the signed-in account, or none.
    const account = () => DEBUG_NEWS ? { login: "you", display: "you" } : BL.net.state.me;
    // The visit's one greeting: the island tour for a visitor who is not signed in, until this browser has answered it;
    // for a signed-in one, what is new since their last visit here, or no greeting at all when nothing is.
    const greet = () => {
      world.tessGreeted = true;
      const me = account();
      if (!me) { if (toured()) return; state.kind = "island"; state.legs = ISLAND; state.welcome = null; notice(); return; }
      const fresh = DEBUG_NEWS ? NEWS.filter((n) => n.date >= DEBUG_NEWS) : freshAfter(lastSeen(me.login));
      if (!fresh.length) return;
      const count = fresh.length;
      state.kind = "news"; state.legs = legsOf(fresh); state.login = DEBUG_NEWS ? null : me.login; state.newest = fresh[0];
      state.welcome = `Welcome back, ${me.display || me.login}! ${count === 1 ? "One new thing" : `${count} new things`} since you were last here. Want to see?`;
      notice();
    };
    const notice = () => { rig.flare(); show("notice"); state.timer = 1.1; };
    const approach = () => { placeBy(); flyTo(spot.x, spot.y, spot.z, pace(6, spot.x, spot.y, spot.z), true); show("approach"); };
    const offer = (text) => {
      state.timer = OFFER_TIME;
      state.tourGuest = state.kind === "island" && !account();
      rig.clearPath(3, 1); rig.push(spot.x, spot.y, spot.z); rig.track();
      rig.nod(); show("offer"); rig.say(text);
    };
    // The view's pose, read and written as an eye and a heading, eased by smoothstep with the heading turning the
    // short way round.
    const readPose = (out) => {
      const p = camera.position, t = camera.target, dx = t.x - p.x, dy = t.y - p.y, dz = t.z - p.z;
      out.x = p.x; out.y = p.y; out.z = p.z;
      out.yaw = Math.atan2(dx, dz); out.pitch = Math.atan2(dy, Math.hypot(dx, dz));
    };
    // Whether the visitor is still on the view they landed on. The camera moves only on input, and follows the Ooga
    // they drive, so a moved view is a visitor who has started on the island. Once moved, it stays so for the visit.
    const landed = pose(), looking = pose();
    const watchStill = (dt) => {
      const actor = visitor();
      if (actor !== state.driven) { state.driven = actor; state.settle = SETTLE; }
      if (state.settle > 0) { state.settle -= dt; readPose(landed); return; }
      readPose(looking);
      let turn = Math.abs(looking.yaw - landed.yaw);
      if (turn > Math.PI) turn = 2 * Math.PI - turn;
      if (Math.hypot(looking.x - landed.x, looking.y - landed.y, looking.z - landed.z) > MOVED || turn > TURNED
        || Math.abs(looking.pitch - landed.pitch) > TURNED) state.still = false;
    };
    const putPose = (a, b, k) => {
      const e = k * k * (3 - 2 * k), yaw = a.yaw + Math.atan2(Math.sin(b.yaw - a.yaw), Math.cos(b.yaw - a.yaw)) * e;
      const pitch = a.pitch + (b.pitch - a.pitch) * e, cp = Math.cos(pitch), p = camera.position, t = camera.target;
      p.x = a.x + (b.x - a.x) * e; p.y = a.y + (b.y - a.y) * e; p.z = a.z + (b.z - a.z) * e;
      t.x = p.x + Math.sin(yaw) * cp; t.y = p.y + Math.sin(pitch); t.z = p.z + Math.cos(yaw) * cp;
    };
    const glideTo = (view, time) => {
      readPose(from);
      to.x = view.x; to.y = view.y; to.z = view.z; to.yaw = view.yaw; to.pitch = view.pitch;
      state.glide = 0; state.glideTime = time;
    };
    // A leg at a stop glides the view there while she flies ahead, and her lines start once she is there; one where the
    // visitor is keeps the view and her by them, and she starts at once.
    const visit = (index) => {
      const leg = state.legs[index];
      state.stop = index; state.arrived = leg.stop < 0;
      if (leg.stop >= 0) {
        glideTo(VIEWS[leg.stop], GLIDE);
        const s = SPOTS[leg.stop];
        flyTo(s[0], s[1], s[2], pace(10, s[0], s[1], s[2]));
        rig.hush();
      } else glideTo(home, GLIDE);
      show("tour");
      if (state.arrived) tell();
    };
    // The tour takes the view and the pilot as the island's chalkboard does: inactive, the pilot lets go of held keys
    // and stops the driven Ooga's steering, fire and swing, so nothing walks on through the tour. Both come back, with
    // fresh controls, once the view is home.
    const hold = () => {
      pilot.setActive(false); pilot.controls.reset(); input.reset();
      pilot.setExternalControl(true);
      state.holding = true;
      document.body.classList.add("tess-touring");
    };
    const release = () => {
      pilot.setExternalControl(false);
      pilot.setActive(true); pilot.controls.reset(); input.reset();
      state.holding = false;
      document.body.classList.remove("tess-touring");
    };
    // The tour keeps where the view was, to give it back.
    const startTour = () => {
      laySpots(camera);
      readPose(home);
      hold();
      if (document.pointerLockElement) document.exitPointerLock();
      visit(0);
    };
    // The view glides home and she flies back to the visitor, and says her last line once she is there.
    const endTour = (line) => {
      rig.hush();
      glideTo(home, RETURN);
      state.closing = line; state.arrived = false;
      placeBy(); flyTo(spot.x, spot.y, spot.z, pace(10, spot.x, spot.y, spot.z), true);
      show("returning");
    };
    // An answer to her offer, Show me or Not now, counts its news as seen, or the island tour as answered; an offer she
    // got no answer to waits for the next visit.
    const answered = () => {
      if (state.kind === "news" && state.login) { markSeen(state.login, state.newest); state.login = null; }
      else if (state.tourGuest) markToured();
    };
    // The panel's two buttons and their keys: on, and back out.
    const forward = () => {
      if (state.phase === "offer") {
        // Another actor or panel may have taken the controls since she offered. Leave its control and unread news alone.
        if (busy()) { toWork(); return; }
        answered(); startTour();
      }
      else if (state.phase === "tour") {
        // What she is saying here comes first, a bubble at a time.
        if (state.arrived && rig.next()) { label(); return; }
        if (state.stop === state.legs.length - 1) endTour(state.kind === "news" ? "newsDone" : "done");
        else visit(state.stop + 1);
      }
    };
    const back = () => {
      if (state.phase === "offer") { answered(); say("declined"); toWork(); }
      else if (state.phase === "tour") endTour("cancelled");
    };
    // Escape waves her off while she comes over or offers, and ends a tour, before the island's own Escape.
    const escape = () => {
      if (state.phase === "notice" || state.phase === "approach") { toWork(); return true; }
      if (state.phase === "offer" || state.phase === "tour") { back(); return true; }
      return state.phase === "returning" && state.holding;
    };
    // A tap on her at work brings her over with the island tour; her rings flare and she nods at once, so the tap
    // shows before she arrives.
    const tap = () => {
      if (state.phase !== "work" || busy()) return;
      world.tessGreeted = true;
      state.kind = "island"; state.legs = ISLAND; state.again = true;
      rig.flare(); rig.nod();
      placeBy(); flyTo(spot.x, spot.y, spot.z, pace(6, spot.x, spot.y, spot.z), true);
      show("approach");
    };
    const captureKey = (e) => {
      if (state.phase !== "offer" && state.phase !== "tour" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key !== "Enter" && e.key !== "ArrowRight") return;
      const target = e.target;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable || target.closest && target.closest("dialog"))) return;
      e.preventDefault(); e.stopImmediatePropagation();
      if (!e.repeat) forward();
    };
    window.addEventListener("keydown", captureKey, true);
    const update = (dt, elapsed) => {
      const actor = visitor();
      if (state.still && (state.phase === "work" || state.phase === "notice" || state.phase === "approach")) watchStill(dt);
      // A greeting she started is dropped, without a word, when the visitor gets going first; one they asked for by a
      // tap is not.
      if (!state.still && !state.again && (state.phase === "notice" || state.phase === "approach")) { world.tessGreeted = false; toWork(); }
      switch (state.phase) {
        case "work":
          if (state.stage === "fly") {
            if (rig.steer(dt)) { state.stage = "beam"; state.timer = 6 + Math.random() * 4; }
            break;
          }
          // A newcomer gets a moment to look round, and to see her at work, before she notices them; she waits until
          // the page knows whether they are signed in.
          state.seen = world.tessGreeted || !state.still || busy() || !BL.net.state.resolved && !DEBUG_NEWS ? 0 : state.seen + dt;
          if (state.seen > NOTICE_AFTER) { greet(); if (state.phase !== "work") break; }
          if ((state.timer -= dt) <= 0) {
            if (state.stage === "beam") { state.stage = "rest"; state.timer = 0.6; }
            else toWork();
          }
          break;
        case "notice":
          if ((state.timer -= dt) <= 0) approach();
          break;
        case "approach":
          placeBy(); rig.setLast(spot.x, spot.y, spot.z); rig.steer(dt);
          if (rig.lastPoint && Math.hypot(spot.x - position.x, spot.y - position.y, spot.z - position.z) < 0.5) {
            offer(state.welcome || LINES[state.again ? "again" : "greeting"]);
            state.again = false; state.welcome = null;
          }
          break;
        case "offer":
          placeBy(); rig.setLast(spot.x, spot.y, spot.z); rig.steer(dt);
          // Her offer stands for a while once she has finished asking.
          if (rig.said && (state.timer -= dt) <= 0) { say("declined"); toWork(); }
          break;
        case "tour": {
          // Where the visitor is, she keeps by them; at a stop, she flies there and starts once she is nearly in place.
          const at = state.legs[state.stop].stop;
          if (at < 0) { placeBy(); rig.clearPath(3, 1); rig.push(spot.x, spot.y, spot.z); rig.track(); }
          rig.steer(dt);
          if (!state.arrived && rig.lastPoint && Math.hypot(SPOTS[at][0] - position.x, SPOTS[at][1] - position.y, SPOTS[at][2] - position.z) < 1.5) {
            state.arrived = true;
            tell();
          }
          // Once she has said it all, the tour goes on by itself: to the next stop, or home after the last.
          else if (state.arrived && rig.said) forward();
          break;
        }
        case "returning":
          placeBy(); rig.setLast(spot.x, spot.y, spot.z); rig.steer(dt);
          if (!state.arrived) {
            if (rig.lastPoint && Math.hypot(spot.x - position.x, spot.y - position.y, spot.z - position.z) < 1.5) { state.arrived = true; say(state.closing); }
          } else if (rig.said) toWork();
          break;
      }
      // The view: gliding to a stop, held there, and gliding home, written after the pilot's own every frame; home, it is
      // the visitor's again.
      if (state.holding) {
        state.glide = Math.min(1, state.glide + dt / state.glideTime);
        putPose(from, to, state.glide);
        if (state.phase === "returning" && state.glide >= 1) release();
      }
      // What she shows: her working beam on the machine she works, her pointing beam on a stop's landmark once she is
      // there, otherwise she watches the visitor: their Ooga, or the view.
      const working = state.phase === "work" && state.stage === "beam", at = state.phase === "tour" ? state.legs[state.stop].stop : -1;
      rig.mode = working ? 1 : at >= 0 && rig.onLastLeg ? 2 : 0;
      if (working) { const a = WORK[state.site].aim; rig.aim.x = a[0]; rig.aim.y = a[1]; rig.aim.z = a[2]; }
      else if (rig.mode === 2) {
        // At a stop, the landmark; through a line about something beside it, a beam to each of those at once.
        const speech = rig.speech, line = state.arrived && speech ? state.legs[state.stop].lineAt[speech.beat] : null;
        const list = line && POINT_AT[line] ? targets[POINT_AT[line]] : null;
        rig.aims = list && list.length ? list : null;
        if (rig.aims) {
          let x = 0, y = 0, z = 0;
          for (let i = 0; i < list.length; i++) { x += list[i].x; y += list[i].y; z += list[i].z; }
          rig.aim.x = x / list.length; rig.aim.y = y / list.length; rig.aim.z = z / list.length;
        } else { const a = STOPS[at].look; rig.aim.x = a[0]; rig.aim.y = a[1]; rig.aim.z = a[2]; }
      }
      rig.steady = state.phase === "offer" || state.phase === "tour" && at < 0;
      rig.calm = rig.steady || state.phase === "tour";
      rig.watching = state.phase !== "work";
      if (actor) { const p = actor.root.position; rig.watch.x = p.x; rig.watch.y = p.y - actor.baseY + (actor.bodyHeight || 1.2) * 0.8; rig.watch.z = p.z; }
      else { rig.watch.x = camera.position.x; rig.watch.y = camera.position.y; rig.watch.z = camera.position.z; }
      rig.update(dt, elapsed);
    };
    const dispose = () => {
      window.removeEventListener("keydown", captureKey, true);
      if (state.holding) release();
      rig.dispose();
      panel.remove();
    };
    return { root: rig.root, state, update, escape, tap, dispose, liveGeometry: rig.liveGeometry, get holding() { return state.holding; }, get speech() { return rig.speech; } };
  };
  BL.hubGuide = { create, NAME, LINES, STOPS, NEWS, freshAfter, legsOf };
})();
