// The island room: one Durable Object holding every signed-in player's socket. The Worker is its
// only door (`/room`), and it hands over who the player is in x-player-* headers after checking the
// session; nothing a client sends can change its identity. Ported from the OBL-Audio prototype:
// hibernatable sockets with attachments, a 15 Hz snapshot while anything moved, an alarm sweeping
// silent sockets, and one socket per player, where a newer one kicks the older with `replaced`.
// Every claim on an Ooga passes `claimRefusal` against the cast the build writes (characters.gen.json).

import { DurableObject } from "cloudflare:workers";
import {
  CLOSE_KICK, CLOSE_PROTOCOL, MAX_PLAYERS, MOVE_HZ, STALE_MS, SWEEP_MS, TICK_HZ,
  castIndex, claimRefusal, parseClientMessage, playerFromHeaders, spawnPoint, takeToken,
} from "./protocol.js";
import CAST_ROWS from "./characters.gen.json";

const CAST = castIndex(CAST_ROWS);

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.players = new Map();
    this.spawnSlot = 0;
    this.dirty = false;
    this.tick = 0;
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
    // The pile's sound loop started once, for good: every page plays it at (now - loopEpoch), so all
    // hear the same crackle at the same moment. Stored, so a woken or redeployed room keeps the phase.
    this.loopEpoch = 0;
    ctx.blockConcurrencyWhile(async () => {
      this.loopEpoch = (await ctx.storage.get("loopEpoch")) || Date.now();
      await ctx.storage.put("loopEpoch", this.loopEpoch);
    });
    // A woken room rebuilds its roster from the attachments its sockets carry.
    for (const ws of ctx.getWebSockets()) {
      const a = ws.deserializeAttachment();
      if (a) this.players.set(a.id, this.record(ws, a));
    }
    if (this.players.size) this.startTick();
  }

  record(ws, a) {
    return { ws, ...a, bucket: { tokens: MOVE_HZ, at: Date.now() }, seenAt: Date.now() };
  }

  attachment(p) {
    return { id: p.id, login: p.login, display: p.display, body: p.body, x: p.x, y: p.y, z: p.z, yaw: p.yaw };
  }

  view(p) {
    return { id: p.id, login: p.login, display: p.display, body: p.body, x: p.x, y: p.y, z: p.z, yaw: p.yaw };
  }

  send(ws, msg) {
    try {
      ws.send(typeof msg === "string" ? msg : JSON.stringify(msg));
    } catch {
      // A socket closing under us is dropped by its close event.
    }
  }

  broadcast(msg, except = null) {
    const text = JSON.stringify(msg);
    for (const p of this.players.values()) if (p.ws !== except) this.send(p.ws, text);
  }

  async fetch(request) {
    if (request.headers.get("upgrade") !== "websocket") return new Response("Expected WebSocket", { status: 426 });
    const who = playerFromHeaders(request.headers);
    if (!who) return new Response("Forbidden", { status: 403 });

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
    // An owner arriving takes their Ooga back from whoever holds it.
    const own = CAST.handleOf.get(p.login.toLowerCase());
    if (own) for (const o of this.players.values()) if (o.body && o.body.toLowerCase() === own) this.release(o, "owner-here");
    this.players.set(p.id, p);

    const others = [];
    for (const o of this.players.values()) if (o !== p) others.push(this.view(o));
    this.send(server, { t: "welcome", you: this.view(p), players: others, tickHz: TICK_HZ, now: Date.now(), loopEpoch: this.loopEpoch });
    this.broadcast({ t: "join", p: this.view(p) }, server);
    this.startTick();
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
      this.dirty = true;
    } else if (msg.t === "body") {
      if (msg.name === p.body) return;
      const refusal = claimRefusal(CAST, p.login, msg.name, this.players.values());
      if (refusal) {
        this.send(ws, { t: "release", name: msg.name, reason: refusal });
        if (p.body === null) return;
        p.body = null;
      } else {
        p.body = msg.name;
      }
      this.broadcast({ t: "body", id: p.id, name: p.body });
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
    this.players.delete(p.id);
    this.broadcast({ t: "leave", id: p.id, reason });
    if (!this.players.size) this.stopTick();
  }

  release(p, reason) {
    this.send(p.ws, { t: "release", name: p.body, reason });
    p.body = null;
    p.ws.serializeAttachment(this.attachment(p));
    this.broadcast({ t: "body", id: p.id, name: null });
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

  startTick() {
    if (this.tick) return;
    this.tick = setInterval(() => this.snapshot(), 1000 / TICK_HZ);
  }

  stopTick() {
    if (this.tick) clearInterval(this.tick);
    this.tick = 0;
  }

  snapshot() {
    if (!this.dirty) return;
    this.dirty = false;
    const ps = [];
    for (const p of this.players.values()) ps.push(p.id, p.x, p.y, p.z, p.yaw);
    this.broadcast({ t: "state", now: Date.now(), ps });
  }

  async ensureSweep() {
    if ((await this.ctx.storage.getAlarm()) === null) await this.ctx.storage.setAlarm(Date.now() + SWEEP_MS);
  }

  // Sockets silent past STALE_MS, auto-answered pings included, are evicted as stale.
  async alarm() {
    const now = Date.now();
    for (const p of [...this.players.values()]) {
      const pinged = this.ctx.getWebSocketAutoResponseTimestamp(p.ws);
      const last = Math.max(p.seenAt, pinged ? pinged.getTime() : 0);
      if (now - last > STALE_MS) this.evict(p, "stale");
    }
    if (this.players.size) await this.ctx.storage.setAlarm(now + SWEEP_MS);
  }
}
