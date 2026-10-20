// The Timechain Sphere doorway through the real Room with a small Cloudflare host mock.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import * as protocol from "../src/protocol.js";
import { sha256Hex } from "../src/crypto.js";
import { getPlayer } from "../src/db.js";

const host = () => {
  let now = 100000;
  const accepted = [], alarms = [];
  const socket = () => ({
    sent: [], closed: null, store: null,
    send(text) { this.sent.push(JSON.parse(text)); },
    close(code, reason) { this.closed = { code, reason }; },
    serializeAttachment(value) { this.store = JSON.parse(JSON.stringify(value)); },
    deserializeAttachment() { return this.store; },
  });
  class WebSocketPair { constructor() { this[0] = socket(); this[1] = socket(); } }
  class Response {
    constructor(body, init = {}) { this.body = body; this.status = init.status; this.webSocket = init.webSocket; }
    async json() { return JSON.parse(this.body); }
  }
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const source = readFileSync(new URL("../src/room.js", import.meta.url), "utf8")
    .replace(/import\s+[\s\S]*?from\s+"[^"]+";/g, "")
    .replace("export class Room", "class Room") + "\nglobalThis.Room = Room;";
  const context = {
    ...protocol, sha256Hex, getPlayer, sfuClient: () => null,
    CAST_ROWS: [{ handle: "a", github_login: "a" }, { handle: "b", github_login: "b" }, { handle: "c", github_login: "c" }],
    DurableObject: class { constructor(ctx, env) { this.ctx = ctx; this.env = env; } },
    WebSocketPair, Response, WebSocketRequestResponsePair: class {}, URL, Date: Clock, Map, Set, setTimeout, clearTimeout, console,
  };
  runInNewContext(source, context);
  const stored = new Map();
  const ctx = {
    setWebSocketAutoResponse() {}, blockConcurrencyWhile: (fn) => fn(), acceptWebSocket: (ws) => accepted.push(ws),
    getWebSockets: () => accepted.filter((ws) => !ws.closed), getWebSocketAutoResponseTimestamp: () => null,
    storage: {
      get: async (key) => Array.isArray(key) ? Object.fromEntries(key.filter((k) => stored.has(k)).map((k) => [k, stored.get(k)])) : stored.get(key),
      put: async (key, value) => stored.set(key, value), getAlarm: async () => alarms.length ? alarms.at(-1) : null,
      setAlarm: async (at) => alarms.push(at),
    },
  };
  const room = () => new context.Room(ctx, {});
  const join = async (r, id, login) => {
    const before = accepted.length;
    await r.fetch({ url: "https://island.invalid/room", headers: new Headers({ upgrade: "websocket", "x-player-id": String(id), "x-player-login": login, "x-player-contributor": "0" }) });
    return accepted[before];
  };
  const send = (r, ws, msg) => r.webSocketMessage(ws, JSON.stringify(msg));
  const enter = async (r, ws, name, zone = "sphere") => {
    await send(r, ws, { t: "body", name });
    await send(r, ws, { t: "pose", x: 1, y: 2, z: 3, yaw: 0 });
    await send(r, ws, { t: "zone", name: zone });
  };
  return { room, join, send, enter, accepted, alarms, advance: (ms) => { now += ms; } };
};

const messages = (ws, t, op) => ws.sent.filter((m) => m.t === t && (op === undefined || m.op === op));

test("the exterior doorway is FIFO, starts only after go, and releases on completion", async () => {
  const h = host(), r = h.room();
  const a = await h.join(r, 1, "a"), b = await h.join(r, 2, "b");
  await h.enter(r, a, "a"); await h.enter(r, b, "b");
  await h.send(r, a, { t: "door", op: "ask", dir: "in", room: 7 });
  await h.send(r, b, { t: "door", op: "ask", dir: "out", room: 2 });
  const grantA = messages(a, "door", "grant").at(-1);
  assert.ok(grantA && !messages(a, "transit").length);
  assert.equal(messages(b, "door", "wait").at(-1).ahead, 0);
  await h.send(r, a, { t: "door", op: "go", cycle: grantA.cycle });
  const started = messages(a, "door", "started").at(-1);
  assert.ok(started.exp > grantA.exp, "the crossing receives its own full lease");
  assert.equal(messages(b, "transit").at(-1).actor, 1);
  await h.send(r, a, { t: "door", op: "done", cycle: grantA.cycle });
  assert.equal(messages(b, "transit-end").at(-1).cycle, grantA.cycle);
  assert.ok(messages(b, "door", "grant").length, "the next request is granted immediately");
});

