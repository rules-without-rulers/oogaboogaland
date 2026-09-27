// Pure checks on the room's wire format and limits: no Durable Object, no sockets.
import { test } from "node:test";
import assert from "node:assert/strict";
import { BOUND_XZ, MESSAGE_MAX, MOVE_HZ, parseClientMessage, playerFromHeaders, spawnPoint, takeToken } from "../src/protocol.js";

test("poses inside the bounds are accepted, rounded and their yaw wrapped", () => {
  const m = parseClientMessage(JSON.stringify({ t: "pose", x: 1.23456, y: -7, z: 3, yaw: 7 }));
  assert.equal(m.t, "pose");
  assert.equal(m.x, 1.235);
  assert.ok(Math.abs(m.yaw - (7 - 2 * Math.PI)) < 1e-3);
});

test("poses out of bounds or not numbers are ignored, not fatal", () => {
  for (const bad of [{ x: BOUND_XZ + 1, y: 0, z: 0, yaw: 0 }, { x: 0, y: 500, z: 0, yaw: 0 }, { x: "1", y: 0, z: 0, yaw: 0 }, { x: 0, y: 0, z: 0 }]) {
    assert.equal(parseClientMessage(JSON.stringify({ t: "pose", ...bad })), null, JSON.stringify(bad));
  }
});

test("a body is an Ooga name or null; anything else is ignored", () => {
  assert.deepEqual(parseClientMessage('{"t":"body","name":"w-s-bitcoin"}'), { t: "body", name: "w-s-bitcoin" });
  assert.deepEqual(parseClientMessage('{"t":"body","name":null}'), { t: "body", name: null });
  assert.equal(parseClientMessage('{"t":"body","name":"<b>"}'), null);
  assert.equal(parseClientMessage('{"t":"body","name":""}'), null);
});

test("unknown types are ignored; unreadable or oversized frames close the socket", () => {
  assert.equal(parseClientMessage('{"t":"teleport","id":1}'), null);
  assert.equal(parseClientMessage("{nope"), false);
  assert.equal(parseClientMessage("[1,2]"), false);
  assert.equal(parseClientMessage(" ".repeat(MESSAGE_MAX + 1)), false);
  assert.equal(parseClientMessage(undefined), false);
});

test("the move bucket allows MOVE_HZ a second and refills with time", () => {
  const b = { tokens: MOVE_HZ, at: 0 };
  let spent = 0;
  for (let i = 0; i < 100; i++) if (takeToken(b, MOVE_HZ, 0)) spent++;
  assert.equal(spent, MOVE_HZ);
  assert.ok(!takeToken(b, MOVE_HZ, 10));
  assert.ok(takeToken(b, MOVE_HZ, 60));
});

test("spawn slots ring the pile, eight apart, facing it", () => {
  const seen = new Set();
  for (let i = 0; i < 8; i++) {
    const s = spawnPoint(i);
    assert.ok(Math.abs(Math.hypot(s.x, s.z) - 3.5) < 1e-2);
    seen.add(`${s.x},${s.z}`);
  }
  assert.equal(seen.size, 8);
  assert.deepEqual(spawnPoint(8), spawnPoint(0));
});

test("identity comes only from the Worker's headers, all or nothing", () => {
  const h = (o) => new Headers(o);
  assert.deepEqual(playerFromHeaders(h({ "x-player-id": "42", "x-player-login": "ooga" })), { id: 42, login: "ooga", display: "ooga" });
  assert.equal(playerFromHeaders(h({ "x-player-login": "ooga" })), null);
  assert.equal(playerFromHeaders(h({ "x-player-id": "abc", "x-player-login": "ooga" })), null);
  assert.equal(playerFromHeaders(h({ "x-player-id": "42" })), null);
});
