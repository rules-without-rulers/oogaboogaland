// Heap interior is passable, its stone platform solid.
// Rock-cut/actor silhouette renderer is shared by the WebGL and Canvas 2D paths.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const TAU = Math.PI * 2, EPS = 1e-7, UP = { x: 0, y: 1, z: 0 };
  const create = ({ overlay, pile, renderOpts = null, renderer = null, floor = pile.core.position.y, lightVisibleAt = null }) => {
    const core = pile.core, geometry = core.geometry, verts = geometry.verts;
    const segments = geometry.pileSegments, rings = geometry.pileRings;
    const lighting = new Float64Array(27), albedo = new Float64Array(3);
    const shadowCache = new Float64Array(9 * 8);
    shadowCache.fill(NaN);
    lighting.fill(1);
    let lightingX = 0, lightingZ = 0, lightingSpan = 1;
    // Weight the banana skin average by face area so the small brown tips do not dominate the interior color.
    const skin = pile.shell?.geometry || BL.models.bananaTileGeometry(), skinVerts = skin.verts;
    let skinArea = 0;
    for (const face of skin.faces) for (let n = 1; n < face.i.length - 1; n++) {
      const a = face.i[0] * 3, b = face.i[n] * 3, c = face.i[n + 1] * 3;
      const ax = skinVerts[b] - skinVerts[a], ay = skinVerts[b + 1] - skinVerts[a + 1], az = skinVerts[b + 2] - skinVerts[a + 2];
      const bx = skinVerts[c] - skinVerts[a], by = skinVerts[c + 1] - skinVerts[a + 1], bz = skinVerts[c + 2] - skinVerts[a + 2];
      const area = Math.hypot(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx);
      for (let channel = 0; channel < 3; channel++) albedo[channel] += face.color[channel] * area;
      skinArea += area;
    }
    for (let channel = 0; channel < 3; channel++) albedo[channel] /= skinArea;
    const bananaTextureAt = (x, y, z, pixels, at) => {
      // Grain is world-anchored, not screen-space.
      // The lighting grid follows the same local surface as the exterior heap.
      const grain = 0.5 + Math.sin(x * 7.3 + y * 4.7 + Math.sin(z * 5.1)) * 0.2
        + Math.sin(z * 8.1 - y * 5.3 + Math.cos(x * 4.1)) * 0.14;
      const gx = Math.max(0, Math.min(2, (x - lightingX) / lightingSpan * 2)), gz = Math.max(0, Math.min(2, (z - lightingZ) / lightingSpan * 2));
      const ix = Math.min(1, Math.floor(gx)), iz = Math.min(1, Math.floor(gz)), tx = gx - ix, tz = gz - iz, index = (iz * 3 + ix) * 3;
      for (let channel = 0; channel < 3; channel++) {
        const i = index + channel;
        const a = lighting[i] + (lighting[i + 3] - lighting[i]) * tx;
        const b = lighting[i + 9] + (lighting[i + 12] - lighting[i + 9]) * tx;
        pixels[at + channel] = albedo[channel] * (0.86 + grain * 0.22) * (a + (b - a) * tz);
      }
      pixels[at + 3] = 255;
    };
    bananaTextureAt.version = 0;
    const cover = BL.cameraCover.create(overlay, bananaTextureAt);
    const forward = new Float64Array(3), view = BL.math.mat4.create(), stack = new Array(64);
    const bounds = BL.scene.boundsOf(geometry), faceBounds = new Float64Array(geometry.faces.length * 6), order = [];
    // Height queries use the real ring vertices; this index serves silhouette rays only.
    // Both stay immutable when a donation scales the heap.
    for (let i = 0; i < geometry.faces.length; i++) {
      const at = i * 6;
      faceBounds.fill(Infinity, at, at + 3); faceBounds.fill(-Infinity, at + 3, at + 6);
      for (const vertex of geometry.faces[i].i) for (let axis = 0; axis < 3; axis++) {
        const value = verts[vertex * 3 + axis];
        faceBounds[at + axis] = Math.min(faceBounds[at + axis], value);
        faceBounds[at + axis + 3] = Math.max(faceBounds[at + axis + 3], value);
      }
      order.push(i);
    }
    // Centroid sort keys computed once; the tree re-sorts at every level.
    const keys = new Float64Array(geometry.faces.length * 3), scratch = BL.math.sortScratch(order.length);
    for (let i = 0; i < geometry.faces.length; i++) for (let axis = 0; axis < 3; axis++) keys[i * 3 + axis] = faceBounds[i * 6 + axis] + faceBounds[i * 6 + axis + 3];
    const build = (start, end) => {
      const box = new Float64Array([Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]);
      for (let n = start; n < end; n++) for (let axis = 0; axis < 3; axis++) {
        const at = order[n] * 6;
        box[axis] = Math.min(box[axis], faceBounds[at + axis]);
        box[axis + 3] = Math.max(box[axis + 3], faceBounds[at + axis + 3]);
      }
      const node = { box, start, end, left: null, right: null };
      if (end - start > 12) {
        let axis = 0;
        for (let a = 1; a < 3; a++) if (box[a + 3] - box[a] > box[axis + 3] - box[axis]) axis = a;
        BL.math.sortByKey(order, start, end, keys, 3, axis, scratch);
        const middle = (start + end) >>> 1;
        node.left = build(start, middle); node.right = build(middle, end);
      }
      return node;
    };
    // Lazy: only silhouette rays walk this index and its faces never move, so the first ray pays, not boot.
    let tree = null;
    const treeOf = () => tree || (tree = build(0, order.length));
    const ringRadius = (ring, sector, ux, uz) => {
      const a = (ring * segments + sector) * 3, b = (ring * segments + (sector + 1) % segments) * 3;
      return (verts[a] * verts[b + 2] - verts[a + 2] * verts[b])
        / (ux * (verts[b + 2] - verts[a + 2]) - uz * (verts[b] - verts[a]));
    };
    const triangleHeight = (a, b, c, x, z) => {
      a *= 3; b *= 3; c *= 3;
      const ax = verts[a], az = verts[a + 2], bx = verts[b] - ax, bz = verts[b + 2] - az;
      const cx = verts[c] - ax, cz = verts[c + 2] - az, dx = x - ax, dz = z - az;
      const det = bx * cz - bz * cx, u = (dx * cz - dz * cx) / det, v = (bx * dz - bz * dx) / det;
      return u >= -EPS && v >= -EPS && u + v <= 1 + EPS ? verts[a + 1] + u * (verts[b + 1] - verts[a + 1]) + v * (verts[c + 1] - verts[a + 1]) : NaN;
    };
    const heightAt = (x, z) => {
      if (!core.visible) return -Infinity;
      x = (x - core.position.x) / core.scale.x; z = (z - core.position.z) / core.scale.z;
      const radius = Math.hypot(x, z);
      if (radius > 1 + EPS) return -Infinity;
      if (radius < EPS) return core.position.y + verts[rings * segments * 3 + 1] * core.scale.y;
      const ux = x / radius, uz = z / radius;
      const sector = Math.min(segments - 1, Math.floor(((Math.atan2(z, x) + TAU) % TAU) / TAU * segments));
      if (radius > ringRadius(0, sector, ux, uz) + EPS) return -Infinity;
      let outer = 0, inner = rings;
      while (inner - outer > 1) {
        const middle = (outer + inner) >>> 1;
        if (radius <= ringRadius(middle, sector, ux, uz)) outer = middle; else inner = middle;
      }
      const next = (sector + 1) % segments, a = outer * segments + sector;
      let y;
      if (inner === rings) y = triangleHeight(a, rings * segments, outer * segments + next, x, z);
      else {
        y = triangleHeight(a, inner * segments + sector, inner * segments + next, x, z);
        if (Number.isNaN(y)) y = triangleHeight(a, inner * segments + next, outer * segments + next, x, z);
      }
      return Number.isNaN(y) ? -Infinity : core.position.y + y * core.scale.y;
    };
    const updateLighting = (camera, reach) => {
      if (!renderOpts || !core.visible) return;
      state.shadowedSamples = 0;
      const p = camera.position, light = renderOpts.light, sky = renderOpts.sky, ground = renderOpts.ground;
      const direct = renderOpts.direct || renderOpts.sun, strength = renderOpts.directStrength;
      const length = Math.hypot(light.x, light.y, light.z), lx = light.x / length, ly = light.y / length, lz = light.z / length;
      const canvas = renderer?.kind === "canvas2d", ambient = renderOpts.ambientFloor, diffuseFloor = renderOpts.diffuseFloor;
      const skyLuma = sky[0] * 0.2126 + sky[1] * 0.7152 + sky[2] * 0.0722;
      const groundLuma = ground[0] * 0.2126 + ground[1] * 0.7152 + ground[2] * 0.0722;
      // Canvas shades one grey where WebGL shades three; its direct term is that direct colour's luminance.
      // Fixed factor tracks the sun, not the dimmer moon: it read dusk darker than midnight, inverting the order.
      const directLuma = direct[0] * 0.2126 + direct[1] * 0.7152 + direct[2] * 0.0722;
      const lights = renderOpts.lights, lightCount = canvas || !lights ? 0 : Math.min(10, renderOpts.lightCount);
      lightingX = p.x - reach; lightingZ = p.z - reach; lightingSpan = Math.max(1e-5, reach * 2);
      const step = core.scale.x * 0.0015, limit = core.scale.x * Math.cos(Math.PI / segments) - step * 2.1;
      let changed = false;
      for (let z = 0; z < 3; z++) for (let x = 0; x < 3; x++) {
        let wx = lightingX + x * reach, wz = lightingZ + z * reach;
        const dx = wx - core.position.x, dz = wz - core.position.z, radius = Math.hypot(dx, dz);
        if (radius > limit) { wx = core.position.x + dx * limit / radius; wz = core.position.z + dz * limit / radius; }
        const wy = heightAt(wx, wz);
        let nx = heightAt(wx - step, wz) - heightAt(wx + step, wz), ny = step * 2;
        let nz = heightAt(wx, wz - step) - heightAt(wx, wz + step);
        const normalLength = Math.hypot(nx, ny, nz);
        nx /= normalLength; ny /= normalLength; nz /= normalLength;
        const hemi = ny * 0.5 + 0.5, diffuse = Math.max(diffuseFloor, nx * lx + ny * ly + nz * lz);
        let visibility = 1;
        if (!canvas && lightVisibleAt && diffuse > 0) {
          const at = (z * 3 + x) * 8, time = renderOpts.matrix ? renderOpts.matrix.time : renderOpts.time;
          if (!(Math.hypot(wx - shadowCache[at], wy - shadowCache[at + 1], wz - shadowCache[at + 2]) < 0.08
            && Math.hypot(lx - shadowCache[at + 3], ly - shadowCache[at + 4], lz - shadowCache[at + 5]) < 0.002 && time - shadowCache[at + 6] < 0.1)) {
            shadowCache[at] = wx; shadowCache[at + 1] = wy; shadowCache[at + 2] = wz;
            shadowCache[at + 3] = lx; shadowCache[at + 4] = ly; shadowCache[at + 5] = lz; shadowCache[at + 6] = time;
            shadowCache[at + 7] = lightVisibleAt(wx + nx * 0.035, wy + ny * 0.035, wz + nz * 0.035, lx, ly, lz) ? 1 : 0;
          }
          visibility = 1 + (Math.max(shadowCache[at + 7], renderOpts.shadowFloor) - 1) * renderOpts.shadowStrength;
          if (visibility < 1) state.shadowedSamples++;
        }
        const canvasLight = Math.min(1, Math.max(ambient, groundLuma + (skyLuma - groundLuma) * hemi) + diffuse * directLuma * strength);
        for (let channel = 0; channel < 3; channel++) {
          let value = canvas ? canvasLight : Math.max(ambient, ground[channel] + (sky[channel] - ground[channel]) * hemi) + direct[channel] * diffuse * strength * visibility;
          for (let n = 0; n < lightCount; n++) {
            const i = n * 8, px = lights[i] - wx, py = lights[i + 1] - wy, pz = lights[i + 2] - wz;
            const distance = Math.hypot(px, py, pz), falloff = Math.max(0, 1 - distance / lights[i + 3]);
            value += lights[i + 4 + channel] * falloff * falloff * Math.max(0, nx * px + ny * py + nz * pz) / Math.max(distance, 0.0001);
          }
          // 1/1024 quantization: sub-quarter-color-step changes are invisible; larger ones must invalidate a still view.
          value = Math.round(value * 1024) / 1024;
          const at = (z * 3 + x) * 3 + channel;
          if (lighting[at] !== value) { lighting[at] = value; changed = true; }
        }
      }
      if (changed) bananaTextureAt.version++;
    };
    const contains = (x, y, z) => core.visible && y >= floor && y <= heightAt(x, z);
    const intersectsBody = (x, feet, z, height) => {
      if (!core.visible || feet + height <= core.position.y || Math.hypot(x - core.position.x, z - core.position.z) > core.scale.x + 0.34) return false;
      for (let k = 0; k < 9; k++) if (heightAt(x + (k % 3 - 1) * 0.24, z + (Math.floor(k / 3) - 1) * 0.24) > feet + 0.04) return true;
      return false;
    };
    const boxHit = (box, x, y, z, dx, dy, dz) => {
      let lo = 0, hi = 1;
      for (let a = 0; a < 3; a++) {
        const p = a === 0 ? x : a === 1 ? y : z, d = a === 0 ? dx : a === 1 ? dy : dz;
        if (Math.abs(d) < 1e-12) { if (p < box[a] || p > box[a + 3]) return false; }
        else { const t0 = (box[a] - p) / d, t1 = (box[a + 3] - p) / d; lo = Math.max(lo, Math.min(t0, t1)); hi = Math.min(hi, Math.max(t0, t1)); if (lo > hi) return false; }
      }
      return true;
    };
    const triangleHit = (a, b, c, x, y, z, dx, dy, dz) => {
      a *= 3; b *= 3; c *= 3;
      const ux = verts[b] - verts[a], uy = verts[b + 1] - verts[a + 1], uz = verts[b + 2] - verts[a + 2];
      const vx = verts[c] - verts[a], vy = verts[c + 1] - verts[a + 1], vz = verts[c + 2] - verts[a + 2];
      const hx = dy * vz - dz * vy, hy = dz * vx - dx * vz, hz = dx * vy - dy * vx, det = ux * hx + uy * hy + uz * hz;
      if (Math.abs(det) < 1e-12) return false;
      const tx = x - verts[a], ty = y - verts[a + 1], tz = z - verts[a + 2], u = (tx * hx + ty * hy + tz * hz) / det;
      if (u < -EPS || u > 1 + EPS) return false;
      const qx = ty * uz - tz * uy, qy = tz * ux - tx * uz, qz = tx * uy - ty * ux, v = (dx * qx + dy * qy + dz * qz) / det;
      if (v < -EPS || u + v > 1 + EPS) return false;
      const t = (vx * qx + vy * qy + vz * qz) / det;
      return t > EPS && t < 1 - EPS;
    };
    const segmentClear = (ax, ay, az, bx, by, bz) => {
      if (!core.visible) return true;
      if (contains(ax, ay, az) || contains(bx, by, bz)) return false;
      const x = (ax - core.position.x) / core.scale.x, y = (ay - core.position.y) / core.scale.y, z = (az - core.position.z) / core.scale.z;
      const dx = (bx - ax) / core.scale.x, dy = (by - ay) / core.scale.y, dz = (bz - az) / core.scale.z;
      let count = 1; stack[0] = treeOf();
      while (count) {
        const node = stack[--count];
        if (!boxHit(node.box, x, y, z, dx, dy, dz)) continue;
        if (node.left) { stack[count++] = node.left; stack[count++] = node.right; continue; }
        for (let n = node.start; n < node.end; n++) {
          const face = geometry.faces[order[n]].i;
          for (let k = 1; k < face.length - 1; k++) if (triangleHit(face[0], face[k], face[k + 1], x, y, z, dx, dy, dz)) return false;
        }
      }
      return true;
    };
    const state = { actorInPile: false, cameraInPile: false, touchesPile: false, outlined: false, guideLines: 0, coverage: 0, partial: false, inside: false };
    let activeCamera = null, sceneVisibleAt = null, ownsActor = false;
    const visibleAt = (x, y, z) => {
      const camera = activeCamera, p = camera.position, dx = x - p.x, dy = y - p.y, dz = z - p.z;
      const depth = dx * forward[0] + dy * forward[1] + dz * forward[2];
      const t = camera.near / depth;
      return t < 1 && segmentClear(p.x + dx * t, p.y + dy * t, p.z + dz * t, x, y, z) && (!sceneVisibleAt || sceneVisibleAt(x, y, z));
    };
    const prepare = (camera, actor, feet = actor ? actor.root.position.y - actor.baseY : 0, bodyHeight = actor?.bodyHeight) => {
      activeCamera = camera;
      const p = camera.position, t = camera.target, length = Math.hypot(t.x - p.x, t.y - p.y, t.z - p.z);
      forward[0] = (t.x - p.x) / length; forward[1] = (t.y - p.y) / length; forward[2] = (t.z - p.z) / length;
      const tangent = Math.tan(camera.fov / 2), aspect = overlay.clientWidth / Math.max(1, overlay.clientHeight);
      const reach = camera.near * Math.sqrt(1 + tangent * tangent * (1 + aspect * aspect));
      state.touchesPile = core.visible && Math.hypot(p.x - core.position.x, p.z - core.position.z) <= core.scale.x + reach
        && p.y + reach >= floor && p.y - reach <= core.position.y + bounds.max[1] * core.scale.y;
      if (state.touchesPile) updateLighting(camera, reach);
      state.actorInPile = false;
      if (actor && core.visible) {
        const a = actor.root.position;
        state.actorInPile = intersectsBody(a.x, feet, a.z, bodyHeight);
      }
      state.cameraInPile = contains(p.x, p.y, p.z);
      // An outside eye can still cut the fruit with a near-plane corner.
      // Confirm the cover's own sample grid before taking over the actor; heap bounds alone are not enough.
      if (!state.cameraInPile && state.touchesPile) {
        BL.math.mat4.lookAt(view, camera.position, camera.target, camera.up || UP);
        const width = overlay.clientWidth, height = overlay.clientHeight;
        const cols = Math.max(1, Math.ceil(32 * Math.min(1, width / height))), rows = Math.max(1, Math.ceil(32 * Math.min(1, height / width)));
        const size = 2 * camera.near * tangent;
        for (let y = 0; y <= rows && !state.cameraInPile; y++) for (let x = 0; x <= cols; x++) {
          const right = (x / cols - 0.5) * size * aspect, up = (0.5 - y / rows) * size;
          if (contains(p.x + forward[0] * camera.near + view[0] * right + view[1] * up,
            p.y + forward[1] * camera.near + view[4] * right + view[5] * up,
            p.z + forward[2] * camera.near + view[8] * right + view[9] * up)) { state.cameraInPile = true; break; }
        }
      }
      ownsActor = !!actor && (state.actorInPile || state.cameraInPile);
      return ownsActor;
    };
    const draw = (camera, actor, dt = 1 / 60, actorVisibleAt = null, guides = null, glyphMaterial = null) => {
      sceneVisibleAt = actorVisibleAt;
      cover.state.opacity = state.touchesPile ? 0.65 : 0.22;
      // Dark keyline keeps the pale body rim legible against yellow fruit.
      cover.draw(camera, actor?.root, state.touchesPile, !!actor && ownsActor, contains, null, guides, dt, 1, glyphMaterial, visibleAt, true);
      state.outlined = cover.state.outlined; state.coverage = cover.state.rockCoverage;
      state.guideLines = cover.state.guideLines;
      state.glyphInterior = cover.state.glyphInterior;
      state.glyphBlendMin = cover.state.glyphBlendMin; state.glyphBlendMax = cover.state.glyphBlendMax;
      state.partial = cover.state.partialRock; state.inside = cover.state.insideRock;
    };
    const dispose = () => { cover.dispose(); stack.fill(null); activeCamera = sceneVisibleAt = null; };
    return { prepare, draw, dispose, contains, heightAt, intersectsBody, segmentClear, state };
  };
  BL.bananaCover = { create };
})();
