// /api/*: who is signed in, their display name, deleting the account, and the Ember Den's leaderboard.
// Signed out, /api/me answers 200 with `player: null`, so a signed-out page logs nothing. Its `donations` says
// whether this Worker reaches bananapayserver (the `DONATIONS` binding), which turns the page's real donations on
// through its own address; without the binding the page stays simulated.

import { cookieNames, isSecureOrigin, serializeCookie } from "./cookies.js";
import { deletePlayer, getPlayer, pokerLeaders, publicPlayer, sanitizeDisplay, updateDisplay } from "./db.js";
import { fromSite, getSessionForRemoval, getSessionFromRequest, json, text } from "./http.js";
import { DEN_NAME } from "./poker-protocol.js";

const BODY_MAX = 1024;

const me = async (request, env) => {
  const found = await (request.method === "DELETE" ? getSessionForRemoval : getSessionFromRequest)(request, env);
  if (request.method === "GET") return json({ player: found ? publicPlayer(found.player) : null,
    character: found ? found.character : null, donations: !!env.DONATIONS });
  if (!fromSite(request, env.SITE_ORIGIN)) return json({ error: "forbidden" }, 403);
  if (!found) return json({ error: "unauthenticated" }, 401);

  if (request.method === "PATCH") {
    const raw = await request.text();
    if (raw.length > BODY_MAX) return json({ error: "too large" }, 413);
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return json({ error: "bad json" }, 400);
    }
    const display = sanitizeDisplay(body && body.display);
    if (!display) return json({ error: "display must be 3-24 letters, digits or simple punctuation" }, 400);
    await updateDisplay(env.DB, found.player.id, display);
    return json({ player: publicPlayer(await getPlayer(env.DB, found.player.id)) });
  }

  if (request.method === "DELETE") {
    await deletePlayer(env.DB, found.player.id);
    // The Ember Den keeps the account's poker bananas and maybe a seat; they go with it, after its sessions, so no
    // new socket can bring them back meanwhile. A den that cannot be reached does not hold the account back.
    if (env.POKER) {
      try {
        await env.POKER.getByName(DEN_NAME).forget(found.player.id);
      } catch (err) {
        console.error("poker den forget failed", err);
      }
    }
    const clear = serializeCookie(cookieNames(env.SITE_ORIGIN).session, "", { maxAge: 0, secure: isSecureOrigin(env.SITE_ORIGIN) });
    return new Response(null, { status: 204, headers: { "set-cookie": clear, "cache-control": "no-store" } });
  }

  return json({ error: "method not allowed" }, 405, { allow: "GET, PATCH, DELETE" });
};

// The Ember Den's leaderboard, public: GitHub logins and hands won at the live tables, top 20.
const pokerLeaderboard = async (request, env) => {
  if (request.method !== "GET") return json({ error: "method not allowed" }, 405, { allow: "GET" });
  return json({ leaders: await pokerLeaders(env.DB, 20) }, 200, { "cache-control": "no-store" });
};

export const handleApi = (request, env, url) => {
  if (url.pathname === "/api/me") return me(request, env);
  if (url.pathname === "/api/poker/leaderboard") return pokerLeaderboard(request, env);
  if (url.pathname === "/api/health") return text("ok", 200);
  return json({ error: "not found" }, 404);
};
