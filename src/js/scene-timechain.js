// The Timechain Sphere's rooms as a scene: this shell is always on the page, the room itself (timechain-interior.js and
// what it uses) is deferred on a hosted page and arrives only once a visit is committed. `prepare` runs before the
// director builds anything: it validates the room (`sphere-<id>` routes carry it as their place), decides whose visit
// this is and loads the code, or sends the visitor to the keypad outside instead.
//
// A visit is shared (signed in, the room's own zone) or solo (a private copy: no presence or voice). The keypad's
// commit on this page decides it (`world.sphereVisit`, used once); a reload or a step through history finds the last
// visit this tab made (sessionStorage) and repeats it only as it was: shared needs the same account still signed in,
// and solo is repeated only while still signed out. Otherwise a signed-out visitor gets a solo copy, while a signed-in
// one (back from signing in, say), or one whose account could not be looked up, goes to the keypad outside with the
// room chosen, so a solo visit never turns shared and joining a shared room is always a deliberate Enter.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const ROOMS = BL.timechainRooms;
  const VISIT_KEY = "ooga-sphere-visit", VISIT_AGE = 30 * 60 * 1000;
  const stored = () => {
    try {
      const raw = window.sessionStorage.getItem(VISIT_KEY);
      if (!raw || raw.length > 512) return null;
      const v = JSON.parse(raw), age = Date.now() - v.at;
      if (!v || !ROOMS.parse(v.room) || v.mode !== "shared" && v.mode !== "solo" || !Number.isFinite(age) || age < 0 || age > VISIT_AGE) return null;
      if (v.login !== null && (typeof v.login !== "string" || v.login.length > 64)) return null;
      if (v.character !== null && (typeof v.character !== "string" || v.character.length > 40)) return null;
      return { room: v.room, mode: v.mode, login: v.login, character: v.character, guided: false };
    } catch {
      return null;
    }
  };
  const store = (v) => {
    try {
      window.sessionStorage.setItem(VISIT_KEY, JSON.stringify({ room: v.room, mode: v.mode, login: v.mode === "shared" ? v.login : null, character: v.character || null, at: Date.now() }));
    } catch {
      // Storage refused: a reload simply asks again at the keypad.
    }
  };
  let impl = null, visit = null, pending = null;
  const scene = {
    id: "timechain",
    // Between scenes the traveler is nowhere; the room publishes its own zone once the Ooga stands in it.
    voiceZone: "none",
    micKey: true,
    root: null, camera: null, input: null, debug: null, agent: null, agentView: null, agentControls: null, agentHandoff: null,
    get visit() { return visit; },
    get renderOpts() { return impl.renderOpts; },
    get inMotion() { return !!impl && impl.inMotion; },
    // Null to go ahead (or a promise of it while the code loads), or where to arrive instead.
    prepare(place, ctx) {
      const id = ROOMS.parse(place), world = ctx.world, me = BL.net.state.me;
      if (!id) return { scene: "hub", place: "timechain" };
      const fresh = world.sphereVisit && world.sphereVisit.room === id ? world.sphereVisit : null;
      world.sphereVisit = null;
      let v = fresh || stored();
      if (v && (v.room !== id || (v.mode === "solo" ? v !== fresh && !!me : !me || me.login !== v.login))) v = null;
      if (!v) {
        if (!BL.net.state.resolved || me) {
          world.sphereKeypad = id;
          return { scene: "hub", place: "timechain" };
        }
        v = { room: id, mode: "solo", login: null, character: null, guided: false };
      }
      pending = v;
      const loading = BL.deferred.load("timechain");
      return loading ? loading.then(() => null) : null;
    },
    enter(ctx) {
      visit = pending;
      pending = null;
      store(visit);
      impl = BL.timechainInterior.create(scene, ctx, visit);
    },
    update: (dt, elapsed) => impl.update(dt, elapsed),
    overlay: (dt) => impl.overlay(dt),
    onDonation: (donation, bananas) => impl.onDonation(donation, bananas),
    onKey: (e) => impl.onKey(e),
    onLootCleared: () => {},
    leave() {
      const out = impl.leave();
      impl = null;
      visit = null;
      return out;
    },
    stats: () => impl.stats(),
    liveGeometry: (set) => impl.liveGeometry(set)
  };
  BL.scenes = BL.scenes || {};
  BL.scenes.timechain = scene;
})();
