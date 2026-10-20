(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { clamp, damp, mat4 } = BL.math;
  const SHOULDER_DISTANCE = 3.8, SHOULDER_SIDE = 1.05, POUND_CHARGE_TIME = 1;
  const THROW_CHARGE_TIME = 1, THROW_MIN_POWER = 1 / 3, THROW_RESULT_TIME = 0.35;
  const PITCH_LIMIT = Math.PI / 2 - 0.0001, ZOOM_PAUSE = 220;
  const create = ({ canvas, camera, renderer, pilot, hud, clankers, input = null, constrainCamera = null,
    reticleTarget = null, sightClear = null, aimCeiling = null, groundAt = null, grabOoga = null, releaseOoga = null, mayPossess = null, birdsEyeMin = 5, maxDistance = 32 }) => {
    const orbit = pilot.orbit, cameraHandoff = pilot.cameraHandoff, target = { x: 0, y: 0, z: 0 };
    const smashMin = clankers.smashPower(0, true), smashBase = clankers.smashPower(0, false);
    const smashMax = clankers.smashPower(1, false), smashRate = (smashMax - smashBase) / POUND_CHARGE_TIME;
    const command = { x: 0, z: 0, climbAxis: 0, climbSide: 0, heading: NaN, jumpHeld: false, jumpPressed: false, run: false };
    const followOffset = { x: 0, y: 0, z: 0 }, overheadOffset = { x: 0, y: 0, z: 0 };
    const controlState = { active: false, combat: false, view: "orbit", yaw: 0, pitch: 0, distance: 0, height: 0,
      eyeX: 0, eyeY: 0, eyeZ: 0, fov: 0, side: 1, focused: false };
    const acquiredAt = { x: 0, y: 0, z: 0 };
    const acquiredEye = { x: 0, y: 0, z: 0 };
    const previousEye = { x: 0, y: 0, z: 0 };
    const shoulderPoint = { x: 0, y: 0, z: 0 };
    const carryTarget = { kind: "facing", x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: 0 };
    const eye = new Float64Array(3), rayView = mat4.create(), cameraUp = { x: 0, y: 1, z: 0 };
    const ray = { ox: 0, oy: 0, oz: 0, dx: 0, dy: 0, dz: 0 };
    const hit = { node: null, owner: null, x: 0, y: 0, z: 0, distance: 0, type: "object" };
    const reticle = document.getElementById("weapon-reticle");
    let savedNear = camera.near;
    const listeners = [];
    let player = null, view = "orbit", combat = false, disposed = false, jumpKey = false, jumpTap = false, run = false;
    let actPointer = -1, smashPointer = -1, smashFromButton = false, smashCharge = 0, smashCombo = false, smashMeter = smashBase, shownPower = -1, mouseButtons = 0, blockedButtons = 0, shoulder = 0;
    let grabHeld = false, grabActive = false, grabSpent = false;
    let throwPointer = -1, throwFromButton = false, throwCharge = 0, throwMeter = THROW_MIN_POWER, throwResult = 0, shownThrow = false;
    let focused = false, lockPending = false, wasLocked = false, unlockedAt = -Infinity, focusVersion = 0;
    let actMode = -1;
    let handoffBefore = false, holdingFollow = false, pinnedFollow = false, viewChanged = false, moving = false;
    let acquisitionHold = false;
    let shoulderPointActive = false, carryShoulderAim = false;
    let shoulderSide = SHOULDER_SIDE, peek = 0, orbitPitch = 0.42, overheadHeight = 14, headHidden = null, savedHeadHidden = false;
    let overheadEntry = false;
    let targetWait = 0, rightAt = -Infinity, rightDownAt = -Infinity, rightTravel = 0;
    let carryRight = false, rightPointer = -1, rightX = 0, rightY = 0, rightLastX = 0, rightLastY = 0;
    let combatTooltipEntry = null, combatTooltipText = "";
    let zoomAt = -Infinity, zoomDirection = 0, zoomStopped = false, zoomGesture = null;
    const clearRight = () => { rightAt = rightDownAt = -Infinity; rightTravel = 0; carryRight = false; rightPointer = -1; };
    // Keep the selected mode as intent while asleep; it becomes usable on wake.
    const isCombat = () => !!player && combat && !clankers.sleeping(player);
    const restoreHead = () => {
      if (headHidden) headHidden.cameraHidden = savedHeadHidden;
      headHidden = null;
    };
    const setCombatTooltip = (entry) => {
      if (entry !== combatTooltipEntry) combatTooltipText = entry ? `🦍 ${entry.owner.traits.display}` : "";
      else if (!entry || !hud.el.tooltip.hidden && hud.el.tooltipText.textContent === combatTooltipText) return;
      combatTooltipEntry = entry;
      if (entry) hud.tooltip.show(combatTooltipText, 0, 0, entry, true);
      else hud.tooltip.hide();
    };
    const resetReticle = () => {
      setCombatTooltip(null);
      reticle.hidden = true;
      reticle.dataset.target = reticle.dataset.hit = "none";
      reticle.dataset.ads = reticle.dataset.sight = reticle.dataset.close = reticle.dataset.occluded = "false";
      reticle.style.removeProperty("left"); reticle.style.removeProperty("top"); reticle.style.removeProperty("--reticle-hit");
      reticle.style.setProperty("--reticle-radius", "14px");
      targetWait = 0;
    };
    const syncCursor = () => {
      document.body.classList.toggle("aim-cursor-focused", focused && isCombat());
      reticle.hidden = !player || !(isCombat() || grabHeld);
    };
    const setView = (next, zoomDistance = null) => {
      if (next === view) return;
      clearRight();
      shoulderPointActive = carryShoulderAim = false;
      if (view !== "birds-eye") orbitPitch = orbit.tPitch;
      view = next; viewChanged = true;
      overheadEntry = false;
      if (view === "first-person") orbit.tDist = 0;
      else if (view === "shoulder") { orbit.tDist = SHOULDER_DISTANCE; orbit.tPitch = orbitPitch; }
      else if (view === "birds-eye") {
        // Wheel travel begins at the shoulder's radius. X and a double
        // right-click retain their authored overhead framing.
        overheadEntry = zoomDistance !== null;
        overheadHeight = clamp(overheadEntry ? zoomDistance : Math.max(birdsEyeMin, orbit.dist),
          overheadEntry ? SHOULDER_DISTANCE : birdsEyeMin, maxDistance);
        orbit.tDist = overheadHeight; orbit.tPitch = PITCH_LIMIT;
        pinnedFollow = false;
        if (overheadEntry) {
          updateTarget();
          overheadOffset.x = orbit.tx - target.x; overheadOffset.y = orbit.ty - target.y; overheadOffset.z = orbit.tz - target.z;
        }
      } else { orbit.tDist = zoomDistance === null ? Math.max(SHOULDER_DISTANCE, orbit.dist) : zoomDistance; orbit.tPitch = orbitPitch; }
      camera.near = view === "first-person" ? 0.05 : savedNear;
      syncCursor(); hud.setGorilla(player, view, isCombat());
    };
    const viewRay = () => {
      const size = renderer.size;
      mat4.lookAt(rayView, camera.position, camera.target, camera.up || cameraUp);
      mat4.rayFromView(ray, rayView, size.width, size.height, camera.fov, camera.position,
        size.width * 0.5, size.height * 0.5, camera.orthoMix, camera.orthoHeight);
      if (view === "birds-eye" && aimCeiling && ray.dy < -1e-5) {
        const skip = Math.max(0, (aimCeiling(player) - ray.oy) / ray.dy);
        ray.ox += ray.dx * skip; ray.oy += ray.dy * skip; ray.oz += ray.dz * skip;
      }
    };
    const acceptTarget = (owner) => owner.entry !== player;
    const updateReticle = (dt) => {
      if (!isCombat() && !grabHeld) { reticle.hidden = true; setCombatTooltip(null); return; }
      reticle.hidden = false;
      targetWait -= dt;
      if (targetWait > 0) return;
      targetWait = 0.05;
      viewRay();
      let type = "none";
      let tooltipEntry = null;
      if (input && input.weaponTargets.ray(hit, ray.ox, ray.oy, ray.oz, ray.dx, ray.dy, ray.dz, 60, null, acceptTarget, true)) {
        const near = Math.max(0, hit.distance - 0.035);
        if (!sightClear || sightClear(ray.ox, ray.oy, ray.oz, ray.ox + ray.dx * near, ray.oy + ray.dy * near, ray.oz + ray.dz * near, hit.node, true)) {
          const kind = hit.owner.kind;
          type = kind === "clanker" || kind === "agent" ? "friendly" : kind === "caveman" ? hit.type
            : kind === "crate" ? "object" : reticleTarget ? reticleTarget(hit) : "none";
          if (isCombat() && kind === "clanker") tooltipEntry = hit.owner.entry;
        }
      }
      setCombatTooltip(tooltipEntry);
      if (reticle.dataset.target !== type) reticle.dataset.target = type;
    };
    const climbHandoff = () => {
      const c = player.climb;
      return c.active && !c.free && (c.handoffDirection || c.autoTo >= 0 || c.progress <= c.lowerGroundDistance + 0.001
        || c.progress >= c.mantleStart - 0.001);
    };
    // Anchor transitions to the displayed view, including an already shortened
    // collision boom. Automatic body motion must not re-orbit the camera.
    const holdCamera = (preserveInput) => {
      const a = camera.target, b = camera.position;
      const yawDelta = preserveInput ? orbit.tYaw - orbit.yaw : 0;
      const pitchDelta = preserveInput ? orbit.tPitch - orbit.pitch : 0;
      const distanceDelta = preserveInput ? orbit.tDist - orbit.dist : 0;
      const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
      orbit.yaw = Math.atan2(dx, dz); orbit.tYaw = orbit.yaw + yawDelta;
      orbit.pitch = Math.atan2(dy, Math.hypot(dx, dz)); orbit.tPitch = orbit.pitch + pitchDelta;
      if (view === "first-person") {
        orbit.tx = b.x; orbit.ty = b.y; orbit.tz = b.z;
        orbit.dist = orbit.tDist = 0; shoulder = 0;
        return;
      }
      orbit.dist = Math.max(0.01, Math.hypot(dx, dy, dz)); orbit.tDist = Math.max(0.01, orbit.dist + distanceDelta);
      orbit.tx = a.x - Math.cos(orbit.yaw) * shoulder; orbit.ty = a.y;
      orbit.tz = a.z + Math.sin(orbit.yaw) * shoulder;
    };
    const on = (node, type, callback, options) => {
      node.addEventListener(type, callback, options);
      listeners.push(() => node.removeEventListener(type, callback, options));
    };
    const consume = (event) => { event.preventDefault(); event.stopImmediatePropagation(); };
    const typing = BL.controls.uiKey;
    const updateSmashGauge = () => {
      const percent = grabHeld ? Math.round(throwMeter * 100) : Math.round(smashMeter * 40);
      if (percent === shownPower && shownThrow === grabHeld) return;
      shownPower = percent;
      shownThrow = grabHeld;
      hud.setGorillaSmashPower(grabHeld ? throwMeter : smashMeter, false, grabHeld);
    };
    // The pilot owns private first-person transitions. Reset those through its
    // public preset API, then restore the displayed camera's exact orbit.
    const rebasePilot = () => {
      target.x = camera.target.x; target.y = camera.target.y; target.z = camera.target.z;
      const dx = camera.position.x - target.x, dy = camera.position.y - target.y, dz = camera.position.z - target.z;
      const distance = Math.max(0.1, Math.hypot(dx, dy, dz));
      const yaw = Math.atan2(dx, dz), pitch = Math.atan2(dy, Math.hypot(dx, dz));
      pilot.goPreset("pile");
      pilot.cursor.stop();
      if (document.pointerLockElement === canvas) document.exitPointerLock();
      pilot.controls.clearPointer();
      orbit.target = target;
      orbit.tx = target.x; orbit.ty = target.y; orbit.tz = target.z;
      orbit.yaw = orbit.tYaw = yaw; orbit.pitch = orbit.tPitch = pitch; orbit.dist = orbit.tDist = distance;
      camera.up = null;
    };
    const cancelInput = () => {
      clearRight();
      carryShoulderAim = false;
      jumpKey = jumpTap = run = grabHeld = grabSpent = false;
      mouseButtons = 0;
      blockedButtons = 0;
      const pointer = actPointer;
      actPointer = -1;
      if (pointer >= 0 && hud.el.act.hasPointerCapture(pointer)) hud.el.act.releasePointerCapture(pointer);
      const smash = smashPointer;
      const throwing = throwPointer;
      if (grabActive && releaseOoga) releaseOoga(player, false);
      grabActive = false;
      smashPointer = -1; smashFromButton = false; smashCharge = 0; smashCombo = false;
      throwPointer = -1; throwFromButton = false; throwCharge = throwResult = 0; throwMeter = THROW_MIN_POWER;
      smashMeter = Math.min(smashMeter, smashBase);
      if (player) player.motion.poundCharge = 0;
      if (smash >= 0 && hud.el.gorillaSmash.hasPointerCapture(smash)) hud.el.gorillaSmash.releasePointerCapture(smash);
      if (throwing >= 0 && hud.el.gorillaSmash.hasPointerCapture(throwing)) hud.el.gorillaSmash.releasePointerCapture(throwing);
      shownPower = -1;
      updateSmashGauge();
      if (input) input.reset();
      pilot.controls.clearPointer();
      clankers.cancelInput();
      moving = false;
    };
    const blurCombat = (nativeUnlock = false) => {
      focused = false; lockPending = false; focusVersion++;
      wasLocked = false;
      unlockedAt = nativeUnlock ? performance.now() : -Infinity;
      document.body.classList.remove("aim-cursor-focused");
      if (document.pointerLockElement === canvas) document.exitPointerLock();
      cancelInput();
    };
    const focusCombat = () => {
      if (!isCombat() || disposed) return;
      focused = true;
      document.body.classList.toggle("aim-cursor-focused", combat);
      canvas.focus({ preventScroll: true });
      if (document.pointerLockElement === canvas || lockPending || !canvas.requestPointerLock) return;
      const version = ++focusVersion;
      lockPending = true;
      const failed = () => { if (version === focusVersion) lockPending = false; };
      try {
        const request = canvas.requestPointerLock();
        if (request && request.then) request.then(() => {
          if (version === focusVersion) lockPending = false;
          // A new Ooga owns capture after a T handoff. Its pilot handles a late
          // result from this request, including cancellation by its own Escape.
          if (!player && pilot.player) return;
          if ((!player || !focused) && document.pointerLockElement === canvas) document.exitPointerLock();
        }, failed);
      } catch (_) { failed(); }
    };
    const lockChanged = () => {
      if (!player) return;
      const locked = document.pointerLockElement === canvas, lost = wasLocked && !locked;
      wasLocked = locked;
      if (locked) {
        lockPending = false;
        if (!focused) document.exitPointerLock();
      } else if (lost) blurCombat(true);
    };
    on(document, "pointerlockchange", lockChanged);
    on(document, "pointerlockerror", () => { if (player) lockPending = false; });
    const showAct = () => {
      if (!player) return;
      if (hud.el.act.hidden) hud.el.act.hidden = false;
      const mode = clankers.sleeping(player) ? 6 : player.climb.active ? 4 : player.fire.rolling ? 3 : player.fire.burning ? 2
        : player.drive.airborne ? player.drive.jumps < 2 ? 1 : 5 : 0;
      if (mode === actMode) return;
      actMode = mode;
      hud.setAct(mode === 6 ? "WAKE UP!" : mode === 5 ? "IN AIR" : mode === 4 ? "JUMP OFF" : mode === 3 ? "ROLLING!" : mode === 2 ? "DROP & ROLL" : mode === 1 ? "DOUBLE JUMP" : "JUMP");
    };
    const beginJump = () => {
      shoulderPointActive = carryShoulderAim = false;
      if (clankers.wake()) { jumpTap = false; syncCursor(); }
      else if (player.fire.burning) {
        jumpTap = false;
        clankers.cancelInput();
        clankers.dropRoll();
      } else {
        // Preserve even a down/up pair between simulation frames as one jump.
        jumpTap = true;
      }
      showAct();
    };
    const captureControl = (out) => {
      if (!player) return pilot.captureControl(out);
      out.active = true; out.combat = combat; out.view = view;
      out.yaw = orbit.yaw; out.pitch = orbit.pitch; out.distance = orbit.dist;
      out.height = camera.position.y - player.root.position.y;
      out.eyeX = camera.position.x; out.eyeY = camera.position.y; out.eyeZ = camera.position.z;
      out.fov = camera.fov; out.side = Math.sign(shoulderSide); out.focused = focused;
      return cameraHandoff.capture(out, headHidden, savedHeadHidden, player.root);
    };
    const release = () => {
      if (!player) return false;
      cameraHandoff.cancel();
      blurCombat();
      restoreHead(); resetReticle();
      clankers.release();
      player = null; combat = false; wasLocked = false;
      shoulderPointActive = carryShoulderAim = false;
      holdingFollow = handoffBefore = pinnedFollow = viewChanged = moving = false;
      acquisitionHold = false;
      overheadEntry = false;
      followOffset.x = followOffset.y = followOffset.z = 0;
      pilot.setExternalControl(false);
      rebasePilot();
      camera.near = savedNear; camera.orthoMix = camera.orthoHeight = 0;
      hud.setGorilla(null);
      hud.el.act.hidden = true;
      return true;
    };
    const possess = (entry, atBoot = false, transition = null) => {
      if (disposed || !entry || !entry.active || !entry.root.visible) return false;
      if (entry === player) return true;
      const refusal = mayPossess && mayPossess(entry);
      if (refusal) { hud.toast(refusal); return false; }
      const incoming = transition || captureControl(controlState);
      if (!player) savedNear = camera.near;
      if (player) { blurCombat(); restoreHead(); }
      if (!clankers.possess(entry)) return false;
      cameraHandoff.cancel();
      pilot.release(true);
      rebasePilot();
      player = entry;
      shoulderPointActive = carryShoulderAim = false;
      smashMeter = smashBase;
      pilot.setExternalControl(true, isCombat);
      combat = incoming.active && incoming.combat; focused = wasLocked = false;
      view = incoming.active ? incoming.view : "orbit";
      if (combat && view === "orbit") view = BL.pilot.combatEntryView(camera.position, entry.root.position);
      overheadEntry = false;
      shoulderSide = incoming.side < 0 ? -SHOULDER_SIDE : SHOULDER_SIDE;
      shoulder = view === "shoulder" ? shoulderSide : 0; peek = 0; actMode = -1;
      rightAt = rightDownAt = zoomAt = -Infinity; zoomStopped = false; zoomGesture = null;
      resetReticle(); camera.near = view === "first-person" ? 0.05 : savedNear;
      camera.fov = incoming.fov;
      cameraUp.x = cameraUp.z = 0; cameraUp.y = 1;
      holdingFollow = handoffBefore = pinnedFollow = viewChanged = false;
      followOffset.x = followOffset.y = followOffset.z = 0;
      cancelInput();
      const p = player.root.position;
      updateTarget();
      acquisitionHold = !incoming.active;
      acquiredAt.x = p.x; acquiredAt.y = p.y; acquiredAt.z = p.z;
      acquiredEye.x = incoming.eyeX; acquiredEye.y = incoming.eyeY; acquiredEye.z = incoming.eyeZ;
      if (acquisitionHold) {
        // Recenter from the exact detached eye, even outside normal zoom limits.
        // The handoff turns the view; no pitch clamp or collision boom moves its eye.
        const dx = incoming.eyeX - target.x, dz = incoming.eyeZ - target.z;
        let dy = incoming.eyeY - target.y;
        if (Math.hypot(dx, dy, dz) < 1e-6) { target.y -= 1e-6; dy = incoming.eyeY - target.y; }
        orbit.yaw = orbit.tYaw = Math.hypot(dx, dz) > 1e-6 ? Math.atan2(dx, dz) : incoming.yaw;
        orbit.pitch = orbit.tPitch = Math.atan2(dy, Math.hypot(dx, dz));
        orbit.dist = orbit.tDist = Math.hypot(dx, dy, dz);
      } else {
        orbit.yaw = orbit.tYaw = incoming.yaw;
        orbit.pitch = orbit.tPitch = view === "birds-eye" ? PITCH_LIMIT : incoming.pitch;
        overheadHeight = Math.max(0.1, incoming.height - 0.15);
        orbit.dist = orbit.tDist = view === "first-person" ? 0 : view === "shoulder" ? SHOULDER_DISTANCE
          : view === "birds-eye" ? overheadHeight : Math.max(0.01, incoming.distance);
      }
      orbit.tx = target.x; orbit.ty = target.y; orbit.tz = target.z;
      orbitPitch = orbit.pitch;
      const sy = Math.sin(orbit.yaw), cy = Math.cos(orbit.yaw), cp = Math.cos(orbit.pitch);
      camera.target.x = orbit.tx + cy * shoulder; camera.target.y = orbit.ty; camera.target.z = orbit.tz - sy * shoulder;
      camera.position.x = acquisitionHold ? incoming.eyeX : camera.target.x + sy * cp * orbit.dist;
      camera.position.y = acquisitionHold ? incoming.eyeY : camera.target.y + Math.sin(orbit.pitch) * orbit.dist;
      camera.position.z = acquisitionHold ? incoming.eyeZ : camera.target.z + cy * cp * orbit.dist;
      if (view === "first-person") {
        camera.target.x -= sy * cp * 4; camera.target.y -= Math.sin(orbit.pitch) * 4; camera.target.z -= cy * cp * 4;
      }
      cameraUp.x = -sy * Math.sin(orbit.pitch); cameraUp.y = cp; cameraUp.z = -cy * Math.sin(orbit.pitch);
      camera.up = cameraUp;
      camera.orthoMix = view === "birds-eye" ? 1 : 0;
      camera.orthoHeight = Math.max(0.1, orbit.dist * 2 * Math.tan(camera.fov / 2));
      holdingFollow = handoffBefore = climbHandoff();
      if (!atBoot) cameraHandoff.begin(incoming);
      hud.setGorilla(player, view, isCombat());
      syncCursor();
      hud.tooltip.hide();
      showAct();
      if (!atBoot && incoming.focused) focusCombat();
      return true;
    };
    const action = (name) => {
      if (!player) return false;
      if (name === "gorilla-smash") {
        if (grabHeld) return true;
        if (clankers.smash(0, clankers.quickSmash(player), smashMeter)) {
          smashMeter = smashMin;
          updateSmashGauge();
        }
      } else if (name === "gorilla-beat") clankers.chestBeat();
      else if (name === "mode-release") release();
      else if (name === "mode-toggle") {
        if (clankers.sleeping(player)) { hud.hint("Wake this gorilla before entering shooter mode"); return true; }
        let entryView = null;
        if (!combat && view === "orbit") {
          // Choose from the displayed eye around the body, even while a
          // selection is still turning toward it. The camera's current aim
          // and pending orbit pitch do not change the elevation threshold.
          updateTarget();
          entryView = BL.pilot.combatEntryView(camera.position, target);
          captureControl(controlState);
          cameraHandoff.cancel();
          holdCamera(false);
          if (entryView === "shoulder") orbit.tPitch = 0.42;
        }
        combat = !combat;
        shoulderPointActive = carryShoulderAim = false;
        if (!combat) setCombatTooltip(null);
        targetWait = 0;
        cancelInput();
        if (entryView) setView(entryView);
        else if (view === "birds-eye" && !combat) {
          orbitPitch = orbit.pitch;
          setView("orbit");
        }
        // Carry shares the Ooga's native cursor; only combat captures mouse look.
        if (combat) focusCombat();
        else blurCombat();
        syncCursor();
        hud.setGorilla(player, view, isCombat());
        if (entryView) {
          // Rebase the shared full-pose blend before solving the new boom so
          // X keeps the exact displayed eye, roll and projection at time zero.
          cameraHandoff.begin(controlState);
          update(0);
        }
      } else if (name === "act") beginJump();
      else return false;
      return true;
    };
    // Called after the scene and HUD have had a chance to close their UI.
    const escape = () => {
      if (!player) return false;
      if (focused || lockPending || document.pointerLockElement === canvas || performance.now() - unlockedAt < 100) {
        blurCombat();
        return true;
      }
      return release();
    };
    const onKeyDown = (event) => {
      if (!player || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "Tab") {
        if (!event.repeat) {
          const captured = isCombat() && (focused || lockPending);
          const blocked = blockedButtons | mouseButtons;
          blurCombat();
          blockedButtons = blocked;
          if (captured && !typing(event)) pilot.controls.consumeTab(event);
        }
        return;
      }
      if (typing(event)) return;
      const space = event.code === "Space" || event.key === " " || event.key === "Spacebar";
      const key = event.key.toLowerCase();
      if (space) {
        consume(event);
        if (!jumpKey && !event.repeat) { jumpKey = true; beginJump(); }
      } else if (key === "shift" && event.code !== "ShiftRight" && event.location !== 2) { run = true; consume(event); }
      else if (key === "g") {
        consume(event);
        if (clankers.sleeping(player)) return;
        if (!grabHeld && !event.repeat) {
          grabHeld = true; grabSpent = false;
          throwCharge = throwResult = 0; throwMeter = THROW_MIN_POWER;
          syncCursor(); updateSmashGauge();
          if (smashPointer < 0) grabActive = !!(grabOoga && grabOoga(player));
        }
      }
      else if (key === "1") {
        consume(event);
        if (!event.repeat) action("gorilla-smash");
      } else if (key === "x") {
        consume(event);
        if (!event.repeat) action("mode-toggle");
      } else if (key === "n") {
        consume(event);
        if (view === "birds-eye") { orbit.tYaw = orbit.yaw + Math.atan2(-Math.sin(orbit.yaw), Math.cos(orbit.yaw)); viewChanged = true; }
      } else if (key === "c") {
        consume(event);
        if (!event.repeat) action("gorilla-beat");
      } else if (key === "v" || key === "j" || key.length === 1 && key >= "3" && key <= "9") consume(event);
    };
    const onKeyUp = (event) => {
      if (!player) return;
      // Shared controls may have seen the press before possession. Let their
      // keyup listener clear it as well; releasing a key triggers no action.
      if (event.code === "Space" || event.key === " " || event.key === "Spacebar") {
        jumpKey = false; event.preventDefault();
      }
      else if (event.key === "Shift" && event.code !== "ShiftRight" && event.location !== 2) { run = false; event.preventDefault(); }
      else if (event.key.toLowerCase() === "g") {
        consume(event);
        grabHeld = grabSpent = false;
        const throwing = throwPointer;
        throwPointer = -1; throwFromButton = false; throwCharge = throwResult = 0; throwMeter = THROW_MIN_POWER;
        if (grabActive && releaseOoga) releaseOoga(player, false);
        grabActive = false;
        if (throwing >= 0 && hud.el.gorillaSmash.hasPointerCapture(throwing)) hud.el.gorillaSmash.releasePointerCapture(throwing);
        syncCursor(); updateSmashGauge();
      }
    };
    on(window, "keydown", onKeyDown, true);
    on(window, "keyup", onKeyUp, true);
    // Follow the actual stance while keeping the aim above head and shoulders.
    const shoulderHeight = () => {
      const head = player.gorilla.parts.head, bounds = BL.scene.boundsOf(head.geometry);
      BL.scene.updateWorld(player.root, player.root.parent.world);
      const m = head.world;
      const top = m[1] * bounds.center[0] + m[5] * bounds.center[1] + m[9] * bounds.center[2] + m[13]
        + Math.abs(m[1]) * (bounds.max[0] - bounds.min[0]) * 0.5
        + Math.abs(m[5]) * (bounds.max[1] - bounds.min[1]) * 0.5
        + Math.abs(m[9]) * (bounds.max[2] - bounds.min[2]) * 0.5;
      return Math.max(top + 0.16,
        Math.max(player.gorilla.parts.armR.world[13], player.gorilla.parts.armL.world[13]) + 0.38);
    };
    const updateTarget = () => {
      const p = player.root.position;
      target.x = p.x; target.y = p.y + (player.fire.rolling ? 0.7 : 1.25); target.z = p.z;
      if (view === "birds-eye") {
        const scale = player.root.scale.x, upright = player.parked || player.biped;
        const ahead = (upright ? 1.015 : 2.2) * scale + 0.18;
        target.x += Math.sin(player.heading) * ahead; target.y = p.y + 0.15;
        target.z += Math.cos(player.heading) * ahead;
      } else if (view === "first-person") {
        const head = player.gorilla.parts.head, bounds = BL.scene.boundsOf(head.geometry);
        BL.scene.updateWorld(player.root, player.root.parent.world);
        mat4.transformPoint(eye, head.world, bounds.center[0], bounds.min[1] + (bounds.max[1] - bounds.min[1]) * 0.65, bounds.max[2] + 0.01);
        target.x = eye[0]; target.y = eye[1]; target.z = eye[2];
      } else if (view === "shoulder") target.y = shoulderHeight();
    };
    const shoulderAhead = () => {
      // Pick once from the body's heading at the click. Following its heading
      // while it turns toward the new aim line would keep turning forever.
      peek = 0;
      const p = player.root.position, height = shoulderHeight(), side = shoulderSide;
      const x = p.x + Math.sin(player.heading) * 10, z = p.z + Math.cos(player.heading) * 10;
      const floor = groundAt ? groundAt(x, z, height) : NaN;
      // A shortened boom may need a different anchor. Keep this world point
      // until deliberate input replaces the view, rather than picking again
      // from the heading as the gorilla turns toward its initial aim.
      shoulderPoint.x = x; shoulderPoint.y = Number.isFinite(floor) ? floor : p.y; shoulderPoint.z = z;
      shoulderPointActive = true;
      const yaw = player.heading - Math.PI + Math.asin(side / 10);
      orbit.tYaw = orbit.yaw + Math.atan2(Math.sin(yaw - orbit.yaw), Math.cos(yaw - orbit.yaw));
      orbitPitch = orbit.tPitch = clamp(Math.atan2(height - shoulderPoint.y,
        Math.sqrt(100 - side * side)), -PITCH_LIMIT, PITCH_LIMIT);
      followOffset.x = followOffset.y = followOffset.z = 0;
      pinnedFollow = false;
      // A deliberate view change also reframes an automatic climbing handoff.
      // Otherwise its pinned overhead anchor would prevent the shoulder dolly.
      holdingFollow = handoffBefore || climbHandoff();
      if (holdingFollow) {
        orbit.tx = p.x; orbit.ty = height; orbit.tz = p.z; shoulder = side;
      }
    };
    const shoulderAt = (clientX, clientY) => {
      const rect = canvas.getBoundingClientRect(), size = renderer.size;
      const p = player.root.position, height = shoulderHeight(), side = shoulderSide;
      pilot.pickCarryTarget(carryTarget, (clientX - rect.left) * size.width / rect.width,
        (clientY - rect.top) * size.height / rect.height, player, height, Math.abs(side) * 2);
      setView("shoulder");
      let yaw = player.heading - Math.PI, pitch = 0;
      if (carryTarget.kind === "point") {
        shoulderPoint.x = carryTarget.x; shoulderPoint.y = carryTarget.y; shoulderPoint.z = carryTarget.z;
        shoulderPointActive = true;
        const x = shoulderPoint.x - p.x, z = shoulderPoint.z - p.z, horizontal = Math.hypot(x, z);
        yaw = Math.atan2(-x, -z) + Math.asin(side / horizontal);
        pitch = Math.atan2(height - shoulderPoint.y, Math.sqrt(horizontal * horizontal - side * side));
      } else if (carryTarget.kind === "direction") {
        const horizontal = Math.hypot(carryTarget.dx, carryTarget.dz);
        if (horizontal > 1e-6) yaw = Math.atan2(-carryTarget.dx, -carryTarget.dz);
        pitch = Math.atan2(-carryTarget.dy, horizontal);
      }
      orbit.tYaw = orbit.yaw + Math.atan2(Math.sin(yaw - orbit.yaw), Math.cos(yaw - orbit.yaw));
      orbitPitch = orbit.tPitch = clamp(pitch, -PITCH_LIMIT, PITCH_LIMIT);
      carryShoulderAim = true;
      peek = 0;
      followOffset.x = followOffset.y = followOffset.z = 0;
      pinnedFollow = false;
      holdingFollow = handoffBefore || climbHandoff();
      if (holdingFollow) {
        orbit.tx = p.x; orbit.ty = height; orbit.tz = p.z; shoulder = side;
      }
    };
    const rightPress = (event) => {
      if (clankers.sleeping(player)) { clearRight(); return; }
      const recapture = isCombat() && !focused;
      // Restoring combat focus consumes this press, including its release;
      // it cannot become the first half of a double-click.
      if (recapture) { clearRight(); blockedButtons |= mouseButtons; }
      if (mouseButtons & ~2) clearRight();
      const now = performance.now();
      if (!combat && view === "orbit") {
        // Wait for an exclusive click: adding the other mouse button belongs
        // to walking, in either press order, and must leave the view alone.
        if (mouseButtons !== 2) return;
        carryRight = true; rightPointer = event.pointerId;
        rightX = rightLastX = event.clientX; rightY = rightLastY = event.clientY;
        rightDownAt = now; rightTravel = 0; rightAt = -Infinity;
        return;
      }
      if (view === "birds-eye" || view === "orbit") {
        const overhead = view === "birds-eye";
        setView("shoulder");
        if (overhead) shoulderAhead();
        focusCombat();
        clearRight();
      } else if (recapture) focusCombat();
      else if (!(mouseButtons & ~2)) {
        if (now - rightAt <= 350) {
          setView(combat ? "birds-eye" : "orbit");
          clearRight();
        } else { rightDownAt = now; rightTravel = 0; }
      }
    };
    const beginSmash = (event, fromButton) => {
      if (clankers.sleeping(player) || smashPointer >= 0 || throwPointer >= 0) return;
      if (grabHeld) {
        if (grabActive) {
          throwPointer = event.pointerId;
          throwFromButton = fromButton;
          throwCharge = 0; throwMeter = THROW_MIN_POWER; throwResult = 0;
          updateSmashGauge();
          if (fromButton && event.isTrusted) hud.el.gorillaSmash.setPointerCapture(event.pointerId);
        }
        return;
      }
      smashPointer = event.pointerId;
      smashFromButton = fromButton;
      smashCharge = 0;
      smashCombo = clankers.quickSmash(player);
      updateSmashGauge();
      if (fromButton && event.isTrusted) hud.el.gorillaSmash.setPointerCapture(event.pointerId);
    };
    const onDown = (event) => {
      if (!player) return;
      if (event.pointerType !== "touch") {
        mouseButtons = event.buttons;
        if (event.button !== 2 || event.target !== canvas || event.buttons & ~2) clearRight();
      }
      if (event.target === hud.el.act) {
        if (event.button !== 0 || actPointer >= 0) return;
        consume(event);
        actPointer = event.pointerId;
        if (event.isTrusted) hud.el.act.setPointerCapture(event.pointerId);
        beginJump();
      } else if (event.target === hud.el.gorillaSmash || hud.el.gorillaSmash.contains(event.target)) {
        if (event.button !== 0 || smashPointer >= 0) return;
        consume(event);
        beginSmash(event, true);
      } else if (event.target === canvas && event.button === 2 && event.pointerType !== "touch") {
        consume(event);
        rightPress(event);
      } else if (event.target === canvas && (isCombat() || grabHeld) && event.pointerType !== "touch") {
        consume(event);
        if (event.button === 0 && grabHeld) { beginSmash(event, false); return; }
        if (!focused) { blockedButtons |= event.buttons; focusCombat(); return; }
        if (event.button === 0 && !(blockedButtons & 1)) beginSmash(event, false);
      }
    };
    const moveView = (dx, dy) => {
      if (!player) return false;
      if (dx || dy) shoulderPointActive = carryShoulderAim = false;
      if (view === "birds-eye") {
        if (dx) { orbit.tYaw -= dx * 0.004; viewChanged = true; }
        return true;
      }
      if (dx || dy) viewChanged = true;
      const direct = view === "shoulder" || view === "first-person";
      orbit.tYaw -= dx * (direct ? 0.0025 : 0.004);
      orbit.tPitch = clamp(orbit.tPitch + dy * (direct ? 0.0025 : 0.0035), -PITCH_LIMIT, PITCH_LIMIT);
      return true;
    };
    const zoom = (factor, gesture = null) => {
      if (!player) return false;
      if (factor === 1) return true;
      const direction = Math.sign(factor - 1), now = performance.now();
      // Explicit wheel/pinch identities own the entire gesture, including
      // momentum and pauses. Direct callers without one use the wheel gap.
      const fresh = gesture !== null ? gesture !== zoomGesture
        : zoomGesture !== null || direction !== zoomDirection || now - zoomAt > ZOOM_PAUSE;
      zoomGesture = gesture; zoomAt = now; zoomDirection = direction;
      if (fresh) zoomStopped = false;
      if (zoomStopped) return true;
      clearRight();
      shoulderPointActive = carryShoulderAim = false;
      viewChanged = true;
      let next = view, nextDistance = null;
      if (view === "first-person" && direction > 0) next = "shoulder";
      else if (view === "shoulder") {
        next = direction < 0 ? "first-person" : combat ? "birds-eye" : "orbit";
        if (direction > 0) nextDistance = clamp(Math.max(SHOULDER_DISTANCE, orbit.tDist) * factor, SHOULDER_DISTANCE, maxDistance);
      }
      else if (view === "birds-eye") {
        orbit.tDist = overheadHeight = clamp(overheadHeight * factor, Math.min(overheadHeight, SHOULDER_DISTANCE), maxDistance);
        if (direction < 0 && overheadHeight <= SHOULDER_DISTANCE) next = "shoulder";
      } else if (view === "orbit") {
        orbit.tDist = clamp(orbit.tDist * factor, Math.min(orbit.tDist, SHOULDER_DISTANCE), Math.max(orbit.tDist, maxDistance));
        if (direction < 0 && orbit.tDist <= SHOULDER_DISTANCE) next = "shoulder";
      }
      if (next !== view) {
        // Shoulder is the mandatory stop in either direction. Once a fresh
        // gesture leaves it, outward travel continues through distant views.
        if (next === "shoulder") zoomStopped = true;
        setView(next, nextDistance);
      }
      return true;
    };
    const onMove = (event) => {
      if (!player || event.pointerType === "touch") return;
      if (carryRight && event.pointerId !== rightPointer) clearRight();
      if (carryRight && event.pointerId === rightPointer) {
        rightTravel += Math.hypot(event.clientX - rightLastX, event.clientY - rightLastY);
        rightLastX = event.clientX; rightLastY = event.clientY;
      }
      const pressed = event.buttons & ~mouseButtons & ~blockedButtons;
      const released = mouseButtons & ~event.buttons;
      mouseButtons = event.buttons;
      blockedButtons &= event.buttons;
      if (event.buttons & ~2) clearRight();
      // A mouse chord reports intermediate button releases as pointermove;
      // pointerup arrives only when its last held button is released.
      if (released & 2) releaseRight(event);
      if (released & 1) releasePrimary(event);
      if (event.target !== canvas) return;
      if (pressed & 2 && (isCombat() || clankers.sleeping(player))) { consume(event); rightPress(event); }
      if (!isCombat() && !grabHeld) return;
      if (!focused) {
        if (pressed & 1) {
          consume(event);
          if (grabHeld) beginSmash(event, false);
          else { blockedButtons |= event.buttons; focusCombat(); }
        }
        return;
      }
      consume(event);
      if (pressed & 1 && !(blockedButtons & 1)) beginSmash(event, false);
    };
    const releaseRight = (event) => {
      const now = performance.now();
      if (carryRight) {
        const x = rightX, y = rightY, rect = canvas.getBoundingClientRect();
        const clicked = event.target === canvas && event.pointerId === rightPointer && event.button === 2 && !event.buttons
          && !combat && view === "orbit" && !clankers.sleeping(player) && now - rightDownAt <= 350
          && x >= rect.left && x < rect.right && y >= rect.top && y < rect.bottom
          && event.clientX >= rect.left && event.clientX < rect.right && event.clientY >= rect.top && event.clientY < rect.bottom
          && rightTravel + Math.hypot(event.clientX - rightLastX, event.clientY - rightLastY) <= 8;
        clearRight(); consume(event);
        if (clicked) shoulderAt(event.clientX, event.clientY);
        return;
      }
      rightAt = event.target === canvas && !clankers.sleeping(player) && now - rightDownAt <= 350 && rightTravel <= 8 ? now : -Infinity;
      rightDownAt = -Infinity;
    };
    const releasePrimary = (event) => {
      if (event.pointerId === actPointer) {
        consume(event);
        actPointer = -1;
        if (hud.el.act.hasPointerCapture(event.pointerId)) hud.el.act.releasePointerCapture(event.pointerId);
        hud.el.act.blur();
      } else if (event.pointerId === throwPointer) {
        consume(event);
        const charge = throwCharge, fromButton = throwFromButton;
        throwPointer = -1; throwFromButton = false; throwCharge = 0;
        if (fromButton) {
          if (hud.el.gorillaSmash.hasPointerCapture(event.pointerId)) hud.el.gorillaSmash.releasePointerCapture(event.pointerId);
          hud.el.gorillaSmash.blur();
        }
        if (grabHeld && grabActive) {
          const aimed = isCombat() && (view === "first-person" || view === "shoulder");
          if (aimed) viewRay();
          releaseOoga(player, true, charge, aimed ? ray : null);
          grabActive = false; grabSpent = true;
          throwResult = THROW_RESULT_TIME;
        }
        updateSmashGauge();
      } else if (event.pointerId === smashPointer) {
        consume(event);
        const charge = smashCharge;
        const combo = smashCombo;
        const power = smashMeter;
        const fromButton = smashFromButton;
        smashPointer = -1; smashFromButton = false; smashCharge = 0; smashCombo = false; player.motion.poundCharge = 0;
        if (fromButton) {
          if (hud.el.gorillaSmash.hasPointerCapture(event.pointerId)) hud.el.gorillaSmash.releasePointerCapture(event.pointerId);
          hud.el.gorillaSmash.blur();
        }
        if (!grabHeld && clankers.smash(charge, combo, power)) smashMeter = smashMin;
        else smashMeter = Math.min(smashMeter, smashBase);
        updateSmashGauge();
      }
    };
    const onUp = (event) => {
      if (!player) return;
      if (event.pointerType !== "touch") {
        mouseButtons = event.buttons;
        blockedButtons &= event.buttons;
        if (event.buttons & ~2) clearRight();
        if (event.button === 2) releaseRight(event);
      }
      if (event.button === 0) releasePrimary(event);
      if (event.target === canvas && isCombat() && event.pointerType !== "touch") consume(event);
    };
    on(window, "pointerdown", onDown, true);
    on(window, "pointermove", onMove, true);
    on(window, "pointerup", onUp, true);
    on(window, "mousemove", (event) => {
      if (player && !carryRight && Number.isFinite(rightDownAt)) rightTravel += Math.hypot(event.movementX || 0, event.movementY || 0);
      if (player && isCombat() && focused && (event.target === canvas || document.pointerLockElement === canvas)) {
        consume(event);
        moveView(event.movementX || 0, event.movementY || 0);
      }
    }, true);
    const cancelPointer = (event) => {
      if (player && event.pointerType !== "touch") clearRight();
      if (player && (event.pointerId === actPointer || event.pointerId === smashPointer || event.pointerId === throwPointer
        || event.type === "pointercancel" && isCombat() && event.target === canvas)) {
        consume(event);
        const blocked = blockedButtons | mouseButtons;
        cancelInput();
        blockedButtons = blocked;
      }
    };
    on(window, "pointercancel", cancelPointer, true);
    on(canvas, "lostpointercapture", cancelPointer);
    on(hud.el.act, "lostpointercapture", cancelPointer);
    on(hud.el.gorillaSmash, "lostpointercapture", cancelPointer);
    on(window, "click", (event) => {
      if (player && ((isCombat() || grabHeld) && event.target === canvas || event.target === hud.el.act && event.detail > 0
        || (event.target === hud.el.gorillaSmash || hud.el.gorillaSmash.contains(event.target)) && event.detail > 0)) consume(event);
    }, true);
    on(canvas, "contextmenu", (event) => { if (player) consume(event); }, true);
    on(window, "blur", () => { if (player) blurCombat(); });
    on(document, "visibilitychange", () => { if (player && document.hidden) blurCombat(); });
    const readInput = (dt) => {
      if (!player) return;
      handoffBefore = climbHandoff();
      if (grabActive && !player.motion.dragging) grabActive = false;
      if (!clankers.sleeping(player) && grabHeld && !grabActive && !grabSpent && smashPointer < 0) grabActive = !!(grabOoga && grabOoga(player));
      if (throwPointer >= 0) {
        throwCharge = Math.min(1, throwCharge + dt / THROW_CHARGE_TIME);
        throwMeter = THROW_MIN_POWER + (1 - THROW_MIN_POWER) * throwCharge;
      } else if (throwResult > 0) throwResult = Math.max(0, throwResult - dt);
      else throwMeter = Math.max(THROW_MIN_POWER, throwMeter - (1 - THROW_MIN_POWER) * dt / THROW_RESULT_TIME);
      if (smashPointer >= 0) {
        smashCharge = Math.min(1, smashCharge + dt / POUND_CHARGE_TIME);
        smashMeter = Math.min(smashMax, smashMeter + smashRate * dt);
        player.motion.poundCharge = smashCharge;
      } else smashMeter = Math.min(smashBase, smashMeter + smashRate * dt);
      updateSmashGauge();
      const axes = pilot.controls.read();
      const shoulderCombat = isCombat() && view === "shoulder";
      if (shoulderCombat && axes.shiftTap) { shoulderSide = -shoulderSide; shoulderPointActive = carryShoulderAim = false; viewChanged = true; }
      const planted = shoulderCombat && axes.peek && !run;
      peek = damp(peek, planted ? axes.x * 0.34 : 0, 14, dt);
      const moveX = planted ? 0 : axes.x, moveY = planted ? 0 : axes.y;
      const turn = isCombat() ? clamp(axes.yaw + axes.orbitYaw, -1, 1) : axes.yaw;
      if (turn || axes.pitch || planted) viewChanged = true;
      moving = Math.hypot(moveX, moveY) > 0.05;
      if (turn || axes.pitch || planted || moving) shoulderPointActive = carryShoulderAim = false;
      orbit.tYaw += turn * 1.7 * dt;
      if (view === "birds-eye") {
        const delta = Math.atan2(Math.sin(orbit.tYaw - orbit.yaw), Math.cos(orbit.tYaw - orbit.yaw));
        orbit.tYaw = orbit.yaw + delta;
        // Match the gorilla's turning rate so it keeps facing the fixed reticle.
        const turnRate = player.drive.climbTurnTimer > 0 && !player.climb.active ? 14 : 7;
        orbit.yaw += clamp(delta, -turnRate * dt, turnRate * dt);
      } else if (axes.pitch) orbit.tPitch = clamp(orbit.tPitch + axes.pitch * 1.1 * dt, -PITCH_LIMIT, PITCH_LIMIT);
      const movementYaw = orbit.yaw;
      const sy = Math.sin(movementYaw), cy = Math.cos(movementYaw);
      command.x = moveX * cy - moveY * sy;
      command.z = -moveX * sy - moveY * cy;
      command.heading = isCombat() || view === "first-person" ? movementYaw + Math.PI : carryShoulderAim ? orbit.tYaw + Math.PI
        : Math.hypot(command.x, command.z) > 0.01 ? Math.atan2(command.x, command.z) : NaN;
      command.climbAxis = axes.y;
      command.climbSide = -axes.x;
      command.jumpHeld = jumpKey || actPointer >= 0 || jumpTap;
      command.jumpPressed = jumpTap;
      moving ||= command.jumpPressed;
      command.run = run;
      clankers.control(command);
      jumpTap = false;
    };
    const finishView = (dt) => {
      cameraHandoff.apply(dt);
      const first = view === "first-person";
      if (first && orbit.dist < 0.65 && !headHidden) {
        // The incoming head stays visible while a handoff approaches it.
        const head = player.gorilla.parts.head, bounds = BL.scene.boundsOf(head.geometry);
        BL.scene.updateWorld(player.root, player.root.parent.world);
        const m = head.world;
        mat4.transformPoint(eye, m, bounds.center[0], bounds.center[1], bounds.center[2]);
        const scale = Math.max(Math.hypot(m[0], m[1], m[2]), Math.hypot(m[4], m[5], m[6]), Math.hypot(m[8], m[9], m[10]));
        if (!cameraHandoff.active || Math.hypot(camera.position.x - eye[0], camera.position.y - eye[1], camera.position.z - eye[2]) <= bounds.radius * scale + camera.near) {
          cameraHandoff.takeHead(head);
          headHidden = head; savedHeadHidden = headHidden.cameraHidden; headHidden.cameraHidden = true;
        }
      } else if (!first && headHidden) {
        // Keep the head out of the near plane until the exit dolly clears it.
        BL.scene.updateWorld(player.root, player.root.parent.world);
        const bounds = BL.scene.boundsOf(headHidden.geometry), m = headHidden.world;
        mat4.transformPoint(eye, m, bounds.center[0], bounds.center[1], bounds.center[2]);
        const scale = Math.max(Math.hypot(m[0], m[1], m[2]), Math.hypot(m[4], m[5], m[6]), Math.hypot(m[8], m[9], m[10]));
        if (Math.hypot(camera.position.x - eye[0], camera.position.y - eye[1], camera.position.z - eye[2]) > bounds.radius * scale + camera.near) restoreHead();
      }
      updateReticle(dt);
      hud.setGorilla(player, view, isCombat());
      showAct();
    };
    const update = (dt) => {
      if (!player) return;
      if (clankers.player !== player || !player.active || !player.root.visible) { release(); return; }
      cameraHandoff.restore();
      updateSmashGauge();
      const p = player.root.position;
      if (acquisitionHold && (viewChanged || moving || Math.hypot(p.x - acquiredAt.x, p.y - acquiredAt.y, p.z - acquiredAt.z) > 1e-5)) acquisitionHold = false;
      const first = view === "first-person", overhead = view === "birds-eye";
      const hold = handoffBefore || climbHandoff();
      if (hold && !holdingFollow && !overhead) holdCamera(viewChanged);
      holdingFollow = hold;
      if (hold) pinnedFollow = true;
      else if (moving) pinnedFollow = false;
      const anchored = !overhead && (hold || pinnedFollow);
      updateTarget();
      if (acquisitionHold) {
        // Keep the actual eye, not a repeatedly reconstructed spherical value.
        camera.position.x = acquiredEye.x; camera.position.y = acquiredEye.y; camera.position.z = acquiredEye.z;
        camera.target.x = target.x; camera.target.y = target.y; camera.target.z = target.z;
        if (Math.hypot(target.x - acquiredEye.x, target.y - acquiredEye.y, target.z - acquiredEye.z) < 1e-6) camera.target.y -= 1e-6;
        finishView(dt);
        return;
      }
      if (anchored) {
        followOffset.x = orbit.tx - target.x; followOffset.y = orbit.ty - target.y; followOffset.z = orbit.tz - target.z;
      } else if (moving) {
        // Resume framing during deliberate travel, never by snapping back
        // after the gorilla's automatic mount or dismount ends.
        followOffset.x = damp(followOffset.x, 0, 4, dt);
        followOffset.y = damp(followOffset.y, 0, 4, dt);
        followOffset.z = damp(followOffset.z, 0, 4, dt);
      }
      const looking = viewChanged || Math.abs(orbit.tYaw - orbit.yaw) > 0.00001
        || Math.abs(orbit.tPitch - orbit.pitch) > 0.00001 || Math.abs(orbit.tDist - orbit.dist) > 0.00001;
      if (anchored && !looking && camera.orthoMix === 0) {
        finishView(dt);
        return;
      }
      if (!overhead) orbit.yaw = damp(orbit.yaw, orbit.tYaw, player.drive.climbTurnTimer > 0 && !player.climb.active ? 28 : 14, dt);
      orbit.pitch = damp(orbit.pitch, orbit.tPitch, 14, dt);
      orbit.dist = damp(orbit.dist, orbit.tDist, 9, dt);
      if (!anchored) {
        if (overhead) {
          if (overheadEntry) {
            // Decay only the handoff offset; follow the moving forward anchor
            // immediately so travel cannot leave the fixed reticle behind.
            overheadOffset.x = damp(overheadOffset.x, 0, 10, dt);
            overheadOffset.y = damp(overheadOffset.y, 0, 10, dt);
            overheadOffset.z = damp(overheadOffset.z, 0, 10, dt);
            if (Math.hypot(overheadOffset.x, overheadOffset.y, overheadOffset.z) < 0.001) overheadEntry = false;
          }
          orbit.tx = target.x + (overheadEntry ? overheadOffset.x : 0);
          orbit.ty = target.y + (overheadEntry ? overheadOffset.y : 0);
          orbit.tz = target.z + (overheadEntry ? overheadOffset.z : 0);
        } else {
          orbit.tx = damp(orbit.tx, target.x + followOffset.x, 10, dt);
          orbit.ty = damp(orbit.ty, target.y + followOffset.y, 10, dt);
          orbit.tz = damp(orbit.tz, target.z + followOffset.z, 10, dt);
        }
        shoulder = damp(shoulder, view === "shoulder" ? shoulderSide + peek : 0, 10, dt);
      }
      const sy = Math.sin(orbit.yaw), cy = Math.cos(orbit.yaw), cp = Math.cos(orbit.pitch);
      previousEye.x = camera.position.x; previousEye.y = camera.position.y; previousEye.z = camera.position.z;
      camera.target.x = orbit.tx + cy * shoulder;
      camera.target.y = orbit.ty;
      camera.target.z = orbit.tz - sy * shoulder;
      camera.position.x = camera.target.x + sy * cp * orbit.dist;
      camera.position.y = camera.target.y + Math.sin(orbit.pitch) * orbit.dist;
      camera.position.z = camera.target.z + cy * cp * orbit.dist;
      if (first) {
        camera.target.x = camera.position.x - sy * cp * 4;
        camera.target.y = camera.position.y - Math.sin(orbit.pitch) * 4;
        camera.target.z = camera.position.z - cy * cp * 4;
      }
      camera.orthoMix = damp(camera.orthoMix || 0, overhead ? 1 : 0, 10, dt);
      if (Math.abs(camera.orthoMix - (overhead ? 1 : 0)) < 0.001) camera.orthoMix = overhead ? 1 : 0;
      camera.orthoHeight = Math.max(0.1, orbit.dist * 2 * Math.tan(camera.fov / 2));
      cameraUp.x = -sy * Math.sin(orbit.pitch); cameraUp.y = cp; cameraUp.z = -cy * Math.sin(orbit.pitch);
      camera.up = cameraUp;
      // The scene can shorten an underground combat boom before restoring its roof.
      if (constrainCamera && !acquisitionHold) constrainCamera(player, camera, anchored, previousEye, first, overhead,
        shoulderPointActive && view === "shoulder" ? shoulderPoint : null);
      if (anchored) {
        // A user-driven look can hit stone during the handoff. Retain the
        // resulting displayed boom instead of expanding it on the next frame.
        holdCamera(true);
        followOffset.x = orbit.tx - target.x; followOffset.y = orbit.ty - target.y; followOffset.z = orbit.tz - target.z;
      }
      viewChanged = false;
      finishView(dt);
    };
    const respawn = (dx, dy, dz) => {
      cameraHandoff.cancel();
      cancelInput();
      acquisitionHold = false;
      holdingFollow = pinnedFollow = handoffBefore = false;
      followOffset.x = followOffset.y = followOffset.z = 0;
      orbit.tx += dx; orbit.ty += dy; orbit.tz += dz;
      camera.position.x += dx; camera.position.y += dy; camera.position.z += dz;
      camera.target.x += dx; camera.target.y += dy; camera.target.z += dz;
      if (shoulderPointActive) { shoulderPoint.x += dx; shoulderPoint.y += dy; shoulderPoint.z += dz; }
      viewChanged = true; targetWait = 0;
    };
    const travelRefusal = () => {
      if (!player) return "Choose a gorilla before travelling.";
      if (grabHeld || grabActive || throwPointer >= 0) return "Let go of the Ooga before travelling.";
      if (actPointer >= 0 || jumpKey || jumpTap || smashPointer >= 0) return "Finish your action before travelling.";
      return clankers.travelRefusal();
    };
    const travel = (position) => {
      if (travelRefusal()) return false;
      const p = player.root.position, x = p.x, y = p.y, z = p.z;
      if (!clankers.travel(position)) return false;
      cameraHandoff.cancel();
      cancelInput();
      const dx = p.x - x, dy = p.y - y, dz = p.z - z;
      // Translate the displayed view and every retained world-space anchor.
      // A pending dolly or detached acquisition keeps its existing framing.
      target.x += dx; target.y += dy; target.z += dz;
      orbit.tx += dx; orbit.ty += dy; orbit.tz += dz;
      camera.position.x += dx; camera.position.y += dy; camera.position.z += dz;
      camera.target.x += dx; camera.target.y += dy; camera.target.z += dz;
      acquiredAt.x += dx; acquiredAt.y += dy; acquiredAt.z += dz;
      acquiredEye.x += dx; acquiredEye.y += dy; acquiredEye.z += dz;
      previousEye.x += dx; previousEye.y += dy; previousEye.z += dz;
      if (shoulderPointActive) { shoulderPoint.x += dx; shoulderPoint.y += dy; shoulderPoint.z += dz; }
      targetWait = 0; setCombatTooltip(null);
      return true;
    };
    const freeCursor = () => {
      if (!player) return false;
      blurCombat();
      return true;
    };
    const resetCamera = () => {
      if (!player || clankers.player !== player || !player.active || !player.root.visible) return false;
      cameraHandoff.cancel();
      clearRight();
      shoulderPointActive = carryShoulderAim = false;
      const first = view === "first-person", overhead = view === "birds-eye";
      acquisitionHold = pinnedFollow = handoffBefore = overheadEntry = false;
      holdingFollow = climbHandoff();
      followOffset.x = followOffset.y = followOffset.z = 0;
      peek = 0; shoulder = view === "shoulder" ? shoulderSide : 0;
      orbit.yaw = orbit.tYaw = overhead ? orbit.yaw : player.heading - Math.PI;
      orbitPitch = first ? 0 : 0.42;
      orbit.pitch = orbit.tPitch = overhead ? PITCH_LIMIT : orbitPitch;
      if (overhead) overheadHeight = clamp(birdsEyeMin, SHOULDER_DISTANCE, maxDistance);
      orbit.dist = orbit.tDist = first ? 0 : overhead ? overheadHeight : view === "shoulder" ? SHOULDER_DISTANCE : 6;
      updateTarget();
      orbit.target = target; orbit.tx = target.x; orbit.ty = target.y; orbit.tz = target.z;
      camera.near = first ? 0.05 : savedNear; camera.orthoMix = overhead ? 1 : 0;
      viewChanged = true; targetWait = 0;
      update(0);
      return true;
    };
    const dispose = () => {
      if (disposed) return;
      release(); disposed = true;
      for (const off of listeners) off();
    };
    return { possess, release, escape, respawn, travelRefusal, travel, freeCursor, resetCamera, captureControl, readInput, update, action, orbit: moveView, zoom, cancelInput, dispose,
      get active() { return !!player; }, get player() { return player; }, get view() { return view; },
      get birdsEye() { return !!player && view === "birds-eye"; }, get birdsEyeMix() { return player ? camera.orthoMix || 0 : 0; },
      get firstPerson() { return !!player && view === "first-person"; },
      get combat() { return isCombat(); }, get focused() { return focused; } };
  };
  BL.clankerPlay = { create };
})();
