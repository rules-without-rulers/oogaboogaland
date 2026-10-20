// The Timechain Sphere's room, as one design built at each of its three sizes (timechain-rooms.js `layout`): a round
// charcoal hall with amber light strips, the screen wall across the front with the latest-blocks ribbon over it, an
// amber chain of blocks inlaid from the doorway to the meeting table, and behind the visitor the one doorway in a flat
// bay under its EXIT header, its two leaves carrying the wall's strip across their seam as a chain, the Exit button
// beside it and a dim vestibule past it. The architecture scales; the doorway, the chairs, the button and the screens'
// pixels do not change size with it, only how far apart things stand, and the table grows to seat 4, 8 or 12. Geometry is cached per size and shared by every room of that
// size; `build` makes one room's nodes. The screens' pictures are the scene's (`picture`); nothing here paints.
(() => {
  "use strict";
  const BL = window.BL;
  const { box, lathe, ring, merge, noShadow, moved, turnedY } = BL.models;
  const { hexToRgb } = BL.math;
  const { createNode, addChild } = BL.scene;
  const ROOMS = BL.timechainRooms, DOOR = ROOMS.DOOR;
  const C = {
    tileA: "#2a2a2f", tileB: "#36363d", base: "#121214", wall: "#1f1f23", band: "#18181b", trim: "#141417",
    dome: "#18181c", rib: "#2e2e36", cap: "#0e0e10", bezel: "#0c0c0d", amber: "#f7931a", chain: "#f29a22", inset: "#1d1912",
    middle: "#1a1a1e", ember: "#9c5a12", vestibule: "#0f0f11", curtain: "#08080a",
    curtainB: "#121215", seat: "#2a2a2f", cushion: "#34343a", desk: "#1d1d21", leg: "#101012"
  };
  const rgb = (c) => typeof c === "string" ? hexToRgb(c) : c;
  // A flat polygon wound so its front faces `normal`, whatever order its corners come in.
  const face = (geo, pts, color, emissive, normal) => {
    const base = geo.verts.length / 3, i = [];
    let nx = 0, ny = 0, nz = 0;
    for (let k = 0; k < pts.length; k++) {
      const p = pts[k], q = pts[(k + 1) % pts.length];
      geo.verts.push(p[0], p[1], p[2]);
      i.push(base + k);
      nx += (p[1] - q[1]) * (p[2] + q[2]); ny += (p[2] - q[2]) * (p[0] + q[0]); nz += (p[0] - q[0]) * (p[1] + q[1]);
    }
    geo.faces.push({ i: nx * normal[0] + ny * normal[1] + nz * normal[2] < 0 ? i.reverse() : i, color: rgb(color), emissive });
  };
  const quad = (geo, a, b, c, d, color, emissive, normal) => face(geo, [a, b, c, d], color, emissive, normal);
  const blank = () => ({ verts: [], faces: [], lines: [] });
  const perScale = (build) => {
    const made = new Map();
    return (scale) => made.get(scale) || made.set(scale, build(scale)).get(scale);
  };
  const UP = [0, 1, 0], DOWN = [0, -1, 0];
  // What of a convex polygon of [x, z] corners keeps nx·x + nz·z ≤ d (Sutherland–Hodgman against one half-plane).
  const clip = (poly, nx, nz, d) => {
    const out = [];
    for (let k = 0; k < poly.length; k++) {
      const p = poly[k], q = poly[(k + 1) % poly.length], sp = nx * p[0] + nz * p[1] - d, sq = nx * q[0] + nz * q[1] - d;
      if (sp <= 0) out.push(p);
      if (sp < 0 && sq > 0 || sp > 0 && sq < 0) { const t = sp / (sp - sq); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
    }
    return out.length >= 3 ? out : null;
  };
  // The header over the doorway's frame: how far it reaches past the jambs, its height and its depth.
  const EXIT_HEADER = { over: 0.12, h: 0.44, d: 0.22 };

  // The floor in one pass, its pieces meeting edge to edge and none lying over another (so nothing fights for
  // depth, on either renderer): the charcoal tiles, clipped round the wall, the doorway, the ring and the side arms;
  // the chain's amber links (`amber`, for the glow) with their dark squares and joint notches (`dark`); the ring of
  // links round the meeting area and its dark middle. Tiles and links keep their size; a bigger room has more of them.
  const floorParts = perScale((scale) => {
    const L = ROOMS.layout(scale), F = L.floor, R = L.radius, T = F.tile, half = T / 2, dark = blank(), amber = blank();
    const ri = F.ringIn, ro = F.ringOut, door = F.door, wallR = R - 0.02;
    const flat = (pts, color, emissive, into) => face(into, pts.map(([x, z]) => [x, 0, z]), color, emissive, UP);
    // The side arms' directions, a third of a turn either side of the doorway's axis.
    const arms = F.arms.map((b) => [Math.sin(b), Math.cos(b)]);
    // The tiles: whole where whole fits, otherwise cut exactly into convex pieces: inside a polygon set within the
    // wall, short of the door's line, outside a polygon set round the ring (its sides clear of the ring's own edge, so
    // a cut tile never reaches into a link) and outside each arm's strip.
    const SIDES = 96, cos = Math.cos(Math.PI / SIDES), keep = ro / cos + 0.002, cells = Math.ceil(R / T) + 1;
    const normal = (k) => { const a = (k + 0.5) / SIDES * Math.PI * 2; return [Math.sin(a), Math.cos(a)]; };
    // What of a convex piece lies outside an arm's strip (a tile wide, from the middle out past the wall), as the
    // ring's peel does it: what lies outside each side in turn is a piece, the rest goes on to the next side.
    const outsideArm = (poly, [dx, dz], out) => {
      for (const [a, b, d] of [[dz, -dx, half], [-dz, dx, half], [dx, dz, R], [-dx, -dz, 0]]) {
        const piece = clip(poly, -a, -b, -d);
        if (piece) out.push(piece);
        poly = clip(poly, a, b, d);
        if (!poly) return;
      }
    };
    const tile = (poly, color) => {
      let pieces = [poly];
      for (const arm of arms) { const next = []; for (const piece of pieces) outsideArm(piece, arm, next); pieces = next; }
      for (const piece of pieces) flat(piece, color, 0, dark);
    };
    for (let i = -cells; i <= cells; i++) for (let j = -cells; j <= cells; j++) {
      const x0 = i * T - half, x1 = x0 + T, z0 = j * T - half, z1 = z0 + T, color = (i + j) & 1 ? C.tileA : C.tileB;
      // The chain's own column, door to ring, is the chain's.
      if (i === 0 && z1 > ro && z0 < door) continue;
      const nx = Math.max(x0, Math.min(0, x1)), nz = Math.max(z0, Math.min(0, z1));
      const near = Math.hypot(nx, nz), far = Math.max(Math.hypot(x0, z0), Math.hypot(x1, z0), Math.hypot(x0, z1), Math.hypot(x1, z1));
      if (near >= wallR || far <= ro || z0 >= door) continue;
      let poly = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
      if (near >= keep && far <= wallR * cos && z1 <= door) { tile(poly, color); continue; }
      poly = clip(poly, 0, 1, door);
      for (let k = 0; k < SIDES && poly; k++) { const [a, b] = normal(k); poly = clip(poly, a, b, wallR * cos); }
      // What lies outside each side of the ring's polygon in turn is a piece; the rest goes on to the next side.
      for (let k = 0; k < SIDES && poly; k++) {
        const [a, b] = normal(k), d = keep * cos, piece = clip(poly, -a, -b, -d);
        if (piece) tile(piece, color);
        poly = clip(poly, a, b, d);
      }
    }
    // A run of chain from the ring's outer edge along u to where `endAt(v)` stops it (the door's line, the wall's
    // curve), one tile wide across v, placed by `at`: a link a tile long on each tile, its dark square in the middle,
    // notches at each side of every joint between links, and the last link cut where the run stops.
    const run = (endAt, at) => {
      const j = F.joint / 2, hv = F.hole / 2, vs = [-half, -half + F.notch, -hv, hv, half - F.notch, half];
      const ring = (v) => Math.sqrt(ro * ro - v * v), end = Math.min(endAt(-half), endAt(half));
      for (let k = Math.floor(ro / T); k * T - half < end; k++) {
        const c = k * T, start = c - half < ro, last = c + half >= end - 1e-9, u1 = last ? end : c + half;
        if (u1 <= ro) continue;
        const lower = !start && c - half - j >= ro, upper = !last, hole = c - hv >= ro + 0.05 && c + hv <= u1 - 0.05;
        const us = [start ? -Infinity : c - half];
        if (lower && c - half + j < u1 - 0.02) us.push(c - half + j);
        if (hole) us.push(c - hv, c + hv);
        if (upper) us.push(c + half - j);
        us.push(last ? Infinity : u1);
        for (let m = 0; m + 1 < us.length; m++) for (let n = 0; n + 1 < vs.length; n++) {
          const ua = us[m], ub = us[m + 1], va = vs[n], vb = vs[n + 1], side = n === 0 || n === 4;
          const notch = side && (lower && ub <= c - half + j + 1e-9 || upper && ua >= c + half - j - 1e-9);
          const inset = n === 2 && hole && ua >= c - hv - 1e-9 && ub <= c + hv + 1e-9;
          // The run's first corners sit on the ring's edge, its last where it stops.
          const pa = ua === -Infinity ? ring(va) : ua, pb = ua === -Infinity ? ring(vb) : ua;
          const qa = ub === Infinity ? endAt(va) : ub, qb = ub === Infinity ? endAt(vb) : ub;
          flat([at(pa, va), at(pb, vb), at(qb, vb), at(qa, va)], notch || inset ? C.inset : C.chain, notch || inset ? 0 : 0.5, notch || inset ? dark : amber);
        }
      }
    };
    run(() => door, (u, v) => [v, u]);
    // The arms run out to the wall, where the tiles stop.
    const E = wallR * cos;
    for (const [dx, dz] of arms) run((v) => Math.sqrt(E * E - v * v), (u, v) => [u * dx + v * dz, u * dz - v * dx]);
    // The ring: links round the meeting area, with the same squares and notches, no notch where a run joins it
    // (toward the doorway and at a third of a turn either side), and its dark middle under the table and chairs.
    const N = F.ringLinks, rm = (ri + ro) / 2, nr = F.notch * (ro - ri) / T, hr = F.ringHole / 2, ja = F.joint / 2 / rm, ha = F.ringHole / 2 / rm;
    const rs = [ri, ri + nr, rm - hr, rm + hr, ro - nr, ro], rim = [], joins = new Set([0, N / 3, 2 * N / 3]);
    const p = (r, a) => [r * Math.sin(a), r * Math.cos(a)];
    for (let l = 0; l < N; l++) {
      const a0 = l / N * Math.PI * 2, a1 = (l + 1) / N * Math.PI * 2, am = (a0 + a1) / 2;
      const as = [a0, a0 + ja, am - ha, am + ha, a1 - ja, a1];
      for (let m = 0; m < 5; m++) {
        rim.push(as[m]);
        for (let n = 0; n < 5; n++) {
          const joint = m === 0 || m === 4, edge = n === 0 || n === 4;
          const joined = n === 4 && (m === 0 && joins.has(l) || m === 4 && joins.has((l + 1) % N));
          const shade = joint && edge && !joined || m === 2 && n === 2;
          flat([p(rs[n], as[m]), p(rs[n], as[m + 1]), p(rs[n + 1], as[m + 1]), p(rs[n + 1], as[m])], shade ? C.inset : C.chain, shade ? 0 : 0.5, shade ? dark : amber);
        }
      }
    }
    // The middle in small cells rather than one fan, so Canvas 2D's depth sort keeps it under the table and chairs.
    const bands = [0, 0.25, 0.5, 0.75, 1];
    for (let b = 0; b + 1 < bands.length; b++) for (let k = 0; k < rim.length; k++) {
      const r0 = ri * bands[b], r1 = ri * bands[b + 1], a0 = rim[k], a1 = rim[(k + 1) % rim.length];
      flat(b === 0 ? [[0, 0], p(r1, a0), p(r1, a1)] : [p(r0, a0), p(r1, a0), p(r1, a1), p(r0, a1)], C.middle, 0, dark);
    }
    return { dark, amber: noShadow(amber) };
  });

  // The dome over the round wall: bands of facets from its foot to the crown, sixteen ribs between the panels, a
  // cornice round the foot over the join, two amber rings and the oculus in `amber` (for the glow) and a dark cap.
  const domeParts = perScale((scale) => {
    const L = ROOMS.layout(scale), D = L.dome, R = L.radius, H = L.wall, dark = blank(), amber = blank();
    const step = Math.PI * 2 / D.sectors, meridians = [];
    for (let s = 0; s < D.sectors; s++) {
      meridians.push([s * step - D.rib / 2, true]);
      for (let k = 0; k < D.panels; k++) meridians.push([s * step + D.rib / 2 + (step - D.rib) * k / D.panels, false]);
    }
    const at = (a, r, y) => [r * Math.sin(a), y, r * Math.cos(a)], inward = (a) => [-Math.sin(a), -1, -Math.cos(a)];
    for (const [f0, f1, kind] of D.bands) {
      const t0 = f0 * Math.PI / 2, t1 = f1 * Math.PI / 2, r0 = R * Math.cos(t0), r1 = R * Math.cos(t1), y0 = H + D.rise * Math.sin(t0), y1 = H + D.rise * Math.sin(t1);
      for (let m = 0; m < meridians.length; m++) {
        const [a0, rib] = meridians[m], a1 = m + 1 < meridians.length ? meridians[m + 1][0] : meridians[0][0] + Math.PI * 2, n = inward((a0 + a1) / 2);
        if (kind === "cap") face(dark, [at(a0, r0, y0), at(a1, r0, y0), [0, D.crown, 0]], C.cap, 0, n);
        else if (kind === "panel") quad(dark, at(a0, r0, y0), at(a1, r0, y0), at(a1, r1, y1), at(a0, r1, y1), rib ? C.rib : C.dome, 0, n);
        else quad(amber, at(a0, r0, y0), at(a1, r0, y0), at(a1, r1, y1), at(a0, r1, y1), C.amber, kind === "oculus" ? 0.85 : 0.7, n);
      }
    }
    // The cornice: its inward face and its underside, round the whole wall.
    const Kc = D.cornice, rc = R - Kc.depth, lo = H - Kc.below, hi = H + Kc.above;
    for (let m = 0; m < meridians.length; m++) {
      const a0 = meridians[m][0], a1 = m + 1 < meridians.length ? meridians[m + 1][0] : meridians[0][0] + Math.PI * 2, mid = (a0 + a1) / 2;
      quad(dark, at(a0, rc, lo), at(a1, rc, lo), at(a1, rc, hi), at(a0, rc, hi), C.trim, 0, [-Math.sin(mid), 0, -Math.cos(mid)]);
      quad(dark, at(a0, rc, lo), at(a1, rc, lo), at(a1, R, lo), at(a0, R, lo), C.band, 0, DOWN);
    }
    return { dark, amber: noShadow(amber) };
  });

  // The hall: the round wall from bay edge to bay edge, the flat bay with the doorway cut in it and its frame, the
  // floor's tiles over a dark base, the chain of blocks and the dome.
  const hall = perScale((scale) => {
    const L = ROOMS.layout(scale), R = L.radius, H = L.wall, s = scale, geo = blank(), parts = [geo];
    const edge = Math.asin(DOOR.bay / R), n = Math.round(40 * s), at = (phi, y, r = R) => [r * Math.sin(phi), y, r * Math.cos(phi)];
    for (let i = 0; i < n; i++) {
      const p0 = edge + (Math.PI * 2 - 2 * edge) * i / n, p1 = edge + (Math.PI * 2 - 2 * edge) * (i + 1) / n, m = (p0 + p1) / 2, inward = [-Math.sin(m), 0, -Math.cos(m)];
      quad(geo, at(p0, 0), at(p1, 0), at(p1, 0.9), at(p0, 0.9), C.band, 0, inward);
      quad(geo, at(p0, 0.9), at(p1, 0.9), at(p1, H), at(p0, H), C.wall, 0, inward);
    }
    // The bay, facing into the room, round the doorway.
    const Z = L.doorZ, B = DOOR.bay, W = DOOR.halfW, D = DOOR.height, IN = [0, 0, -1];
    quad(geo, [-B, 0, Z], [-W, 0, Z], [-W, H, Z], [-B, H, Z], C.wall, 0, IN);
    quad(geo, [W, 0, Z], [B, 0, Z], [B, H, Z], [W, H, Z], C.wall, 0, IN);
    quad(geo, [-W, D, Z], [W, D, Z], [W, H, Z], [-W, H, Z], C.wall, 0, IN);
    // Its frame: jambs and a lintel standing a hand proud of the bay, and over them a deeper header a little wider,
    // which carries the EXIT sign.
    const F = DOOR.frame, X = EXIT_HEADER;
    for (const side of [-1, 1]) parts.push(box({ w: F, h: D + F, d: 0.14, color: C.trim, offset: { x: side * (W + F / 2), y: (D + F) / 2, z: Z - 0.05 } }));
    parts.push(box({ w: 2 * W + 2 * F, h: F, d: 0.14, color: C.trim, offset: { y: D + F / 2, z: Z - 0.05 } }));
    parts.push(box({ w: 2 * W + 2 * F + 2 * X.over, h: X.h, d: X.d, color: C.trim, offset: { y: D + F + X.h / 2, z: Z - X.d / 2 + 0.02 } }));
    parts.push(floorParts(scale).dark, domeParts(scale).dark);
    // The screens' and cards' dark bezels, a little behind their pictures.
    for (const list of [L.screens, L.ribbon]) for (const p of list) {
      const pad = list === L.screens ? 0.16 * s : 0.06 * s, back = 0.1;
      parts.push(moved(turnedY(box({ w: p.w + pad, h: p.h + pad, d: back, color: C.bezel, offset: { z: -back / 2 - 0.01 } }), -p.angle), p.x, p.y, p.z));
    }
    return merge(...parts);
  });
  // What glows: the light strips low and high round the wall and across the bay, and the chain of blocks on the
  // floor from the doorway to the table and round it. Kept off the shadows.
  const glow = perScale((scale) => {
    const L = ROOMS.layout(scale), R = L.radius, H = L.wall, s = scale, geo = blank();
    const edge = Math.asin(DOOR.bay / R), n = Math.round(40 * s), at = (phi, y, r) => [r * Math.sin(phi), y, r * Math.cos(phi)];
    for (const [y, h] of [[0.9, 0.05], [H - 0.45 * s, 0.07 * s]]) for (let i = 0; i < n; i++) {
      const p0 = edge + (Math.PI * 2 - 2 * edge) * i / n, p1 = edge + (Math.PI * 2 - 2 * edge) * (i + 1) / n, m = (p0 + p1) / 2, r = R - 0.02;
      quad(geo, at(p0, y, r), at(p1, y, r), at(p1, y + h, r), at(p0, y + h, r), C.amber, 1, [-Math.sin(m), 0, -Math.cos(m)]);
    }
    const Z = L.doorZ - 0.015, B = DOOR.bay, W = DOOR.halfW, IN = [0, 0, -1], top = H - 0.45 * s;
    quad(geo, [-B, 0.9, Z], [-W - DOOR.frame, 0.9, Z], [-W - DOOR.frame, 0.95, Z], [-B, 0.95, Z], C.amber, 1, IN);
    quad(geo, [W + DOOR.frame, 0.9, Z], [B, 0.9, Z], [B, 0.95, Z], [W + DOOR.frame, 0.95, Z], C.amber, 1, IN);
    quad(geo, [-B, top, Z], [B, top, Z], [B, top + 0.07 * s, Z], [-B, top + 0.07 * s, Z], C.amber, 1, IN);
    // The floor's chain and the dome's rings (`floorParts`, `domeParts`).
    return noShadow(merge(geo, floorParts(scale).amber, domeParts(scale).amber));
  });
  // The vestibule past the doorway, dim, ending in a hanging curtain of dark strips; the same depth in every room.
  const vestibule = perScale((scale) => {
    const L = ROOMS.layout(scale), geo = blank(), Z = L.doorZ, W = DOOR.halfW, D = DOOR.height, end = Z + DOOR.vestibule;
    quad(geo, [-W, 0, Z], [W, 0, Z], [W, 0, end], [-W, 0, end], C.vestibule, 0, UP);
    quad(geo, [-W, D, Z], [W, D, Z], [W, D, end], [-W, D, end], C.vestibule, 0, DOWN);
    for (const side of [-1, 1]) quad(geo, [side * W, 0, Z], [side * W, 0, end], [side * W, D, end], [side * W, D, Z], C.vestibule, 0, [-side, 0, 0]);
    const strips = 10;
    for (let i = 0; i < strips; i++) {
      const x0 = -W + 2 * W * i / strips, x1 = x0 + 2 * W / strips;
      quad(geo, [x0, 0, end], [x1, 0, end], [x1, D, end], [x0, D, end], i & 1 ? C.curtain : C.curtainB, 0, [0, 0, -1]);
    }
    return geo;
  });
  const vestibuleGlow = perScale((scale) => {
    const L = ROOMS.layout(scale), geo = blank(), Z = L.doorZ, W = DOOR.halfW - 0.08, end = Z + DOOR.vestibule - 0.05;
    for (const side of [-1, 1]) quad(geo, [side * W - 0.02, 0.005, Z], [side * W + 0.02, 0.005, Z], [side * W + 0.02, 0.005, end], [side * W - 0.02, 0.005, end], C.ember, 0.6, UP);
    return noShadow(geo);
  });
  // A door leaf, `side` -1 or 1, centred on its own origin: charcoal, its leading edge dark so the seam shows as a
  // line, on the face toward the room (-z).
  const leaf = (side) => {
    const W = DOOR.halfW, D = DOOR.height, geo = box({ w: W, h: D, d: 0.08, color: C.wall, offset: { y: D / 2 } }), IN = [0, 0, -1], z = -0.046;
    const e = side < 0 ? W / 2 : -W / 2;
    quad(geo, [e - 0.015, 0, z], [e + 0.015, 0, z], [e + 0.015, D, z], [e - 0.015, D, z], C.leg, 0, IN);
    return geo;
  };
  // The wall's low strip carried across a leaf as a chain of three hollow links, joined to its partner's across the
  // seam and running out to the frame: its own mesh, a child of the leaf, so Canvas 2D can sort it over the leaf.
  const leafChain = (side) => {
    const W = DOOR.halfW, geo = blank(), IN = [0, 0, -1], z = -0.045;
    // From the leading edge, at the seam, along the leaf away from it.
    const e = side < 0 ? W / 2 : -W / 2, at = (u) => e + side * u;
    const bar = (u0, u1, y0, y1) => quad(geo, [Math.min(at(u0), at(u1)), y0, z], [Math.max(at(u0), at(u1)), y0, z], [Math.max(at(u0), at(u1)), y1, z], [Math.min(at(u0), at(u1)), y1, z], C.amber, 0.9, IN);
    const LINK = 0.38, JOIN = 0.1, SIDE = 0.08, y0 = 0.845, y1 = 1.005, h0 = 0.895, h1 = 0.955;
    let u = JOIN / 2;
    bar(0, u, 0.9, 0.95);
    for (let k = 0; k < 3; k++) {
      bar(u, u + LINK, y0, h0); bar(u, u + LINK, h1, y1);
      bar(u, u + SIDE, h0, h1); bar(u + LINK - SIDE, u + LINK, h0, h1);
      u += LINK;
      bar(u, k < 2 ? u + JOIN : W, 0.9, 0.95);
      u += JOIN;
    }
    return noShadow(geo);
  };
  const leaves = [leaf(-1), leaf(1)], chains = [leafChain(-1), leafChain(1)];
  // The Exit button's plate, its amber face and the play mark on it, facing -z and pointing right as seen from the room.
  const button = (() => {
    const geo = merge(box({ w: 0.38, h: 0.38, d: 0.06, color: C.trim }), box({ w: 0.28, h: 0.28, d: 0.02, color: C.amber, emissive: 0.85, offset: { z: -0.035 } }));
    const base = geo.verts.length / 3;
    geo.verts.push(0.06, 0.08, -0.047, 0.06, -0.08, -0.047, -0.08, 0, -0.047);
    geo.faces.push({ i: [base, base + 1, base + 2], color: hexToRgb(C.curtain), emissive: 0 });
    return geo;
  })();
  // EXIT in the island's 5x7 letters (jumbotron.js), amber on the doorway's header, about its own middle and facing
  // -z, into the room: one face a run of lit cells in a row.
  const exitWord = (() => {
    const T = BL.jumbotron.text, word = "EXIT", px = 0.036, geo = blank(), IN = [0, 0, -1];
    const cols = word.length * (T.GLYPH_W + T.TRACKING) - T.TRACKING;
    // Seen from the room the word reads toward -x.
    const x = (col) => (cols / 2 - col) * px, y = (row) => (T.GLYPH_H / 2 - row) * px;
    for (let row = 0; row < T.GLYPH_H; row++) {
      const lit = [];
      [...word].forEach((ch, i) => { const bits = T.glyphOf(ch)[row]; for (let c = 0; c < T.GLYPH_W; c++) if (bits >> (T.GLYPH_W - 1 - c) & 1) lit[i * (T.GLYPH_W + T.TRACKING) + c] = true; });
      for (let c = 0; c < cols; c++) {
        if (!lit[c]) continue;
        let e = c;
        while (lit[e + 1]) e++;
        quad(geo, [x(e + 1), y(row + 1), 0], [x(c), y(row + 1), 0], [x(c), y(row), 0], [x(e + 1), y(row), 0], C.amber, 0.9, IN);
        c = e;
      }
    }
    return noShadow(geo);
  })();
  // The meeting table: a dark drum on a pedestal with an amber band, as wide as the room's layout makes it (`k` times
  // the smallest room's) at one height, and a flat ₿ in its top. The top is laid in squares a ₿ pixel across, cut to
  // the drum's rim, the ₿'s own lit, so nothing lies over anything (Canvas 2D sorts face by face).
  const BITCOIN = ["00011011000", "00011011000", "01111111100", "00110000110", "00110000110", "00111111100", "00110000110", "00110000011", "00110000011", "01111111110", "00011011000", "00011011000"];
  const table = perScale((scale) => {
    const T = ROOMS.layout(scale).table, k = T.r / 1.15, h = T.top, rim = 1.1 * k, segments = Math.round(32 * k), geo = blank();
    const cell = 0.07 * k, n = Math.ceil(rim / cell) + 1, inside = rim * Math.cos(Math.PI / segments);
    for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) {
      const x0 = (i - 0.5) * cell, z0 = j * cell, row = BITCOIN[j + 6], lit = !!row && row[i + 5] === "1";
      let poly = [[x0, z0], [x0 + cell, z0], [x0 + cell, z0 + cell], [x0, z0 + cell]];
      // The rim is the lathe's own polygon: its corners at whole steps of the turn, each side `inside` from the middle.
      if (Math.max(...poly.map(([x, z]) => Math.hypot(x, z))) > inside) {
        for (let s = 0; s < segments && poly; s++) { const a = (s + 0.5) / segments * Math.PI * 2; poly = clip(poly, Math.cos(a), Math.sin(a), inside); }
      }
      if (poly) face(geo, poly.map(([x, z]) => [x, h, z]), lit ? C.amber : C.seat, lit ? 0.75 : 0, UP);
    }
    return merge(
      lathe({ profile: [[0, 0], [0.55 * k, 0], [0.55 * k, 0.06], [0.2 * k, 0.09], [0.2 * k, h - 0.14], [rim, h - 0.12], [rim, h]], segments, color: C.seat }),
      ring({ r: 1.11 * k, thickness: 0.03, y: h - 0.06, segments, color: C.amber, emissive: 0.8 }),
      geo
    );
  });
  // How far Canvas 2D's depth sort pulls a mark in front of the face it lies on (the door's chain, EXIT).
  const MARK_BIAS = -0.3;
  // A blocky lounge chair, its front toward +z.
  const chair = merge(
    box({ w: 0.86, h: 0.36, d: 0.82, color: C.seat, offset: { y: 0.18 } }),
    box({ w: 0.7, h: 0.1, d: 0.64, color: C.cushion, offset: { y: 0.41, z: 0.04 } }),
    box({ w: 0.86, h: 0.8, d: 0.2, color: C.seat, offset: { y: 0.76, z: -0.31 } }),
    ...[-1, 1].map((side) => box({ w: 0.14, h: 0.26, d: 0.74, color: C.cushion, offset: { x: side * 0.36, y: 0.49 } })),
    box({ w: 0.6, h: 0.03, d: 0.03, color: C.amber, emissive: 0.6, offset: { y: 0.04, z: 0.42 } })
  );
  // The holdings desk with its terminal, front toward +z; the terminal's picture hangs at `screen`.
  const desk = merge(
    box({ w: 2, h: 0.06, d: 0.8, color: C.desk, offset: { y: 0.76 } }),
    ...[-1, 1].map((side) => box({ w: 0.06, h: 0.73, d: 0.72, color: C.leg, offset: { x: side * 0.93, y: 0.365 } })),
    box({ w: 0.12, h: 0.32, d: 0.12, color: C.leg, offset: { y: 0.95, z: -0.2 } }),
    box({ w: 1.24, h: 0.8, d: 0.07, color: C.bezel, offset: { y: 1.48, z: -0.2 } }),
    box({ w: 0.9, h: 0.03, d: 0.26, color: C.leg, offset: { y: 0.8, z: 0.12 } }),
    box({ w: 1.9, h: 0.02, d: 0.02, color: C.amber, emissive: 0.6, offset: { y: 0.735, z: 0.4 } })
  );
  const DESK_SCREEN = { y: 1.48, z: -0.16, w: 1.1, h: 0.68 };
  // Sani's recliner (base, swivelling seat, back) and his laptop, as the old sphere had them, in the room's colours.
  const reclinerBase = merge(box({ w: 1.35, h: 0.12, d: 1.1, color: C.leg, offset: { y: 0.12 } }), box({ w: 0.22, h: 0.55, d: 0.22, color: C.trim, offset: { y: 0.38 } }));
  const reclinerSeat = merge(
    box({ w: 1.24, h: 0.22, d: 0.95, color: C.seat, offset: { y: 0.68 } }),
    box({ w: 1.04, h: 0.14, d: 0.85, color: C.cushion, offset: { y: 0.81 } }),
    box({ w: 1.08, h: 0.15, d: 0.4, color: C.cushion, offset: { y: 0.64, z: 0.52 } }),
    ...[-0.63, 0.63].map((x) => box({ w: 0.18, h: 0.18, d: 1.05, color: C.seat, offset: { x, y: 1.08 } }))
  );
  const reclinerBack = merge(
    box({ w: 1.25, h: 1.25, d: 0.22, color: C.seat, offset: { y: 0.58 } }),
    box({ w: 1.05, h: 0.9, d: 0.17, color: C.cushion, offset: { y: 0.55, z: 0.15 } }),
    box({ w: 0.72, h: 0.06, d: 0.25, color: C.amber, emissive: 0.6, offset: { y: 1.07, z: 0.16 } })
  );
  const laptopBase = (() => {
    const parts = [box({ w: 1.04, h: 0.065, d: 0.65, color: "#3a3a40" })];
    for (let row = 0; row < 3; row++) for (let col = 0; col < 9; col++) parts.push(box({ w: 0.075, h: 0.015, d: 0.065, color: C.leg, offset: { x: (col - 4) * 0.1, y: 0.042, z: 0.06 + row * 0.08 } }));
    return merge(...parts);
  })();
  const laptopLid = merge(
    box({ w: 1.04, h: 0.47, d: 0.055, color: "#3a3a40", offset: { y: 0.22 } }),
    box({ w: 0.94, h: 0.39, d: 0.015, color: "#0f1a12", emissive: 0.45, offset: { y: 0.23, z: -0.036 } }),
    ...[0, 1, 2, 3].map((i) => box({ w: 0.28 + (i % 3) * 0.13, h: 0.025, d: 0.01, color: i % 2 ? "#3ddc84" : "#f7931a", emissive: 0.85, offset: { x: -0.14, y: 0.34 - i * 0.075, z: -0.05 } }))
  );

  // A picture on a quad `w` by `h` about the origin, facing +z, from a decoded image `image` of `width` by `height`.
  const picture = (image, width, height, w, h) => {
    const geo = { verts: [-w / 2, -h / 2, 0, w / 2, -h / 2, 0, w / 2, h / 2, 0, -w / 2, h / 2, 0], faces: [{ i: [0, 1, 2, 3], color: [0, 0, 0], emissive: 0 }], lines: [], castShadow: false };
    geo.imageSurface = { asset: { width, height, load: () => image }, rect: [-w / 2, -h / 2, w, h] };
    return geo;
  };

  // One room's nodes at `scale`. The screens', cards' and terminal's nodes come empty: the scene hangs their
  // pictures. The lounge carries what timechain-beer.js drives (`node`, `chair`, `swivel`, `spots`).
  const build = (scale) => {
    const L = ROOMS.layout(scale), root = createNode(), s = scale;
    addChild(root, createNode({ geometry: hall(scale) }), createNode({ geometry: glow(scale), sightHidden: true }),
      createNode({ geometry: vestibule(scale) }), createNode({ geometry: vestibuleGlow(scale), sightHidden: true }));
    const doors = [-1, 1].map((side) => createNode({ geometry: leaves[side < 0 ? 0 : 1], position: { x: side * DOOR.halfW / 2, y: 0, z: L.doorZ + 0.06 } }));
    doors.forEach((door, i) => addChild(door, createNode({ geometry: chains[i], depthBias: MARK_BIAS })));
    addChild(root, ...doors);
    const facingIn = (p) => createNode({ position: { x: p.x, y: p.y, z: p.z }, rotation: { x: 0, y: -p.angle, z: 0 } });
    const screens = L.screens.map(facingIn), cards = L.ribbon.map(facingIn);
    addChild(root, ...screens, ...cards);
    const E = L.exitButton;
    // The button and the sign are built facing -z, into the room.
    const exitButton = createNode({ geometry: button, position: { x: E.x, y: E.y, z: E.z } });
    // EXIT on the header over the doorway.
    const exitSign = createNode({ geometry: exitWord, depthBias: MARK_BIAS, position: { x: 0, y: DOOR.height + DOOR.frame + EXIT_HEADER.h / 2, z: L.doorZ - EXIT_HEADER.d + 0.016 } });
    addChild(root, exitButton, exitSign);
    const tableNode = createNode({ geometry: table(scale), position: { x: L.table.x, y: 0, z: L.table.z } });
    const chairs = L.chairs.map((c) => createNode({ geometry: chair, position: { x: c.x, y: 0, z: c.z }, rotation: { x: 0, y: c.heading, z: 0 } }));
    const deskNode = createNode({ geometry: desk, position: { x: L.desk.x, y: 0, z: L.desk.z }, rotation: { x: 0, y: L.desk.heading, z: 0 } });
    const terminal = createNode({ position: { x: 0, y: DESK_SCREEN.y, z: DESK_SCREEN.z } });
    addChild(deskNode, terminal);
    addChild(root, tableNode, ...chairs, deskNode);
    // Sani's corner, in the room's own frame: the recliner, and the node timechain-beer.js stands his gear in.
    const lounge = createNode();
    const reclinerNode = createNode({ geometry: reclinerBase, position: { x: L.beer.chair.x, y: 0, z: L.beer.chair.z } });
    const swivel = createNode({ geometry: reclinerSeat, rotation: { x: 0, y: Math.PI, z: 0 } });
    const back = createNode({ geometry: reclinerBack, position: { x: 0, y: 0.82, z: -0.44 }, rotation: { x: -0.23, y: 0, z: 0 } });
    const laptop = createNode({ geometry: laptopBase, position: { x: 0, y: 1, z: 0.58 } });
    addChild(laptop, createNode({ geometry: laptopLid, position: { x: 0, y: 0.035, z: 0.3 }, rotation: { x: 0.14, y: 0, z: 0 } }));
    addChild(swivel, back, laptop);
    addChild(reclinerNode, swivel);
    addChild(lounge, reclinerNode);
    addChild(root, lounge);
    // Point lights, the fixed ones first: warm over the table and the corners, the screens' wash, the vestibule.
    const B = L.beer;
    const lights = [
      [0, L.wall - 0.4, 0, 9 * s, 0.95, 0.62, 0.3],
      [0, L.screens[0].y, -L.radius * 0.62, 10 * s, 0.75, 0.48, 0.2],
      [L.desk.x * 0.8, 3 * s, L.desk.z, 6 * s, 0.6, 0.42, 0.22],
      [(B.chair.x + B.dispenser.x) / 2, 3 * s, (B.chair.z + B.dispenser.z) / 2, 6 * s, 0.6, 0.42, 0.22],
      [0, 2.6, L.doorZ - 1.6, 6, 0.7, 0.46, 0.2],
      [0, DOOR.height - 0.4, L.doorZ + DOOR.vestibule * 0.5, 3.2, 0.32, 0.2, 0.08]
    ];
    return {
      root, layout: L, doors, screens, cards, exitButton, exitSign, terminal, table: tableNode, chairs, desk: deskNode, lights,
      lounge: { node: lounge, chair: reclinerNode, swivel, laptop, spots: B }
    };
  };
  // Every geometry a room of this size draws, for the scene's live set and for releasing a preview.
  const geometries = (scale) => [hall(scale), glow(scale), vestibule(scale), vestibuleGlow(scale), ...leaves, ...chains, button, exitWord, table(scale), chair, desk, reclinerBase, reclinerSeat, reclinerBack, laptopBase, laptopLid];
  BL.timechainRoomModels = { build, picture, geometries, DESK_SCREEN, COLORS: C };
})();
