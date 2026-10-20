(() => {
  "use strict";
  const BL = window.BL;
  const { createNode, addChild, removeChild } = BL.scene;
  const { box, merge, cached, lathe, ring, tube } = BL.models;
  const dispenserGeometry = cached(() => merge(
    box({ w: 1.5, h: 0.15, d: 1.2, color: "#33434c", offset: { y: 0.075 } }),
    box({ w: 1.25, h: 0.8, d: 0.85, color: "#ae6c26", offset: { y: 0.55 } }),
    box({ w: 1.4, h: 0.12, d: 1.1, color: "#96a9b5", offset: { y: 0.99 } }),
    box({ w: 0.18, h: 0.65, d: 0.18, color: "#96a9b5", offset: { y: 1.36 } }),
    box({ w: 0.18, h: 0.14, d: 0.6, color: "#d5a34b", offset: { y: 1.65, z: 0.25 } }),
    box({ w: 0.1, h: 0.18, d: 0.1, color: "#96a9b5", offset: { y: 1.59, z: 0.5 } }),
    box({ w: 0.55, h: 0.06, d: 0.48, color: "#263843", offset: { y: 1.075, z: 0.45 } })
  ));
  const CAPACITY_LITRES = 0.5, FILL_RADIUS = 0.05;
  const FILL_HEIGHT = CAPACITY_LITRES * 0.001 / (Math.PI * FILL_RADIUS * FILL_RADIUS);
  const GLASS_SCALE = 1.3;
  // The serving glass holds 500 ml; its larger display scale keeps it readable in the scene.
  const glassGeometry = cached(() => {
    const pieces = [ring({ r: 0.06, thickness: 0.006, y: 0.18, segments: 24, color: "#d8eff1" }),
      lathe({ profile: [[0, 0], [0.049, 0], [0.055, 0.008], [0.06, 0.18], [0.052, 0.18], [0.05, 0.012], [0, 0.012]], segments: 24, color: "#bbdee2" }),
      tube({ path: t => ({ x: 0.06 + Math.sin(Math.PI * t) * 0.05, y: 0.025 + t * 0.1, z: 0 }), radius: () => 0.008, rings: 12, segments: 6, colorFn: () => "#c5e4e8" })];
    for (let i = 0; i < 12; i++) pieces.push(box({ w: 0.004, h: 0.16, d: 0.004, color: "#bbdee2", offset: { x: Math.cos(i * Math.PI / 6) * 0.057, y: 0.087, z: Math.sin(i * Math.PI / 6) * 0.057 } }));
    return merge(...pieces);
  });
  const liquidGeometry = cached(() => lathe({ profile: [[0, 0], [FILL_RADIUS, 0], [FILL_RADIUS, FILL_HEIGHT], [0, FILL_HEIGHT]], segments: 24, color: "#eaa323", emissive: 0.12 }));
  const foamGeometry = cached(() => lathe({ profile: [[0, 0], [0.051, 0], [0.051, 0.005], [0, 0.005]], segments: 24, color: "#fff1d4" }));
  const cabinetGeometry = cached(() => merge(
    box({ w: 1.7, h: 1.8, d: 0.12, color: "#283e48", offset: { y: 0.9, z: -0.3 } }),
    ...[-0.8, 0.8].map(x => box({ w: 0.1, h: 1.8, d: 0.7, color: "#96a9b5", offset: { x, y: 0.9 } })),
    ...[-0.68, 0.68].map(x => box({ w: 0.025, h: 1.56, d: 0.54, color: "#86b9c2", emissive: 0.08, offset: { x, y: 0.9 } })),
    ...[0.12, 0.8, 1.55, 1.8].map(y => box({ w: 1.7, h: 0.07, d: 0.7, color: "#96a9b5", offset: { y } }))
  ));
  const binGeometry = cached(() => lathe({ profile: [[0, 0], [0.38, 0], [0.46, 0.8], [0.4, 0.8], [0.33, 0.1], [0, 0.1]], segments: 16, color: "#455964" }));
  const streamGeometry = cached(() => box({ w: 0.025, h: 1, d: 0.025, color: "#edaa24", emissive: 0.2 }));
  const trayGeometry = cached(() => box({ w: 0.6, h: 0.09, d: 0.65, color: "#334e5a" }));
  const shardGeometry = cached(() => merge(...Array.from({ length: 9 }, (_, i) => box({ w: 0.07, h: 0.025, d: 0.11, color: "#c5e4e8", offset: { x: Math.sin(i * 2.4) * 0.33, y: 0.025, z: Math.cos(i * 2.4) * 0.3 } }))));
  const panGeometry = cached(() => box({ w: 0.65, h: 0.045, d: 0.5, color: "#738996" }));
  const brushGeometry = cached(() => merge(box({ w: 0.045, h: 0.65, d: 0.045, color: "#b17d46", offset: { y: -0.25 } }), box({ w: 0.4, h: 0.13, d: 0.12, color: "#d3ba72", offset: { y: -0.6 } })));
  const leverGeometry = cached(() => box({ w: 0.08, h: 0.28, d: 0.08, color: "#263843", offset: { y: 0.12 } }));
  const DURATIONS = { work: 18, sip: 3, chug: 6.5, spin: 2.5, rise: 2, walk: 5, fill: 7, return: 5, sit: 2, cleanwalk: 2, clean: 1.25, trashwalk: 3, discard: 0.75, cabinetwalk: 3.5, take: 0.75, tapwalk: 2 };
  const smooth = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
  // `site` is Sani's corner, in the frame of its `node` (the gear's parent): `chair` (the recliner), `swivel`, and
  // `spots`, where things stand in that frame: the recliner (`chair`), where he steps to on getting up (`rise`), where a
  // spun glass lands (`spill`), and each piece of gear (`bin`, `dispenser`, `cabinet`: where it stands, its turn
  // `ry`, and `walk`, where he stops in front of it). Sani stands in the same frame.
  const create = site => {
    const S = site.spots, home = S.chair;
    const station = (geometry, g) => createNode({ geometry, position: { x: g.x, y: 0, z: g.z }, rotation: { x: 0, y: g.ry, z: 0 } });
    const dispenser = station(dispenserGeometry(), S.dispenser), cabinet = station(cabinetGeometry(), S.cabinet), bin = station(binGeometry(), S.bin);
    const badge = createNode({ geometry: BL.hubModels.caveSign("500 ML"), position: { x: 0, y: 0.62, z: 0.46 }, scale: { x: 0.18, y: 0.18, z: 0.18 } });
    const stream = createNode({ geometry: streamGeometry(), visible: false });
    const lever = createNode({ geometry: leverGeometry(), position: { x: 0, y: 1.7, z: 0.25 } });
    addChild(dispenser, badge, stream, lever); addChild(site.node, dispenser, cabinet, bin);
    const stock = [];
    for (const y of [0.16, 0.84]) for (const x of [-0.48, 0, 0.48]) {
      const cup = createNode({ geometry: glassGeometry(), position: { x, y, z: 0.05 }, scale: { x: GLASS_SCALE, y: GLASS_SCALE, z: GLASS_SCALE } });
      stock.push(cup); addChild(cabinet, cup);
    }
    const tray = createNode({ geometry: trayGeometry(), position: { x: 0.95, y: 1.05, z: 0 } });
    addChild(site.swivel, tray);
    const mug = createNode({ geometry: glassGeometry(), scale: { x: GLASS_SCALE, y: GLASS_SCALE, z: GLASS_SCALE } }), liquid = createNode({ geometry: liquidGeometry(), position: { x: 0, y: 0.012, z: 0 } }), foam = createNode({ geometry: foamGeometry() });
    addChild(mug, liquid, foam); addChild(tray, mug);
    const shards = createNode({ geometry: shardGeometry(), visible: false }), pan = createNode({ geometry: panGeometry(), visible: false }), brush = createNode({ geometry: brushGeometry(), visible: false });
    addChild(site.node, shards, pan, brush);
    const state = { mode: "work", elapsed: 0, litres: CAPACITY_LITRES, sips: 0, refills: 0, broken: false, cleaned: 0, replaced: 0 };
    let sipStart = CAPACITY_LITRES, startAngle = Math.PI, x = home.x, z = home.z, fromX = 0, fromZ = 0, toX = 0, toZ = 0, fallX = 0, fallZ = 0, fallY = 0, heading = Math.PI;
    const mount = (node, parent, px, py, pz) => {
      if (node.parent !== parent) { removeChild(node.parent, node); addChild(parent, node); }
      node.position.x = px; node.position.y = py; node.position.z = pz;
      node.rotation.x = node.rotation.y = node.rotation.z = 0;
    };
    const route = (mode, tx, tz) => { state.mode = mode; fromX = x; fromZ = z; toX = tx; toZ = tz; };
    const seated = () => state.mode === "work" || state.mode === "sip" || state.mode === "chug" || state.mode === "spin";
    const pause = () => {
      state.mode = "work"; state.elapsed = 0;
      if (state.broken) state.litres = 0;
      state.broken = false; x = home.x; z = home.z;
      mount(mug, tray, 0, 0.07, 0); mount(shards, site.node, 0, 0, 0);
      mount(pan, site.node, 0, 0, 0); mount(brush, site.node, 0, 0, 0);
      mug.visible = stream.visible = shards.visible = pan.visible = brush.visible = false;
      lever.rotation.x = 0; stock[4].visible = true;
    };
    const act = (action, seat) => {
      if (state.mode !== "work" && state.mode !== "sip") return false;
      state.elapsed = 0; sipStart = state.litres;
      if (action === "chug") { state.mode = "chug"; return true; }
      if (action !== "spin") return false;
      state.mode = "spin"; seat.speed = Math.min(7, seat.speed + 4.5);
      const h = site.chair.scale.x;
      fallX = home.x + Math.cos(seat.angle) * 0.95 * h;
      fallZ = home.z - Math.sin(seat.angle) * 0.95 * h; fallY = 1.12 * h;
      return true;
    };
    const update = (cave, seat, dt) => {
      const h = cave.traits.height, parts = cave.parts;
      state.elapsed += dt;
      while (state.elapsed >= DURATIONS[state.mode]) {
        state.elapsed -= DURATIONS[state.mode];
        // Complete the previous leg before the next route starts (also for large dt).
        if (state.mode.endsWith("walk") || state.mode === "return") { x = toX; z = toZ; }
        switch (state.mode) {
          case "work": sipStart = state.litres; state.mode = state.litres > 0.001 ? "sip" : "rise"; startAngle = seat.angle; break;
          case "sip": case "chug": {
            const chug = state.mode === "chug";
            state.sips++; state.litres = chug ? 0 : Math.max(0, sipStart - CAPACITY_LITRES / 5);
            state.mode = state.litres < 0.001 ? "rise" : "work"; startAngle = seat.angle; break;
          }
          case "spin": state.broken = true; state.litres = 0; state.mode = "rise"; startAngle = seat.angle; break;
          case "rise": x = S.rise.x; z = S.rise.z; if (state.broken) route("cleanwalk", S.spill.x, S.spill.z); else route("walk", S.dispenser.walk.x, S.dispenser.walk.z); break;
          case "cleanwalk": state.mode = "clean"; break;
          case "clean": route("trashwalk", S.bin.walk.x, S.bin.walk.z); break;
          case "trashwalk": state.mode = "discard"; break;
          case "discard": state.cleaned++; route("cabinetwalk", S.cabinet.walk.x, S.cabinet.walk.z); break;
          case "cabinetwalk": state.mode = "take"; break;
          case "take": state.broken = false; state.replaced++; stock[4].visible = false; route("tapwalk", S.dispenser.walk.x, S.dispenser.walk.z); break;
          case "walk": case "tapwalk": state.mode = "fill"; break;
          case "fill": state.litres = CAPACITY_LITRES; state.refills++; route("return", S.rise.x, S.rise.z); break;
          case "return": state.mode = "sit"; break;
          case "sit": state.mode = "work"; x = home.x; z = home.z; stock[4].visible = true; break;
        }
      }
      const mode = state.mode, t = state.elapsed / DURATIONS[mode];
      mug.visible = !state.broken; stream.visible = mode === "fill";
      lever.rotation.x = mode === "fill" ? -0.5 : 0;
      pan.visible = mode === "clean" || mode === "trashwalk" || mode === "discard";
      brush.visible = mode === "clean";
      if (mode === "sip" || mode === "chug") state.litres = Math.max(0, sipStart - (mode === "chug" ? sipStart : CAPACITY_LITRES / 5) * smooth((t - 0.25) / 0.5));
      if (mode === "fill") state.litres = t * CAPACITY_LITRES;
      liquid.visible = foam.visible = state.litres > 0.001;
      const fill = state.litres / CAPACITY_LITRES;
      liquid.scale.y = Math.max(0.001, fill); foam.position.y = 0.012 + fill * FILL_HEIGHT;
      if (mode === "work") { mount(mug, tray, 0, 0.07, 0); return; }
      if (mode === "spin") {
        const flight = Math.min(1, state.elapsed / 0.7);
        mount(mug, site.node, fallX + (S.spill.x - fallX) * flight, Math.max(0.04, fallY * (1 - flight * flight)), fallZ + (S.spill.z - fallZ) * flight);
        mug.rotation.z = flight * 2.4;
        if (flight === 1) { state.broken = true; state.litres = 0; mug.visible = false; }
        mount(shards, site.node, S.spill.x, 0.01, S.spill.z); shards.visible = state.broken;
        return;
      }
      if (mode !== "fill" && mode !== "take") mount(mug, parts.armL, -0.27, -0.48 * h, 0.08 * h);
      if (mode === "sip" || mode === "chug") {
        const lift = smooth(t / 0.25) * (1 - smooth((t - 0.75) / 0.25));
        parts.armL.rotation.x = -0.95 - lift * 0.75; parts.armL.rotation.z = -0.2 * lift;
        parts.head.rotation.x = 0.28 - lift * 0.4;
        mug.rotation.x = -parts.armL.rotation.x + 0.23 - lift * (mode === "chug" ? 1.1 : 0.7);
        return;
      }
      seat.speed = 0;
      seat.angle = mode === "rise" ? startAngle + Math.atan2(Math.sin(Math.PI - startAngle), Math.cos(Math.PI - startAngle)) * smooth(t) : Math.PI;
      site.swivel.rotation.y = seat.angle;
      // Getting up and sitting down he faces as the chair does; walking, the way he goes; at a piece of gear, that
      // piece; sweeping, the way he came.
      let standing = 1;
      const walking = mode.endsWith("walk") || mode === "return";
      if (mode === "rise" || mode === "sit") {
        standing = mode === "rise" ? smooth(t) : 1 - smooth(t);
        x = home.x + (S.rise.x - home.x) * standing; z = home.z + (S.rise.z - home.z) * standing; heading = seat.angle;
      } else if (walking) {
        x = fromX + (toX - fromX) * t; z = fromZ + (toZ - fromZ) * t;
        heading = Math.atan2(toX - fromX, toZ - fromZ);
      } else if (mode !== "clean") {
        const g = mode === "fill" ? S.dispenser : mode === "take" ? S.cabinet : S.bin;
        heading = Math.atan2(g.x - x, g.z - z);
      }
      cave.root.position.x = x; cave.root.position.z = z;
      cave.root.position.y = 0.88 * h * (1 - standing) + cave.baseY * standing;
      cave.root.rotation.x = mode === "clean" ? 0.65 : -0.23 * (1 - standing); cave.root.rotation.y = heading;
      const stride = walking ? Math.sin(state.elapsed * 9) * 0.5 : 0;
      parts.legR.rotation.x = -1.05 * (1 - standing) + stride; parts.legL.rotation.x = -1.05 * (1 - standing) - stride;
      parts.head.rotation.x = 0.12; parts.armR.rotation.x = -0.2 - stride * 0.5;
      parts.armL.rotation.x = -1.1; parts.armL.rotation.z = 0;
      mug.rotation.x = -parts.armL.rotation.x - cave.root.rotation.x;
      if (mode === "fill") {
        mount(mug, dispenser, 0, 1.11, 0.5);
        const bottom = 1.15 + fill * FILL_HEIGHT;
        stream.scale.y = Math.max(0.01, 1.5 - bottom);
        stream.position.y = (1.5 + bottom) / 2; stream.position.z = 0.5;
        parts.armL.rotation.x = -2;
      }
      if (mode === "clean") {
        mount(pan, site.node, S.spill.x, 0.08, S.spill.z);
        mount(brush, parts.armL, 0, -0.55 * h, 0);
        parts.armL.rotation.x = -0.6; parts.armL.rotation.z = Math.sin(t * Math.PI * 8) * 0.35;
        mount(shards, site.node, S.spill.x, 0.02 + t * 0.08, S.spill.z); shards.scale.x = shards.scale.z = 1 - t * 0.65;
      } else if (mode === "trashwalk" || mode === "discard") {
        mount(pan, parts.armR, 0, -0.56 * h, 0.1); parts.armR.rotation.x = -1.3;
        pan.rotation.x = 1.3;
        if (mode !== "discard") mount(shards, pan, 0, 0.03, 0);
        else {
          mount(shards, site.node, S.bin.walk.x + (S.bin.x - S.bin.walk.x) * t, 0.85 + Math.sin(t * Math.PI) * 0.5, S.bin.walk.z + (S.bin.z - S.bin.walk.z) * t);
          shards.visible = t < 0.9; pan.rotation.z = -t;
        }
      } else if (!state.broken || mode === "cabinetwalk" || mode === "take") shards.visible = false;
      if (mode === "take") { parts.armL.rotation.x = -1.7; mug.visible = t > 0.6; mount(mug, cabinet, 0, 0.84, 0.05); stock[4].visible = t <= 0.6; }
    };
    return { dispenser, cabinet, bin, mug, stream, shards, state, update, pause, act, get seated() { return seated(); }, dispose: pause };
  };
  BL.timechainBeer = { create };
})();
