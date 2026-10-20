(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { models } = BL;
  const { mat4, lerp, damp, ease, mulberry32 } = BL.math;
  const { createNode, addChild, removeChild, addTween } = BL.scene;
  const DROP_HEIGHT = 4.3;
  const BANANA_DROP_HEIGHT = (BL.terrain.MAX_HEIGHT + BL.hubModels.TREE_HEIGHT) * 2;
  const BANANA_SCALE = models.BANANA_AMMO_SCALE;
  const DISK_BANANAS = 302;
  const MAX_BANANAS = 10000000;
  const BASE_HEIGHT = 0.48;
  // PACKING_HEIGHT 1.2 plus the fuller profile stands for air between loosely settled fruit, without widening
  // the pile into the bounded outer meadow at very large levels.
  const PACKING_HEIGHT = 1.2;
  const SHELL_EDGE = 0.28;
  const CORE_FACE_SIZE = 0.16;
  const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
  // Established layered-shell spacing and orientation for the large pile; keep these values.
  const BANANA_LENGTH_SPACE = 0.3;
  const BANANA_ROW_SPACE = 0.1;
  const BANANA_YAW_SPREAD = 0.5;
  const BANANA_UNDERLAYER_SINK = 0.03;
  const BANANA_SURFACE_CLEARANCE = 0.008;
  const PLATFORM_CLEARANCE = 0.004;
  const SURFACE_OUTER_RADIUS = 1;
  const DROP_POOL_SIZE = 96;
  const DROP_RATE = 72;
  const DROP_DURATION_MIN = 1.05;
  const DROP_DURATION_RANGE = 0.3;
  const DROP_DURATION_MAX = DROP_DURATION_MIN + DROP_DURATION_RANGE;
  const SPILL_POOL_SIZE = 32, SPILL_BURST = 8, SPILL_GRAVITY = 7, SPILL_FADE_TIME = 0.22;
  const BACKLOG_SECONDS = 10;
  const FRAME_TIME_MAX = 0.1;
  const DROP_THROUGHPUT = Math.min(DROP_RATE, DROP_POOL_SIZE / DROP_DURATION_MAX);
  const BACKLOG_VISUAL_CAPACITY = Math.max(1, Math.floor((BACKLOG_SECONDS - DROP_DURATION_MAX - FRAME_TIME_MAX) * DROP_THROUGHPUT));
  const MAX_WEBGL_TILES = 65536;
  const MAX_CANVAS_TILES = 512;
  const DISTANT_SHELL_MIN_TILES = 1000, SHELL_DETAIL_NEAR = 8, SHELL_DETAIL_FAR = 10;
  const footprintFor = (count, scale = 0.45) => scale * (count > DISK_BANANAS ? Math.cbrt(count / DISK_BANANAS) : 1);
  const visualFootprintFor = (count, scale = 0.45) => {
    const mix = Math.min(1, Math.max(0, (count - DISK_BANANAS) / DISK_BANANAS));
    return footprintFor(count, scale) + BANANA_SCALE * SHELL_EDGE * mix;
  };
  const heightGrowthFor = (count) => footprintFor(count, 1) * PACKING_HEIGHT;
  // The mound core never changes shape, only its node scale: one geometry per page per size.
  const coreGeometries = new Map();
  const setVec = (v, x, y, z) => {
    v.x = x;
    v.y = y;
    v.z = z;
    return v;
  };
  const domeSurface = (radius, out) => {
    const profile = models.BANANA_PILE_PROFILE;
    for (let i = 0; i < profile.length - 1; i++) {
      const outer = profile[i], inner = profile[i + 1];
      if (radius < inner[0]) continue;
      const span = outer[0] - inner[0];
      const t = (outer[0] - radius) / span;
      out.y = lerp(outer[1], inner[1], t);
      out.slope = (outer[1] - inner[1]) / span;
      return out;
    }
    out.y = profile[profile.length - 1][1];
    out.slope = 0;
    return out;
  };
  const create = (ctx) => {
    const { root, world, pileScale: SCALE = 0.45, pileY: BASE_Y = 0.02 } = ctx;
    const source = ctx.deliverySource || null;
    const durationMin = source ? 4.2 : DROP_DURATION_MIN;
    const durationMax = durationMin + DROP_DURATION_RANGE;
    const throughput = Math.min(DROP_RATE, DROP_POOL_SIZE / durationMax);
    const matrixLiving = !!ctx.matrixLivingPile;
    const pileSlots = [];
    const coreFaceSize = ctx.renderer.kind === "canvas2d" ? CORE_FACE_SIZE * 1.75 : CORE_FACE_SIZE;
    // The supporting dome stays an ordinary Matrix receiver so code runs down between the bright bananas instead
    // of turning the entire pile into a glow.
    const coreKey = `${SCALE}/${coreFaceSize}`;
    let coreGeometry = coreGeometries.get(coreKey);
    if (!coreGeometry) coreGeometries.set(coreKey, coreGeometry = models.bananaPileCoreGeometry(SCALE * 6, BASE_HEIGHT * 6, coreFaceSize));
    const core = createNode({ geometry: coreGeometry, visible: false });
    const bananaGeometry = models.bananaGeometry();
    const shellGeometry = models.bananaTileGeometry();
    const distantShellGeometry = models.bananaTileGeometry(true);
    let shellMinZ = Infinity, shellReach = 0;
    for (let i = 0; i < shellGeometry.verts.length; i += 3) {
      shellMinZ = Math.min(shellMinZ, shellGeometry.verts[i + 2]);
      shellReach = Math.max(shellReach, Math.hypot(shellGeometry.verts[i], shellGeometry.verts[i + 1], shellGeometry.verts[i + 2]));
    }
    shellReach *= BANANA_SCALE;
    const bananaSurfaceLift = -shellMinZ * BANANA_SCALE + BANANA_SURFACE_CLEARANCE;
    const shell = createNode({
      geometry: shellGeometry,
      instanceData: new Float32Array(20),
      instanceCount: 0,
      instanceVersion: 0,
      visible: false,
      matrixLiving
    });
    const maxTiles = ctx.renderer.kind === "canvas2d" ? MAX_CANVAS_TILES : MAX_WEBGL_TILES;
    const surfaceSample = { y: 0, slope: 0 };
    const instanceMatrix = mat4.create();
    const restingMatrix = mat4.create();
    const restingScale = { x: BANANA_SCALE, y: BANANA_SCALE, z: BANANA_SCALE };
    const tilePosition = { x: 0, y: 0, z: 0 };
    const keepAbovePlatform = (position, rotation, scale, geometry) => {
      setVec(restingScale, scale, scale, scale);
      mat4.fromTRS(restingMatrix, position, rotation, restingScale);
      let minY = Infinity;
      for (let i = 0; i < geometry.verts.length; i += 3) {
        minY = Math.min(minY, restingMatrix[1] * geometry.verts[i] + restingMatrix[5] * geometry.verts[i + 1] + restingMatrix[9] * geometry.verts[i + 2] + restingMatrix[13]);
      }
      position.y += Math.max(0, BASE_Y + PLATFORM_CLEARANCE - minY);
    };
    const keepInstanceAbovePlatform = (matrix) => {
      if (matrix[13] - BASE_Y - PLATFORM_CLEARANCE >= shellReach) return;
      let minY = Infinity;
      for (let i = 0; i < shellGeometry.verts.length; i += 3) {
        minY = Math.min(minY, matrix[1] * shellGeometry.verts[i] + matrix[5] * shellGeometry.verts[i + 1] + matrix[9] * shellGeometry.verts[i + 2] + matrix[13]);
      }
      matrix[13] += Math.max(0, BASE_Y + PLATFORM_CLEARANCE - minY);
    };
    addChild(root, core, shell);
    {
      const surfaceRand = mulberry32(0x51face);
      const bases = [];
      for (let i = 0; i < DISK_BANANAS; i++) {
        const base = {
          pos: { x: 0, y: BASE_Y, z: 0 },
          rot: { x: -Math.PI * 0.5, y: 0, z: 0 }
        };
        bases.push(base);
      }
      for (let i = 0; i < bases.length; i++) {
        const base = bases[i];
        // The same bounded pool (DISK_BANANAS = 302) becomes deterministic shell reference points at 303.
        const surfaceRadius = Math.sqrt((i + 0.5) / DISK_BANANAS) * 0.985;
        const surfaceAngle = i * GOLDEN_ANGLE + (surfaceRand() - 0.5) * 0.08;
        const profile = domeSurface(surfaceRadius, surfaceSample);
        const radialNormal = -profile.slope * BASE_HEIGHT * PACKING_HEIGHT / SCALE;
        const normalLength = Math.hypot(radialNormal, 1);
        const nx = Math.cos(surfaceAngle) * radialNormal / normalLength;
        const ny = 1 / normalLength;
        const nz = Math.sin(surfaceAngle) * radialNormal / normalLength;
        const surface = {
          x: Math.cos(surfaceAngle) * surfaceRadius,
          y: profile.y,
          z: Math.sin(surfaceAngle) * surfaceRadius,
          nx, ny, nz,
          rot: { x: -Math.asin(ny), y: Math.atan2(nx, nz), z: surfaceRand() * Math.PI * 2 }
        };
        const node = models.banana();
        setVec(node.scale, BANANA_SCALE, BANANA_SCALE, BANANA_SCALE);
        Object.assign(node.position, base.pos);
        Object.assign(node.rotation, base.rot);
        node.visible = false;
        const slot = {
          node,
          base: { pos: { ...base.pos }, rot: { ...base.rot } },
          small: base,
          surface,
          restScale: BANANA_SCALE,
          token: 0,
          note: null,
          moving: false
        };
        pileSlots.push(slot);
        addChild(root, node);
      }
    }
    const dropSlots = [];
    for (let i = 0; i < DROP_POOL_SIZE; i++) {
      const node = models.banana();
      setVec(node.scale, BANANA_SCALE, BANANA_SCALE, BANANA_SCALE);
      node.matrixLiving = matrixLiving;
      node.visible = false;
      dropSlots.push({
        node,
        landing: { pos: { x: 0, y: BASE_Y, z: 0 }, rot: { x: 0, y: 0, z: 0 } },
        token: 0,
        note: null,
        moving: false,
        bananaValue: 0,
        restScale: BANANA_SCALE,
        tween: null
      });
      addChild(root, node);
    }
    // Cosmetic fruit shares the banana mesh but never the delivery pool, collision registry or outline queries;
    // the batch needs its own geometry identity (the renderer groups by geometry); only mesh arrays are shared.
    const spillNode = createNode({ geometry: { ...bananaGeometry }, instanceData: new Float32Array(SPILL_POOL_SIZE * 20), instanceCount: 0, instanceVersion: 0, fixedInstanceCapacity: true, matrixLiving, sightHidden: true, visible: false });
    const spillSlots = [];
    for (let i = 0; i < SPILL_POOL_SIZE; i++) spillSlots.push({ age: 0, life: 0, position: { x: 0, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, spin: { x: 0, y: 0, z: 0 } });
    const spillState = { capacity: SPILL_POOL_SIZE, active: 0, bursts: 0, emitted: 0 };
    const spillEffect = { node: spillNode, state: spillState };
    const spillScale = { x: BANANA_SCALE, y: BANANA_SCALE, z: BANANA_SCALE }, spillMatrix = mat4.create();
    addChild(root, spillNode);
    const writeSpills = () => {
      let count = 0;
      for (let i = 0; i < spillSlots.length; i++) {
        const slot = spillSlots[i];
        if (!slot.life) continue;
        const size = BANANA_SCALE * Math.min(1, (slot.life - slot.age) / SPILL_FADE_TIME);
        setVec(spillScale, size, size, size);
        mat4.fromTRS(spillMatrix, slot.position, slot.rotation, spillScale);
        const at = count++ * 20, data = spillNode.instanceData;
        data.set(spillMatrix, at);
        data[at + 16] = 1; data[at + 17] = 0; data[at + 18] = matrixLiving ? 2 : 0; data[at + 19] = 0;
      }
      spillState.active = spillNode.instanceCount = count;
      spillNode.visible = count > 0;
      spillNode.instanceVersion++;
    };
    const spill = (x, y, z, vx, vy, vz, height = 0.3) => {
      // Cap inherited speed so a very fast flight does not scatter fruit far beyond the character.
      const speed = Math.hypot(vx, vy, vz), inherit = speed > 8 ? 4 / speed : 0.5;
      const horizontal = Math.hypot(vx, vz), dx = horizontal > 0.001 ? vx / horizontal : 1, dz = horizontal > 0.001 ? vz / horizontal : 0;
      let emitted = 0;
      for (let i = 0; i < spillSlots.length && emitted < SPILL_BURST; i++) {
        const slot = spillSlots[i];
        if (slot.life) continue;
        const side = (Math.random() - 0.5) * 0.7, ahead = Math.random() * 0.18;
        // Stratify the burst so even a small emission includes fruit near the feet, torso and head where they meet
        // the mound.
        const lift = height * (emitted % 3 + Math.random() * 0.25) / 2.25;
        setVec(slot.position, x + dx * ahead - dz * side, y + lift, z + dz * ahead + dx * side);
        setVec(slot.velocity, vx * inherit - dz * side * 2 + dx * 0.4, vy * inherit + 1.4 + Math.random() * 0.7, vz * inherit + dx * side * 2 + dz * 0.4);
        setVec(slot.rotation, Math.random() * Math.PI * 2, Math.random() * Math.PI * 2, Math.random() * Math.PI * 2);
        setVec(slot.spin, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12);
        slot.age = 0; slot.life = 0.85 + Math.random() * 0.3;
        emitted++;
      }
      if (emitted) { spillState.bursts++; spillState.emitted += emitted; writeSpills(); }
      return emitted;
    };
    const updateSpills = (dt) => {
      if (!spillState.active) return;
      for (let i = 0; i < spillSlots.length; i++) {
        const slot = spillSlots[i];
        if (!slot.life) continue;
        slot.age += dt;
        if (slot.age >= slot.life) { slot.life = 0; continue; }
        const p = slot.position, v = slot.velocity, r = slot.rotation, spin = slot.spin;
        const x = p.x, y = p.y, z = p.z;
        p.x += v.x * dt; p.y += v.y * dt - SPILL_GRAVITY * dt * dt * 0.5; p.z += v.z * dt;
        v.y -= SPILL_GRAVITY * dt;
        r.x += spin.x * dt; r.y += spin.y * dt; r.z += spin.z * dt;
        // Settle onto the pile platform before shrinking, rather than leaving a second pile of physical fruit or
        // falling through it.
        if (p.y < BASE_Y + 0.04) { p.y = BASE_Y + 0.04; setVec(v, 0, 0, 0); slot.age = Math.max(slot.age, slot.life - SPILL_FADE_TIME); }
        if (ctx.onProjectileMove) ctx.onProjectileMove(x, y, z, p.x, p.y, p.z, dt);
      }
      writeSpills();
    };
    let shown = 0, counted = 0;
    let footprint = SCALE, layoutCount = -1, shellWanted = 0;
    const delivery = world.delivery || (world.delivery = {
      pendingValue: 0,
      pendingTokens: 0,
      airborneValue: 0,
      airborneCount: 0,
      activeTime: 0,
      drainDeadline: 0,
      totalAcceptedValue: 0,
      totalLandedValue: 0,
      visualDropsStarted: 0,
      visualDropsLanded: 0,
      visualDropsCanceled: 0,
      replanCount: 0,
      launchCredit: 0,
      maxConcurrentDrops: 0,
      lastDrainSeconds: 0
    });
    let hatchOpen = 0, hatchTarget = 0;
    const pileEdge = () => footprint;
    const restSlot = (slot) => {
      Object.assign(slot.node.position, slot.base.pos);
      Object.assign(slot.node.rotation, slot.base.rot);
      setVec(slot.node.scale, slot.restScale, slot.restScale, slot.restScale);
    };
    // Writes one flat banana on the mound at (angle, normalizedRadius), yawed about the normal; seed is stable
    // across relays so a banana keeps its look while the mound grows under it.
    const writeTile = (data, instance, seed, angle, normalizedRadius, yaw, sink, growth, coreFootprint, radialScale, edgeBand) => {
      const profile = domeSurface(normalizedRadius, surfaceSample);
      const radialNormal = -profile.slope * radialScale;
      const normalLength = Math.hypot(radialNormal, 1);
      const ny = 1 / normalLength;
      const cos = Math.cos(angle), sin = Math.sin(angle);
      const nx = cos * radialNormal / normalLength;
      const nz = sin * radialNormal / normalLength;
      const yx = ny * cos, yy = -radialNormal / normalLength, yz = ny * sin;
      const radialJitter = edgeBand ? 0 : Math.sin(seed * 4.229) * 0.008;
      const lift = bananaSurfaceLift - sink + (edgeBand ? 0 : Math.sin(seed * 5.731) * 0.004);
      const warpedRadius = normalizedRadius * (edgeBand ? 1 : models.bananaPileRadiusScale(angle, normalizedRadius));
      const warpedY = profile.y + models.bananaPileHeightOffset(angle, normalizedRadius);
      setVec(tilePosition,
        cos * warpedRadius * coreFootprint + nx * lift + yx * radialJitter,
        BASE_Y + warpedY * BASE_HEIGHT * growth + ny * lift + yy * radialJitter,
        sin * warpedRadius * coreFootprint + nz * lift + yz * radialJitter);
      const tx = -sin, tz = cos;
      const ct = Math.cos(yaw), st = Math.sin(yaw);
      const xx = tx * ct + yx * st, xy = yy * st, xz = tz * ct + yz * st;
      const bx = -tx * st + yx * ct, by = yy * ct, bz = -tz * st + yz * ct;
      const flip = Math.sin(seed * 3.731) < 0 ? -BANANA_SCALE : BANANA_SCALE;
      instanceMatrix[0] = xx * flip;
      instanceMatrix[1] = xy * flip;
      instanceMatrix[2] = xz * flip;
      instanceMatrix[3] = 0;
      instanceMatrix[4] = bx * flip;
      instanceMatrix[5] = by * flip;
      instanceMatrix[6] = bz * flip;
      instanceMatrix[7] = 0;
      instanceMatrix[8] = nx * BANANA_SCALE;
      instanceMatrix[9] = ny * BANANA_SCALE;
      instanceMatrix[10] = nz * BANANA_SCALE;
      instanceMatrix[11] = 0;
      instanceMatrix[12] = tilePosition.x;
      instanceMatrix[13] = tilePosition.y;
      instanceMatrix[14] = tilePosition.z;
      instanceMatrix[15] = 1;
      keepInstanceAbovePlatform(instanceMatrix);
      const offset = instance * 20;
      data.set(instanceMatrix, offset);
      data[offset + 16] = 1;
      data[offset + 17] = 0;
      data[offset + 18] = matrixLiving ? 2 : 0;
      data[offset + 19] = 0;
    };
    // Preserve the layered shell: bands run rim to apex, a slightly sunken second layer fills gaps while keeping
    // visible 3D depth.
    const rebuildSurface = (target, growth, coreFootprint) => {
      const building = target <= DISK_BANANAS;
      if (!target) {
        shell.visible = false;
        shell.instanceCount = 0;
        shellWanted = 0;
        return;
      }
      const radialScale = BASE_HEIGHT * growth / coreFootprint;
      const rowStep = (normalizedRadius, spacing) => BANANA_ROW_SPACE * spacing / (coreFootprint * Math.hypot(1, domeSurface(normalizedRadius, surfaceSample).slope * radialScale));
      const bandCountAt = (normalizedRadius, spacing) => Math.max(1, Math.floor(Math.PI * 2 * normalizedRadius * coreFootprint / (BANANA_LENGTH_SPACE * spacing)));
      const stepAt = (normalizedRadius, spacing) => Math.min(Math.PI * 2, BANANA_LENGTH_SPACE * spacing / (normalizedRadius * coreFootprint));
      const extraAt = (normalizedRadius, spacing) => Math.PI * 2 - bandCountAt(normalizedRadius, spacing) * stepAt(normalizedRadius, spacing) > stepAt(normalizedRadius, spacing) * 0.5 ? 1 : 0;
      let spacing = 1, fullWanted;
      for (;;) {
        // The platform-contact ring never inherits adaptive shell thinning; its full circumference seals the core's
        // foot.
        fullWanted = bandCountAt(SURFACE_OUTER_RADIUS, 1);
        for (let normalizedRadius = SURFACE_OUTER_RADIUS - rowStep(SURFACE_OUTER_RADIUS, spacing); normalizedRadius > 0; normalizedRadius -= rowStep(normalizedRadius, spacing)) fullWanted += bandCountAt(normalizedRadius, spacing) * 2 + extraAt(normalizedRadius, spacing);
        if (fullWanted <= maxTiles) break;
        spacing *= Math.sqrt(fullWanted / maxTiles) * 1.02;
      }
      const wanted = building ? Math.min(target, fullWanted) : fullWanted;
      if (!building && wanted === shellWanted) return;
      shellWanted = wanted;
      const need = wanted * 20;
      if (shell.instanceData.length < need) {
        let capacity = shell.instanceData.length;
        while (capacity < need) capacity *= 2;
        shell.instanceData = new Float32Array(Math.min(maxTiles * 20, capacity));
      }
      const data = shell.instanceData;
      let instance = 0, candidate = 0, band = 0;
      const all = wanted === fullWanted;
      // Start at the true foot of the profile: an inset imperceptible on a small pile scales into an exposed skirt
      // at million-banana sizes.
      for (let normalizedRadius = SURFACE_OUTER_RADIUS; normalizedRadius > 0; normalizedRadius -= rowStep(normalizedRadius, spacing), band++) {
        const edgeBand = band === 0;
        const bandSpacing = edgeBand ? 1 : spacing;
        const bandCount = bandCountAt(normalizedRadius, bandSpacing);
        const phase = (band * GOLDEN_ANGLE) % (Math.PI * 2);
        // Close the contact ring with equal angular spacing; carrying the ordinary row remainder into its final gap
        // can expose the backing at large radii.
        const step = edgeBand ? Math.PI * 2 / bandCount : stepAt(normalizedRadius, bandSpacing);
        const last = bandCount - 1 + (edgeBand ? 0 : extraAt(normalizedRadius, bandSpacing));
        const underRadius = Math.max(0, normalizedRadius - rowStep(normalizedRadius, bandSpacing) * 0.5);
        for (let j = 0; j <= last; j++) {
          const seed = band * 7919 + j + 1;
          const jitter = Math.sin(seed * 12.9898) * 0.015 / Math.max(0.05, normalizedRadius * coreFootprint);
          const angle = phase + j * step + jitter;
          if (j < bandCount) {
            if (instance < wanted && (all || candidate === Math.floor((instance + 0.5) * fullWanted / wanted))) writeTile(data, instance++, seed, angle, normalizedRadius, Math.sin(seed * 7.133) * (edgeBand ? 0.18 : BANANA_YAW_SPREAD), 0, growth, coreFootprint, radialScale, edgeBand);
            candidate++;
          }
          if (!edgeBand) {
            if (instance < wanted && (all || candidate === Math.floor((instance + 0.5) * fullWanted / wanted))) writeTile(data, instance++, -seed, angle + step * 0.5, underRadius, Math.sin(seed * 9.271) * BANANA_YAW_SPREAD, BANANA_UNDERLAYER_SINK, growth, coreFootprint, radialScale, false);
            candidate++;
          }
        }
      }
      shell.instanceCount = instance;
      shell.instanceVersion++;
      shell.visible = true;
    };
    const reflow = (target) => {
      if (target === layoutCount) return;
      layoutCount = target;
      const growth = target <= DISK_BANANAS ? PACKING_HEIGHT * target / DISK_BANANAS : heightGrowthFor(target);
      const coreFootprint = footprintFor(target, SCALE);
      footprint = visualFootprintFor(target, SCALE);
      core.visible = target > 0;
      core.position.y = BASE_Y;
      setVec(core.scale, coreFootprint, BASE_HEIGHT * growth, coreFootprint);
      rebuildSurface(target, growth, coreFootprint);
      if (ctx.onLayout) ctx.onLayout(footprint, target);
      // Every level re-spreads the bases: they are the pile's measured shape, not just chooseLanding's input, so
      // they cannot be skipped above 302.
      for (let i = 0; i < pileSlots.length; i++) {
        const slot = pileSlots[i], surface = slot.surface;
        const lift = BANANA_SCALE * 0.07;
        slot.restScale = BANANA_SCALE;
        setVec(slot.base.pos,
          surface.x * coreFootprint + surface.nx * lift,
          BASE_Y + surface.y * BASE_HEIGHT * growth + surface.ny * lift,
          surface.z * coreFootprint + surface.nz * lift);
        Object.assign(slot.base.rot, surface.rot);
        keepAbovePlatform(slot.base.pos, slot.base.rot, slot.restScale, bananaGeometry);
        if (slot.node.visible && !slot.moving) restSlot(slot);
      }
    };
    const chooseLanding = (slot) => {
      const landing = slot.landing;
      if (counted <= DISK_BANANAS) {
        const base = pileSlots[Math.floor(Math.random() * Math.max(1, counted))].base;
        Object.assign(landing.pos, base.pos);
        Object.assign(landing.rot, base.rot);
        return landing;
      }
      let x, z, normalizedRadius;
      do {
        const magnitude = Math.sqrt(-2 * Math.log(Math.max(Number.EPSILON, Math.random()))) * 0.38;
        const angle = Math.random() * Math.PI * 2;
        x = Math.cos(angle) * magnitude;
        z = Math.sin(angle) * magnitude;
        normalizedRadius = magnitude;
      } while (normalizedRadius > 0.96);
      const angle = Math.atan2(z, x);
      const cos = Math.cos(angle), sin = Math.sin(angle);
      const growth = heightGrowthFor(counted);
      const coreFootprint = footprintFor(counted, SCALE);
      const profile = domeSurface(normalizedRadius, surfaceSample);
      const radialNormal = -profile.slope * BASE_HEIGHT * growth / coreFootprint;
      const normalLength = Math.hypot(radialNormal, 1);
      const nx = cos * radialNormal / normalLength;
      const ny = 1 / normalLength;
      const nz = sin * radialNormal / normalLength;
      const warpedRadius = normalizedRadius * models.bananaPileRadiusScale(angle, normalizedRadius);
      setVec(landing.pos,
        cos * warpedRadius * coreFootprint + nx * bananaSurfaceLift,
        BASE_Y + (profile.y + models.bananaPileHeightOffset(angle, normalizedRadius)) * BASE_HEIGHT * growth + ny * bananaSurfaceLift,
        sin * warpedRadius * coreFootprint + nz * bananaSurfaceLift);
      setVec(landing.rot, -Math.asin(ny), Math.atan2(nx, nz), Math.random() * Math.PI * 2);
      keepAbovePlatform(landing.pos, landing.rot, BANANA_SCALE, bananaGeometry);
      return landing;
    };
    const outstandingValue = () => delivery.pendingValue + delivery.airborneValue;
    const visualCapacityForDeadline = () => {
      const remaining = Math.max(0, delivery.drainDeadline - delivery.activeTime);
      const occupiedDelay = delivery.airborneCount ? durationMax : 0;
      const launchCapacity = Math.max(0, remaining - durationMax - FRAME_TIME_MAX - occupiedDelay) * throughput;
      return Math.max(1, Math.min(BACKLOG_VISUAL_CAPACITY, Math.floor(launchCapacity + 1e-9)));
    };
    const replanPending = () => {
      delivery.pendingTokens = Math.min(delivery.pendingValue, visualCapacityForDeadline());
      delivery.replanCount++;
    };
    const dropIn = (slot, bananaValue) => {
      const token = ++slot.token;
      const landing = chooseLanding(slot);
      const { pos, rot } = landing;
      const fromX = source ? source.x : pos.x + (Math.random() - 0.5) * 0.7;
      const fromY = source ? source.y : BANANA_DROP_HEIGHT + Math.random() * 1.2;
      const fromZ = source ? source.z : pos.z + (Math.random() - 0.5) * 0.7;
      const crest = Math.max(fromY, pos.y, BANANA_DROP_HEIGHT) + 24;
      const spinX = (Math.random() - 0.5) * 12;
      const spinY = (Math.random() - 0.5) * 10;
      const spinZ = (Math.random() - 0.5) * 12;
      slot.note = null;
      slot.moving = true;
      slot.bananaValue = bananaValue;
      if (ctx.trackMirrorObject) ctx.trackMirrorObject(slot.node, 1);
      delivery.airborneValue += bananaValue;
      delivery.airborneCount++;
      delivery.visualDropsStarted++;
      delivery.maxConcurrentDrops = Math.max(delivery.maxConcurrentDrops, delivery.airborneCount);
      slot.tween = addTween({
        dur: durationMin + Math.random() * DROP_DURATION_RANGE,
        ease: source ? ease.linear : ease.outBounce,
        update: (k) => {
          if (slot.token !== token) return;
          slot.node.visible = true;
          const scale = lerp(BANANA_SCALE, slot.restScale, k);
          setVec(slot.node.scale, scale, scale, scale);
          if (source) {
            // Vertical tangents at the roof and pile, with the horizontal travel high above the island.
            const v = 1 - k, launch = v * v * v;
            const across = k * k * (3 - 2 * k);
            setVec(slot.node.position, lerp(fromX, pos.x, across),
              fromY * launch + 3 * v * k * crest + pos.y * k * k * k,
              lerp(fromZ, pos.z, across));
          } else setVec(slot.node.position, lerp(fromX, pos.x, k), lerp(fromY, pos.y, k), lerp(fromZ, pos.z, k));
          setVec(slot.node.rotation, rot.x + (1 - k) * spinX, rot.y + (1 - k) * spinY, rot.z + (1 - k) * spinZ);
        },
        done: () => {
          if (slot.token !== token) return;
          delivery.airborneValue -= slot.bananaValue;
          delivery.airborneCount--;
          delivery.visualDropsLanded++;
          delivery.totalLandedValue += slot.bananaValue;
          slot.moving = false;
          slot.node.visible = false;
          if (ctx.untrackMirrorObject) ctx.untrackMirrorObject(slot.node);
          slot.tween = null;
          // Real deliveries are a show: the server's pile message already owns the balance.
          if (!BL.donations.real) world.level += slot.bananaValue;
          slot.bananaValue = 0;
          syncPile(true);
          if (!outstandingValue()) {
            delivery.lastDrainSeconds = delivery.activeTime - (delivery.drainDeadline - BACKLOG_SECONDS);
            delivery.drainDeadline = 0;
            delivery.pendingTokens = 0;
          }
        }
      });
    };
    const pumpDrops = (dt) => {
      if (!delivery.pendingValue) return;
      if (!delivery.pendingTokens) replanPending();
      delivery.launchCredit = Math.min(DROP_POOL_SIZE, delivery.launchCredit + dt * DROP_RATE);
      let budget = Math.floor(delivery.launchCredit), launched = 0;
      for (let i = 0; i < dropSlots.length && delivery.pendingValue && launched < budget; i++) {
        const slot = dropSlots[i];
        if (slot.moving) continue;
        const bananaValue = Math.ceil(delivery.pendingValue / delivery.pendingTokens);
        delivery.pendingValue -= bananaValue;
        delivery.pendingTokens--;
        dropIn(slot, bananaValue);
        launched++;
      }
      delivery.launchCredit -= launched;
      if (launched < budget) delivery.launchCredit = Math.min(1, delivery.launchCredit);
    };
    const cancelAirborne = (restorePending) => {
      for (let i = 0; i < dropSlots.length; i++) {
        const slot = dropSlots[i];
        if (slot.moving && restorePending) {
          delivery.pendingValue += slot.bananaValue;
          delivery.visualDropsCanceled++;
        }
        if (slot.tween) slot.tween.alive = false;
        if (slot.moving && ctx.untrackMirrorObject) ctx.untrackMirrorObject(slot.node);
        slot.token++;
        slot.moving = false;
        slot.node.visible = false;
        slot.tween = null;
        slot.bananaValue = 0;
      }
      delivery.airborneValue = 0;
      delivery.airborneCount = 0;
      if (restorePending && delivery.pendingValue) replanPending();
    };
    const clearDrops = () => {
      cancelAirborne(false);
      delivery.pendingValue = 0;
      delivery.pendingTokens = 0;
      delivery.drainDeadline = 0;
      delivery.totalAcceptedValue = 0;
      delivery.totalLandedValue = 0;
      delivery.visualDropsStarted = 0;
      delivery.visualDropsLanded = 0;
      delivery.visualDropsCanceled = 0;
      delivery.replanCount = 0;
      delivery.launchCredit = 0;
      delivery.maxConcurrentDrops = 0;
      delivery.lastDrainSeconds = 0;
    };
    const syncPile = (settle = false) => {
      if (world.level > MAX_BANANAS) world.level = MAX_BANANAS;
      const target = Math.max(0, Math.floor(world.level));
      const additions = Math.max(0, target - counted);
      reflow(target);
      const targetShown = 0;
      while (shown > targetShown) {
        shown--;
        const slot = pileSlots[shown];
        slot.node.visible = false;
        restSlot(slot);
      }
      while (shown < targetShown) {
        const slot = pileSlots[shown];
        slot.node.visible = true;
        slot.moving = false;
        restSlot(slot);
        shown++;
      }
      counted = target;
      if (additions) hatchTarget = 1;
      if (ctx.onShown) ctx.onShown(target);
      ctx.crew.updateFan();
      // A delivery (>= 2 additions) brings the crew running; one banana does not.
      if (additions >= 2) ctx.crew.rush();
    };
    const deliverBananas = (amount) => {
      // A full server-owned pile still shows incoming fruit without reserving balance for it.
      const room = MAX_BANANAS - (BL.donations.real ? 0 : Math.floor(world.level)) - outstandingValue();
      const additions = Math.max(0, Math.min(room, Math.floor(Number(amount) || 0)));
      if (!additions) return 0;
      delivery.pendingValue += additions;
      delivery.totalAcceptedValue += additions;
      delivery.drainDeadline = delivery.activeTime + BACKLOG_SECONDS;
      replanPending();
      hatchTarget = 1;
      if (additions >= 2) ctx.crew.rush();
      return additions;
    };
    // A driven caveman eats from the logical pile; its hand animation owns the banana.
    const eatFromPile = (cave) => {
      if (counted < 1) return false;
      world.level = Math.max(0, world.level - 1);
      syncPile(true);
      return true;
    };
    const updateDetail = () => {
      if (shell.instanceCount < DISTANT_SHELL_MIN_TILES) {
        shell.geometry = shellGeometry;
        return;
      }
      // Measure from the nearest possible surface, not the mound's centre, so a camera beside even the largest pile
      // keeps the original bananas; the box covers the warped dome and its shell fruit's full reach.
      const eye = ctx.camera.position, radius = core.scale.x * 1.05 + shellReach;
      const dx = Math.max(0, Math.abs(eye.x) - radius), dz = Math.max(0, Math.abs(eye.z) - radius);
      const dy = Math.max(0, BASE_Y - shellReach - eye.y, eye.y - BASE_Y - core.scale.y - shellReach);
      const distance = Math.hypot(dx, dy, dz);
      if (distance > SHELL_DETAIL_FAR) shell.geometry = distantShellGeometry;
      else if (distance < SHELL_DETAIL_NEAR) shell.geometry = shellGeometry;
    };
    const update = (dt) => {
      delivery.activeTime += dt;
      const target = Math.floor(world.level);
      if (target !== counted) syncPile();
      updateDetail();
      pumpDrops(dt);
      updateSpills(dt);
      if (!outstandingValue() && hatchTarget === 1) hatchTarget = 0;
      hatchOpen = damp(hatchOpen, hatchTarget, 7, dt);
    };
    const dispose = () => {
      cancelAirborne(true);
      for (const slot of pileSlots) {
        removeChild(root, slot.node);
      }
      for (const slot of dropSlots) removeChild(root, slot.node);
      removeChild(root, core);
      removeChild(root, shell);
      // Both detail levels cache this visit's instance matrices; end their GPU lifetime here so another scene's
      // pile cannot reuse a matching version.
      ctx.renderer.releaseGeometry(shellGeometry);
      ctx.renderer.releaseGeometry(distantShellGeometry);
      removeChild(root, spillNode);
      spillSlots.length = 0;
      spillState.active = spillNode.instanceCount = 0;
      spillNode.visible = false;
      spillNode.instanceData = new Float32Array(20);
      pileSlots.length = 0;
      dropSlots.length = 0;
      shell.instanceData = new Float32Array(20);
      shell.instanceCount = 0;
      shown = 0;
      counted = 0;
    };
    const currentWeightRange = () => {
      let min = Infinity, max = 0;
      if (delivery.pendingTokens) {
        min = Math.floor(delivery.pendingValue / delivery.pendingTokens);
        max = Math.ceil(delivery.pendingValue / delivery.pendingTokens);
      }
      for (let i = 0; i < dropSlots.length; i++) {
        const value = dropSlots[i].bananaValue;
        if (!value) continue;
        min = Math.min(min, value);
        max = Math.max(max, value);
      }
      return { min: min === Infinity ? 0 : min, max };
    };
    const deliveryDebug = {
      get logicalOutstandingValue() { return outstandingValue(); },
      get pendingLogicalValue() { return delivery.pendingValue; },
      get pendingVisualDropCount() { return delivery.pendingTokens; },
      get airborneVisualDropCount() { return delivery.airborneCount; },
      get airborneLogicalValue() { return delivery.airborneValue; },
      get minDropWeight() { return currentWeightRange().min; },
      get maxDropWeight() { return currentWeightRange().max; },
      get visualDropsStarted() { return delivery.visualDropsStarted; },
      get visualDropsLanded() { return delivery.visualDropsLanded; },
      get visualDropsCanceled() { return delivery.visualDropsCanceled; },
      get totalAcceptedValue() { return delivery.totalAcceptedValue; },
      get totalLandedValue() { return delivery.totalLandedValue; },
      get activeTime() { return delivery.activeTime; },
      get drainDeadline() { return delivery.drainDeadline; },
      get estimatedActiveTimeRemaining() { return Math.max(0, delivery.drainDeadline - delivery.activeTime); },
      get visualCapacity() { return BACKLOG_VISUAL_CAPACITY; },
      get replanCount() { return delivery.replanCount; },
      get maxConcurrentDrops() { return delivery.maxConcurrentDrops; },
      get lastDrainSeconds() { return delivery.lastDrainSeconds; },
      enqueue: deliverBananas
    };
    const stats = () => ({ slots: pileSlots.length, shown: counted, rendered: shell.instanceCount, deliveries: delivery.airborneValue, pendingDrops: delivery.pendingValue, dropsStarted: delivery.visualDropsStarted, dropsLanded: delivery.visualDropsLanded, landedBananaValue: delivery.totalLandedValue, dropPool: dropSlots.length, dropRate: DROP_RATE, spillPool: spillSlots.length, spilling: spillState.active });
    const setLevel = (level) => {
      clearDrops();
      world.level = Math.max(0, Math.min(MAX_BANANAS, Number(level) || 0));
      syncPile(true);
    };
    const liveGeometry = (set) => set.add(shellGeometry).add(distantShellGeometry);
    // Crew slots are assigned immediately after construction: publish the loaded pile's real footprint before the
    // crew exists or starts walking.
    reflow(Math.max(0, Math.min(MAX_BANANAS, Math.floor(world.level))));
    return {
      slots: pileSlots, drops: dropSlots, core, shell, syncPile, deliverBananas, pileEdge, eatFromPile, update, dispose, stats, setLevel, liveGeometry, delivery: deliveryDebug, spill, spillEffect,
      get shown() {
        return counted;
      },
      get rendered() {
        return shell.instanceCount;
      },
      get footprintEdge() {
        return footprint;
      },
      get hatchOpen() {
        return hatchOpen;
      },
      get inMotion() {
        return outstandingValue() > 0 || spillState.active > 0;
      }
    };
  };
  BL.pile = { create, DROP_HEIGHT, BANANA_DROP_HEIGHT, DROP_POOL_SIZE, DROP_RATE, DROP_DURATION_MAX, BACKLOG_SECONDS, BACKLOG_VISUAL_CAPACITY, MAX_BANANAS, DISK_BANANAS, PACKING_HEIGHT, footprintFor, visualFootprintFor, MAX_WEBGL_TILES, MAX_CANVAS_TILES };
})();
