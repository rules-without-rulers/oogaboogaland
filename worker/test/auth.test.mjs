// Sign-in helpers and real routes with fixture D1 and identity responses: no network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cookieNames, parseCookies, serializeCookie } from "../src/cookies.js";
import { randomToken, sameString, sha256Hex } from "../src/crypto.js";
import { isExpired, needsTouch, publicPlayer, sanitizeDisplay, TOUCH_SECONDS } from "../src/db.js";
import { routeFixture } from "./routes.mjs";

const { fromSite, safeNext, handleApi } = routeFixture();
const DOT_NEXT = ["/.//evil.example", "/%2e//evil.example", "/a/..//evil.example", "/a/%2E%2e//evil.example",
  "/a/b/../..//evil.example", "/.//evil.example?next=/lightning#room"];

test("tokens are 32 random bytes in base64url and never repeat", () => {
  const a = randomToken(), b = randomToken();
  assert.match(a, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(a, b);
});

test("session hashes are stable SHA-256 hex", async () => {
  assert.equal(await sha256Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

test("state comparison needs an exact string", () => {
  assert.ok(sameString("abc", "abc"));
  assert.ok(!sameString("abc", "abd"));
  assert.ok(!sameString("abc", "abcd"));
  assert.ok(!sameString(null, "abc"));
});

test("next accepts only same-site paths", () => {
  assert.equal(safeNext("/"), "/");
  assert.equal(safeNext("/?scene=lab&debug=1"), "/?scene=lab&debug=1");
  assert.equal(safeNext("/a/../lightning?view=hall#room"), "/a/../lightning?view=hall#room");
  for (const bad of ["//evil.com", "/\\evil.com", "https://evil.com", "javascript:alert(1)", "evil", "/a\nb", "/a\\b", null, "/" + "x".repeat(600), ...DOT_NEXT]) {
    assert.equal(safeNext(bad), "/", String(bad));
  }
});

test("cookies: parsed by name, first wins, __Host- only on https", () => {
  const jar = parseCookies("a=1; obl_session=tok; a=2; broken; =x");
  assert.equal(jar.get("a"), "1");
  assert.equal(jar.get("obl_session"), "tok");
  assert.equal(cookieNames("https://obl.ruleswithoutrulers.com").session, "__Host-obl_session");
  assert.equal(cookieNames("http://localhost:8787").session, "obl_session");
  assert.equal(serializeCookie("n", "v", { maxAge: 60, secure: true }), "n=v; Path=/; HttpOnly; SameSite=Lax; Max-Age=60; Secure");
  assert.ok(!serializeCookie("n", "", { maxAge: 0, secure: false }).includes("Secure"));
});

test("state-changing requests must come from the site", () => {
  const site = "https://obl.ruleswithoutrulers.com";
  const req = (headers) => new Request(`${site}/auth/logout`, { method: "POST", headers });
  assert.ok(fromSite(req({ origin: site }), site));
  assert.ok(!fromSite(req({ origin: "https://evil.com" }), site));
  assert.ok(fromSite(req({ "sec-fetch-site": "same-origin" }), site));
  assert.ok(!fromSite(req({ "sec-fetch-site": "cross-site" }), site));
  assert.ok(!fromSite(req({}), site));
});

test("sessions expire at their time and are touched at most every ten minutes", () => {
  assert.ok(isExpired({ expires_at: 100 }, 100));
  assert.ok(!isExpired({ expires_at: 101 }, 100));
  assert.ok(needsTouch({ last_used_at: null }, 100));
  assert.ok(!needsTouch({ last_used_at: 100 }, 100 + TOUCH_SECONDS - 1));
  assert.ok(needsTouch({ last_used_at: 100 }, 100 + TOUCH_SECONDS));
});

test("display names keep the donation character set and 3-24 characters", () => {
  assert.equal(sanitizeDisplay("  Ooga   Booga!  "), "Ooga Booga!");
  assert.equal(sanitizeDisplay("<script>x</script>"), "scriptxscript");
  assert.equal(sanitizeDisplay("ab"), null);
  assert.equal(sanitizeDisplay(null), null);
  assert.equal(sanitizeDisplay("x".repeat(40)).length, 24);
});

test("the page never receives the avatar url or ban fields", () => {
  const p = publicPlayer({ id: 1, login: "ooga", display: null, avatar_url: "https://x", look: "{\"bald\":true}", created_at: 5, banned_at: null });
  assert.deepEqual(p, { id: 1, login: "ooga", display: "ooga", look: { bald: true }, createdAt: 5 });
  assert.equal(publicPlayer({ id: 1, login: "o", look: "[1]" }).look, null);
  assert.equal(publicPlayer({ id: 1, login: "o", look: "{bad" }).look, null);
});

test("the page takes real donations only from a Worker with the bananapayserver binding", async () => {
  const me = async (env) => (await handleApi(new Request("https://site.test/api/me"), { SITE_ORIGIN: "https://site.test", ...env }, new URL("https://site.test/api/me"))).json();
  assert.deepEqual(await me({}), { player: null, character: null, donations: false });
  assert.deepEqual(await me({ DONATIONS: {} }), { player: null, character: null, donations: true });
});

const SITE = "https://site.test", FAR = 4102444800;
const CAST = [{ handle: "Cave-Name", github_login: "real-owner",
  joined_at: "2026-09-01T00:00:00Z", last_commit_at: "2026-10-01T00:00:00Z" }];
const database = (login) => {
  const writes = [], player = { id: 123, login, banned_at: null, created_at: 1,
    token_hash: "h", expires_at: FAR, last_used_at: FAR };
  return { writes, prepare: (sql) => ({ bind: (...values) => ({ sql, values,
    first: async () => player, run: async () => { writes.push({ sql, values }); return {}; } }) }),
  batch: async (statements) => { writes.push(...statements); return []; } };
};
const requestFor = (path, method = "GET", extra = {}) => new Request(SITE + path, {
  method, headers: { origin: SITE, cookie: "__Host-obl_session=held", ...extra },
});
const callbackFor = (next = "/") => new Request(`${SITE}/auth/callback?code=code&state=held`, {
  headers: { cookie: `__Host-obl_oauth=held.${btoa(encodeURIComponent(next))}` },
});
const github = (login) => async (url) => {
  if (url === "https://github.com/login/oauth/access_token") return Response.json({ access_token: "token" });
  assert.equal(url, "https://api.github.com/user");
  return Response.json({ id: 123, login, type: "User" });
};

test("OAuth rejects nonowners without account writes and returns only to same-site destinations after URL normalization", async () => {
  for (const login of ["visitor", "cave-name"]) for (const next of ["/", ...DOT_NEXT, "/a/../lightning?view=hall&signin=old#room"]) {
    let lookups = 0, dbCalls = 0;
    const routes = routeFixture({ cast: CAST, fetcher: github(login), lookup: async (name) => {
      lookups++;
      return name === "cave-name" ? { handle: name, joined: 1, lastCommit: 2 } : null;
    } });
    const request = callbackFor(next), response = await routes.handleAuth(request, { SITE_ORIGIN: SITE,
      DB: { prepare: () => { dbCalls++; throw new Error("Rejected sign-in reached D1"); } } }, new URL(request.url));
    assert.equal(response.status, 302);
    const location = response.headers.get("location");
    assert.equal(location, next.startsWith("/a/../lightning") ? "/lightning?view=hall&signin=contributor-required#room" : "/?signin=contributor-required");
    assert.equal(new URL(location, SITE).origin, SITE, next);
    assert.match(response.headers.get("set-cookie"), /__Host-obl_oauth=;.*Max-Age=0/);
    assert.ok(!response.headers.get("set-cookie").includes("__Host-obl_session="));
    assert.equal(dbCalls, 0);
    assert.equal(lookups, login === "visitor" ? 1 : 0);
  }
});

test("OAuth admits bundled owners during an upstream outage and verified temporary owners", async () => {
  for (const login of ["REAL-OWNER", "new-ooga"]) {
    let lookups = 0;
    const routes = routeFixture({ cast: CAST, fetcher: github(login), lookup: async (name) => {
      lookups++;
      if (name !== "new-ooga") throw new Error("Bundled owner consulted unavailable Oogatron");
      return { handle: "new-ooga", joined: 1, lastCommit: 2 };
    } });
    const DB = database(login), request = callbackFor();
    const response = await routes.handleAuth(request, { SITE_ORIGIN: SITE, DB }, new URL(request.url));
    assert.equal(response.status, 302);
    assert.equal(response.headers.get("location"), "/");
    assert.match(response.headers.get("set-cookie"), /__Host-obl_session=[A-Za-z0-9_-]{43}/);
    assert.equal(DB.writes.length, 2);
    assert.match(DB.writes[0].sql, /INSERT INTO players/);
    assert.match(DB.writes[1].sql, /INSERT INTO sessions/);
    assert.equal(lookups, login === "new-ooga" ? 1 : 0);
  }
});

test("old nonowner sessions receive no identity and cannot reach account, room or voice operations", async () => {
  const { worker } = routeFixture({ cast: CAST });
  for (const login of ["visitor", "cave-name"]) {
    const DB = database(login), env = { SITE_ORIGIN: SITE, DB,
      ROOM: { getByName: () => { throw new Error("Ineligible session reached the room binding"); } } };
    assert.deepEqual(await (await worker.fetch(requestFor("/api/me"), env)).json(), { player: null, character: null, donations: false });
    assert.equal((await worker.fetch(requestFor("/api/me", "PATCH"), env)).status, 401);
    assert.equal((await worker.fetch(requestFor("/room", "GET", { upgrade: "websocket", "x-player-contributor": "1" }), env)).status, 401);
    assert.equal((await worker.fetch(requestFor("/api/voice/publish", "POST"), env)).status, 401);
    assert.equal(DB.writes.length, 0);
  }
});

test("eligible sessions share one character check with the API and strip forged room identity headers", async () => {
  let lookups = 0, forwarded = null;
  const row = { handle: "new-ooga", joined: 1, lastCommit: 2 };
  const { worker } = routeFixture({ cast: CAST, lookup: async () => { lookups++; return row; } });
  const env = { SITE_ORIGIN: SITE, DB: database("new-ooga"), ROOM: { getByName: () => ({ fetch: async (request) => {
    forwarded = request;
    return new Response("accepted");
  } }) } };
  const me = await (await worker.fetch(requestFor("/api/me"), env)).json();
  assert.equal(me.player.login, "new-ooga");
  assert.deepEqual(me.character, row);
  assert.equal(lookups, 1, "/api/me reuses the session's verified character");
  assert.equal((await worker.fetch(requestFor("/room", "GET", { upgrade: "websocket", "x-player-login": "victim",
    "x-player-id": "999", "x-player-extra": "spoof", "x-player-contributor": "0" }), env)).status, 200);
  assert.equal(lookups, 2, "/room performs only its central session check");
  assert.equal(forwarded.headers.get("x-player-login"), "new-ooga");
  assert.equal(forwarded.headers.get("x-player-id"), "123");
  assert.equal(forwarded.headers.get("x-player-contributor"), "1");
  assert.equal(forwarded.headers.get("x-player-extra"), null);
});

test("formerly eligible visitors can clear their own sessions or delete their account, with same-site checks", async () => {
  const { worker } = routeFixture({ cast: CAST });
  for (const [path, method] of [["/auth/logout?all=1", "POST"], ["/api/me", "DELETE"]]) {
    const DB = database("visitor"), env = { SITE_ORIGIN: SITE, DB };
    assert.equal((await worker.fetch(requestFor(path, method, { origin: "https://elsewhere.test" }), env)).status, 403);
    assert.equal(DB.writes.length, 0);
    const response = await worker.fetch(requestFor(path, method), env);
    assert.equal(response.status, 204);
    assert.match(response.headers.get("set-cookie"), /__Host-obl_session=;.*Max-Age=0/);
    assert.match(DB.writes[0].sql, /DELETE FROM sessions WHERE player_id/);
    assert.equal(DB.writes[0].values[0], 123);
    if (method === "DELETE") assert.match(DB.writes[1].sql, /DELETE FROM players WHERE id/);
  }
});
