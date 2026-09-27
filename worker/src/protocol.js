// The room's wire format and the limits it enforces, as pure functions the tests can reach.
//
// Client → room:  { t: "pose", x, y, z, yaw }   the driven Ooga's feet and heading, at most MOVE_HZ
//                 { t: "body", name }            the Ooga being driven, or null when driving none
// Room → client:  welcome { you, players, tickHz, now }, join { p }, leave { id, reason },
//                 body { id, name }, state { now, ps: [id, x, y, z, yaw, ...] }, kick { reason }
// "ping" answers "pong" without waking the room (setWebSocketAutoResponse).

export const TICK_HZ = 15;
export const MOVE_HZ = 20;
export const MAX_PLAYERS = 32;
export const MESSAGE_MAX = 256;
export const STALE_MS = 30000;
export const SWEEP_MS = 5000;
// Generous bounds around the hub: jetpack flight reaches about 140 out and 72 up, falls end at -120.
export const BOUND_XZ = 160;
export const BOUND_Y_MIN = -130;
export const BOUND_Y_MAX = 100;
export const BODY_NAME = /^[A-Za-z0-9_.-]{1,40}$/;
// Close codes: 4000 follows a `kick` (replaced, stale, full); 4400 is a message the room cannot read.
export const CLOSE_KICK = 4000;
export const CLOSE_PROTOCOL = 4400;

const finite = (v) => typeof v === "number" && Number.isFinite(v);
const round = (v) => Math.round(v * 1000) / 1000;

/** A parsed client message, `null` for one to ignore, or `false` for one that should close the socket. */
export const parseClientMessage = (text) => {
  if (typeof text !== "string" || text.length > MESSAGE_MAX) return false;
  let msg;
  try {
    msg = JSON.parse(text);
  } catch {
    return false;
  }
  if (!msg || typeof msg !== "object" || Array.isArray(msg)) return false;
  if (msg.t === "pose") {
    const { x, y, z, yaw } = msg;
    if (!finite(x) || !finite(y) || !finite(z) || !finite(yaw)) return null;
    if (Math.abs(x) > BOUND_XZ || Math.abs(z) > BOUND_XZ || y < BOUND_Y_MIN || y > BOUND_Y_MAX) return null;
    return { t: "pose", x: round(x), y: round(y), z: round(z), yaw: round(Math.atan2(Math.sin(yaw), Math.cos(yaw))) };
  }
  if (msg.t === "body") {
    if (msg.name === null) return { t: "body", name: null };
    return typeof msg.name === "string" && BODY_NAME.test(msg.name) ? { t: "body", name: msg.name } : null;
  }
  return null;
};

/** A token bucket per player: `rate` a second, bursting to `rate`. Mutates and answers whether one is spent. */
export const takeToken = (bucket, rate, now) => {
  bucket.tokens = Math.min(rate, bucket.tokens + (now - bucket.at) * rate / 1000);
  bucket.at = now;
  if (bucket.tokens < 1) return false;
  bucket.tokens -= 1;
  return true;
};

/** Eight spawn slots on a ring round the pile, so arrivals do not stand in one another. */
export const spawnPoint = (slot) => {
  const a = (slot % 8) * Math.PI / 4;
  return { x: round(Math.sin(a) * 3.5), z: round(Math.cos(a) * 3.5), yaw: round(Math.atan2(-Math.sin(a), -Math.cos(a))) };
};

/** The identity the Worker vouched for, read from its headers; null when any part is missing. */
export const playerFromHeaders = (headers) => {
  const id = Number(headers.get("x-player-id"));
  const login = headers.get("x-player-login");
  if (!Number.isSafeInteger(id) || id <= 0 || !login) return null;
  return { id, login, display: headers.get("x-player-display") || login };
};