test("leases expire by alarm, disconnects release the doorway, and room transits stay in one room", async () => {
  const h = host(), r = h.room();
  const a = await h.join(r, 1, "a"), b = await h.join(r, 2, "b"), c = await h.join(r, 3, "c");
  await h.enter(r, a, "a"); await h.enter(r, b, "b"); await h.enter(r, c, "c");
  await h.send(r, a, { t: "door", op: "ask", dir: "in", room: 1 });
  await h.send(r, b, { t: "door", op: "ask", dir: "in", room: 2 });
  h.advance(protocol.DOOR_GRANT_MS + 1);
  await r.alarm();
  assert.ok(messages(b, "door", "grant").length, "an unused grant lapses without an idle timer");
  r.webSocketClose(b);
  assert.equal(r.doorActive, null, "the active owner cannot strand the doorway on disconnect");

  await h.send(r, a, { t: "zone", name: "sphere-7" });
  await h.send(r, a, { t: "door", op: "pass", door: "sphere-7", dir: "in" });
  await h.send(r, c, { t: "zone", name: "sphere-8" });
  assert.equal(messages(c, "transit").filter((m) => m.door === "sphere-7").length, 0);
  await h.send(r, c, { t: "zone", name: "sphere-7" });
  assert.equal(messages(c, "transit").at(-1).door, "sphere-7", "a late observer receives the active transit on entering that exact room");
});

test("a cancelled door alarm does not pull the ordinary account sweep forward", async () => {
  const h = host(), r = h.room(), a = await h.join(r, 1, "a");
  await h.enter(r, a, "a");
  const sweepAt = r.sweepAt;
  await h.send(r, a, { t: "door", op: "ask", dir: "in", room: 1 });
  await h.send(r, a, { t: "door", op: "cancel" });
  h.advance(protocol.DOOR_GRANT_MS + 1);
  await r.alarm();
  assert.equal(r.sweepAt, sweepAt);
});

test("a hibernated room reconstructs its active lease and in-flight room transit", async () => {
  const h = host(), r = h.room();
  const a = await h.join(r, 1, "a"), b = await h.join(r, 2, "b");
  await h.enter(r, a, "a"); await h.enter(r, b, "b");
  await h.send(r, a, { t: "door", op: "ask", dir: "in", room: 4 });
  const grant = messages(a, "door", "grant").at(-1);
  await h.send(r, a, { t: "door", op: "go", cycle: grant.cycle });
  const woken = h.room();
  assert.equal(woken.doorActive.id, 1);
  assert.equal(woken.doorActive.phase, "active");
  await h.send(woken, b, { t: "zone", name: "sphere" });
  assert.equal(messages(b, "transit").at(-1).cycle, grant.cycle);
});

test("a voice pull is closed if its room membership changes while the SFU answers", async () => {
  const h = host(), r = h.room();
  const a = await h.join(r, 1, "a"), b = await h.join(r, 2, "b");
  await h.enter(r, a, "a", "sphere-1"); await h.enter(r, b, "b", "sphere-1");
  const pa = r.players.get(1), pb = r.players.get(2);
  pa.voice = { pub: "pub-a", sub: "sub-a", track: "mic", gen: 1 };
  pb.voice = { pub: "pub-b", sub: "sub-b", track: "mic", gen: 1 };
  let answer, began;
  const ready = new Promise((resolve) => { answer = resolve; });
  const started = new Promise((resolve) => { began = resolve; });
  const closed = [];
  r.sfu = {
    newTracks: async () => { began(); return ready; },
    closeTracks: async (session, mids) => closed.push({ session, mids }),
  };
  const pending = r.voiceRequest("pull", { headers: new Headers({ "x-player-id": "1" }), json: async () => ({ ids: [2] }) });
  await started;
  await h.send(r, a, { t: "zone", name: "sphere-2" });
  answer({ tracks: [{ sessionId: "pub-b", mid: "7" }], sessionDescription: { type: "answer", sdp: "x" } });
  const response = await pending, body = await response.json();
  assert.deepEqual(body.tracks, []);
  assert.equal(closed.length, 1);
  assert.equal(closed[0].session, "sub-a");
  assert.equal(Array.from(closed[0].mids).join(","), "7");
});
