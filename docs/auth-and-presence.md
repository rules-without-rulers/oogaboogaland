# Sign-in and presence

How a visitor becomes a player on the Cloudflare-hosted island. Everything here lives in `worker/` and `src/js/net.js`; the page served anywhere else (GitHub Pages, a file, `npm run serve`) finds no backend and behaves exactly as before.

## Pieces

| Piece | Where | Job |
|---|---|---|
| Static page | `dist/index.html`, built by `npm run build:dist` | the whole game, served by the Worker's assets binding with the headers in `worker/_headers` |
| Worker | `worker/src/index.js` | runs only for `/auth/*`, `/api/*` and `/room` (`run_worker_first`); everything else is the static page |
| D1 `oogaboogaland` | `worker/migrations/` | `players` (GitHub id, login, display name) and `sessions` (token hash, expiry) |
| Page modules | `src/js/net.js` (`BL.net`), `src/js/remote-players.js` | the account and the room socket; the other visitors on the island. The sheet footer shows the account and the online count through `hud.showAccount` |
| Room | `worker/src/room.js` (Durable Object `Room`) | one socket per signed-in player, presence and poses |

## Signing in

1. The footer's **Sign in with GitHub** calls `BL.net.login()`, which navigates to `/auth/login?next=<current path>`.
2. `/auth/login` (rate limited, 10 a minute per IP) makes 32 random bytes of `state`, stores `state.<next>` in a ten-minute `HttpOnly` cookie (`__Host-obl_oauth` on https), and redirects to GitHub's authorize page. No scopes are requested: the public profile is all we read.
3. GitHub sends the visitor to `/auth/callback?code=…&state=…`. The Worker checks `state` against the cookie in constant time and clears it, trades the code for an access token, reads `GET https://api.github.com/user`, and **discards the token**.
4. The player row is upserted by GitHub's numeric id (a renamed login stays the same player). A banned player gets 403.
5. A session is 32 random bytes; the browser gets it in `__Host-obl_session` (`HttpOnly; Secure; SameSite=Lax; Path=/`, 30 days) and D1 keeps only its SHA-256. The visitor lands back on `next`, which must be a same-site path.

## Being signed in

- `GET /api/me` answers `{ "player": null }` or `{ "player": { id, login, display, look, createdAt } }`, always 200, so a signed-out page logs nothing. `avatar_url` stays server-side while the content policy blocks GitHub images.
- The session is touched at most once every ten minutes, so reading it is not a write per request.
- `PATCH /api/me` with `{ "display": "…" }` sets the in-game name: the character set of `donations.sanitize`, 3–24 characters.
- A cron at 04:00 UTC deletes expired sessions; they are refused on read before that anyway.

## Signing out and leaving

- **Sign out** posts `/auth/logout`, which deletes that session row and clears the cookie. `/auth/logout?all=1` ends every session of the player.
- `DELETE /api/me` deletes the player and every session.
- Every state-changing request must carry the site's own `Origin` (or `Sec-Fetch-Site: same-origin`); anything else is 403.

## What is stored

For a signed-in player: GitHub id, login, avatar URL, the chosen display name, sign-in and last-seen times, and for each session its token hash, times and the first 120 characters of the user agent. Nothing for visitors who never sign in. No GitHub token is ever stored.

## Presence

A signed-in visitor holds one WebSocket to `/room` for the page life. The Worker checks the site `Origin` and the session, strips any client `x-player-*` headers, sets its own (`id`, `login`, `display`) and hands the upgrade to the Durable Object `Room` named `island` (`worker/src/room.js`); the room trusts only those headers.

| Direction | Message | Meaning |
|---|---|---|
| client → room | `{ t: "body", name }` | the Ooga being driven, by name; `null` when free roaming or outside the hub |
| client → room | `{ t: "pose", x, y, z, yaw }` | that Ooga's feet and heading, at most 15 a second from the page, 20 allowed |
| client → room | `"ping"` every 10 s | answered `"pong"` without waking the room |
| room → client | `welcome { you, players, tickHz, now, loopEpoch }` | on connect: everyone else and their last pose |
| room → client | `join { p }`, `leave { id, reason }`, `body { id, name }` | the roster changing |
| room → client | `state { now, ps }` | 15 Hz while anything moved: `ps` is flat `id, x, y, z, yaw` runs |
| room → client | `release { name, reason }` | a claim refused (`not-yours`, `owner-here`, `taken`, `unknown`) or an Ooga taken back by its arriving owner |
| room → client | `kick { reason }`, then close 4000 | `replaced` (a newer tab), `stale` (30 s silent), `full` (32 players) |

