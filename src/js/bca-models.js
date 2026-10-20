// B.C.A., Banana Certified Accounting: the office behind the 10 o'clock mouth, in the mouth's frame (+z leads out
// of the cave, the floor at y = 0). Two walnut desks stand either side of the centre aisle, facing the door, each
// with a swivel chair turned out to the aisle until someone sits, a chunky monitor showing the ledger, a keyboard,
// an abacus whose beads really slide, the open ledger and its receipts and a banker's lamp. Ledger shelves and filing
// cabinets line the side walls, with a wait spot in front of each cabinet, and the firm's plaque hangs on the back wall.
//
// `office(mouth)` builds a visit's nodes over cached geometry and returns them with what the gorillas work by, in
// world space (see `workOffice` in clankers.js): per desk the `seat` (the swivel), the `approach` in front of the
// chair, the `aisle` point level with it, the `heading` facing the desk and `sitHeading` facing the aisle, the arm
// that works the abacus (`side`, +1 the left), the glance at the screen (`look`), both hands' places on the keys
// (`keys`, right then left), the other hand's rest while counting (`rest`), and `stroke(progress, out)`, which slides
// the beads of the abacus's next move under the hand and writes where that hand is, then `commit()` once it is made.
// The chairs turn by each desk's `chairYaw`, which the gorillas set, in `update`.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { box, bevelBox, merge, cached, variants, turnedY, turnedZ, moved } = BL.models;
  const { createNode, addChild } = BL.scene;
  const GLYPHS = BL.hubModels.SIGN_GLYPHS;
  const WALNUT = "#5b3a24", WALNUT_DK = "#3f2717", WALNUT_LT = "#7a5034", LEATHER = "#2f4a3a", LEATHER_DK = "#22382b";
  const BRASS = "#c79a3e", BRASS_DK = "#8c6a2a", IVORY = "#efe6cc", INK = "#4a3826", CASE = "#cfc6ae", CASE_DK = "#9c937c";
  const SCREEN = "#16231b", SCREEN_INK = "#8fd19e", SCREEN_DIM = "#4f8a5c", BANANA = "#f5d142", IRON = "#2c2e33";
  const SPINES = ["#2f4a3a", "#6b2a2a", "#25324a", "#8a6a3a", "#3f2717"];
  // Metres in the mouth's frame. The chairs' swivels sit on the seat line, which is also the walkway to them; the
  // entry point is where the aisle run from the door ends.
  const LAYOUT = {
    seatZ: -5.3, deskX: 1.6, deskHalf: 0.75, deskFront: -4.35, deskBack: -3.45, deskTop: 0.94, seatTop: 0.42,
    entry: -3.5, aisleHalf: 0.85, approach: 0.5,
    keys: { off: 0.05, y: 1.05, z: -4.25, spread: 0.19 },
    abacus: { off: 0.5, z: -4.08, rods: [0.99, 1.05, 1.11, 1.17], half: 0.19, bead: 0.035, beads: 6 },
    monitor: { off: 0.42, z: -3.78 },
    rest: { off: 0.3, y: 1.02, z: -4.2 },
    waits: [[-1.75, -1.9], [1.75, -1.9]],
    plaque: { y: 2.55, z: -6.66 }
  };
  const A = LAYOUT.abacus;
  // A line of carved letters in the signs' 3x5 alphabet, centred on x, as runs of whole cells.
  const lettering = (out, text, cell, x, y, z, depth, color, emissive) => {
    let cells = -1;
    for (const ch of text) cells += ch === " " ? 2 : GLYPHS[ch][0].length + 1;
    let cursor = x - cells * cell / 2;
    for (const ch of text) {
      if (ch === " ") { cursor += cell * 2; continue; }
      const glyph = GLYPHS[ch];
      for (let row = 0; row < glyph.length; row++) for (let col = 0; col < glyph[row].length; col++) {
        if (glyph[row][col] !== "1") continue;
        let n = 1;
        while (glyph[row][col + n] === "1") n++;
        out.push(box({ w: cell * n, h: cell, d: depth, color, emissive, offset: { x: cursor + (col + n / 2) * cell, y: y + (2 - row) * cell, z } }));
        col += n - 1;
      }
      cursor += cell * (glyph[0].length + 1);
    }
  };
  // One desk, k = -1 left of the aisle or +1 right, built where it stands: the top with its leather inlay, a drawer
  // pedestal on the wall side, legs on the aisle side, a closed front toward the door, and everything on it but the
  // screen's face and the beads.
  const desk = variants((v) => {
    const k = v ? 1 : -1, cx = k * LAYOUT.deskX, inner = -k, L = LAYOUT, top = L.deskTop, mid = (L.deskFront + L.deskBack) / 2;
    const depth = L.deskBack - L.deskFront, geos = [];
    geos.push(bevelBox({ w: L.deskHalf * 2, h: 0.08, d: depth, color: WALNUT, bevel: 0.02, offset: { x: cx, y: top - 0.04, z: mid } }));
    geos.push(box({ w: L.deskHalf * 2 - 0.3, h: 0.006, d: depth - 0.3, color: LEATHER, offset: { x: cx, y: top + 0.003, z: mid } }));
    geos.push(box({ w: L.deskHalf * 2, h: 0.018, d: 0.018, color: BRASS, offset: { x: cx, y: top - 0.05, z: L.deskFront - 0.002 } }));
    const px = cx + k * (L.deskHalf - 0.17);
    geos.push(bevelBox({ w: 0.34, h: top - 0.08, d: depth - 0.04, color: WALNUT_DK, bevel: 0.015, offset: { x: px, y: (top - 0.08) / 2, z: mid } }));
    for (const y of [0.17, 0.43, 0.69]) {
      geos.push(bevelBox({ w: 0.28, h: 0.22, d: 0.02, color: WALNUT_LT, bevel: 0.005, offset: { x: px, y, z: L.deskFront - 0.004 } }));
      geos.push(box({ w: 0.06, h: 0.02, d: 0.025, color: BRASS, offset: { x: px, y, z: L.deskFront - 0.02 } }));
    }
    for (const z of [L.deskFront + 0.06, L.deskBack - 0.06]) geos.push(bevelBox({ w: 0.07, h: top - 0.08, d: 0.07, color: WALNUT_DK, bevel: 0.012, offset: { x: cx + inner * (L.deskHalf - 0.05), y: (top - 0.08) / 2, z } }));
    // The side the door sees: one panel, trimmed in brass, so the legs under the desk never show.
    geos.push(bevelBox({ w: L.deskHalf * 2 - 0.04, h: 0.7, d: 0.04, color: WALNUT_DK, bevel: 0.01, offset: { x: cx, y: 0.5, z: L.deskBack - 0.03 } }));
    geos.push(box({ w: L.deskHalf * 2 - 0.1, h: 0.02, d: 0.01, color: BRASS_DK, offset: { x: cx, y: 0.8, z: L.deskBack - 0.005 } }));
    // The keyboard: a cream case with three rows of keys.
    const kx = cx + inner * L.keys.off;
    geos.push(bevelBox({ w: 0.62, h: 0.035, d: 0.18, color: CASE, bevel: 0.008, offset: { x: kx, y: top + 0.0175, z: L.keys.z } }));
    for (let row = 0; row < 3; row++) for (let col = 0; col < 12; col++) {
      geos.push(box({ w: 0.038, h: 0.012, d: 0.038, color: (row + col) % 7 ? CASE_DK : BANANA, offset: { x: kx - 0.2585 + col * 0.047, y: top + 0.04, z: L.keys.z - 0.05 + row * 0.05 } }));
    }
    // The monitor: a chunky cream set on a short stand, turned to the chair; its face is the screen node.
    const mx = cx + k * L.monitor.off, yaw = Math.atan2(k * L.monitor.off, L.monitor.z - L.seatZ - 0.2);
    const monitor = merge(
      box({ w: 0.2, h: 0.04, d: 0.2, color: CASE_DK, offset: { x: 0, y: 0.02, z: 0 } }),
      box({ w: 0.07, h: 0.06, d: 0.07, color: CASE_DK, offset: { x: 0, y: 0.07, z: 0 } }),
      bevelBox({ w: 0.5, h: 0.42, d: 0.3, color: CASE, bevel: 0.03, offset: { x: 0, y: 0.31, z: -0.04 } }),
      bevelBox({ w: 0.34, h: 0.3, d: 0.2, color: CASE_DK, bevel: 0.03, offset: { x: 0, y: 0.31, z: 0.18 } }),
      box({ w: 0.44, h: 0.34, d: 0.01, color: WALNUT_DK, offset: { x: 0, y: 0.31, z: -0.192 } }),
      box({ w: 0.03, h: 0.02, d: 0.01, color: SCREEN_INK, emissive: 0.8, offset: { x: 0.2, y: 0.12, z: -0.192 } }));
    geos.push(moved(turnedY(monitor, yaw), mx, top, L.monitor.z));
    // The abacus: a walnut frame with four brass rods; its beads are nodes of their own.
    const ax = cx + inner * A.off, h = A.half + 0.025;
    for (const side of [-1, 1]) geos.push(bevelBox({ w: 0.035, h: 0.3, d: 0.05, color: WALNUT, bevel: 0.008, offset: { x: ax + side * h, y: top + 0.15, z: A.z } }));
    for (const y of [top + 0.015, top + 0.285]) geos.push(bevelBox({ w: h * 2 + 0.035, h: 0.03, d: 0.05, color: WALNUT, bevel: 0.008, offset: { x: ax, y, z: A.z } }));
    for (const y of A.rods) geos.push(box({ w: h * 2, h: 0.008, d: 0.008, color: BRASS, offset: { x: ax, y, z: A.z } }));
    for (const side of [-1, 1]) geos.push(box({ w: 0.06, h: 0.02, d: 0.12, color: WALNUT_DK, offset: { x: ax + side * h, y: top + 0.01, z: A.z } }));
    // The ledger open on the desk's aisle corner, ruled in ink, with a spike of receipts and the banker's lamp behind.
    const lx = cx + inner * 0.55, lz = L.deskFront + 0.11;
    geos.push(box({ w: 0.32, h: 0.012, d: 0.2, color: LEATHER_DK, offset: { x: lx, y: top + 0.006, z: lz } }));
    for (const side of [-1, 1]) {
      geos.push(box({ w: 0.145, h: 0.012, d: 0.185, color: IVORY, offset: { x: lx + side * 0.077, y: top + 0.016, z: lz } }));
      for (let line = 0; line < 6; line++) geos.push(box({ w: 0.11, h: 0.002, d: 0.006, color: INK, offset: { x: lx + side * 0.077, y: top + 0.0225, z: lz - 0.07 + line * 0.028 } }));
    }
    geos.push(box({ w: 0.006, h: 0.004, d: 0.18, color: BRASS_DK, offset: { x: lx, y: top + 0.022, z: lz } }));
    const sx = cx + inner * 0.62, sz = L.deskBack - 0.17;
    geos.push(box({ w: 0.09, h: 0.015, d: 0.09, color: BRASS, offset: { x: sx, y: top + 0.0075, z: sz } }));
    geos.push(box({ w: 0.008, h: 0.15, d: 0.008, color: IRON, offset: { x: sx, y: top + 0.08, z: sz } }));
    for (let n = 0; n < 4; n++) geos.push(turnedY(box({ w: 0.075, h: 0.004, d: 0.095, color: n & 1 ? IVORY : "#f6f0dc", offset: { x: 0, y: 0, z: 0 } }), n * 0.5));
    for (let n = 0; n < 4; n++) moved(geos[geos.length - 4 + n], sx, top + 0.025 + n * 0.012, sz);
    const bx = cx + inner * 0.15, bz = L.deskBack - 0.15;
    geos.push(box({ w: 0.16, h: 0.025, d: 0.1, color: BRASS_DK, offset: { x: bx, y: top + 0.0125, z: bz } }));
    geos.push(box({ w: 0.02, h: 0.2, d: 0.02, color: BRASS, offset: { x: bx, y: top + 0.12, z: bz } }));
    geos.push(bevelBox({ w: 0.28, h: 0.06, d: 0.11, color: "#2f8a55", emissive: 0.55, bevel: 0.015, offset: { x: bx, y: top + 0.24, z: bz - 0.03 } }));
    geos.push(box({ w: 0.22, h: 0.008, d: 0.07, color: "#ffe9a8", emissive: 1, offset: { x: bx, y: top + 0.206, z: bz - 0.03 } }));
    return merge(...geos);
  });
  // A swivel chair in its own frame, turning about its column at the origin and facing +z: a brass cross base, a
  // walnut seat with a green leather cushion and a padded back.
  const chair = cached(() => {
    const top = LAYOUT.seatTop, geos = [];
    geos.push(box({ w: 0.62, h: 0.04, d: 0.08, color: IRON, offset: { x: 0, y: 0.03, z: 0 } }));
    geos.push(box({ w: 0.08, h: 0.04, d: 0.62, color: IRON, offset: { x: 0, y: 0.03, z: 0 } }));
    for (const [x, z] of [[-0.3, 0], [0.3, 0], [0, -0.3], [0, 0.3]]) geos.push(box({ w: 0.06, h: 0.03, d: 0.06, color: BRASS_DK, offset: { x, y: 0.015, z } }));
    geos.push(box({ w: 0.06, h: top - 0.12, d: 0.06, color: BRASS, offset: { x: 0, y: (top - 0.12) / 2 + 0.05, z: 0 } }));
    geos.push(bevelBox({ w: 0.84, h: 0.06, d: 0.6, color: WALNUT, bevel: 0.02, offset: { x: 0, y: top - 0.06, z: -0.05 } }));
    geos.push(bevelBox({ w: 0.78, h: 0.05, d: 0.54, color: LEATHER, bevel: 0.02, offset: { x: 0, y: top - 0.02, z: -0.05 } }));
    for (const x of [-0.28, 0.28]) geos.push(box({ w: 0.05, h: 0.34, d: 0.05, color: WALNUT_DK, offset: { x, y: top + 0.12, z: -0.37 } }));
    geos.push(bevelBox({ w: 0.66, h: 0.72, d: 0.06, color: WALNUT, bevel: 0.02, offset: { x: 0, y: top + 0.44, z: -0.38 } }));
    geos.push(bevelBox({ w: 0.56, h: 0.6, d: 0.03, color: LEATHER, bevel: 0.012, offset: { x: 0, y: top + 0.44, z: -0.345 } }));
    for (let n = 0; n < 3; n++) geos.push(box({ w: 0.02, h: 0.02, d: 0.01, color: BRASS, offset: { x: -0.2 + n * 0.2, y: top + 0.62, z: -0.328 } }));
    return merge(...geos);
  });
  const bead = variants((i) => bevelBox({ w: A.bead, h: 0.045, d: 0.045, color: i ? IVORY : BANANA, bevel: 0.008 }));
  // The screen's face, in the jumbotron's green on black: IN, OUT and TOTAL ruled into a grid with their tallies.
  // Built facing +z and turned to face the chair; `v` picks how far the tallies have run, from the desk's own count.
  const SCREEN_FACES = 8;
  const screenFace = variants((v) => {
    const geos = [], cell = 0.0085, W = 0.4, H = 0.3;
    geos.push(box({ w: W, h: H, d: 0.004, color: SCREEN, emissive: 0.2, offset: { x: 0, y: 0, z: 0 } }));
    const line = (w, h, x, y) => geos.push(box({ w, h, d: 0.003, color: SCREEN_DIM, emissive: 0.7, offset: { x, y, z: 0.003 } }));
    line(W - 0.03, 0.004, 0, H / 2 - 0.015); line(W - 0.03, 0.004, 0, -H / 2 + 0.015);
    line(0.004, H - 0.03, -W / 2 + 0.015, 0); line(0.004, H - 0.03, W / 2 - 0.015, 0);
    for (const y of [0.045, -0.045]) line(W - 0.03, 0.003, 0, y);
    line(0.003, H - 0.03, -0.01, 0);
    const income = 3 + v, out = 1 + (v >> 1), rows = [["IN", income], ["OUT", out], ["TOTAL", income - out]];
    rows.forEach(([label, count], r) => {
      const y = 0.09 - r * 0.09;
      lettering(geos, label, cell, -0.105, y - cell * 2 - 0.0035, 0.004, 0.003, SCREEN_INK, 1);
      for (let n = 0; n < count; n++) {
        const group = Math.floor(n / 5), within = n % 5, x = 0.012 + group * 0.08 + within * 0.014;
        if (within < 4) geos.push(box({ w: 0.005, h: 0.045, d: 0.003, color: SCREEN_INK, emissive: 1, offset: { x, y, z: 0.005 } }));
        else geos.push(moved(turnedZ(box({ w: 0.072, h: 0.005, d: 0.003, color: SCREEN_INK, emissive: 1 }), 0.6), x - 0.035, y, 0.006));
      }
    });
    // A cursor block at the TOTAL line's end.
    geos.push(box({ w: 0.01, h: 0.016, d: 0.003, color: SCREEN_INK, emissive: 1, offset: { x: W / 2 - 0.04, y: -0.115, z: 0.005 } }));
    const geo = turnedY(merge(...geos), Math.PI);
    geo.castShadow = false;
    return geo;
  });
  // Ledgers on the side walls, spines out, and a filing cabinet by each wait spot; side -1 is the left wall.
  const shelves = variants((v) => {
    const side = v ? 1 : -1, x = side * 2.92, geos = [];
    for (const dz of [-0.6, 0.6]) geos.push(bevelBox({ w: 0.36, h: 1.9, d: 0.05, color: WALNUT_DK, bevel: 0.01, offset: { x, y: 0.95, z: -3 + dz } }));
    for (let s = 0; s < 5; s++) geos.push(bevelBox({ w: 0.36, h: 0.04, d: 1.2, color: WALNUT, bevel: 0.01, offset: { x, y: 0.05 + s * 0.45, z: -3 } }));
    geos.push(box({ w: 0.02, h: 1.9, d: 1.2, color: WALNUT_DK, offset: { x: x + side * 0.17, y: 0.95, z: -3 } }));
    for (let s = 0; s < 4; s++) {
      let z = -3.55;
      for (let n = 0; z < -2.45; n++) {
        const w = 0.05 + ((n * 7 + s * 3) % 4) * 0.012, h = 0.3 + ((n * 5 + s) % 3) * 0.035;
        if (z + w > -2.45) break;
        geos.push(box({ w: 0.26, h, d: w - 0.006, color: SPINES[(n + s * 2) % SPINES.length], offset: { x: x - side * 0.02, y: 0.07 + s * 0.45 + h / 2, z: z + w / 2 } }));
        if (n % 3 === 1) geos.push(box({ w: 0.005, h: 0.03, d: w - 0.02, color: BRASS, offset: { x: x - side * 0.152, y: 0.07 + s * 0.45 + h * 0.7, z: z + w / 2 } }));
        z += w;
      }
    }
    const cz = -1.15;
    geos.push(bevelBox({ w: 0.5, h: 1.1, d: 0.56, color: WALNUT, bevel: 0.02, offset: { x: side * 2.83, y: 0.55, z: cz } }));
    for (let d = 0; d < 3; d++) {
      geos.push(bevelBox({ w: 0.02, h: 0.3, d: 0.48, color: WALNUT_LT, bevel: 0.006, offset: { x: side * 2.57, y: 0.2 + d * 0.35, z: cz } }));
      geos.push(box({ w: 0.03, h: 0.025, d: 0.12, color: BRASS, offset: { x: side * 2.55, y: 0.28 + d * 0.35, z: cz } }));
      geos.push(box({ w: 0.01, h: 0.04, d: 0.08, color: IVORY, offset: { x: side * 2.555, y: 0.2 + d * 0.35, z: cz } }));
    }
    for (let n = 0; n < 3; n++) geos.push(box({ w: 0.24, h: 0.05 + n * 0.012, d: 0.3, color: SPINES[n], offset: { x: side * 2.85, y: 1.13 + n * 0.06, z: cz } }));
    return merge(...geos);
  });
  // The firm's name and motto on the back wall, in brass on walnut.
  const plaque = cached(() => {
    const geos = [], P = LAYOUT.plaque;
    geos.push(bevelBox({ w: 3.3, h: 1.0, d: 0.08, color: WALNUT_DK, bevel: 0.03, offset: { x: 0, y: P.y, z: P.z } }));
    geos.push(bevelBox({ w: 3.18, h: 0.88, d: 0.02, color: WALNUT, bevel: 0.01, offset: { x: 0, y: P.y, z: P.z + 0.045 } }));
    for (const y of [P.y + 0.46, P.y - 0.46]) geos.push(box({ w: 3.26, h: 0.025, d: 0.02, color: BRASS, offset: { x: 0, y, z: P.z + 0.05 } }));
    lettering(geos, "BANANA CERTIFIED ACCOUNTING", 0.026, 0, P.y + 0.3, P.z + 0.065, 0.02, BRASS, 0.2);
    geos.push(box({ w: 2.2, h: 0.012, d: 0.01, color: BRASS_DK, offset: { x: 0, y: P.y + 0.19, z: P.z + 0.06 } }));
    ["COUNT BANANAS.", "KEEP RECEIPTS.", "BUILD IN PUBLIC."].forEach((text, n) => lettering(geos, text, 0.03, 0, P.y + 0.06 - n * 0.2, P.z + 0.065, 0.02, IVORY, 0.15));
    return merge(...geos);
  });
  const office = (mouth) => {
    const L = LAYOUT, sr = Math.sin(mouth.ry), cr = Math.cos(mouth.ry);
    const wx = (x, z) => mouth.x + cr * x + sr * z, wz = (x, z) => mouth.z - sr * x + cr * z;
    const node = createNode(), solids = [], chairs = [], stations = [];
    const plaqueNode = createNode({ geometry: plaque() });
    addChild(node, plaqueNode);
    for (let v = 0; v < 2; v++) {
      const shelf = createNode({ geometry: shelves(v) });
      addChild(node, shelf); solids.push(shelf);
    }
    for (let v = 0; v < 2; v++) {
      const k = v ? 1 : -1, cx = k * L.deskX, inner = -k;
      const deskNode = createNode({ geometry: desk(v) });
      addChild(node, deskNode); solids.push(deskNode);
      const aisleYaw = inner * Math.PI / 2;
      const chairNode = createNode({ geometry: chair(), position: { x: cx, y: 0, z: L.seatZ }, rotation: { x: 0, y: aisleYaw, z: 0 } });
      addChild(node, chairNode); chairs.push(chairNode);
      const yaw = Math.atan2(k * L.monitor.off, L.monitor.z - L.seatZ - 0.2);
      // The face sits on the bezel's front, in the monitor's own frame.
      const screen = createNode({ position: { x: cx + k * L.monitor.off, y: L.deskTop, z: L.monitor.z }, rotation: { x: 0, y: yaw, z: 0 } });
      const face = createNode({ geometry: screenFace(0), position: { x: 0, y: 0.31, z: -0.199 }, sightHidden: true });
      addChild(screen, face);
      addChild(node, screen);
      // The abacus: six beads on each of four rods, counted beads to the +x end. Each desk keeps its own count.
      const ax = cx + inner * A.off, beads = [], x = new Float32Array(A.rods.length * A.beads);
      const digits = new Uint8Array(A.rods.length), start = v ? [5, 0, 3, 1] : [2, 4, 1, 0];
      for (let r = 0; r < digits.length; r++) digits[r] = start[r];
      const counted = (j) => A.half - A.bead * (j + 0.5), resting = (j) => -A.half + A.bead * (A.beads - j - 0.5);
      for (let r = 0; r < A.rods.length; r++) for (let j = 0; j < A.beads; j++) {
        const at = r * A.beads + j;
        x[at] = j < digits[r] ? counted(j) : resting(j);
        const b = createNode({ geometry: bead((j + r) % 3 ? 0 : 1), position: { x: ax + x[at], y: A.rods[r], z: A.z }, sightHidden: true });
        addChild(node, b); beads.push(b);
      }
      const keysY = L.keys.y, kx = cx + inner * L.keys.off;
      const station = {
        seat: { x: wx(cx, L.seatZ), z: wz(cx, L.seatZ) },
        approach: { x: wx(cx + inner * L.approach, L.seatZ), z: wz(cx + inner * L.approach, L.seatZ) },
        aisle: { x: wx(0, L.seatZ), z: wz(0, L.seatZ) },
        heading: mouth.ry, sitHeading: mouth.ry + aisleYaw, aisleYaw, chairYaw: aisleYaw,
        side: inner, look: Math.atan2(k * L.monitor.off, L.monitor.z - L.seatZ),
        keys: new Float64Array([wx(kx - L.keys.spread, L.keys.z), mouth.floorY + keysY, wz(kx - L.keys.spread, L.keys.z),
          wx(kx + L.keys.spread, L.keys.z), mouth.floorY + keysY, wz(kx + L.keys.spread, L.keys.z)]),
        rest: new Float64Array([wx(cx + k * L.rest.off, L.rest.z), mouth.floorY + L.rest.y, wz(cx + k * L.rest.off, L.rest.z)]),
        count: 0, carry: 0,
        // The next move on the abacus: one bead pushed over on the carried rod, or that rod's six swept back when it is
        // full and the count carried to the next. The hand meets the bead, slides it over, then lifts off it.
        stroke(progress, out) {
          const r = station.carry, d = digits[r], sweep = d >= A.beads;
          const slide = clamp01((progress - 0.3) / 0.55), t = slide * slide * (3 - 2 * slide);
          let hand;
          if (sweep) {
            const shift = (resting(0) - counted(0)) * t;
            for (let j = 0; j < A.beads; j++) {
              const at = r * A.beads + j;
              x[at] = counted(j) + shift; beads[at].position.x = ax + x[at];
            }
            hand = counted(0) + shift + A.bead / 2 + 0.03;
          } else {
            const at = r * A.beads + d;
            x[at] = resting(d) + (counted(d) - resting(d)) * t; beads[at].position.x = ax + x[at];
            hand = x[at] - A.bead / 2 - 0.03;
          }
          const lift = progress > 0.85 ? (progress - 0.85) * 0.25 : 0, lx = ax + hand, lz = A.z - 0.07;
          out.x = wx(lx, lz); out.y = mouth.floorY + A.rods[r] + 0.01 + lift; out.z = wz(lx, lz);
          return out;
        },
        commit() {
          const r = station.carry;
          if (digits[r] >= A.beads) { digits[r] = 0; station.carry = (r + 1) % digits.length; }
          else { digits[r]++; station.carry = 0; }
          for (let j = 0; j < A.beads; j++) {
            const at = r * A.beads + j;
            x[at] = j < digits[r] ? counted(j) : resting(j); beads[at].position.x = ax + x[at];
          }
          station.count++;
          const next = screenFace(Math.floor(station.count / 3) % SCREEN_FACES);
          if (face.geometry !== next) face.geometry = next;
        }
      };
      stations.push(station);
    }
    const waits = L.waits.map(([x, z]) => ({ x: wx(x, z), z: wz(x, z), heading: mouth.ry + Math.PI }));
    const update = () => {
      for (let i = 0; i < chairs.length; i++) chairs[i].rotation.y = stations[i].chairYaw;
    };
    return { node, solids, stations, waits, entry: { x: wx(0, L.entry), z: wz(0, L.entry) }, entryAlong: L.entry,
      aisleHalf: L.aisleHalf, walkway: L.seatZ, update };
  };
  const clamp01 = (t) => t < 0 ? 0 : t > 1 ? 1 : t;
  BL.bcaModels = { LAYOUT, office, desk, chair, screenFace, plaque };
})();
