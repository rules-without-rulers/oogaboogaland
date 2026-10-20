// The island room: one Durable Object holding every signed-in player's socket. The Worker is its
// only door (`/room`), and it hands over who the player is in x-player-* headers after checking the
// session; nothing a client sends can change its identity. Ported from the OBL-Audio prototype:
// hibernatable sockets with attachments, a snapshot at most 15 times a second while anything moves, an
// alarm sweeping silent sockets once a minute, and one socket per player, where a newer one kicks the older with `replaced`.
// Every claim on an Ooga or gorilla passes `claimRefusal` against the cast the build writes (characters.gen.json).
// Voice: the room alone talks to the Realtime SFU (the secret stays here), decides who hears whom
// (`voicePeers`: both driving a body in the same place) and re-checks it on every pull, so a page never
// learns another player's session and cannot pull a voice it may not hear.
// NPCs: the room elects one page as host (`electHost`), relays its binary pose frames to every other
// page showing the island, and keeps the latest frame for pages that arrive or come back.
// Cost: the room hibernates whenever nothing is happening, so no timer runs while idle: a snapshot is a
// one-shot flush scheduled by a pose, voice lists are sent when who hears whom can change, and the host
// is told how many pages follow it (`host { id, followers }`) so a lone host sends no frames, and who is
// in voice or muted goes out (`vstate`) only when it changes, as health does (`hp`). The last voice list
// each player was sent lives in its attachment (`sent`), so a woken room still knows what every page holds.
// Chat: each line is named from the session, rate limited per account across awake-room reconnects, sent to every socket and kept in a
// ring of the last CHAT_KEEP in memory alone, which a joiner gets after `welcome`. No durable chat storage: a room
// that hibernates, restarts or is redeployed wakes with an empty ring, and the lines are gone.

import { DurableObject } from "cloudflare:workers";
import {
  CLOSE_KICK, CLOSE_PROTOCOL, MAX_PLAYERS, MOVE_HZ, STALE_MS, SWEEP_MS, TICK_HZ,
  NPC_FRAME_MAX, NPC_HZ, OUTSIDE, HP_HZ, VOICE_TRACK, CHAT_HZ, CHAT_BURST, CHAT_BUCKET_KEEP, CHAT_RETRY_KEEP,
  DOOR_ZONE, DOOR_ROOM, DOOR_GRANT_MS, DOOR_TRANSIT_MS, DOOR_PASS_MS, DOOR_HZ, DOOR_BURST,
  chatLog, castIndex, bodyName, ownedBody, electHost, npcFollowers, claimRefusal, parseClientMessage, playerFromHeaders, spawnPoint, takeToken, voicePeers,
} from "./protocol.js";
import { sha256Hex } from "./crypto.js";
import { getPlayer } from "./db.js";
import { sfuClient } from "./sfu.js";
import CAST_ROWS from "./characters.gen.json";

