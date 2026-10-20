// Timechain Sphere: the painted ball off the southwest rim, its bridge, and the one doorway into its nine rooms. The
// island keeps only the outside: the shell, the doors whose outer faces carry the ball's turning bands and ₿ across
// their seam, the keypad beside them, and a short dim passage behind them ending in a hanging curtain, which hides a
// traveler before their room loads. The rooms themselves are a scene of their own (scene-timechain.js). A solid plug
// across the doorway keeps every walker, jumper and jetpack out whether the doors stand open or not; only a guided
// crossing (timechain-gate.js) lifts it, for its own traveler.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { cached, box, bevelBox, lathe, merge, makeVox, voxelGeometry } = BL.models;
  const { limb, padNormals, flatInto } = BL.hubModels;
  const { createNode, addChild } = BL.scene;
  // The bridge deck meets the portal at its full outer width, so the approach does not pinch down before the doors.
  const PORTAL_WIDTH = 6;
  const SITE = { bearing: BL.terrain.TIMECHAIN.bearing, radius: 13, depth: 12, span: 18, width: PORTAL_WIDTH, bridgeFloor: 0.07 };
  const DIR = { x: Math.sin(SITE.bearing), z: -Math.cos(SITE.bearing) };
  const UNIT = 0.5, WOOD = "#795335", PLANK = "#8b6340", POST = "#5e3f27", ORANGE = "#f7931a";
  const SHELL_R = 13, SHELL_SKIN = 0.16, SHELL_CY = 3;
  // Where the shell's inner skin meets a height: the floor must stay inside it, underside included.
  const innerReach = (y) => Math.sqrt((SHELL_R - SHELL_SKIN) ** 2 - (SHELL_CY - y) ** 2);
  const ground = cached(() => {
    const v = makeVox(), limit = innerReach(-UNIT) - 0.01;
    for (let x = -26; x < 26; x++) for (let z = -26; z < 26; z++) {
      // A block stays only if its farthest corner is inside the wall, so no square edge pokes through the shell.
      if (Math.hypot(Math.max(-x, x + 1), Math.max(-z, z + 1)) * UNIT > limit) continue;
      v.set(x, -1, z, Math.abs(x + 0.5) < 1.5 ? 2 : (x + z) % 4 === 0 ? 1 : 0);
    }
    // A low trim closes the notches the square blocks leave against the curve; it walks as floor.
    const trimIn = limit - UNIT * Math.SQRT2, trimOut = innerReach(0.04) - 0.03;
    return merge(
      voxelGeometry(v, { unit: UNIT, palette: ["#263843", "#304650", "#a3874f"], origin: { x: 0, y: 0, z: 0 } }),
      lathe({ profile: [[trimIn, 0], [trimOut, 0], [trimOut, 0.04], [trimIn, 0.04], [trimIn, 0]], segments: 96, color: "#1d2b33" })
    );
  });
  // The collision shell stays fixed while the painted exterior turns round the doorway and its doors.
  const SEGMENTS = 96, STEP = 2 * Math.PI / SEGMENTS, LUNES = 16, DOOR_TOP = 4.8, INSIDE = [19, 32, 45];
  const TAU = Math.PI * 2, DOOR_HALF_ANGLE = Math.PI / 16, SYMBOL_CELL = 0.075, SYMBOL_SLICES = 4, SYMBOL_RADIUS = SHELL_R + 0.05;
  const SYMBOL_BEARINGS = [Math.PI / 6, Math.PI / 6 + TAU / 3, Math.PI / 6 - TAU / 3];
  const DOOR_BOTTOM_LAT = Math.asin(-SHELL_CY / SYMBOL_RADIUS), DOOR_TOP_LAT = Math.asin((DOOR_TOP - SHELL_CY) / SYMBOL_RADIUS);
  const BITCOIN = ["00011011000", "00011011000", "01111111100", "00110000110", "00110000110", "00111111100", "00110000110", "00110000011", "00110000011", "01111111110", "00011011000", "00011011000"];
  const shell = cached(() => {
    const levels = Array.from({ length: 49 }, (_, i) => -Math.PI / 2 + i * Math.PI / 48);
    levels.push(Math.asin(-SHELL_CY / SHELL_R), Math.asin((DOOR_TOP - SHELL_CY) / SHELL_R)); levels.sort((a, b) => a - b);
    const tones = ["#d9700b", "#e8810d", "#f7931a", "#ef8910"].map(BL.math.hexToRgb), ribbon = [255, 188, 83], logo = [255, 249, 230];
    const layer = () => ({ verts: [], faces: [], lines: [], normals: [] });
    const caps = Array.from({ length: LUNES }, layer), solid = { verts: [], faces: [], lines: [] };
    const quad = (geo, r, lo, hi, bottom, top, inward, color, emissive) => {
      const base = geo.verts.length / 3, sign = inward ? -1 : 1;
      for (const [a, b] of [[lo, bottom], [hi, bottom], [hi, top], [lo, top]]) {
        const nx = Math.cos(b) * Math.sin(a), ny = Math.sin(b), nz = Math.cos(b) * Math.cos(a);
        geo.verts.push(r * nx, SHELL_CY + r * ny, r * nz);
        if (geo.normals) geo.normals.push(sign * nx, sign * ny, sign * nz);
      }
      geo.faces.push({ i: inward ? [base + 3, base + 2, base + 1, base] : [base, base + 1, base + 2, base + 3], color, emissive });
    };
    for (let row = 0; row < levels.length - 1; row++) for (let col = 0; col < SEGMENTS; col++) {
      const lo = -Math.PI + col * STEP, hi = lo + STEP, bottom = levels[row], top = levels[row + 1];
      const latitude = (bottom + top) / 2, longitude = (lo + hi) / 2;
      const y = SHELL_CY + SHELL_R * Math.sin(latitude);
      if (Math.abs(longitude) < DOOR_HALF_ANGLE && y > 0 && y < DOOR_TOP) continue;
      const band = Math.abs(latitude - 0.5 - 0.12 * Math.sin(longitude * 3)) < 0.06 || Math.abs(latitude + 0.5 + 0.12 * Math.sin(longitude * 3)) < 0.06;
      const lune = Math.floor(col * LUNES / SEGMENTS), plain = band ? ribbon : tones[(row + col % 3) % tones.length];
      if (y <= 0 || y >= DOOR_TOP) quad(caps[lune], SHELL_R + 0.02, lo, hi, bottom, top, false, plain, band ? 0.8 : 0.5);
      quad(solid, SHELL_R, lo, hi, bottom, top, false, INSIDE, 0);
      quad(solid, SHELL_R - SHELL_SKIN, lo, hi, bottom, top, true, INSIDE, 0);
    }
    // Close the doorway's cut between the skins (sill, lintel, jambs; the frame hides them), so the collision shell
    // is one closed solid: open, a point on the threshold saw only the outer skin above it and counted as inside.
    const sill = Math.asin(-SHELL_CY / SHELL_R), lintel = Math.asin((DOOR_TOP - SHELL_CY) / SHELL_R), edge = 3 * STEP;
    const at = (r, a, b) => [r * Math.cos(b) * Math.sin(a), SHELL_CY + r * Math.sin(b), r * Math.cos(b) * Math.cos(a)];
    const reveal = (corners, out) => {
      const base = solid.verts.length / 3;
      let nx = 0, ny = 0, nz = 0;
      for (let k = 0; k < 4; k++) {
        const p = corners[k], q = corners[(k + 1) % 4];
        solid.verts.push(...p);
        nx += (p[1] - q[1]) * (p[2] + q[2]); ny += (p[2] - q[2]) * (p[0] + q[0]); nz += (p[0] - q[0]) * (p[1] + q[1]);
      }
      const i = [base, base + 1, base + 2, base + 3];
      solid.faces.push({ i: nx * out[0] + ny * out[1] + nz * out[2] < 0 ? i.reverse() : i, color: INSIDE, emissive: 0 });
    };
    const outer = SHELL_R, innerR = SHELL_R - SHELL_SKIN;
    for (let col = -3; col < 3; col++) {
      const lo = col * STEP, hi = lo + STEP;
      reveal([at(outer, lo, lintel), at(outer, hi, lintel), at(innerR, hi, lintel), at(innerR, lo, lintel)], [0, -1, 0]);
      reveal([at(outer, lo, sill), at(outer, hi, sill), at(innerR, hi, sill), at(innerR, lo, sill)], [0, 1, 0]);
    }
    for (let row = levels.indexOf(sill); row < levels.indexOf(lintel); row++) for (const side of [-1, 1]) {
      const a = side * edge, bottom = levels[row], top = levels[row + 1];
      reveal([at(outer, a, bottom), at(outer, a, top), at(innerR, a, top), at(innerR, a, bottom)], [-side * Math.cos(a), 0, side * Math.sin(a)]);
    }
    // Split the door-height band into angular strips, then mask only strips crossing the fixed opening.
    const bandRows = [], bandGroups = new Map(), doorRows = [], sliceWidth = STEP / SYMBOL_SLICES;
    for (let row = 0; row < levels.length - 1; row++) {
      const bottom = levels[row], top = levels[row + 1], y = SHELL_CY + SHELL_R * Math.sin((bottom + top) / 2);
      if (y > 0 && y < DOOR_TOP) doorRows.push({ row, bottom, top });
    }
    for (let col = 0; col < SEGMENTS; col++) {
      const longitude = -Math.PI + (col + 0.5) * STEP, lune = Math.floor(col * LUNES / SEGMENTS);
      const paints = doorRows.map(({ row, bottom, top }) => {
        const latitude = (bottom + top) / 2;
        const band = Math.abs(latitude - 0.5 - 0.12 * Math.sin(longitude * 3)) < 0.06 || Math.abs(latitude + 0.5 + 0.12 * Math.sin(longitude * 3)) < 0.06;
        return band ? 4 : (row + col % 3) % tones.length;
      });
      for (let slice = 0; slice < SYMBOL_SLICES; slice++) {
        const key = `${lune}:${paints.join("")}`;
        let group = bandGroups.get(key);
        if (!group) {
          const geometry = layer();
          for (let i = 0; i < doorRows.length; i++) quad(geometry, SHELL_R + 0.02, -sliceWidth / 2, sliceWidth / 2,
            doorRows[i].bottom, doorRows[i].top, false, paints[i] === 4 ? ribbon : tones[paints[i]], paints[i] === 4 ? 0.8 : 0.5);
          group = { geometry, angles: [], lune, halfWidth: sliceWidth / 2 };
          bandGroups.set(key, group); bandRows.push(group);
        }
        group.angles.push(longitude + (slice - (SYMBOL_SLICES - 1) / 2) * sliceWidth);
      }
    }
    const symbolRows = [];
    for (let row = 0; row < BITCOIN.length; row++) {
      const top = (BITCOIN.length / 2 - row) * SYMBOL_CELL, bottom = top - SYMBOL_CELL, cuts = [bottom];
      if (bottom < DOOR_BOTTOM_LAT && DOOR_BOTTOM_LAT < top) cuts.push(DOOR_BOTTOM_LAT);
      if (bottom < DOOR_TOP_LAT && DOOR_TOP_LAT < top) cuts.push(DOOR_TOP_LAT);
      cuts.push(top);
      for (let part = 0; part < cuts.length - 1; part++) {
        const low = cuts[part], high = cuts[part + 1], geometry = layer(), half = SYMBOL_CELL / (SYMBOL_SLICES * 2);
        quad(geometry, SYMBOL_RADIUS, -half, half, low, high, false, logo, 0.85);
        symbolRows.push({ row, geometry, mask: low >= DOOR_BOTTOM_LAT && high <= DOOR_TOP_LAT, halfWidth: half });
      }
    }
    for (const geo of [...caps, ...bandRows.map(row => row.geometry), ...symbolRows.map(row => row.geometry)]) geo.normals = Float32Array.from(geo.normals);
    return { caps, solid, bandRows, symbolRows };
  });
  const rotatingBatch = (geometry, angles, place, owner, mask, halfWidth) => {
    const node = createNode({ geometry, sightHidden: true, instanceData: new Float32Array(angles.length * 20), instanceCount: 0, instanceVersion: 0, fixedInstanceCapacity: true });
    const baseCos = new Float32Array(angles.length), baseSin = new Float32Array(angles.length);
    for (let i = 0; i < angles.length; i++) {
      baseCos[i] = Math.cos(place.ry + angles[i]); baseSin[i] = Math.sin(place.ry + angles[i]);
    }
    return { node, angles: new Float32Array(angles), baseCos, baseSin, place, owner, mask, halfWidth };
  };
  // Writes a batch's strips for the ball turned by `spin`. A strip over the doorway belongs to the door leaf it lies
  // on: with the doors parted by `slide` it moves out with its leaf (`slideCos`, `slideSin`) and is gone once it passes
  // the jamb, under the fixed shell; closed, the doors carry the pattern unbroken across their seam.
  const turnBatch = (batch, spin, spinCos, spinSin, slide, slideCos, slideSin) => {
    const { node, angles, baseCos, baseSin, place, owner, mask } = batch, data = node.instanceData;
    let count = 0;
    for (let i = 0; i < angles.length; i++) {
      let local = angles[i] + spin;
      if (local > Math.PI) local -= TAU;
      if (local > Math.PI) local -= TAU;
      if (local < -Math.PI) local += TAU;
      let c = baseCos[i] * spinCos - baseSin[i] * spinSin, s = baseSin[i] * spinCos + baseCos[i] * spinSin;
      if (mask && slide > 0 && Math.abs(local) < DOOR_HALF_ANGLE) {
        const side = local < 0 ? -1 : 1;
        if (Math.abs(local + side * slide) >= DOOR_HALF_ANGLE) continue;
        const sn = side * slideSin, turned = c * slideCos - s * sn;
        s = s * slideCos + c * sn; c = turned;
      }
      const o = count++ * 20;
      data[o] = c; data[o + 1] = 0; data[o + 2] = -s; data[o + 3] = 0;
      data[o + 4] = 0; data[o + 5] = 1; data[o + 6] = 0; data[o + 7] = 0;
      data[o + 8] = s; data[o + 9] = 0; data[o + 10] = c; data[o + 11] = 0;
      data[o + 12] = place.x; data[o + 13] = place.y; data[o + 14] = place.z; data[o + 15] = 1;
      data[o + 16] = owner.glow; data[o + 17] = owner.highlight; data[o + 18] = 0; data[o + 19] = 0;
    }
    node.instanceCount = count;
    node.instanceVersion++;
  };
  // A chunky timber frame over the cut edges of both skins, lit gold along its inner faces.
  const portal = cached(() => merge(
    bevelBox({ w: PORTAL_WIDTH, h: 0.5, d: 0.9, color: WOOD, offset: { y: 5.05 } }),
    box({ w: 4.82, h: 0.06, d: 0.5, color: "#ffbd53", emissive: 0.9, offset: { y: 4.765 } }),
    ...[-1, 1].flatMap(side => [
      bevelBox({ w: 0.5, h: 5.1, d: 0.9, color: WOOD, offset: { x: side * 2.72, y: 2.45 } }),
      box({ w: 0.06, h: 4.7, d: 0.5, color: "#ffbd53", emissive: 0.9, offset: { x: side * 2.435, y: 2.4 } })
    ])
  ));
  // The raised deck overlaps the floor trim and the home shore, keeping a continuous walk through the doorway.
  // Coordinates are in the bridge's frame (z = 0 at BRIDGE_Z).
  const BRIDGE_Z = SITE.radius - 2, DECK = innerReach(0.04) - 0.55 - BRIDGE_Z, DECK_END = SITE.span + 0.5, GATE = SITE.span - 1;
  const POSTS = Array.from({ length: 5 }, (_, i) => DECK + 0.9 + i * (GATE - DECK - 0.9) / 5);
  // Plain boxes as the walking shell: one deck slab, the rail and the posts, so the cartoon pieces never change it.
  const bridgeShell = cached(() => {
    const length = DECK_END - DECK, middle = (DECK + DECK_END) / 2, geos = [box({ w: SITE.width, h: 0.16, d: length, color: WOOD, offset: { y: -0.01, z: middle } })];
    for (const side of [-1, 1]) {
      const x = side * (SITE.width / 2 + 0.1);
      geos.push(box({ w: 0.12, h: 0.12, d: GATE - POSTS[0], color: WOOD, offset: { x, y: 0.95, z: (POSTS[0] + GATE) / 2 } }));
      for (const z of POSTS) geos.push(box({ w: 0.26, h: 1.3, d: 0.26, color: WOOD, offset: { x, y: 0.5, z } }));
      geos.push(box({ w: 0.36, h: 2.7, d: 0.36, color: WOOD, offset: { x: side * (SITE.width / 2 + 0.18), y: 1.2, z: GATE } }));
    }
    geos.push(box({ w: SITE.width + 0.9, h: 0.3, d: 0.3, color: WOOD, offset: { y: 2.55, z: GATE } }));
    return merge(...geos);
  });
  // Drawn as the island's cartoon crossings are: bevelled planks on two stringers, chunky posts with Bitcoin-orange
  // caps, thick sagging rope rails and a lantern gateway on the shore.
  const bridge = cached(() => {
    const geo = { verts: [], faces: [], lines: [], smooth: true, normals: [] }, w = SITE.width, length = DECK_END - DECK;
    const count = Math.round(length / 0.46), pitch = length / count, rope = BL.math.hexToRgb("#d2ab62");
    for (let i = 0; i < count; i++) flatInto(geo, bevelBox({ w, h: 0.18, d: pitch + 0.02, color: i % 3 === 0 ? PLANK : WOOD, bevel: 0.04, offset: { y: -0.02, z: DECK + (i + 0.5) * pitch } }));
    for (const side of [-1, 1]) {
      const x = side * (w / 2 + 0.1), stops = [...POSTS, GATE];
      flatInto(geo, bevelBox({ w: 0.22, h: 0.22, d: length, color: POST, offset: { x: side * (w / 2 - 0.2), y: -0.25, z: DECK + length / 2 } }));
      for (const z of POSTS) flatInto(geo,
        bevelBox({ w: 0.26, h: 1.3, d: 0.26, color: POST, offset: { x, y: 0.5, z } }),
        bevelBox({ w: 0.34, h: 0.14, d: 0.34, color: ORANGE, offset: { x, y: 1.2, z } }));
      for (let i = 0; i + 1 < stops.length; i++) {
        let from = stops[i];
        for (let k = 1; k <= 6; k++) {
          const t = k / 6, to = stops[i] + (stops[i + 1] - stops[i]) * t, y = (a) => 1.02 - 0.12 * 4 * a * (1 - a);
          limb(geo, x, y((k - 1) / 6), from, x, y(t), to, 0.055, 0.055, 6, rope);
          from = to;
        }
      }
      padNormals(geo);
      flatInto(geo,
        bevelBox({ w: 0.36, h: 2.7, d: 0.36, color: POST, offset: { x: side * (w / 2 + 0.18), y: 1.2, z: GATE } }),
        bevelBox({ w: 0.46, h: 0.2, d: 0.46, color: ORANGE, offset: { x: side * (w / 2 + 0.18), y: 2.62, z: GATE } }));
    }
    flatInto(geo,
      bevelBox({ w: w + 0.9, h: 0.3, d: 0.3, color: PLANK, offset: { y: 2.55, z: GATE } }),
      bevelBox({ w: 0.3, h: 0.08, d: 0.3, color: "#3b2a1c", offset: { y: 2.36, z: GATE } }),
      bevelBox({ w: 0.26, h: 0.3, d: 0.26, color: "#ffb347", emissive: 1, bevel: 0.05, offset: { y: 2.16, z: GATE } }),
      bevelBox({ w: 0.3, h: 0.06, d: 0.3, color: "#3b2a1c", offset: { y: 1.99, z: GATE } }));
    geo.normals = Float32Array.from(geo.normals);
    geo.collisionGeometry = bridgeShell();
    return geo;
  });
  // Behind the doors, in the ball's frame: a short dim passage from the doorway (MOUTH) to a curtain of hanging strips
  // (CURTAIN), and past it a closed pocket where a traveler stands hidden (PARK) while their room loads, and where one
  // coming back out appears. WAIT is where a traveler stands on the bridge before the doors part, square to them.
  const PASSAGE = { halfW: 2.5, top: 4.78, mouth: 12.3, curtain: 9.4, back: 7.6, floor: 0.04 };
  const SPOTS = { WAIT: { x: 0, z: 14.4 }, PARK: { x: 0, z: 8.4 }, THRESHOLD: 12.65, KEYPAD: { x: 2.72, y: 1.42, z: 13.13 }, KEYPAD_REACH: 2.4 };
  const DARK = "#141416", DARKER = "#0b0b0c";
  const facing = (geo, pts, color, emissive, normal) => {
    const base = geo.verts.length / 3;
    let nx = 0, ny = 0, nz = 0;
    for (let k = 0; k < 4; k++) {
      const p = pts[k], q = pts[(k + 1) % 4];
      geo.verts.push(p[0], p[1], p[2]);
      nx += (p[1] - q[1]) * (p[2] + q[2]); ny += (p[2] - q[2]) * (p[0] + q[0]); nz += (p[0] - q[0]) * (p[1] + q[1]);
    }
    const i = [base, base + 1, base + 2, base + 3];
    geo.faces.push({ i: nx * normal[0] + ny * normal[1] + nz * normal[2] < 0 ? i.reverse() : i, color: BL.math.hexToRgb(color), emissive });
  };
  // The passage as drawn; its collision is the whole closed ball, the old floor inside it and the passage's own
  // closed slabs, so nothing walks into the ball's hollow and the guided traveler has a floor and walls.
  const passage = cached(() => {
    const geo = { verts: [], faces: [], lines: [] }, { halfW: W, top: T, mouth: M, curtain: C, back: B, floor: F } = PASSAGE;
    facing(geo, [[-W, F, B], [W, F, B], [W, F, M], [-W, F, M]], DARK, 0, [0, 1, 0]);
    facing(geo, [[-W, T, B], [W, T, B], [W, T, M], [-W, T, M]], DARKER, 0, [0, -1, 0]);
    for (const side of [-1, 1]) facing(geo, [[side * W, F, B], [side * W, F, M], [side * W, T, M], [side * W, T, B]], DARK, 0, [-side, 0, 0]);
    facing(geo, [[-W, F, B], [W, F, B], [W, T, B], [-W, T, B]], DARKER, 0, [0, 0, 1]);
    const strips = 14;
    for (let i = 0; i < strips; i++) {
      const x0 = -W + 2 * W * i / strips, x1 = x0 + 2 * W / strips;
      facing(geo, [[x0, F, C], [x1, F, C], [x1, T, C], [x0, T, C]], i & 1 ? DARKER : "#19191c", 0, [0, 0, 1]);
    }
    const slab = (w, h, d, x, y, z) => box({ w, h, d, color: DARK, offset: { x, y, z } });
    const length = M + 0.3 - B, middle = (M + 0.3 + B) / 2;
    geo.collisionGeometry = merge(shell().solid, ground(),
      slab(2 * W, 0.34, length, 0, F - 0.17, middle), slab(2 * W, 0.22, length, 0, T + 0.11, middle),
      ...[-1, 1].map((side) => slab(0.2, T, length, side * (W + 0.1), T / 2, middle)), slab(2 * W + 0.4, T, 0.2, 0, T / 2, B - 0.1));
    return geo;
  });
  // A dim amber line along each foot of the passage, so it reads as a way in and not a hole.
  const passageGlow = cached(() => {
    const geo = { verts: [], faces: [], lines: [], castShadow: false }, { halfW: W, mouth: M, curtain: C, floor: F } = PASSAGE;
    for (const side of [-1, 1]) facing(geo, [[side * (W - 0.12) - 0.025, F + 0.004, C], [side * (W - 0.12) + 0.025, F + 0.004, C], [side * (W - 0.12) + 0.025, F + 0.004, M], [side * (W - 0.12) - 0.025, F + 0.004, M]], "#9c5a12", 0.55, [0, 1, 0]);
    return geo;
  });
  // A door leaf on the ball's surface, `side` -1 (to the left of the seam, seen from the bridge) or 1: dark orange
  // under the pattern its strips paint on it, charcoal toward the passage, and a dark line on its leading edge, the
  // seam. It slides by turning about the ball's vertical axis, into the gap between the skins.
  const LEAF_R = SHELL_R - 0.07;
  const leaf = (side) => {
    const geo = { verts: [], faces: [], lines: [] }, cols = 6, rows = 10;
    const at = (lon, y, r = LEAF_R) => { const ring = Math.sqrt(r * r - (y - SHELL_CY) ** 2); return [ring * Math.sin(lon), y, ring * Math.cos(lon)]; };
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const a0 = side * DOOR_HALF_ANGLE * i / cols, a1 = side * DOOR_HALF_ANGLE * (i + 1) / cols, y0 = DOOR_TOP * j / rows, y1 = DOOR_TOP * (j + 1) / rows;
      const m = (a0 + a1) / 2, out = [Math.sin(m), 0, Math.cos(m)];
      facing(geo, [at(a0, y0), at(a1, y0), at(a1, y1), at(a0, y1)], "#c7680d", 0.3, out);
      facing(geo, [at(a0, y0, LEAF_R - 0.03), at(a1, y0, LEAF_R - 0.03), at(a1, y1, LEAF_R - 0.03), at(a0, y1, LEAF_R - 0.03)], "#1b1b1e", 0, [-out[0], 0, -out[2]]);
    }
    const e = 0.003 * side, r = SHELL_R + 0.04;
    for (let j = 0; j < rows; j++) {
      const y0 = DOOR_TOP * j / rows, y1 = DOOR_TOP * (j + 1) / rows;
      facing(geo, [at(0, y0, r), at(e, y0, r), at(e, y1, r), at(0, y1, r)], "#2a1606", 0, [0, 0, 1]);
    }
    return geo;
  };
  const leaves = [leaf(-1), leaf(1)];
  // The doorway's plug: a closed box across it that no walker crosses; drawn only as a sill sunk into the deck.
  const plug = cached(() => {
    const geo = box({ w: 4.9, h: 0.04, d: 0.5, color: "#3b2a1c", offset: { y: -0.04, z: SPOTS.THRESHOLD } });
    geo.collisionGeometry = box({ w: 5.2, h: DOOR_TOP, d: 0.55, color: "#3b2a1c", offset: { y: DOOR_TOP / 2, z: SPOTS.THRESHOLD } });
    return geo;
  });
  // The keypad flat against the right-hand post: an iron plate, a dim display, 1–9 in a 3 by 3 grid with each number
  // picked out in the signs' pixels, and Back and Enter under them. Each button stays a separate node so the island
  // can pick the real control. `KEYS` is where each number sits on it.
  const KEY_PITCH = 0.105, KEYS = Array.from({ length: 9 }, (_, i) => ({ x: (i % 3 - 1) * KEY_PITCH, y: 0.1 - Math.floor(i / 3) * KEY_PITCH }));
  const keypad = cached(() => {
    const parts = [
      box({ w: 0.44, h: 0.7, d: 0.05, color: "#2a2420" }),
      box({ w: 0.36, h: 0.09, d: 0.012, color: "#1a120a", emissive: 0.35, offset: { y: 0.25, z: 0.03 } }),
      ...[[-1, 1], [1, 1], [-1, -1], [1, -1]].map(([x, y]) => box({ w: 0.03, h: 0.03, d: 0.012, color: "#8a7a6a", offset: { x: x * 0.19, y: y * 0.32, z: 0.03 } }))
    ];
    return merge(...parts);
  });
  const keyLabel = (text, pixel, color, emissive, front = 0.0115) => {
    const geo = { verts: [], faces: [], lines: [], castShadow: false }, glyphs = BL.hubModels.SIGN_GLYPHS;
    const cells = text.length * 3 + Math.max(0, text.length - 1), left = -cells * pixel / 2;
    for (let i = 0; i < text.length; i++) {
      const glyph = glyphs[text[i]];
      if (!glyph) continue;
      for (let r = 0; r < glyph.length; r++) for (let c = 0; c < glyph[r].length; c++) {
        if (glyph[r][c] !== "1") continue;
        const x = left + (i * 4 + c) * pixel, y = (2 - r - 0.5) * pixel, z = front;
        facing(geo, [[x, y, z], [x + pixel, y, z], [x + pixel, y + pixel, z], [x, y + pixel, z]], color, emissive, [0, 0, 1]);
      }
    }
    return geo;
  };
  const keyFace = (w, h, text, pixel, color, ink, emissive = 0) => merge(
    box({ w, h, d: 0.02, color, emissive }), keyLabel(text, pixel, ink, emissive ? 0.75 : 0.45)
  );
  const DIGIT_KEYS = Array.from({ length: 9 }, (_, i) => keyFace(0.085, 0.085, String(i + 1), 0.011, "#3a3430", "#f2d39a"));
  const LIT_DIGIT_KEYS = Array.from({ length: 9 }, (_, i) => keyFace(0.09, 0.09, String(i + 1), 0.011, "#f7931a", "#17110a", 1));
  const BACK_KEY = keyFace(0.15, 0.07, "BACK", 0.0072, "#4a3a30", "#f2d39a");
  const ENTER_KEY = keyFace(0.15, 0.07, "ENTER", 0.0062, "#5a4022", "#f2d39a");
  const READY_ENTER_KEY = keyFace(0.155, 0.075, "ENTER", 0.0062, "#ffbd53", "#17110a", 1);
  const ROOM_LABELS = Array.from({ length: 9 }, (_, i) => keyLabel(`ROOM ${i + 1}`, 0.007, "#f7931a", 1, 0));
  const build = (island) => {
    let rim = 27.4;
    while (rim < 36 && island.surfaceAt(DIR.x * (rim + 0.1), DIR.z * (rim + 0.1)) > 0.5) rim += 0.1;
    // Overlap both shores, so the bridge meets solid ground rather than a voxel corner.
    const start = rim - 1, bridgeZ = BRIDGE_Z, radius = start + SITE.span + bridgeZ;
    const place = { x: DIR.x * radius, y: island.surfaceAt(DIR.x * start, DIR.z * start) + 0.02, z: DIR.z * radius, ry: -SITE.bearing, rim: start, bridgeZ, approachFrom: BL.terrain.TIMECHAIN.from };
    const node = createNode({ position: { x: place.x, y: place.y, z: place.z }, rotation: { x: 0, y: place.ry, z: 0 } });
    const { caps, bandRows, symbolRows } = shell();
    const shellNode = createNode({ geometry: passage() });
    const outer = createNode({ sightHidden: true });
    const screen = caps.map(geometry => createNode({ geometry }));
    const logo = createNode();
    screen.push(logo);
    addChild(outer, ...screen.slice(0, LUNES));
    const batches = [], logoBatches = [];
    for (const band of bandRows) {
      const batch = rotatingBatch(band.geometry, band.angles, place, screen[band.lune], true, band.halfWidth);
      batches.push(batch); addChild(outer, batch.node);
    }
    for (const part of symbolRows) {
      const angles = [];
      for (const bearing of SYMBOL_BEARINGS) for (let col = 0; col < BITCOIN[part.row].length; col++) {
        if (BITCOIN[part.row][col] !== "1") continue;
        for (let slice = 0; slice < SYMBOL_SLICES; slice++) angles.push(bearing + (col - 5 + (slice - (SYMBOL_SLICES - 1) / 2) / SYMBOL_SLICES) * SYMBOL_CELL);
      }
      const batch = rotatingBatch(part.geometry, angles, place, logo, part.mask, part.halfWidth);
      batches.push(batch); logoBatches.push(batch); addChild(outer, batch.node);
    }
    // The doors and the keypad move or light up, so they stay out of the outline registry, as the turning screen does.
    const doors = leaves.map((geometry) => createNode({ geometry, sightHidden: true }));
    let spin = 0, slide = 0;
    const turn = (angle) => {
      spin = angle;
      outer.rotation.y = angle;
      const c = Math.cos(angle), s = Math.sin(angle), sc = Math.cos(slide), ss = Math.sin(slide);
      for (let i = 0; i < batches.length; i++) turnBatch(batches[i], angle, c, s, slide, sc, ss);
    };
    // How far the doors stand open, 0 to 1; they and the pattern on them move together.
    const setDoors = (open) => {
      const next = Math.max(0, Math.min(1, open)) * DOOR_HALF_ANGLE;
      if (next === slide) return;
      slide = next;
      doors[0].rotation.y = -slide;
      doors[1].rotation.y = slide;
      turn(spin);
    };
    turn(0);
    const entrance = createNode({ geometry: portal(), position: { x: 0, y: 0, z: 12.65 } });
    addChild(entrance, createNode({ position: { x: 0, y: 5.6, z: 0 }, geometry: BL.hubModels.caveSign("TIMECHAIN SPHERE") }));
    const bridgeNode = createNode({ position: { x: 0, y: 0, z: bridgeZ }, geometry: bridge() });
    const plugNode = createNode({ geometry: plug(), sightHidden: true });
    const K = SPOTS.KEYPAD, pad = createNode({ geometry: keypad(), position: { x: K.x, y: K.y, z: K.z }, sightHidden: true });
    const keys = KEYS.map((key, i) => ({ key: String(i + 1), node: createNode({ geometry: DIGIT_KEYS[i], position: { x: key.x, y: key.y, z: 0.033 }, sightHidden: true }) }));
    const back = { key: "back", node: createNode({ geometry: BACK_KEY, position: { x: -0.085, y: -0.235, z: 0.033 }, sightHidden: true }) };
    const enter = { key: "enter", node: createNode({ geometry: ENTER_KEY, position: { x: 0.085, y: -0.235, z: 0.033 }, sightHidden: true }) };
    const readout = createNode({ position: { x: 0, y: 0.25, z: 0.0365 }, visible: false, sightHidden: true });
    readout.room = 0;
    addChild(pad, readout, ...keys.map(key => key.node), back.node, enter.node);
    // The traveler's look into their room hangs here, just in front of the curtain, on their page alone.
    const picture = createNode({ position: { x: 0, y: PASSAGE.floor, z: PASSAGE.curtain + 0.03 }, sightHidden: true });
    addChild(node, shellNode, createNode({ geometry: passageGlow(), sightHidden: true }), outer, entrance, bridgeNode, ...doors, plugNode, pad, picture);
    // A key lit (1–9), or none (0); the selected number and ready Enter label turn black against amber.
    let selected = 0;
    const choose = (digit) => {
      if (selected) keys[selected - 1].node.geometry = DIGIT_KEYS[selected - 1];
      selected = digit > 0 && digit <= 9 ? digit : 0;
      if (selected) keys[selected - 1].node.geometry = LIT_DIGIT_KEYS[selected - 1];
      enter.node.geometry = selected ? READY_ENTER_KEY : ENTER_KEY;
      readout.room = selected;
      readout.geometry = selected ? ROOM_LABELS[selected - 1] : null;
      readout.visible = !!selected;
    };
    return { node, shell: shellNode, outer, turn, setDoors, screen, logoBatches, entrance, bridge: bridgeNode, doors, plug: plugNode, keypad: pad, keys: [...keys, back, enter], readout, choose, picture, place };
  };
  // Most of the time the screen holds its picture; every minute or so it runs a seven-second show on the lunes'
  // `glow` and `highlight`, never the same one twice running, then settles back exactly. Some shows take the logos
  // away (the plain tiles under them light in their place) and bring them back. Every node and geometry is built
  // once with the site, so a show only writes floats and flips visibility. `show(site)` returns the per-frame step;
  // the first step after the wait only picks the show. `step.cue(kind)` starts that show next, as soon as none is
  // running (the doorway's heartbeat, `HEARTBEAT`, while a room takes longer than usual to ready).
  const SHOW_SECONDS = 7, SHOWS = 7, HEARTBEAT = 6;
  // A small integer hash for the sparkle, so a lune's flicker needs no allocation.
  const flicker = (a, b) => {
    let h = Math.imul(a + 1, 0x9e3779b1) ^ Math.imul(b + 7, 0x85ebca6b);
    h = Math.imul(h ^ h >>> 15, 0x2c1b3c6d);
    return ((h ^ h >>> 12) >>> 0) / 4294967296;
  };
  const wrap = (angle) => (angle + 5 * Math.PI) % (2 * Math.PI) - Math.PI;
  const show = (site) => {
    let wait = 20 + Math.random() * 40, t = -1, kind = -1, next = -1;
    const logo = site.screen[LUNES];
    const showLogo = (on) => {
      if (logo.visible === on) return;
      logo.visible = on;
      for (const batch of site.logoBatches) batch.node.visible = on;
    };
    const step = (dt) => {
      if (t < 0) {
        if ((wait -= dt) > 0) return;
        t = 0; kind = next >= 0 ? next : (kind + 1 + Math.floor(Math.random() * (SHOWS - 1))) % SHOWS; next = -1;
        return;
      }
      t = Math.min(SHOW_SECONDS, t + dt);
      const fade = Math.min(1, t * 2, (SHOW_SECONDS - t) * 2), screen = site.screen;
      let logoGlow = Math.floor(t * 3) % 2 ? 2.2 : 0.5, logoOn = true;
      for (let i = 0; i < LUNES; i++) {
        const at = (i + 0.5) / LUNES * 2 * Math.PI - Math.PI;
        let glow, highlight;
        if (kind === 0) {
          // A beam sweeps round twice.
          const off = wrap(at - t * 1.9), beam = Math.exp(-off * off * 3);
          glow = 0.3 + 2.2 * beam; highlight = beam * 0.9;
        } else if (kind === 1) {
          // A marquee chase.
          const on = (i + Math.floor(t * 8)) % 4 === 0;
          glow = on ? 2.4 : 0.35; highlight = on ? 0.7 : 0;
        } else if (kind === 2) {
          // The ball breathes, and the logos fade out at the bottom of each breath.
          const breath = 0.5 - 0.5 * Math.cos(t * 4.5);
          glow = 0.35 + 2 * breath; highlight = breath * 0.6;
          logoOn = breath > 0.25; logoGlow = 0.6 + 1.6 * breath;
        } else if (kind === 3) {
          // Sparkle: lunes flash at random ten times a second, the logos blink out.
          const spark = flicker(i, Math.floor(t * 10)) > 0.7;
          glow = spark ? 2.6 : 0.4; highlight = spark ? 0.8 : 0;
          logoOn = Math.floor(t * 2.5) % 2 === 0;
        } else if (kind === 4) {
          // Twin beams leave the door, meet at the back and come home.
          const reach = Math.PI * (0.5 - 0.5 * Math.cos(t * 1.8)), off = Math.abs(Math.abs(at) - reach), beam = Math.exp(-off * off * 4);
          glow = 0.3 + 2.3 * beam; highlight = beam * 0.8;
        } else if (kind === 5) {
          // Blackout and reveal: the ball goes dark without its logos, lights lune by lune round from the door, and
          // the logos pop back with a flash.
          const lit = Math.max(0, Math.min(1, (t - 1.2 - (at + Math.PI) / (2 * Math.PI) * 3.2) * 3));
          glow = 0.12 + 1.3 * lit; highlight = lit * (1 - Math.min(1, Math.max(0, t - 4.4))) * 0.9;
          logoOn = t > 4.4; logoGlow = t > 4.4 ? 1 + 1.8 * Math.max(0, 5.4 - t) : 1;
        } else {
          // Heartbeat: a double pulse a second, the logos beating with it.
          const beat = t % 1.1, pulse = Math.exp(-((beat - 0.1) ** 2) * 200) + 0.7 * Math.exp(-((beat - 0.35) ** 2) * 200);
          glow = 0.4 + 2.2 * pulse; highlight = pulse * 0.7; logoGlow = 0.8 + 1.8 * pulse;
        }
        screen[i].glow = 1 + (glow - 1) * fade;
        screen[i].highlight = highlight * fade;
      }
      logo.glow = 1 + (logoGlow - 1) * fade;
      showLogo(logoOn || fade < 1);
      if (t >= SHOW_SECONDS) { t = -1; wait = 45 + Math.random() * 60; showLogo(true); }
    };
    step.cue = (want) => {
      if (t >= 0) return;
      next = want;
      wait = 0;
    };
    return step;
  };
  BL.timechainModels = { SITE, DIR, PASSAGE, SPOTS, HEARTBEAT, build, show };
})();
