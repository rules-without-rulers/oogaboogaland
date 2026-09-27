// The Ooga crew kept in step for signed-in players. The room elects one page showing the island as host
// (`net.state.hostId`): it runs the crew as always and, SEND_S apart, sends one binary frame with every
// Ooga nobody drives. Every other signed-in page on the island follows: those Oogas become puppets
// (`cave.puppet`, which makes crew.update skip their AI) and are eased toward the latest frame here, after
// the crew's update. An Ooga someone drives is never in a frame and never a puppet: the driver's page
// runs it and the others show it through remote-players.js. With no room, no host or when hosting, every
// Ooga runs its own AI as before.
//
// A frame: a Uint32 header [FORMAT, signature of the crew's names, record count, 0], then one RECORD of
// floats per Ooga: its index in crew.list, flags, the root's position, rotation, quaternion and scale, the
// legs, arms (rotation and quaternion), head (rotation, position, quaternion) and torso. Pages built from
// a different cast have a different signature and ignore each other's frames.
// One sync per hub visit: `create` after the crew, `update` after crew.update each frame, `dispose` in leave.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { quat, fnv1a } = BL.math;
  const FORMAT = 1, HEADER = 4, RECORD = 48, SEND_S = 0.1;
  const EASE = 14, SNAP = 4;
  const F_VISIBLE = 1, F_CLOSED = 2, F_ROOT_Q = 4, F_ARM_L_Q = 8, F_ARM_R_Q = 16, F_HEAD_Q = 32;

  const wrap = (d) => Math.atan2(Math.sin(d), Math.cos(d));

  const create = ({ crew }) => {
    const net = BL.net;
    const list = crew.list, n = list.length;
    const signature = fnv1a(list.map((cave) => cave.traits.name).join(",")) >>> 0;
    const out = new Float32Array(HEADER + n * RECORD), outHeader = new Uint32Array(out.buffer, 0, HEADER);
    const views = [];
    for (let k = 0; k <= n; k++) views.push(new Uint8Array(out.buffer, 0, (HEADER + k * RECORD) * 4));
    const target = new Float32Array(n * RECORD);
    const have = new Uint8Array(n), fresh = new Uint8Array(n);
    // Each puppet's own quaternions: the crew's are never written from here.
    const quats = list.map(() => ({ root: quat.create(), armL: quat.create(), armR: quat.create(), head: quat.create() }));
    let role = "solo", sendIn = 0, seen = -1, frames = 0;

    const driven = (cave) => cave === crew.player || !!cave.remoteControlled;

    const writeQuat = (o, q) => {
      if (!q) return false;
      out[o] = q[0]; out[o + 1] = q[1]; out[o + 2] = q[2]; out[o + 3] = q[3];
      return true;
    };
    const encode = () => {
      let k = 0;
      for (let i = 0; i < n; i++) {
        const cave = list[i];
        if (driven(cave)) continue;
        const o = HEADER + k * RECORD, r = cave.root, p = cave.parts;
        let flags = 0;
        if (r.visible) flags |= F_VISIBLE;
        if (p.head.geometry === cave.headClosed) flags |= F_CLOSED;
        out[o] = i;
        out[o + 2] = r.position.x; out[o + 3] = r.position.y; out[o + 4] = r.position.z;
        out[o + 5] = r.rotation.x; out[o + 6] = r.rotation.y; out[o + 7] = r.rotation.z;
        if (writeQuat(o + 8, r.quaternion)) flags |= F_ROOT_Q;
        out[o + 12] = r.scale.x; out[o + 13] = r.scale.y; out[o + 14] = r.scale.z;
        out[o + 15] = p.legL.rotation.x; out[o + 16] = p.legL.rotation.z;
        out[o + 17] = p.legR.rotation.x; out[o + 18] = p.legR.rotation.z;
        out[o + 19] = p.armL.rotation.x; out[o + 20] = p.armL.rotation.y; out[o + 21] = p.armL.rotation.z;
        if (writeQuat(o + 22, p.armL.quaternion)) flags |= F_ARM_L_Q;
        out[o + 26] = p.armR.rotation.x; out[o + 27] = p.armR.rotation.y; out[o + 28] = p.armR.rotation.z;
        if (writeQuat(o + 29, p.armR.quaternion)) flags |= F_ARM_R_Q;
        out[o + 33] = p.head.rotation.x; out[o + 34] = p.head.rotation.y; out[o + 35] = p.head.rotation.z;
        out[o + 36] = p.head.position.x; out[o + 37] = p.head.position.y; out[o + 38] = p.head.position.z;
        if (writeQuat(o + 39, p.head.quaternion)) flags |= F_HEAD_Q;
        out[o + 43] = p.torso.scale.y; out[o + 44] = p.torso.rotation.x; out[o + 45] = p.torso.rotation.z;
        out[o + 1] = flags;
        k++;
      }
      outHeader[0] = FORMAT; outHeader[1] = signature; outHeader[2] = k; outHeader[3] = 0;
      net.sendNpc(views[k]);
    };

    const decode = (buffer) => {
      if (!buffer || buffer.byteLength < HEADER * 4 || buffer.byteLength % 4) return;
      const header = new Uint32Array(buffer, 0, HEADER), f = new Float32Array(buffer);
      const count = header[2];
      if (header[0] !== FORMAT || header[1] !== signature || count > n || buffer.byteLength < (HEADER + count * RECORD) * 4) return;
      for (let k = 0; k < count; k++) {
        const o = HEADER + k * RECORD, i = f[o];
        if (!(i >= 0 && i < n)) continue;
        target.set(f.subarray(o, o + RECORD), i * RECORD);
        if (!have[i]) fresh[i] = 1;
        have[i] = 1;
      }
      frames++;
    };

    // A quaternion eased toward the frame's, or dropped (back to the Euler rotation) when the frame has none.
    const poseQuat = (node, own, t, o, on, k) => {
      if (!on) {
        if (node.quaternion === own) node.quaternion = null;
        return;
      }
      if (node.quaternion !== own) {
        node.quaternion = own;
        own[0] = t[o]; own[1] = t[o + 1]; own[2] = t[o + 2]; own[3] = t[o + 3];
        return;
      }
      TQ[0] = t[o]; TQ[1] = t[o + 1]; TQ[2] = t[o + 2]; TQ[3] = t[o + 3];
      quat.slerpTo(own, TQ, k);
    };
    const TQ = quat.create();
    const easeAngles = (rot, t, o, k) => {
      rot.x += wrap(t[o] - rot.x) * k; rot.y += wrap(t[o + 1] - rot.y) * k; rot.z += wrap(t[o + 2] - rot.z) * k;
    };

    const apply = (i, cave, dt) => {
      const t = target, o = i * RECORD, r = cave.root, p = cave.parts, q = quats[i];
      const flags = t[o + 1];
      const far = fresh[i] || Math.hypot(t[o + 2] - r.position.x, t[o + 3] - r.position.y, t[o + 4] - r.position.z) > SNAP;
      const k = far ? 1 : 1 - Math.exp(-EASE * dt);
      fresh[i] = 0;
      r.visible = (flags & F_VISIBLE) !== 0;
      r.position.x += (t[o + 2] - r.position.x) * k; r.position.y += (t[o + 3] - r.position.y) * k; r.position.z += (t[o + 4] - r.position.z) * k;
      easeAngles(r.rotation, t, o + 5, k);
      poseQuat(r, q.root, t, o + 8, (flags & F_ROOT_Q) !== 0, k);
      r.scale.x = t[o + 12]; r.scale.y = t[o + 13]; r.scale.z = t[o + 14];
      p.legL.rotation.x += wrap(t[o + 15] - p.legL.rotation.x) * k; p.legL.rotation.z += wrap(t[o + 16] - p.legL.rotation.z) * k;
      p.legR.rotation.x += wrap(t[o + 17] - p.legR.rotation.x) * k; p.legR.rotation.z += wrap(t[o + 18] - p.legR.rotation.z) * k;
      easeAngles(p.armL.rotation, t, o + 19, k);
      poseQuat(p.armL, q.armL, t, o + 22, (flags & F_ARM_L_Q) !== 0, k);
      easeAngles(p.armR.rotation, t, o + 26, k);
      poseQuat(p.armR, q.armR, t, o + 29, (flags & F_ARM_R_Q) !== 0, k);
      easeAngles(p.head.rotation, t, o + 33, k);
      p.head.position.x += (t[o + 36] - p.head.position.x) * k; p.head.position.y += (t[o + 37] - p.head.position.y) * k; p.head.position.z += (t[o + 38] - p.head.position.z) * k;
      poseQuat(p.head, q.head, t, o + 39, (flags & F_HEAD_Q) !== 0, k);
      const head = (flags & F_CLOSED) !== 0 ? cave.headClosed : cave.headOpen;
      if (p.head.geometry !== head) p.head.geometry = head;
      p.torso.scale.y = t[o + 43];
      p.torso.rotation.x += wrap(t[o + 44] - p.torso.rotation.x) * k; p.torso.rotation.z += wrap(t[o + 45] - p.torso.rotation.z) * k;
    };

    const release = () => {
      for (let i = 0; i < n; i++) list[i].puppet = false;
      have.fill(0);
      fresh.fill(0);
    };

    /** Once a frame, after crew.update: host sends, follower poses its puppets, solo does nothing. */
    const update = (dt) => {
      const st = net.state;
      const next = st.room !== "live" || !st.hostId ? "solo" : st.hostId === st.selfId ? "host" : "follow";
      if (next !== role) {
        // Leaving follow hands the Oogas back to their own AI where they stand; a new host sends at once.
        if (role === "follow") release();
        role = next;
        sendIn = 0;
        seen = -1;
      }
      if (role === "host") {
        sendIn -= dt;
        if (sendIn <= 0) {
          sendIn = SEND_S;
          encode();
        }
        return;
      }
      if (role !== "follow") return;
      if (st.npcVersion !== seen) {
        seen = st.npcVersion;
        decode(net.npcFrame);
      }
      for (let i = 0; i < n; i++) {
        const cave = list[i];
        if (driven(cave)) {
          cave.puppet = false;
          continue;
        }
        cave.puppet = true;
        if (have[i]) apply(i, cave, dt);
      }
    };

    const dispose = () => {
      release();
      role = "solo";
    };

    return { update, dispose, get role() { return role; }, get frames() { return frames; } };
  };

  BL.npcSync = { create, FORMAT, RECORD };
})();