const CAST = castIndex(CAST_ROWS);

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.players = new Map();
    this.spawnSlot = 0;
    this.dirty = false;
    this.flushTimer = 0;
    this.sfu = sfuClient(env);
    this.hostId = 0;
    this.followers = 0;
    this.lastNpc = null;
    this.chat = chatLog();
    this.chatId = 0;
    this.chatAccepted = new Map();
    this.chatBuckets = new Map();
    this.doorQueue = [];
    this.doorActive = null;
    this.doorPasses = new Map();
    this.doorId = 0;
    this.sweepAt = 0;
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
    // The pile's sound loop started once, for good: every page plays it at (now - loopEpoch), so all
    // hear the same crackle at the same moment. Stored, so a woken or redeployed room keeps the phase.
    this.loopEpoch = 0;
    ctx.blockConcurrencyWhile(async () => {
      const stored = await ctx.storage.get(["loopEpoch", "sweepAt"]);
      this.loopEpoch = stored && stored.loopEpoch || Date.now();
      this.sweepAt = stored && stored.sweepAt || Date.now() + SWEEP_MS;
      await ctx.storage.put("loopEpoch", this.loopEpoch);
      await ctx.storage.put("sweepAt", this.sweepAt);
    });
    // A woken room rebuilds its roster from the attachments its sockets carry.
    for (const ws of ctx.getWebSockets()) {
      const a = ws.deserializeAttachment();
      if (a) this.players.set(a.id, this.record(ws, a));
    }
    // Old guest sockets can survive a deployment in hibernated attachments.
    // Use the ordinary departure path so peers drop their presence and voice.
    for (const p of this.players.values()) if (!ownedBody(CAST, p.login, p.contributor)) this.evict(p, "revoked");
    this.restoreDoor();
    this.hostId = electHost(this.players.values());
    this.followers = npcFollowers(this.players.values(), this.hostId);
  }

  record(ws, a) {
    return { ws, voice: { pub: null, sub: null, track: null, gen: 0 }, muted: false, hp: 100, ko: false, g: null, sent: null, zone: OUTSIDE, pokerVoice: null, inHub: false, joinedAt: Date.now(), door: null, passes: [], ...a, bucket: { tokens: MOVE_HZ, at: Date.now() }, npcBucket: { tokens: NPC_HZ, at: Date.now() }, hpBucket: { tokens: HP_HZ, at: Date.now() }, doorBucket: { tokens: DOOR_BURST, at: Date.now() }, chatBucket: this.chatBucketFor(a.id, Date.now()), seenAt: Date.now() };
  }

  // Retain account debt across socket records, only while awake. Reclaim fully replenished
  // inactive accounts on demand; at capacity refuse new debt rather than evict depleted buckets.
  chatBucketFor(id, now) {
    for (const [account, bucket] of this.chatBuckets) {
      if (!this.players.has(account) && bucket.tokens + (now - bucket.at) * CHAT_HZ / 1000 >= CHAT_BURST) this.chatBuckets.delete(account);
    }
    let bucket = this.chatBuckets.get(id);
    if (!bucket && this.chatBuckets.size < CHAT_BUCKET_KEEP) {
      bucket = { tokens: CHAT_BURST, at: now };
      this.chatBuckets.set(id, bucket);
    }
    return bucket || null;
  }

  attachment(p) {
    return { id: p.id, login: p.login, display: p.display, contributor: p.contributor, body: p.body, x: p.x, y: p.y, z: p.z, yaw: p.yaw, g: p.g, voice: p.voice, muted: p.muted, hp: p.hp, ko: p.ko, sent: p.sent, zone: p.zone, pokerVoice: p.pokerVoice, inHub: p.inHub, joinedAt: p.joinedAt, door: p.door, passes: p.passes };
  }

  view(p) {
    return { id: p.id, login: p.login, display: p.display, body: p.body, zone: p.zone, x: p.x, y: p.y, z: p.z, yaw: p.yaw, g: p.g, voice: !!p.voice.track, muted: p.muted, hp: p.hp, ko: p.ko };
  }

  send(ws, msg) {
    try {
      ws.send(typeof msg === "string" || msg instanceof ArrayBuffer ? msg : JSON.stringify(msg));
    } catch {
      // A socket closing under us is dropped by its close event.
    }
  }

  broadcast(msg, except = null) {
    const text = JSON.stringify(msg);
    for (const p of this.players.values()) if (p.ws !== except) this.send(p.ws, text);
  }

  broadcastZone(zone, msg) {
    const text = JSON.stringify(msg);
    for (const p of this.players.values()) if (p.zone === zone) this.send(p.ws, text);
  }

  restoreDoor() {
    const now = Date.now(), queued = [], active = [];
    for (const p of this.players.values()) {
      if (p.door && p.body && p.zone === DOOR_ZONE && p.door.exp > now) {
        if (p.door.phase === "queued") queued.push(p);
        else if (p.door.phase === "grant" || p.door.phase === "active") active.push(p);
        else p.door = null;
      } else p.door = null;
      p.passes = Array.isArray(p.passes) ? p.passes.filter((x) => x && DOOR_ROOM.test(x.door) && x.exp > now && p.body && p.zone === x.door) : [];
      for (const pass of p.passes) this.doorPasses.set(pass.cycle, { ...pass, id: p.id });
    }
    queued.sort((a, b) => a.door.at - b.door.at || a.id - b.id);
    active.sort((a, b) => a.door.at - b.door.at || a.id - b.id);
    this.doorQueue = queued.map((p) => p.id);
    if (active.length) {
      const p = active.shift();
      this.doorActive = { ...p.door, id: p.id };
      for (const extra of active) {
        extra.door = { phase: "queued", dir: extra.door.dir, room: extra.door.room, at: extra.door.at, exp: Number.MAX_SAFE_INTEGER };
        this.doorQueue.push(extra.id);
      }
    }
    for (const p of this.players.values()) {
      p.ws.serializeAttachment(this.attachment(p));
      this.replayDoor(p);
    }
  }

  doorCycle(p) {
    this.doorId = (this.doorId + 1) % 0x100000;
    return `${Date.now().toString(36)}_${p.id.toString(36)}_${this.doorId.toString(36)}`;
  }

  replayDoor(p) {
    const now = Date.now();
    if (p.zone === DOOR_ZONE && this.doorActive && this.doorActive.phase === "active" && this.doorActive.exp > now && this.doorActive.id !== p.id) {
      const a = this.doorActive;
      this.send(p.ws, { t: "transit", cycle: a.cycle, actor: a.id, door: DOOR_ZONE, dir: a.dir, at: a.startedAt, exp: a.exp });
    }
    if (DOOR_ROOM.test(p.zone)) for (const pass of this.doorPasses.values()) {
      if (pass.door === p.zone && pass.exp > now && pass.id !== p.id) this.send(p.ws, { t: "transit", cycle: pass.cycle, actor: pass.id, door: pass.door, dir: pass.dir, at: pass.at, exp: pass.exp });
    }
  }

  async doorMessage(p, msg) {
    const now = Date.now();
    if (!takeToken(p.doorBucket, DOOR_HZ, now, DOOR_BURST)) {
      this.send(p.ws, { t: "door", op: "denied", reason: "rate" });
      return;
    }
    if (msg.op === "ask") {
      if (!p.body || p.zone !== DOOR_ZONE) { this.send(p.ws, { t: "door", op: "denied", reason: "not-at-door" }); return; }
      if (p.door) { this.send(p.ws, { t: "door", op: "denied", reason: "already-waiting" }); return; }
      if (this.doorQueue.length >= MAX_PLAYERS) { this.send(p.ws, { t: "door", op: "denied", reason: "full" }); return; }
      p.door = { phase: "queued", dir: msg.dir, room: msg.room, at: now, exp: Number.MAX_SAFE_INTEGER };
      this.doorQueue.push(p.id);
      p.ws.serializeAttachment(this.attachment(p));
      if (!this.doorActive) this.grantDoor(now);
      else this.send(p.ws, { t: "door", op: "wait", ahead: Math.max(0, this.doorQueue.indexOf(p.id)) });
    } else if (msg.op === "go") {
      const a = this.doorActive;
      if (!a || a.id !== p.id || a.cycle !== msg.cycle || a.phase !== "grant" || a.exp <= now || !p.body || p.zone !== DOOR_ZONE) {
        this.send(p.ws, { t: "door", op: "denied", reason: "stale-grant" });
        return;
      }
      a.phase = p.door.phase = "active";
      a.startedAt = p.door.startedAt = now;
      a.exp = p.door.exp = now + DOOR_TRANSIT_MS;
      p.ws.serializeAttachment(this.attachment(p));
      this.send(p.ws, { t: "door", op: "started", cycle: a.cycle, exp: a.exp });
      this.broadcastZone(DOOR_ZONE, { t: "transit", cycle: a.cycle, actor: p.id, door: DOOR_ZONE, dir: a.dir, at: now, exp: a.exp });
    } else if (msg.op === "done") {
      if (this.doorActive && this.doorActive.id === p.id && this.doorActive.cycle === msg.cycle) this.finishDoor(now);
    } else if (msg.op === "cancel") {
      this.cancelDoor(p, now);
    } else if (msg.op === "pass") {
      if (!p.body || p.zone !== msg.door) { this.send(p.ws, { t: "door", op: "denied", reason: "wrong-room" }); return; }
      for (const pass of p.passes) this.doorPasses.delete(pass.cycle);
      const pass = { cycle: this.doorCycle(p), door: msg.door, dir: msg.dir, at: now, exp: now + DOOR_PASS_MS };
      p.passes = [pass];
      this.doorPasses.set(pass.cycle, { ...pass, id: p.id });
      p.ws.serializeAttachment(this.attachment(p));
      this.broadcastZone(msg.door, { t: "transit", cycle: pass.cycle, actor: p.id, door: pass.door, dir: pass.dir, at: pass.at, exp: pass.exp });
    }
    await this.scheduleAlarm();
  }

  grantDoor(now = Date.now()) {
    while (!this.doorActive && this.doorQueue.length) {
      const p = this.players.get(this.doorQueue.shift());
      if (!p || !p.body || p.zone !== DOOR_ZONE || !p.door || p.door.phase !== "queued") continue;
      const cycle = this.doorCycle(p), exp = now + DOOR_GRANT_MS;
      p.door = { ...p.door, phase: "grant", cycle, exp };
      this.doorActive = { ...p.door, id: p.id };
      p.ws.serializeAttachment(this.attachment(p));
      this.send(p.ws, { t: "door", op: "grant", cycle, exp });
    }
    for (let i = 0; i < this.doorQueue.length; i++) {
      const p = this.players.get(this.doorQueue[i]);
      if (p) this.send(p.ws, { t: "door", op: "wait", ahead: i });
    }
  }

  finishDoor(now = Date.now()) {
    const a = this.doorActive;
    if (!a) return;
    if (a.phase === "active") this.broadcastZone(DOOR_ZONE, { t: "transit-end", cycle: a.cycle });
    const p = this.players.get(a.id);
    if (p) { p.door = null; p.ws.serializeAttachment(this.attachment(p)); }
    this.doorActive = null;
    this.grantDoor(now);
  }

  cancelDoor(p, now = Date.now()) {
    if (!p.door) return;
    if (this.doorActive && this.doorActive.id === p.id) this.finishDoor(now);
    else {
      this.doorQueue = this.doorQueue.filter((id) => id !== p.id);
      p.door = null;
      p.ws.serializeAttachment(this.attachment(p));
      this.grantDoor(now);
    }
  }

  clearPasses(p) {
    for (const pass of p.passes || []) {
      this.doorPasses.delete(pass.cycle);
      this.broadcastZone(pass.door, { t: "transit-end", cycle: pass.cycle });
    }
    p.passes = [];
  }

  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (path.startsWith("/voice/")) return this.voiceRequest(path.slice("/voice/".length), request);
    if (request.headers.get("upgrade") !== "websocket") return new Response("Expected WebSocket", { status: 426 });
    const who = playerFromHeaders(request.headers);
    if (!who || !ownedBody(CAST, who.login, who.contributor)) return new Response("Contributors with an Ooga only", { status: 403 });

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server, [String(who.id)]);

    const older = this.players.get(who.id);
    if (older) this.evict(older, "replaced");
    if (this.players.size >= MAX_PLAYERS) {
      this.send(server, { t: "kick", reason: "full" });
      server.close(CLOSE_KICK, "full");
      return new Response(null, { status: 101, webSocket: client });
    }

    const spawn = spawnPoint(this.spawnSlot++);
    const p = this.record(server, { ...who, body: null, x: spawn.x, y: 0, z: spawn.z, yaw: spawn.yaw });
    server.serializeAttachment(this.attachment(p));
    // An owner arriving takes either body back from whoever holds it.
    const own = ownedBody(CAST, p.login, p.contributor);
    if (own) for (const o of this.players.values()) if (o.body && bodyName(o.body).toLowerCase() === own) this.release(o, "owner-here");
    this.players.set(p.id, p);

    const others = [];
    for (const o of this.players.values()) if (o !== p) others.push(this.view(o));
    this.send(server, { t: "welcome", you: this.view(p), players: others, tickHz: TICK_HZ, now: Date.now(), loopEpoch: this.loopEpoch, host: this.hostId, followers: this.followers, features: ["door"] });
    // A message of its own after welcome, so a page that does not know chat ignores it; empty after the room slept.
    this.send(server, { t: "chat-history", messages: this.chat.list() });
    this.broadcast({ t: "join", p: this.view(p) }, server);
    this.updateVoice();
    await this.ensureSweep();
    return new Response(null, { status: 101, webSocket: client });
  }

  byWs(ws) {
    const a = ws.deserializeAttachment();
    const p = a && this.players.get(a.id);
    return p && p.ws === ws ? p : null;
  }

  webSocketMessage(ws, message) {
    const p = this.byWs(ws);
    if (!p) return;
    if (!ownedBody(CAST, p.login, p.contributor)) { this.evict(p, "revoked"); return; }
    if (typeof message !== "string") {
      this.npcFrame(p, message);
      return;
    }
    const msg = parseClientMessage(typeof message === "string" ? message : "");
    if (msg === false) {
      this.drop(p, "protocol");
      ws.close(CLOSE_PROTOCOL, "unreadable message");
      return;
    }
    p.seenAt = Date.now();
    if (!msg) return;
    if (msg.t === "pose") {
      if (!takeToken(p.bucket, MOVE_HZ, p.seenAt)) return;
      p.x = msg.x; p.y = msg.y; p.z = msg.z; p.yaw = msg.yaw;
      if (msg.g && p.body && p.body.startsWith("gorilla:")) p.g = msg.g;
      this.dirty = true;
      this.scheduleFlush();
    } else if (msg.t === "hub") {
      if (msg.on === p.inHub) return;
      p.inHub = msg.on;
      this.electHost();
      // A page arriving on the island catches up with the NPCs at once rather than at the next frame.
      if (p.inHub && p.id !== this.hostId && this.lastNpc) this.send(p.ws, this.lastNpc);
    } else if (msg.t === "zone") {
      if (msg.name === p.zone) return;
      if (msg.name !== DOOR_ZONE) this.cancelDoor(p);
      if (msg.name !== p.zone) this.clearPasses(p);
      p.zone = msg.name;
      p.pokerVoice = null;
      this.broadcast({ t: "zone", id: p.id, name: p.zone });
      // The page let go of every voice when it moved, so it always hears where it is now, changed list or not.
      p.sent = null;
      this.updateVoice();
      this.replayDoor(p);
    } else if (msg.t === "poker-voice") {
      if (p.zone !== "ember-den" || msg.table === p.pokerVoice) return;
      p.pokerVoice = msg.table;
      p.sent = null;
      this.updateVoice();
    } else if (msg.t === "hp") {
      if (msg.v === p.hp && msg.ko === p.ko) return;
      if (!takeToken(p.hpBucket, HP_HZ, p.seenAt)) return;
      p.hp = msg.v;
      p.ko = msg.ko;
      this.broadcast({ t: "hp", id: p.id, v: p.hp, ko: p.ko }, p.ws);
    } else if (msg.t === "mute") {
      if (msg.on === p.muted) return;
      p.muted = msg.on;
      this.voiceState(p);
    } else if (msg.t === "chat") {
      // Nothing in the attachment changes.
      return this.say(p, msg.text, msg.clientId);
    } else if (msg.t === "door") {
      return this.doorMessage(p, msg);
    } else if (msg.t === "body") {
      if (msg.name === p.body) return;
      const refusal = claimRefusal(CAST, p.login, msg.name, this.players.values(), p.contributor);
      if (refusal) {
        this.send(ws, { t: "release", name: msg.name, reason: refusal });
        if (p.body === null) return;
        p.body = null;
      } else {
        p.body = msg.name;
      }
      if (!p.body) { this.cancelDoor(p); this.clearPasses(p); }
      // Another body, or none: its normalized health is reported afresh.
      p.hp = 100;
      p.ko = false;
      p.g = null;
      this.broadcast({ t: "body", id: p.id, name: p.body });
      this.updateVoice();
    }
    ws.serializeAttachment(this.attachment(p));
  }

  // The prototype's note stands: on this compatibility date close handlers must not call ws.close().
  webSocketClose(ws) {
    const p = this.byWs(ws);
    if (p) this.drop(p, "closed");
  }

  webSocketError(ws) {
    const p = this.byWs(ws);
    if (p) this.drop(p, "error");
  }

  drop(p, reason) {
    if (this.players.get(p.id) !== p) return;
    this.cancelDoor(p);
    this.clearPasses(p);
    this.players.delete(p.id);
    this.broadcast({ t: "leave", id: p.id, reason });
    this.electHost();
    this.updateVoice();
    if (!this.players.size && this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = 0;
    }
  }

  release(p, reason) {
    this.cancelDoor(p);
    this.clearPasses(p);
    this.send(p.ws, { t: "release", name: p.body, reason });
    p.body = null;
    p.g = null;
    p.ws.serializeAttachment(this.attachment(p));
    this.broadcast({ t: "body", id: p.id, name: null });
    this.updateVoice();
  }

  // An explicit kick before the close: a server-initiated close alone can leave the client in CLOSING.
  evict(p, reason) {
    this.drop(p, reason);
    this.send(p.ws, { t: "kick", reason });
    try {
      p.ws.close(CLOSE_KICK, reason);
    } catch {
      // Already closed.
    }
  }

  // One snapshot at most every 1/TICK_HZ while poses arrive, and nothing pending once they stop, so the
  // room can hibernate between bursts (a running interval would keep it awake, and billed, for good).
  scheduleFlush() {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = 0;
      this.snapshot();
    }, 1000 / TICK_HZ);
  }

  snapshot() {
    if (!this.dirty) return;
    this.dirty = false;
    const ps = [], gs = [];
    for (const p of this.players.values()) {
      ps.push(p.id, p.x, p.y, p.z, p.yaw);
      if (p.g) gs.push(p.id, ...p.g);
    }
    this.broadcast(gs.length ? { t: "state", now: Date.now(), ps, gs } : { t: "state", now: Date.now(), ps });
  }

  // A line from a player, named by the session's login and display name; over the rate its sender is told.
  async say(p, text, clientId) {
    // Scope retry ids to the authenticated account, never to a socket or client-supplied identity.
    const key = clientId === undefined ? null : `${p.id}:${clientId}`;
    // Only the fingerprint outlives the visible ring. After the async hash, the identity check,
    // dedup lookup and acceptance run synchronously, so simultaneous retries cannot both accept.
    const fingerprint = key ? await sha256Hex(text) : null;
    if (this.players.get(p.id) !== p) return;
    if (key && this.chatAccepted.has(key)) {
      this.send(p.ws, this.chatAccepted.get(key) === fingerprint
        ? { t: "chat-ack", clientId } : { t: "chat-rejected", clientId, reason: "conflict" });
      return;
    }
    if (!p.chatBucket) p.chatBucket = this.chatBucketFor(p.id, p.seenAt);
    if (!p.chatBucket || !takeToken(p.chatBucket, CHAT_HZ, p.seenAt, CHAT_BURST)) {
      this.send(p.ws, { t: "chat-rejected", ...(clientId === undefined ? {} : { clientId }), reason: "rate" });
      return;
    }
    const at = Date.now();
    // Ids follow the clock and only grow, so a restarted room does not reuse one, as voice counts do not.
    this.chatId = Math.max(at, this.chatId + 1);
    const line = { id: this.chatId, at, login: p.login, name: p.display, text };
    if (key) {
      this.chatAccepted.set(key, fingerprint);
      if (this.chatAccepted.size > CHAT_RETRY_KEEP) this.chatAccepted.delete(this.chatAccepted.keys().next().value);
    }
    this.chat.push(line);
    this.broadcast({ t: "chat", ...line });
    if (key) this.send(p.ws, { t: "chat-ack", clientId });
  }

  // Also after any page's `hub` flag changes: the host sends frames only while someone follows.
  electHost() {
    const id = electHost(this.players.values());
    const followers = npcFollowers(this.players.values(), id);
    if (id === this.hostId && followers === this.followers) return;
    this.hostId = id;
    this.followers = followers;
    if (!id) this.lastNpc = null;
    this.broadcast({ t: "host", id, followers });
  }

  // A binary frame is the NPC host's poses: taken only from the current host, capped in size and rate,
  // and relayed unchanged to every other page showing the island.
  npcFrame(p, data) {
    if (p.id !== this.hostId || !p.inHub) return;
    if (!(data instanceof ArrayBuffer) || data.byteLength > NPC_FRAME_MAX) return;
    if (!takeToken(p.npcBucket, NPC_HZ, Date.now())) return;
    p.seenAt = Date.now();
    this.lastNpc = data;
    for (const q of this.players.values()) if (q !== p && q.inHub) this.send(q.ws, data);
  }

  // Tells each player whom to hear, with each one's publication (`gens`: a microphone published again is
  // pulled again), only when that changed since the list the player last got (`sent`, kept through a
  // hibernation; null sends regardless). Called wherever it can change: a join or leave, a body or zone, a
  // voice session opened, announced or left.
  updateVoice() {
    if (!this.sfu) return;
    const desired = voicePeers([...this.players.values()]);
    for (const p of this.players.values()) {
      const peers = desired.get(p.id) || [];
      const gens = peers.map((id) => this.players.get(id).voice.gen || 0);
      const sig = peers.map((id, i) => `${id}:${gens[i]}`).join(",");
      if (p.sent === sig) continue;
      p.sent = sig;
      p.ws.serializeAttachment(this.attachment(p));
      this.send(p.ws, { t: "voice", peers, gens });
    }
  }

  // Every other page's roster shows who is in voice (a live microphone) and who muted it: sent on a change only.
  voiceState(p) {
    this.broadcast({ t: "vstate", id: p.id, voice: !!p.voice.track, muted: p.muted }, p.ws);
  }

  // /voice/<op> from the Worker, which checked the session and set x-player-id. Ops: session (a publish
  // or receive session), publish (the mic's offer), live (the publishing connection is up: only now is the
  // mic announced, since pulling a publication before it connects fails), pull (peers the room allows),
  // renegotiate, close (dropped peers' tracks), leave (forget this player's sessions).
  async voiceRequest(op, request) {
    const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
    if (!this.sfu) return json({ error: "voice is not configured" }, 503);
    const p = this.players.get(Number(request.headers.get("x-player-id")));
    if (!p) return json({ error: "join the island first" }, 409);
    if (!ownedBody(CAST, p.login, p.contributor)) {
      this.evict(p, "revoked");
      return json({ error: "contributors with an Ooga only" }, 403);
    }
    let body = {};
    try {
      body = await request.json();
    } catch {
      // No body.
    }
    const was = !!p.voice.track;
    try {
      if (op === "session") {
        const kind = body.kind === "pub" ? "pub" : "sub";
        const { sessionId } = await this.sfu.newSession();
        p.voice[kind] = sessionId;
        if (kind === "pub") p.voice.track = p.voice.pending = null;
        p.ws.serializeAttachment(this.attachment(p));
        this.updateVoice();
        if (was && !p.voice.track) this.voiceState(p);
        return json({ ok: true });
      }
      if (op === "publish") {
        if (!p.voice.pub || typeof body.sdp !== "string" || typeof body.mid !== "string") return json({ error: "bad publish" }, 400);
        const res = await this.sfu.newTracks(p.voice.pub, {
          sessionDescription: { type: "offer", sdp: body.sdp },
          tracks: [{ location: "local", mid: body.mid, trackName: VOICE_TRACK }],
        });
        const t = res.tracks && res.tracks[0];
        if (!t || t.errorCode) return json({ error: (t && t.errorDescription) || "publish failed" }, 502);
        p.voice.pending = VOICE_TRACK;
        p.ws.serializeAttachment(this.attachment(p));
        return json({ sessionDescription: res.sessionDescription });
      }
      if (op === "live") {
        if (!p.voice.pub || !p.voice.pending) return json({ error: "nothing published" }, 400);
        p.voice.track = p.voice.pending;
        // A new count for every microphone that goes live, never reused: whoever heard an older one pulls this one.
        p.voice.gen = Math.max(Date.now(), (p.voice.gen || 0) + 1);
        p.ws.serializeAttachment(this.attachment(p));
        this.updateVoice();
        if (!was) this.voiceState(p);
        return json({ ok: true });
      }
      if (op === "pull") {
        if (!p.voice.sub || !Array.isArray(body.ids)) return json({ error: "bad pull" }, 400);
        const sub = p.voice.sub;
        const allowed = new Set(voicePeers([...this.players.values()]).get(p.id) || []);
        const tracks = [], requested = new Map();
        for (const id of body.ids.slice(0, 64)) {
          const q = this.players.get(id);
          if (!allowed.has(id) || !q || !q.voice.pub || !q.voice.track) continue;
          tracks.push({ location: "remote", sessionId: q.voice.pub, trackName: q.voice.track });
          requested.set(q.voice.pub, { id, track: q.voice.track });
        }
        if (!tracks.length) return json({ tracks: [], requiresImmediateRenegotiation: false });
        const res = await this.sfu.newTracks(sub, { tracks });
        // A zone, body, socket or publication can change while the SFU request is in flight. Close every
        // track that is no longer eligible before its descriptor reaches the page.
        const current = this.players.get(p.id) === p && p.voice.sub === sub;
        const allowedNow = current ? new Set(voicePeers([...this.players.values()]).get(p.id) || []) : new Set();
        const kept = [], close = [];
        for (const t of res.tracks || []) {
          const asked = requested.get(t.sessionId), q = asked && this.players.get(asked.id);
          if (current && asked && allowedNow.has(asked.id) && q && q.voice.pub === t.sessionId && q.voice.track === asked.track) {
            kept.push({ id: asked.id, mid: t.mid, errorCode: t.errorCode });
          } else if (typeof t.mid === "string") close.push(t.mid);
        }
        if (close.length) await this.sfu.closeTracks(sub, close);
        if (!current) return json({ error: "voice membership changed" }, 409);
        return json({
          tracks: kept,
          sessionDescription: res.sessionDescription,
          requiresImmediateRenegotiation: !!res.requiresImmediateRenegotiation,
        });
      }
      if (op === "renegotiate") {
        if (!p.voice.sub || typeof body.sdp !== "string") return json({ error: "bad renegotiate" }, 400);
        await this.sfu.renegotiate(p.voice.sub, body.sdp);
        return json({ ok: true });
      }
      if (op === "close") {
        if (!p.voice.sub || !Array.isArray(body.mids)) return json({ error: "bad close" }, 400);
        const mids = body.mids.filter((m) => typeof m === "string").slice(0, 64);
        if (mids.length) await this.sfu.closeTracks(p.voice.sub, mids);
        return json({ ok: true });
      }
      if (op === "leave") {
        p.voice = { pub: null, sub: null, track: null, pending: null, gen: p.voice.gen || 0 };
        p.ws.serializeAttachment(this.attachment(p));
        this.updateVoice();
        if (was) this.voiceState(p);
        return json({ ok: true });
      }
      return json({ error: "unknown voice op" }, 404);
    } catch (err) {
      console.warn(`voice ${op} failed for ${p.id}: ${err.message}`);
      return json({ error: "the voice service did not answer" }, 502);
    }
  }

  async ensureSweep() {
    if (!this.sweepAt) {
      this.sweepAt = Date.now() + SWEEP_MS;
      await this.ctx.storage.put("sweepAt", this.sweepAt);
    }
    await this.scheduleAlarm();
  }

  nextDoorExpiry() {
    let at = this.doorActive ? this.doorActive.exp : Infinity;
    for (const pass of this.doorPasses.values()) at = Math.min(at, pass.exp);
    return at;
  }

  async scheduleAlarm() {
    if (!this.players.size) return;
    const next = Math.min(this.sweepAt || Date.now() + SWEEP_MS, this.nextDoorExpiry());
    const set = await this.ctx.storage.getAlarm();
    if (set === null || set > next) await this.ctx.storage.setAlarm(next);
  }

  expireDoors(now) {
    if (this.doorActive && this.doorActive.exp <= now) this.finishDoor(now);
    for (const [cycle, pass] of [...this.doorPasses]) if (pass.exp <= now) {
      this.doorPasses.delete(cycle);
      const p = this.players.get(pass.id);
      if (p) {
        p.passes = p.passes.filter((x) => x.cycle !== cycle);
        p.ws.serializeAttachment(this.attachment(p));
      }
      this.broadcastZone(pass.door, { t: "transit-end", cycle });
    }
  }

  // Sockets silent past STALE_MS, auto-answered pings included, are evicted as stale.
  async alarm() {
    const now = Date.now();
    const sweepDue = !this.sweepAt || now >= this.sweepAt;
    this.expireDoors(now);
    // A cancelled lease can leave its earlier alarm in place. Before the recorded sweep deadline that wake only
    // expires door state and reschedules; it must not turn account reads and stale checks into a high-frequency poll.
    if (sweepDue) {
      for (const p of [...this.players.values()]) {
        if (!ownedBody(CAST, p.login, p.contributor)) { this.evict(p, "revoked"); continue; }
        // The existing operator D1 ban also ends active presence at the next successful sweep.
        // Retry on a later alarm if D1 is unavailable; never infer a ban from a failed read.
        if (this.env.DB) {
          let player;
          try { player = await getPlayer(this.env.DB, p.id); } catch { /* Retry the account check next sweep; stale eviction still applies. */ }
          if (this.players.get(p.id) !== p) continue;
          if (player !== undefined && (!player || player.banned_at)) { this.evict(p, "revoked"); continue; }
        }
        const pinged = this.ctx.getWebSocketAutoResponseTimestamp(p.ws);
        const last = Math.max(p.seenAt, pinged ? pinged.getTime() : 0);
        if (now - last > STALE_MS) this.evict(p, "stale");
      }
      this.sweepAt = now + SWEEP_MS;
      await this.ctx.storage.put("sweepAt", this.sweepAt);
    }
    if (this.players.size) await this.ctx.storage.setAlarm(Math.min(this.sweepAt, this.nextDoorExpiry()));
  }
}
