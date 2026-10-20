// The factory's guide, Tess (her rig is `tess.js`): she works the hall's stations with a beam from her eye, flies over
// to greet a visitor who comes in, and leads the tours. One visit owns her rig, the on-screen tour menu and the feed
// subscription. Dialogue is data for later speech. The tour observes events; it never drives the node or the visitor.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { factoryModels: FM } = BL;
  const DEMO = "obl.factory.demo.v1";
  const NAME = "Tess", TALK = `TALK TO ${NAME.toUpperCase()}`;
  const LINES = {
    greeting: "Hi! I'm Tess, your factory guide. Want a look round?",
    greetingDemo: "Hi! I'm Tess. This node is a demo one today.",
    noOogaDemo: "Demo node today! Pick an Ooga on the island.",
    noOoga: "No Ooga, no tour! Pick one on the island.",
    comeCloser: "Come closer and I'll show you round!",
    declined: "No problem! Come find me if you want a tour.",
    gather: "Tours start at the balcony. Follow me!",
    menu: "Four tours! Pick one.",
    follow: "Follow me! Lines, the core, the switchboard.",
    channels: "Lines are channels to peers. A payment can hop node to node.",
    core: "The core is this node. It forwards payments; it mines nothing.",
    outcomes: "Settled means it went through. Failed means it did not — never why.",
    privacy: "Routes and fees stay private. We see outcomes, not journeys.",
    quiet: "Quiet shift — no forward came by. The machines explain themselves.",
    settled: "A forward just settled. Its route and fee stay private.",
    failed: "A forward just failed. The report never says why.",
    demoReport: "That report came from the demo node — practice, not real.",
    replayReport: "That was an old report replayed, not fresh news.",
    followChannels: "Come! Forge first, then the lines.",
    followRebalancing: "This way! The rebalancer waits.",
    followHealth: "Up we go! The watchtower sees far.",
    forge: "The forge ties lines to the chain. Opens and closes happen on-chain.",
    opening: "Opening parks funds in a channel. The carts show a size bucket, not an amount.",
    closing: "Closing settles back on-chain. The coin is our picture of it.",
    channelStatus: "Each station is one channel: opening, active, closing, closed.",
    slots: "Today's slots are temporary labels. They name no peer, no route.",
    fundsPrivate: "Public capacity is not spendable balance. Liquidity stays private.",
    channelQuiet: "No channel news this leg. The station explains itself anyway.",
    channelOpeningReport: "An opening was reported. That is not active yet.",
    channelActiveReport: "An active channel was reported. Balances stay private.",
    channelClosingReport: "A closing was reported. Not closed until closed arrives.",
    channelClosedReport: "A closed channel was reported. That is all it says.",
    channelDone: "Forge plus lines — that is the dance. Back to work for me!",
    liquidity: "Channels need liquidity that moves. Capacity alone says little.",
    rebalancer: "The rebalancer shifts liquidity so lines keep working.",
    rebalanceHour: "Reports group by the hour. The spin is a picture, not a timestamp.",
    rebalancePrivate: "Reports name no channel and no balance. A fail gives no cause.",
    rebalanceQuiet: "No rebalance came by. No need to poke the machine.",
    rebalanceSucceededReport: "A rebalance worked. Which channels? Not said.",
    rebalanceFailedReport: "A rebalance failed. Why? The report does not say.",
    rebalanceDone: "That is rebalancing! Private balances stay private.",
    healthCore: "The core lights on starting or ready reports, dark on stopped.",
    unknownNode: "No node state reported. Missing news is not bad news.",
    startingNode: "Node says starting. A report, not a promise.",
    readyNode: "Node says ready. Not a guarantee every forward lands.",
    stoppedNode: "Node says stopped. A report — not the same as a quiet feed.",
    watchtower: "The beam follows feed activity. Signal, not diagnosis.",
    waitingSignal: "No event yet. We wait; health unknown.",
    silentSignal: "Feed quiet. The beam can sleep while the node is fine.",
    liveSignal: "Events arriving! An active feed, not a clean bill of health.",
    replaySignal: "Old events replaying. Signal yes, fresh health no.",
    summary: "Summaries describe activity. Not diagnosis, not balances.",
    noSummary: "No summary supplied. We invent no counts.",
    healthDone: "State and signal answer different questions. Tour done!",
    done: "That is forwarding! Back to work — come find me anytime.",
    warning: "Still coming? I'll hover here.",
    abandoned: "Lost my visitor! Back to work.",
    cancelled: "All good. Back to work!"
  };
  // Her flight. Clear-air waypoints over the hall and the legs between them, every leg at least 0.8 m from any surface
  // the hall draws (the factory suite measures it). A work site is a waypoint she hovers at, with the point on its
  // station her beam lands on. She is found working at a site near the front, so she reaches the balcony quickly.
  const AIR = {
    core: [3, 8.5, 1], forge: [0, 2.5, 5], lineA: [-11, 12.5, -10], lineB: [12, 12.5, -10], lineC: [-12, 7.5, 0],
    lineD: [13, 7.5, 0], switchboard: [-10, 5.5, 8], rebalancer: [12, 5.5, 6], treasury: [10, 5.5, 20],
    lookout: [-16, 23.5, -10], balcony: [0, 7.5, 23], front: [0, 10, 12], left: [-7, 10, 5], right: [7, 10, 5],
    pit: [0, 5.5, 7], backA: [-10, 14.5, -8], backB: [10, 14.5, -8], mid: [-4, 9.5, -1], high: [-12, 19, -7],
    tower: [-14, 22.5, -10], rightLow: [11, 7.5, 0]
  };
  const LEGS = [
    ["lineD", "rightLow"], ["lookout", "tower"], ["lineA", "backA"], ["lineB", "backB"], ["forge", "pit"], ["backA", "high"],
    ["high", "tower"], ["core", "right"], ["switchboard", "left"], ["left", "mid"], ["front", "pit"], ["rebalancer", "right"],
    ["right", "rightLow"], ["core", "pit"], ["core", "mid"], ["lineC", "left"], ["core", "rightLow"], ["lineC", "mid"],
    ["left", "pit"], ["right", "pit"], ["pit", "mid"], ["front", "left"], ["front", "right"], ["switchboard", "pit"],
    ["backA", "mid"], ["forge", "switchboard"], ["core", "left"], ["balcony", "front"], ["core", "front"],
    ["switchboard", "front"], ["rebalancer", "pit"], ["core", "backB"], ["lineC", "high"], ["treasury", "front"],
    ["front", "mid"], ["left", "high"], ["switchboard", "balcony"], ["backA", "backB"], ["core", "treasury"],
    ["rebalancer", "balcony"]
  ];
  const WORK = {
    core: [1.91, 8.5, -2.01], forge: [0, 1.19, 0.96], lineA: [-11, 11.2, -13.52], lineB: [11.34, 11.84, -11.77],
    lineC: [-12.88, 6.24, -3.53], lineD: [12.62, 6.25, -3.51], switchboard: [-12.53, 3.6, 5.47],
    rebalancer: [13.95, 4.52, 4.24], treasury: [12.79, 4.7, 20], lookout: [-16, 22.51, -13.04]
  };
  const FRONT = ["core", "forge", "switchboard", "rebalancer", "treasury", "lineC", "lineD"];
  // A tour flies its route LEAD metres over the floor, between the waypoints' supports, and the visitor walks it. The
  // routes use the broad arrival stairs and the left pit-to-core stairs, not ladders; the bend at the foot of the grand
  // stairway keeps her off its lanterns. At a stop she flies out to show its station: `show` is the rise off the
  // route, where she hovers and where her beam lands. Every waypoint has a dock, the air waypoint she rises to when a
  // tour ends there. Tours share fixed approach points but own their stops. No runtime route building or event history.
  const LEAD = 2.2;
  const ROUTE = [
    [-2, 5, 23.6], [-0.8, 5, 22.9], [0, 5, 22], [0, 0, 13], [0, 0, 11.4],
    [-4.8, 0, 9], [-6.5, 0, 8.5], [-4.8, 0, 9], [-4.8, 0, 7.5],
    [-4.8, 5, 1.3], [-4.8, 5, 0.1], [-4.8, 5, 1.3], [-4.8, 0, 7.5], [-7, 0, 8.5]
  ];
  const STOPS = { 6: ["channels"], 10: ["core", "privacy"], 13: ["outcomes", "observation", "source", "history", "done"] };
  const CHANNEL_ROUTE = [
    ...ROUTE.slice(0, 5), [-4.8, 0, 9], [-4.8, 0, 5.8], [-4.8, 0, 7.5],
    [-4.8, 5, 1.3], [-4.8, 5, 0.1], [-5.6, 5, -1.6], [-6.1, 5, -3.9],
    [-6.45, 5, -3.95], [-8.5, 5, -2.5]
  ];
  const DOCKS = [
    [-2, 5, 23.6, "balcony"], [-0.8, 5, 22.9, "balcony"], [0, 5, 22, "balcony"], [0, 0, 13, "pit"], [0, 0, 11.4, "pit"],
    [-4.8, 0, 9, "pit"], [-6.5, 0, 8.5, "forge"], [-4.8, 0, 7.5, "forge"], [-4.8, 0, 5.8, "left"], [-7, 0, 8.5, "forge"],
    [-4.8, 5, 1.3, "mid"], [-4.8, 5, 0.1, "mid"], [-5.6, 5, -1.6, "mid"], [-6.1, 5, -3.9, "lineC"],
    [-6.45, 5, -3.95, "lineC"], [-8.5, 5, -2.5, "lineC"], [-8.9, 5, -3.5, "mid"], [-9.2, 5, -4.4, "backA"],
    [-9.2, 10, -9.6, "lineA"], [-9.2, 10, -10.1, "lineA"], [4.8, 0, 10, "pit"], [8.5, 0, 9.5, "right"]
  ];
  const TOURS = {
    payments: {
      title: "PAYMENTS", follow: "follow", route: ROUTE,
      events: ["forward.settled", "forward.failed"], quiet: "quiet", stops: STOPS,
      show: {
        6: [1.5, [-8, 7.5, -0.5], [-11.67, 7.08, -1.75]], 10: [0, [-4, 7, -0.5], [-1.97, 7.51, -2.28]],
        13: [1.5, [-10.5, 5, 8], [-12.39, 3.74, 5.47]]
      }
    },
    channels: {
      title: "CHANNELS", follow: "followChannels", route: CHANNEL_ROUTE,
      events: ["channel.opening", "channel.active", "channel.closing", "channel.closed"], quiet: "channelQuiet",
      stops: {
        6: ["forge", "opening", "closing", "observation", "source", "history"],
        13: ["channelStatus", "slots", "fundsPrivate", "observation", "source", "history", "channelDone"]
      },
      show: { 6: [1.5, [1, 2, 4], [0.01, 2.99, 0.74]], 13: [1, [-13.5, 8, 0], [-12.24, 6.86, -2.29]] }
    },
    rebalancing: {
      title: "REBALANCING", follow: "followRebalancing",
      route: [...ROUTE.slice(0, 5), [4.8, 0, 10], [8.5, 0, 9.5]],
      events: ["rebalance.succeeded", "rebalance.failed"], quiet: "rebalanceQuiet",
      stops: { 5: ["liquidity"], 6: ["rebalancer", "rebalanceHour", "rebalancePrivate", "observation", "source", "history", "rebalanceDone"] },
      show: { 5: [1.5, [8, 8, -0.5], [11.7, 7.16, -1.76]], 6: [1.5, [11, 5, 5.5], [13.9, 4.52, 4.24]] }
    },
    health: {
      title: "NODE HEALTH", follow: "followHealth",
      route: [...CHANNEL_ROUTE, [-8.9, 5, -3.5], [-9.2, 5, -4.4], [-9.2, 10, -9.6], [-9.2, 10, -10.1]],
      events: [], quiet: "unknownNode",
      stops: {
        9: ["healthCore", "observation", "source", "history"],
        17: ["watchtower", "signal", "summary", "healthDone"]
      },
      show: { 9: [0, [-4, 7, -0.5], [-1.97, 7.51, -2.28]], 17: [1.5, [-11.5, 19.5, -12], [-15.26, 20.75, -13.67]] }
    }
  };
  const TOUR_ORDER = ["payments", "channels", "rebalancing", "health"];
  // The air waypoints by index, and the next hop from each to each over the legs (Floyd-Warshall, once a page).
  const NODES = Object.keys(AIR), N = NODES.length, INDEX = {}, AT = new Float32Array(N * 3), NEXT = new Int8Array(N * N);
  NODES.forEach((name, i) => { INDEX[name] = i; AT.set(AIR[name], i * 3); });
  {
    const D = new Float64Array(N * N).fill(Infinity);
    for (let i = 0; i < N; i++) { D[i * N + i] = 0; NEXT[i * N + i] = i; }
    for (const [a, b] of LEGS) {
      const i = INDEX[a], j = INDEX[b], d = Math.hypot(AT[i * 3] - AT[j * 3], AT[i * 3 + 1] - AT[j * 3 + 1], AT[i * 3 + 2] - AT[j * 3 + 2]);
      D[i * N + j] = D[j * N + i] = d; NEXT[i * N + j] = j; NEXT[j * N + i] = i;
    }
    for (let k = 0; k < N; k++) for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      if (D[i * N + k] + D[k * N + j] < D[i * N + j]) { D[i * N + j] = D[i * N + k] + D[k * N + j]; NEXT[i * N + j] = NEXT[i * N + k]; }
    }
  }
  const BALCONY = INDEX.balcony, SITES = Object.keys(WORK).map((name) => INDEX[name]), STARTS = FRONT.map((name) => INDEX[name]);
  // Each tour's docks, by waypoint. A waypoint with none throws here, never mid-tour.
  for (const tour of Object.values(TOURS)) tour.docks = Int8Array.from(tour.route, (w) => {
    const dock = DOCKS.find((d) => d[0] === w[0] && d[1] === w[1] && d[2] === w[2]);
    if (!dock) throw new Error(`Tess has no dock for waypoint ${w}`);
    return INDEX[dock[3]];
  });
  const OBSERVATIONS = {
    "forward.settled": "settled", "forward.failed": "failed",
    "channel.opening": "channelOpeningReport", "channel.active": "channelActiveReport",
    "channel.closing": "channelClosingReport", "channel.closed": "channelClosedReport",
    "rebalance.succeeded": "rebalanceSucceededReport", "rebalance.failed": "rebalanceFailedReport"
  };
  const NODE_LINES = { unknown: "unknownNode", starting: "startingNode", ready: "readyNode", stopped: "stoppedNode" };
  // Where each work site's beam lands, by air waypoint.
  const AIM = new Float32Array(N * 3);
  for (const name in WORK) AIM.set(WORK[name], INDEX[name] * 3);
  // How long she waits for a visitor who has fallen behind before calling, and before giving up: at the balcony,
  // where a tour gathers, the walk there may be long.
  const WAIT = { gather: [20, 45], tour: [4, 12] };
  const create = ({ parent, input, fx, feed, visitor, demoRunning, coarse, camera, quality = () => "high" }) => {
    const rig = BL.tess.create({ parent, input, fx, camera, kind: "greeter", coarse, quality }), figure = rig.figure;
    let legLength = 1;
    // The tour menu lives on screen, in the HUD's wood, built for the visit and removed on leave.
    const panel = document.createElement("div");
    panel.className = "greeter-menu";
    panel.hidden = true;
    const heading = document.createElement("p");
    heading.className = "greeter-menu-title";
    heading.textContent = `${NAME}'s tours`;
    panel.append(heading);
    const options = [];
    for (let i = 0; i < TOUR_ORDER.length; i++) {
      const id = TOUR_ORDER[i], option = document.createElement("button");
      option.type = "button";
      option.className = "greeter-choice";
      option.textContent = TOURS[id].title;
      option.addEventListener("click", () => choose(id));
      option.addEventListener("pointerenter", () => { if (state.phase === "menu") select(i); });
      panel.append(option);
      options.push(option);
    }
    const help = document.createElement("p");
    help.className = "greeter-menu-help";
    help.textContent = coarse ? "Tap a tour" : "Arrows choose · Enter starts · Esc closes";
    panel.append(help);
    const stop = document.createElement("button");
    stop.type = "button";
    stop.className = "greeter-stop";
    stop.textContent = "End tour";
    stop.hidden = true;
    stop.addEventListener("click", () => endTour());
    document.body.append(panel, stop);
    let tour = TOURS.payments;
    // She is found at work at a station near the front. `perch` is the air waypoint she is at or last left, `site` the
    // station she is working or flying to, and `at` what kind of place she is at, which says how she gets back to the
    // air waypoints from there: a waypoint (`node`), a visitor's shoulder, a tour's route, a stop's station (`show`),
    // or on her way (`air`). `anchor` is the floor a tour measures the visitor from.
    const start = STARTS[Math.floor(Math.random() * STARTS.length)];
    const state = {
      tour: null, selection: 0, phase: "work", stage: "beam", timer: 4 + Math.random() * 4, perch: start, site: start, at: "node",
      offered: false, seen: 0, attending: false, ending: false, beam: 0, waypoint: 0, line: 0, away: 0,
      spoken: null, lastEvent: null, replay: false, demo: false, observation: "quiet", snapshotDemo: false, snapshotReplay: false,
      node: feed.reading.node, nodeDemo: false, nodeReplay: false, nodeReported: false,
      anchor: { x: 0, y: 0, z: 0 }, origin: { x: 0, z: 0 }, side: 1
    };
    const position = rig.position, spot = { x: 0, y: 0, z: 0 };
    position.x = AT[start * 3]; position.y = AT[start * 3 + 1]; position.z = AT[start * 3 + 2];
    const clearPath = rig.clearPath, push = rig.push, steer = rig.steer;
    const pushAir = (from, to) => { for (let i = from; i !== to;) { i = NEXT[i * N + to]; push(AT[i * 3], AT[i * 3 + 1], AT[i * 3 + 2]); } };
    const pushRoute = (w, rise = 0) => push(w[0], w[1] + LEAD + rise, w[2]);
    const feetOf = (actor) => actor.root.position.y - actor.baseY;
    // Within `range` of her, from the visitor's chest.
    const nearMe = (range) => {
      const actor = visitor();
      if (!actor) return false;
      const p = actor.root.position;
      return Math.hypot(p.x - position.x, feetOf(actor) + (actor.bodyHeight || 1.2) * 0.7 - position.y, p.z - position.z) <= range;
    };
    // Within `range` of the tour's floor: under her while she leads, or the stop the visitor stands at.
    const nearSpot = (range) => {
      const actor = visitor();
      if (!actor) return false;
      const p = actor.root.position, s = state.anchor;
      return Math.hypot(p.x - s.x, p.z - s.z, feetOf(actor) - s.y) <= range;
    };
    const anchorAt = (w) => { state.anchor.x = w[0]; state.anchor.y = w[1]; state.anchor.z = w[2]; };
    const onBalcony = (actor) => {
      const p = actor.root.position, feet = feetOf(actor);
      return feet > 4 && feet < 6.5 && p.z > 20.5 && Math.abs(p.x) < 7;
    };
    const strayed = (actor) => Math.hypot(actor.root.position.x - state.origin.x, actor.root.position.z - state.origin.z) > 5;
    // Whether she clears the hall's floors and what stands on them, from the visitor's feet up to her top, at every step
    // of the leg from (ax, ay, az) to (bx, by, bz).
    const legClear = (ax, ay, az, bx, by, bz, feet) => {
      const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay, bz - az) / 0.25));
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        if (!FM.clearAt(ax + (bx - ax) * t, az + (bz - az) * t, feet, 0.4, ay + (by - ay) * t + 0.4 - feet)) return false;
      }
      return true;
    };
    // Her place with the visitor, into `spot`: ahead of them and off to the side with room, at head height, where the
    // view over their shoulder shows her; with no room either side, over their head. A place is taken only when it and
    // the leg to it from (fx, fy, fz) clear the hall; with none, `spot` keeps the last place that did, and this is false.
    const shoulder = (fx, fy, fz) => {
      const actor = visitor(), p = actor.root.position, ax = Math.sin(actor.root.rotation.y), az = Math.cos(actor.root.rotation.y);
      const feet = feetOf(actor), height = actor.bodyHeight || 1.2;
      for (let tries = 0; tries < 3; tries++) {
        const side = tries === 0 ? state.side : -state.side, over = tries === 2;
        const x = over ? p.x : p.x - az * side + ax * 1.8, z = over ? p.z : p.z + ax * side + az * 1.8;
        const y = over ? feet + height + 0.7 : feet + height * 0.8;
        if (!legClear(fx, fy, fz, x, y, z, feet)) continue;
        if (!over) state.side = side;
        spot.x = x; spot.y = y; spot.z = z;
        return true;
      }
      return false;
    };
    const show = (phase) => {
      state.phase = phase;
      panel.hidden = phase !== "menu";
      stop.hidden = !state.tour || state.ending;
    };
    const select = (index) => {
      state.selection = (index + options.length) % options.length;
      for (let i = 0; i < options.length; i++) options[i].classList.toggle("sel", i === state.selection);
    };
    // One anchored bubble replaces the previous line and follows the guide, including her return. On a tour, once a
    // line is said through, the next comes on its own.
    const say = (id) => {
      state.spoken = id;
      rig.say(LINES[id]);
    };
    const pickSite = () => {
      let site = state.perch;
      while (site === state.perch || site === state.site) site = SITES[Math.floor(Math.random() * SITES.length)];
      return site;
    };
    // Off to work at another station, from the air waypoint she is at.
    const flyTo = (site) => {
      clearPath(4, 0.8); pushAir(state.perch, site);
      state.site = site; state.at = "air"; state.stage = "fly"; show("work");
    };
    // Back to work from wherever a tour or a greeting left her, along legs already flown: from a stop's station down to
    // the route, from the route to its dock, from a visitor's shoulder to the balcony; then over the air waypoints.
    const home = () => {
      let dock = state.perch;
      clearPath(4, 0.8);
      if (state.at === "show") {
        const s = tour.show[state.waypoint], w = tour.route[state.waypoint];
        if (s[0]) pushRoute(w, s[0]);
        pushRoute(w);
      }
      if (state.at === "show" || state.at === "route") dock = tour.docks[state.waypoint];
      else if (state.at === "shoulder") dock = BALCONY;
      push(AT[dock * 3], AT[dock * 3 + 1], AT[dock * 3 + 2]);
      state.perch = dock;
      const site = pickSite();
      pushAir(dock, site);
      state.site = site; state.at = "air"; state.stage = "fly";
      state.tour = null; state.ending = false; state.attending = false;
      show("work");
    };
    // She notices a visitor come onto the balcony: stops work, turns to them, her rings flare; then she flies over. That
    // uses the visit's greeting, whatever happens next: walked off, waved off or taken, it does not come again.
    const notice = () => { state.offered = true; show("notice"); state.timer = 1.1; rig.flare(); };
    // To the balcony's waypoint, then to the place beside the visitor that `shoulder` found from there.
    const approach = () => {
      clearPath(6, 1); pushAir(state.perch, BALCONY);
      push(spot.x, spot.y, spot.z); rig.track();
      state.at = "air"; show("approach");
    };
    // The visitor went off the balcony before she got there: on to the balcony's waypoint, then back to work.
    const abandonApproach = () => {
      const site = pickSite();
      if (rig.onLastLeg) { clearPath(4, 0.8); push(AT[BALCONY * 3], AT[BALCONY * 3 + 1], AT[BALCONY * 3 + 2]); }
      else rig.dropLast(4);
      state.perch = BALCONY; pushAir(BALCONY, site);
      state.site = site; state.stage = "fly"; show("work");
    };
    const offer = () => {
      const p = visitor().root.position;
      state.origin.x = p.x; state.origin.z = p.z;
      state.at = "shoulder"; state.timer = 9; rig.nod();
      clearPath(3, 1); push(spot.x, spot.y, spot.z); rig.track();
      show("offer"); say(demoRunning() ? "greetingDemo" : "greeting");
    };
    const decline = () => { say("declined"); home(); };
    // Talking turns the visitor's Ooga to face her, and the menu opens on screen.
    const openMenu = () => {
      const p = visitor().root;
      p.rotation.y = Math.atan2(position.x - p.position.x, position.z - p.position.z);
      state.origin.x = p.position.x; state.origin.z = p.position.z; state.attending = true;
      select(0); show("menu"); say("menu");
    };
    // Closing the menu at the visitor's shoulder declines the tour; at a station she goes back to her work.
    const closeMenu = () => {
      if (state.at === "shoulder") decline();
      else { state.attending = false; show("work"); }
    };
    const greet = () => {
      if (!visitor()) { say(demoRunning() ? "noOogaDemo" : "noOoga"); return; }
      if (state.phase === "talk") { if (!rig.next()) next(); return; }
      if (state.phase === "offer" || state.phase === "work" && state.stage !== "fly" && nearMe(4)) { openMenu(); return; }
      if (state.phase === "work") say("comeCloser");
    };
    const end = (line) => {
      if (line) say(line);
      state.ending = true; stop.hidden = true;
      if (state.phase === "talk" || state.phase === "gather" && state.at === "route") home();
    };
    const resolveLine = (id) => {
      if (id === "observation") return state.observation;
      if (id === "source") return state.snapshotDemo ? "demoReport" : null;
      if (id === "history") return state.snapshotReplay ? "replayReport" : null;
      if (id === "signal") return feed.signal === "waiting" ? "waitingSignal" : feed.signal === "silent" ? "silentSignal"
        : feed.reading.stream === "replay" ? "replaySignal" : "liveSignal";
      if (id === "summary") return feed.reading.summary ? "summary" : "noSummary";
      return id;
    };
    const talk = () => {
      state.line = 0;
      const nodeMetadata = state.nodeReported && state.node === feed.reading.node;
      state.observation = state.tour === "health" ? NODE_LINES[feed.reading.node] : OBSERVATIONS[state.lastEvent] || tour.quiet;
      state.snapshotDemo = state.tour === "health" ? nodeMetadata && state.nodeDemo : !!state.lastEvent && state.demo;
      state.snapshotReplay = state.tour === "health" ? nodeMetadata && state.nodeReplay : !!state.lastEvent && state.replay;
      show("talk"); say(tour.stops[state.waypoint][0]);
    };
    // The next leg of the route, flown LEAD over the floor.
    const lead = () => {
      const a = tour.route[state.waypoint], b = tour.route[state.waypoint + 1];
      clearPath(2.2, 0.3); pushRoute(b);
      legLength = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) || 1;
      state.at = "route"; show("lead");
    };
    // At a waypoint: a stop sends her out to show its station, rising off the route first where the route is hemmed in.
    const arrive = (index) => {
      state.waypoint = index; state.at = "route"; anchorAt(tour.route[index]);
      if (state.ending) { home(); return; }
      const s = tour.show[index];
      if (!s) { lead(); return; }
      clearPath(3.2, 0.5);
      if (s[0]) pushRoute(tour.route[index], s[0]);
      push(s[1][0], s[1][1], s[1][2]);
      show("show");
    };
    const back = () => {
      const s = tour.show[state.waypoint], w = tour.route[state.waypoint];
      clearPath(3.2, 0.5);
      if (s[0]) pushRoute(w, s[0]);
      pushRoute(w);
      show("back");
    };
    // The stop's next line, then the leg: a line said through and NEXT on its last bubble both come here.
    const next = () => {
      if (state.phase !== "talk") return;
      const lines = tour.stops[state.waypoint];
      while (++state.line < lines.length) {
        const line = resolveLine(lines[state.line]);
        if (line) { say(line); return; }
      }
      if (state.waypoint === tour.route.length - 1) end();
      else back();
    };
    // A tour starts at the balcony: from the visitor's shoulder there she goes straight to the route's start; from a
    // station she flies there and the visitor follows.
    const choose = (id) => {
      if (!Object.hasOwn(TOURS, id) || state.phase !== "menu") return;
      const here = state.at === "shoulder";
      tour = TOURS[id]; state.tour = id;
      state.waypoint = 0; state.away = 0; state.lastEvent = null; state.ending = false; state.offered = true; state.attending = false;
      clearPath(4.5, 0.8);
      if (!here) pushAir(state.perch, BALCONY);
      pushRoute(tour.route[0]);
      state.at = "air"; anchorAt(tour.route[0]);
      show("gather"); say(here ? tour.follow : "gather");
    };
    const endTour = () => {
      if (state.tour && !state.ending) end("cancelled");
    };
    // Escape waves her off while she comes to the visitor or offers, and closes an open menu, before the cave's own
    // Escape leaves.
    const escape = () => {
      if (state.phase === "menu") { closeMenu(); return true; }
      if (state.phase === "offer") { decline(); return true; }
      if (state.phase === "notice") { say("declined"); show("work"); return true; }
      if (state.phase === "approach") { say("declined"); abandonApproach(); return true; }
      return false;
    };
    const unsubscribe = feed.subscribe((e) => {
      if (e.type === "node.started" || e.type === "node.ready" || e.type === "node.stopped") {
        state.node = e.type === "node.started" ? "starting" : e.type === "node.ready" ? "ready" : "stopped";
        state.nodeReplay = e.stream === "replay"; state.nodeDemo = e.schema === DEMO; state.nodeReported = true;
      }
      if (!state.tour || state.ending) return;
      if (!tour.events.includes(e.type)) return;
      state.lastEvent = e.type; state.replay = e.stream === "replay"; state.demo = e.schema === DEMO;
    });
    // A visitor out of reach of the tour: a call after a while, then she gives up.
    const wait = (dt, limits) => {
      if (nearSpot(6)) { state.away = 0; return; }
      const before = state.away;
      state.away += dt;
      if (before < limits[0] && state.away >= limits[0]) fx.say(figure, LINES.warning, 8);
      if (state.away >= limits[1]) end("abandoned");
    };
    const update = (dt, elapsed) => {
      const actor = visitor();
      switch (state.phase) {
        case "work":
          if (state.stage === "fly") {
            if (steer(dt)) { state.perch = state.site; state.at = "node"; state.stage = "beam"; state.timer = 6 + Math.random() * 4; }
            break;
          }
          state.attending = !!actor && nearMe(6);
          // A visitor on the balcony gets a moment to see her at work before she notices them.
          state.seen = !state.offered && actor && onBalcony(actor) ? state.seen + dt : 0;
          if (state.seen > 1.6) { notice(); break; }
          if (!state.attending && (state.timer -= dt) <= 0) {
            if (state.stage === "beam") { state.stage = "rest"; state.timer = 0.6; }
            else flyTo(pickSite());
          }
          break;
        case "notice":
          if (!actor || !onBalcony(actor)) { show("work"); break; }
          // She comes over once there is a place beside the visitor with room, and gives up if none comes.
          if ((state.timer -= dt) <= 0) {
            if (shoulder(AT[BALCONY * 3], AT[BALCONY * 3 + 1], AT[BALCONY * 3 + 2])) approach();
            else if (state.timer < -6) show("work");
          }
          break;
        case "approach": {
          if (!actor || !onBalcony(actor)) { abandonApproach(); break; }
          // The last leg runs from the balcony's waypoint, or from where she is once she is on it.
          if (rig.onLastLeg ? shoulder(position.x, position.y, position.z) : shoulder(AT[BALCONY * 3], AT[BALCONY * 3 + 1], AT[BALCONY * 3 + 2])) {
            rig.setLast(spot.x, spot.y, spot.z);
          }
          steer(dt);
          if (rig.lastPoint && Math.hypot(spot.x - position.x, spot.y - position.y, spot.z - position.z) < 0.45) offer();
          break;
        }
        case "offer":
        case "menu":
          if (!actor || strayed(actor)) {
            if (state.phase === "offer") decline(); else closeMenu();
            break;
          }
          if (state.at === "shoulder") {
            if (shoulder(position.x, position.y, position.z)) rig.setLast(spot.x, spot.y, spot.z);
            steer(dt);
          }
          if (state.phase === "offer" && (state.timer -= dt) <= 0) decline();
          break;
        case "gather":
          if (state.at === "air") {
            if (steer(dt)) { state.at = "route"; if (state.ending) home(); }
            break;
          }
          if (nearSpot(6)) {
            if (state.spoken === "gather") say(tour.follow);
            lead();
          } else if (!state.ending) wait(dt, WAIT.gather);
          break;
        case "lead": {
          const a = tour.route[state.waypoint], b = tour.route[state.waypoint + 1];
          const left = Math.hypot(b[0] - position.x, b[1] + LEAD - position.y, b[2] - position.z), t = Math.min(1, Math.max(0, 1 - left / legLength));
          state.anchor.x = position.x; state.anchor.z = position.z; state.anchor.y = a[1] + (b[1] - a[1]) * t;
          if (!state.ending) wait(dt, WAIT.tour);
          if (state.phase === "lead" && (state.ending || nearSpot(6)) && steer(dt)) arrive(state.waypoint + 1);
          break;
        }
        case "show":
          if (!state.ending) wait(dt, WAIT.tour);
          if (state.phase === "show" && steer(dt)) { state.at = "show"; if (state.ending) home(); else talk(); }
          break;
        case "talk":
          wait(dt, WAIT.tour);
          if (state.phase === "talk" && rig.said) next();
          break;
        case "back":
          if (!state.ending) wait(dt, WAIT.tour);
          if (state.phase === "back" && steer(dt)) { state.at = "route"; if (state.ending) home(); else lead(); }
          break;
      }

      // What she shows: her working beam on the station she works, her pointing beam on a stop's, otherwise she watches
      // the visitor. She keeps her eye on them while she offers, and is calm while she talks.
      const working = state.phase === "work" && state.stage === "beam" && !state.attending;
      rig.mode = working ? 1 : state.phase === "talk" ? 2 : 0;
      if (working) { rig.aim.x = AIM[state.site * 3]; rig.aim.y = AIM[state.site * 3 + 1]; rig.aim.z = AIM[state.site * 3 + 2]; }
      else if (rig.mode === 2) { const s = tour.show[state.waypoint][2]; rig.aim.x = s[0]; rig.aim.y = s[1]; rig.aim.z = s[2]; }
      rig.steady = state.phase === "offer" || state.phase === "menu";
      rig.calm = rig.steady || state.phase === "talk";
      rig.watching = !!actor;
      if (actor) { const p = actor.root.position; rig.watch.x = p.x; rig.watch.y = feetOf(actor) + (actor.bodyHeight || 1.2) * 0.8; rig.watch.z = p.z; }
      rig.update(dt, elapsed);
      state.beam = rig.shown;
    };
    const act = () => {
      if (!visitor()) return false;
      if (state.phase === "talk") {
        if (!nearSpot(6)) return false;
        // Each bubble of her line first, then the next line.
        if (!rig.next()) next();
        return true;
      }
      if (state.phase === "menu") { choose(TOUR_ORDER[state.selection]); return true; }
      if (state.phase === "offer" || state.phase === "work" && state.stage !== "fly" && nearMe(4)) { openMenu(); return true; }
      return false;
    };
    // What the act button offers right now, the hub's ENTER ARCADE pattern: a label only while the act works.
    const actLabel = () => {
      if (!visitor()) return null;
      if (state.phase === "talk") return nearSpot(6) ? "NEXT" : null;
      if (state.phase === "menu") return "START TOUR";
      if (state.phase === "offer" || state.phase === "work" && state.stage !== "fly" && nearMe(4)) return TALK;
      return null;
    };
    // Space acts on her when she has come to the visitor (an offer, the menu, a tour's NEXT), or within arm's reach of
    // her at a station; otherwise it stays the visitor's own.
    const useNear = (x, z, reach) => {
      if (!actLabel()) return false;
      if (state.phase === "work" && Math.hypot(x - position.x, z - position.z) > reach) return false;
      return act();
    };
    const menuKey = (e) => {
      if (state.phase !== "menu" || e.metaKey || e.ctrlKey || e.altKey) return false;
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown" && e.key !== "Enter") return false;
      e.preventDefault(); e.stopImmediatePropagation();
      if (!e.repeat) {
        if (e.key === "Enter") choose(TOUR_ORDER[state.selection]);
        else select(state.selection + (e.key === "ArrowDown" ? 1 : -1));
      }
      return true;
    };
    // Capture repeats too: the director ignores repeated keydowns, but movement controls still read them.
    const captureMenuKey = (e) => {
      const target = e.target;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable
        || target.closest && target.closest("dialog"))) return;
      menuKey(e);
    };
    window.addEventListener("keydown", captureMenuKey, true);
    const dispose = () => {
      window.removeEventListener("keydown", captureMenuKey, true);
      unsubscribe();
      rig.dispose();
      panel.remove(); stop.remove();
      state.lastEvent = null;
    };
    return { root: rig.root, state, update, greet, act, actLabel, useNear, escape, dispose, liveGeometry: rig.liveGeometry, light: rig.light };
  };
  // The flight's data, for the factory suite's clearance check.
  const FLIGHT = { AIR, LEGS, WORK, LEAD, RADIUS: BL.tess.RADIUS };
  BL.factoryGreeter = { create, LINES, TOURS, NAME, FLIGHT };
})();