Frames the room cannot read close with 4400; out-of-bounds poses and unknown types are ignored. The pure rules are in `worker/src/protocol.js` with their checks in `worker/test/`.

On the island (`src/js/remote-players.js`), each remote visitor driving an Ooga appears as that Ooga with their name over it, eased toward the room's poses. The local crew's copy of the same Ooga steps `away` while someone else drives it and comes back when they let go, so no Ooga stands twice; the NPC crew keeps working and walks round remote bodies. A visitor who is free roaming or in another game is not shown.

### Who drives which Ooga

Every Ooga belongs to a contributor, and ownership keys on the GitHub login alone: a character's `github`, or its handle when it has none (`bc1gui` is owned by `ottoz0r`; a different GitHub account that happens to be called `bc1gui` owns nothing).

- A signed-in contributor drives **only their own** Ooga, and while they are signed in **nobody else** can drive it. The hub hands it to them on arrival (`claimOwnOoga`), once a visit, unless they already drive another; letting go keeps it let go until the next visit.
- Everyone else, signed in or not, drives an Ooga only when its owner is **not signed in**, **nobody else** holds it, and it is **not working** (by its real activity; the hub's temporary overrides do not count).
- An owner arriving takes their Ooga back: the room frees it and the driver's page lets go with a notice.

The page enforces all of it (`net.mayDrive`, checked by `pilot.possess` through the scene's `mayPossess`). The room enforces ownership and who holds what (`claimRefusal` in `worker/src/protocol.js`, over the cast `npm run build:dist` writes to `worker/src/characters.gen.json`), so a tampered page cannot take a contributor's Ooga; a refused claim answers `release { name, reason }` and is never shown to anyone. Whether an Ooga is working comes from activity the room does not see, so that rule is the page's alone. The rules apply only on the page served by the Worker; without a backend (GitHub Pages, the test suite) any Ooga can be driven as before.

A second tab of the same account takes over: the first is kicked with `replaced`, stops reconnecting, and its sheet footer offers **Play here**. Every deploy drops every socket; pages reconnect on their own with backoff (0.5 s × 1.7, up to 15 s).

## The pile's sound

Everyone in the room hears the same fire at the pile at the same moment (`src/js/pile-audio.js`). The room stores the moment the loop started (`loopEpoch`, kept in Durable Object storage so a redeploy keeps the phase) and sends it in `welcome`; each page estimates the room's clock from the timestamps on `welcome` and `state` (`net.serverNow`) and plays the loop at `(serverNow - loopEpoch) mod 8 s`, re-seeking if it drifts past a quarter second. Two pages measured 32–35 ms apart.

The sound is an eight-second crackle over an ember rumble, synthesized in Web Audio from a fixed seed, so the crackles fall at the same seconds on every machine: no audio file. It is full within 5 of the pile and gone by 16, heard from the driven Ooga, or from where the camera looks while roaming free. It plays only for signed-in visitors while the room is live, starts after the first click or key (browsers allow sound only after a gesture), and honours the page-wide mute (`oogaboogaland.audio`, which the games' M key sets).

## Voice

Not built yet: proximity voice over the Realtime SFU. `docs/net-inventory.md` records what the OBL-Audio prototype already proves.

## Banning

A ban refuses the next sign-in and the next room connection; a socket already open stays until it drops (a deploy drops them all).

```sh
cd worker
npx wrangler d1 execute oogaboogaland --remote --command \
  "UPDATE players SET banned_at = unixepoch(), ban_reason = 'reason' WHERE login = 'someone'; DELETE FROM sessions WHERE player_id IN (SELECT id FROM players WHERE login = 'someone');"
```
