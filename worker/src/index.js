// The Worker in front of Ooga Booga Land: the built page from static assets, GitHub sign-in under
// /auth/*, the account API under /api/*, voice signalling under /api/voice/*, /room, the island's
// live socket, /poker, the Ember Den's live tables, and /donations/*, passed on to bananapayserver
// over the DONATIONS binding. Only those paths run this code (`run_worker_first` in
// wrangler.<env>.jsonc); every other path is served straight from _site.

import { handleApi } from "./api.js";
import { handleAuth } from "./auth.js";
import { purgeExpiredSessions } from "./db.js";
import { handleDonations } from "./donations.js";
import { allowed, fromSite, getSessionFromRequest, text } from "./http.js";
import { DEN_NAME } from "./poker-protocol.js";

export { Room } from "./room.js";
export { PokerDen } from "./poker-den.js";

const ROOM_NAME = "island";

// The upgrade with who the player is in x-player-* headers, set here from the session and nowhere else.
const asPlayer = (request, player) => {
  const headers = new Headers(request.headers);
  for (const name of [...headers.keys()]) if (name.startsWith("x-player-")) headers.delete(name);
  headers.set("x-player-id", String(player.id));
  headers.set("x-player-login", player.login);
  headers.set("x-player-display", player.display || player.login);
  return headers;
};

// Identity is decided here, once, from the session; the room trusts only the headers set below.
const handleRoom = async (request, env) => {
  if (request.headers.get("upgrade") !== "websocket") return text("Expected WebSocket", 426);
  if (!fromSite(request, env.SITE_ORIGIN)) return text("Forbidden", 403);
  const found = await getSessionFromRequest(request, env);
  if (!found) return text("Sign in first", 401);
  if (!(await allowed(env.ROOM_LIMITER, String(found.player.id)))) return text("Too many reconnects", 429);
  const headers = new Headers(request.headers);
  for (const name of [...headers.keys()]) if (name.startsWith("x-player-")) headers.delete(name);
  headers.set("x-player-id", String(found.player.id));
  headers.set("x-player-login", found.player.login);
  headers.set("x-player-display", found.player.display || found.player.login);
  headers.set("x-player-contributor", "1");
  return env.ROOM.getByName(ROOM_NAME).fetch(new Request(request, { headers }));
};

// The Ember Den's dealer, on the same terms as the room: the site's own page, a session, a reconnect limit.
const handlePoker = async (request, env) => {
  if (request.headers.get("upgrade") !== "websocket") return text("Expected WebSocket", 426);
  if (!env.POKER) return text("Live tables are not set up here", 503);
  if (!fromSite(request, env.SITE_ORIGIN)) return text("Forbidden", 403);
  const found = await getSessionFromRequest(request, env);
  if (!found) return text("Sign in first", 401);
  if (!(await allowed(env.POKER_LIMITER, String(found.player.id)))) return text("Too many reconnects", 429);
  return env.POKER.getByName(DEN_NAME).fetch(new Request(request, { headers: asPlayer(request, found.player) }));
};

// Voice signalling: the room validates ownership and talks to the SFU with the secret.
const handleVoice = async (request, env, url) => {
  if (request.method !== "POST") return text("Method not allowed", 405);
  if (!fromSite(request, env.SITE_ORIGIN)) return text("Forbidden", 403);
  const found = await getSessionFromRequest(request, env);
  if (!found) return text("Sign in first", 401);
  if (!(await allowed(env.VOICE_LIMITER, String(found.player.id)))) return text("Too many voice requests", 429);
  const op = url.pathname.slice("/api/voice/".length);
  const headers = new Headers({ "content-type": "application/json", "x-player-id": String(found.player.id) });
  return env.ROOM.getByName(ROOM_NAME).fetch(new Request(new URL(`/voice/${op}`, url), { method: "POST", headers, body: request.body }));
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/auth/")) return handleAuth(request, env, url);
    if (url.pathname.startsWith("/api/voice/")) return handleVoice(request, env, url);
    if (url.pathname.startsWith("/api/")) return handleApi(request, env, url);
    if (url.pathname === "/room") return handleRoom(request, env);
    if (url.pathname === "/poker") return handlePoker(request, env);
    if (url.pathname.startsWith("/donations/")) return handleDonations(request, env, url);
    return env.ASSETS.fetch(request);
  },

  // Daily: expired sessions are already refused on read; this keeps the table from growing.
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(purgeExpiredSessions(env.DB));
  },
};
