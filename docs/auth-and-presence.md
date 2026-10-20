# Sign-in and presence

How a contributor with their own Ooga becomes a player on the Cloudflare-hosted island. Other visitors explore signed out. Everything here lives in `worker/` and `src/js/net.js`; the page served anywhere else (GitHub Pages, a file, `npm run serve`) finds no backend and behaves exactly as before.

New Oogatron contributors can receive a server-verified default character before
their file reaches a deployed bundle. Eligibility, merge-time generation and the
PR ownership check are described in [Contributor onboarding](contributor-onboarding.md).

## Pieces

| Piece | Where | Job |
|---|---|---|
| Static site | `_site/` (the page as `index.html` and each `<route>.html`), staged by `npm run build:site` | the whole game, served by the Worker's assets binding with the headers in `worker/_headers` |
| Worker | `worker/src/index.js` | runs only for `/auth/*`, `/api/*`, `/room` and `/poker` (`run_worker_first`), and on staging `/donations/*`, which `worker/src/donations.js` passes on to bananapayserver with the signed-in donor; everything else is the static page |
| D1 `oogaboogaland` | `worker/migrations/` | `players` (GitHub id, login, display name) and `sessions` (token hash, expiry) |
| Page modules | `src/js/net.js` (`BL.net`), `src/js/remote-players.js` | the account and the room socket; the other visitors on the island. The sheet footer shows the account and the online count through `hud.showAccount` |
| Room | `worker/src/room.js` (Durable Object `Room`) | one socket per signed-in player, presence and poses, and Ooga Chat |
| Ember Den dealer | `worker/src/poker-den.js` (Durable Object `PokerDen`, one named `ember-den`) | the live poker tables: one socket per signed-in player in the room, the deal, turn clocks and each account's poker bananas (see The Ember Den's live tables) |

## Signing in

1. The footer's **Contributor sign-in** calls `BL.net.login()`, which navigates to `/auth/login?next=<current path>`.
2. `/auth/login` (rate limited, 10 a minute per IP) makes 32 random bytes of `state`, stores `state.<next>` in a ten-minute `HttpOnly` cookie (`__Host-obl_oauth` on https), and redirects to GitHub's authorize page. No scopes are requested: the public profile is all we read.
3. GitHub sends the visitor to `/auth/callback?code=…&state=…`. The Worker checks `state` against the cookie in constant time and clears it, trades the code for an access token, reads `GET https://api.github.com/user`, and **discards the token**.
4. Before writing a player or session, the Worker requires an owned character: an existing bundled character matched by its owning GitHub login, or a verified Oogatron contributor eligible for a temporary character. A character alias cannot be claimed by a different GitHub account. Ineligible accounts return to the saved same-site destination with a contributor-only sign-in notice; no account or session is written. The eligible player row is upserted by GitHub's numeric id (a renamed login stays the same player if it still owns a character). A banned player gets 403.
5. A session is 32 random bytes; the browser gets it in `__Host-obl_session` (`HttpOnly; Secure; SameSite=Lax; Path=/`, 30 days) and D1 keeps only its SHA-256. The visitor lands back on `next`, which must be a same-site path. A detached camera is saved in tab-local session storage before leaving for GitHub and restored once on a matching route within ten minutes of an eligible sign-in. DSB also carries an allowlisted venue id so the same room is rebuilt before acquisition. The available own Ooga is selected in carry/orbit, with the restored camera position retained.

## Being signed in

- `GET /api/me` answers `{ "player": null, "character": null, "donations": false }` or `{ "player": { id, login, display, look, createdAt }, "character": { handle, joined, lastCommit }, "donations": false }`, always 200, so a signed-out page logs nothing. `avatar_url` stays server-side while the content policy blocks GitHub images. `donations` is true once the Worker has its bananapayserver binding (`DONATIONS`): the page then takes real donations through its own address (`donations.useOrigin`), and until then stays simulated.
- Session reads recheck character eligibility for account, room, voice and signed-in donation attribution. Old guest cookies no longer identify a signed-in player. Bundled owners do not depend on Oogatron availability; an unbundled owner must still be verified by the bounded cached lookup. A refresh failure retains previously verified rows only until the original snapshot is 24 hours old. Unknown accounts remain denied, and a successful refresh replaces the rows immediately.
- The session is touched at most once every ten minutes, so reading it is not a write per request.
- `PATCH /api/me` with `{ "display": "…" }` sets the in-game name: the character set of `donations.sanitize`, 3–24 characters.
- A cron at 04:00 UTC deletes expired sessions; they are refused on read before that anyway.

## Signing out and leaving

- **Sign out** posts `/auth/logout`, which deletes that session row and clears the cookie. `/auth/logout?all=1` ends every session of the player.
- `DELETE /api/me` deletes the player and every session.
- These two removal paths accept a valid historical session even if its account no longer qualifies to sign in. The signed-out footer does not show those historical sessions. With the island open, `fetch("/api/me", { method: "DELETE" })` in the browser console removes the retained account and all its sessions; `fetch("/auth/logout", { method: "POST" })` clears only this session. Check for a 204 response. They grant no other access. Expired sessions cannot authorize removal; contact the maintainer to remove the retained player record.
- Every state-changing request must carry the site's own `Origin` (or `Sec-Fetch-Site: same-origin`); anything else is 403.

## What is stored

For a signed-in player: GitHub id, login, avatar URL, the chosen display name, sign-in and last-seen times, and for each session its token hash, times and the first 120 characters of the user agent. Once they join the Ember Den's live tables, the dealer's own storage also keeps their poker bananas (a count and the day of their last free top-up) until they sign out and, while they sit, their seat; D1's `poker_stats` keeps their GitHub login and hands won at the live tables, shown on the public leaderboard and kept after sign-out; `DELETE /api/me` deletes all of those too. Nothing for visitors who never sign in. No GitHub token is ever stored.

## Presence

A signed-in visitor holds one WebSocket to `/room` for the page life. The Worker checks the site `Origin` and the session, strips any client `x-player-*` headers, sets its own (`id`, `login`, `display`) and hands the upgrade to the Durable Object `Room` named `island` (`worker/src/room.js`); the room trusts only those headers.

| Direction | Message | Meaning |
|---|---|---|
| client → room | `{ t: "body", name }` | Ooga handle, `gorilla:<handle>` for its companion, or `null` when detached/in a game |
| client → room | `{ t: "pose", x, y, z, yaw, g? }` | the body's feet and heading, at most 10 a second from the page, 20 allowed; optional bounded gorilla locomotion below |
| client → room | `{ t: "zone", name }` | where that body is (see Zones below): voice is shared within its group, players are shown within the same zone |
| client → room | `{ t: "poker-voice", table }` | in the Ember Den, the table (0-9) whose voice this player hears and speaks into while it is open, or `null` for the floor's; a zone change resets it |
| client → room | `{ t: "hub", on }` | this page shows the island in a visible tab: it can host the NPCs and receives their frames |
| client → room | `{ t: "mute", on }` | this page muted or unmuted its own microphone, for everyone's roster |
| client → room | `{ t: "hp", v, ko }` | the driven body's health normalized to 0-100, in steps of 4, and knockout flag; only on a change, 4 a second at most |
| client → room | `{ t: "chat", text }` | an Ooga Chat line (see Ooga Chat); the room names the speaker |
| client → room | binary | the NPC host's frame: Ooga poses, gear, status and work, then its events (see The crew in step) |
| client → room | `"ping"` every 10 s | answered `"pong"` without waking the room |
| room → client | `welcome { you, players, tickHz, now, loopEpoch, host, followers }` | on connect: everyone else, their last pose, whether each is in voice (`voice`) and muted (`muted`), and their health (`hp`, `ko`) |
| room → client | `chat-history { messages }` | right after `welcome`: the chat lines the room still holds, oldest first, at most 100 |
| room → client | `chat { id, at, login, name, text }` | a chat line, to everyone (the speaker too) |
| room → client | `join { p }`, `leave { id, reason }`, `body { id, name }` | the roster changing |
| room → client | `state { now, ps, gs? }` | at most 15 a second while poses arrive, none while nothing changes: `ps` is flat `id, x, y, z, yaw` runs; optional `gs` is `id, ...g` runs |
| room → client | `host { id, followers }` | the page that runs the NPCs now (0 for none) and how many pages follow it; binary frames from it follow while any do |
| room → client | `voice { peers, gens }` | the ids this player should hear and each one's publication count (a new count is a microphone published again, pulled again); sent when that changes, and after every zone message |
| room → client | `vstate { id, voice, muted }` | a player's microphone went live or off, or they muted or unmuted it; sent only on a change |
| room → client | `hp { id, v, ko }` | a player's driven Ooga's health changed (a new body starts at 100) |
| room → client | `release { name, reason }` | a claim refused (`not-yours`) or a legacy claim freed on owner arrival (`owner-here`) |
| room → client | `kick { reason }`, then close 4000 | `replaced` (a newer tab), `stale` (90 s silent, swept once a minute), `full` (32 players), `revoked` (account access removed) |

Frames the room cannot read close with 4400, as does any frame over 256 characters except a chat line; out-of-bounds poses, unknown types and unusable chat lines are ignored. The pure rules are in `worker/src/protocol.js` with their checks in `worker/test/`.

Gorilla locomotion `g` is six finite numbers: `[flags, speed, climbStride, climbDirection, climbSide, swim]`. The flag bits are airborne (1), biped (2), climbing (4), running (8), lab (16), office (32) and asleep (64); flags must be an integer 0–127. The remaining values are clamped to ±20, ±1,000,000, ±1, ±1 and 0–1 respectively. While asleep, `climbDirection` carries the resting pose (-1 left, 0 back, 1 right), and the remote rig suppresses movement and other locomotion. Only a gorilla body retains them. Changing body clears locomotion and resets health; the page invalidates its pose cache and reports the new actor even at identical coordinates. Welcome/join records include `g`, and room attachments preserve it through hibernation. This adds no idle timer or change to the five-number position stride.

Old open pages still understand Ooga poses but interpret `gorilla:<handle>` as an unknown Ooga handle. They can show a hashed Ooga alongside their still-active local gorilla, rather than the remote companion. Refresh all participating pages together for multiplayer companion play; the room does not negotiate client versions. The extension carries locomotion, not attacks, captive Oogas, throws or authoritative combat damage.

### Zones

Where a signed-in player is decides whom they hear and see. A zone is `<group>` or `<group>.<place>`: voice is shared within a group, and players are shown only to others in the same zone, since a hall has coordinates of its own.

| Kind | Zone | Where |
|---|---|---|
| The island | `outside` | the main island, from the hub (`island.onLand`) |
| A bridged land | `sphere`, `rainforest`, `bifrost`, `bifrost.chamber` | the Timechain Sphere's bridge, doorway and passage from the foot of its bridge; the Mempool rainforest from the foot of its vine bridge, with its chamber and tunnels; the Bifrost isle and bridge, and the chamber behind the arch |
| A Timechain room | `sphere-1` … `sphere-9` | one of the Sphere's nine rooms, signed in (never dotted, so each is its own voice group, apart from `sphere`); a solo visit signed out reports `none` with no body. The doorway's reservation and transit messages are in `docs/timechain-sphere/doorway-contract.md` |
| A cave or a portal | `lab`, `lab.hall`, `bca`, `factory`, `factory.hall`, `arcade`, `arcade.hall`, `mirror`, `hq`, `ember-den`, `dsb-outside`, `dsb-<venue>` | EntropyLab's cave (and the debug-only lab scene), B.C.A.'s office, the Lightning Factory's tunnel and hall, Ooga Arcade's mouth and hall, the Mirror cave, HQ (every entrance), the Ember Den off the Bifrost chamber, DSB Land outside and each of its venues |
| Nowhere | `none` | off the island's edge (a cloud, flying or falling past the rim), or between scenes: hears and is heard by nobody, shown to nobody |

The hub works the zone out every frame from the driven Ooga or gorilla (`zoneOf` in `scene-hub.js`) and reports a new one once it has held for a quarter second, so a bridge's foot does not flicker. Every other scene declares its own (`voiceZone` on the scene object, set by the director on entry); DSB Land reports its venues as it goes. The games keep `scene-<id>`, with no actor driven and so no voice.

Each remote visitor driving an Ooga in the same zone appears as that Ooga (`src/js/remote-players.js`, in the island and every scene with Oogas to drive), eased toward the room's poses, with a nameplate: their name, a health bar under it from the room's `hp` (red while knocked out), and while they are in voice the speaker to its right (green while speaking, red with a cross when they muted their microphone). A visitor on the island who drives nothing sees everyone in the island's own places. The local crew's copy of the same Ooga steps `away` while someone else drives it and comes back when they let go, so no Ooga stands twice (the Arcade hides its crowd's copy the same way); the NPC crew keeps working and walks round remote bodies.

The Ooga Boogas panel shows every signed-in player online, in every scene: the row of their own Ooga and the row of the Ooga they drive get the green dot, and online rows lead the list. One who disconnects drops back to their activity's place.

A remote companion uses `BL.agent`'s managed gorilla rig instead of a caveman. Its local NPC copy releases its work/bed/portal reservations and hides while remotely driven, then returns to normal AI after release; the owner's Ooga remains in the crew. Health is a fraction of the gorilla's maximum, rendered through the existing 0–100 bar. Voice and online marks stay on the owner's roster row. Locomotion, rig geometry and disposal share the existing bounded remote-player pool.

### Who drives which Ooga

Every Ooga belongs to a contributor, and ownership keys on the GitHub login alone: a character's `github`, or its handle when it has none (`bc1gui` is owned by `ottoz0r`; a different GitHub account that happens to be called `bc1gui` owns nothing).

- A signed-in contributor drives **only their own** Ooga in multiplayer. The hub hands it to them on arrival (`claimOwnOoga`), once a visit, unless they already drive another or explicitly arrived detached from an interior. Letting go stays detached until they take control again or revisit. The detached portrait retakes the last controlled actor, whether Ooga or gorilla, using the same selection rules as double-clicking it.
- Every signed-in player has an owned character. There is no signed-in borrowing path; a missing client character mapping refuses selection until the owned character is available.
- Signed-out visitors can play available bundled Oogas and gorillas locally, including working actors. They have no room socket or remote roster, so their page cannot know which owners are online elsewhere. This local control is not a multiplayer claim and does not show a green signed-in marker. Static hosting likewise does not mark local control online. Logout keeps an eligible bundled actor controlled; temporary actors require sign-in and are released.
- A signed-in contributor may also claim **their own gorilla**, including a server-vouched temporary contributor. `net.mayDriveGorilla` and the room both check the companion's owner. T cycles the owned pair on the hub, or retakes the Ooga when detached; G keeps its existing weapon/grab meaning. Companions remain in the hub's playable areas, rather than separate scene interiors. Signed-out/static gorilla play is local, with no room publication.

Hub world selection, the last-actor retake portrait and T validate the target before releasing the current actor. A refused or unavailable actor leaves the current control and camera intact and shows the reason. Selecting the current actor does nothing. From detached view, selection retains the exact camera position, recenters its look on the actor and enters carry/orbit; switching between controlled actors preserves carry/combat and the view family. Sleeping actors stay asleep until Space or the wake button is pressed.

The room rejects accounts without an owned body before accepting their socket. Historical guest attachments are evicted when the room wakes, receives their next message, or runs its existing stale sweep, so they cannot keep chat, voice or NPC-host access. This adds no timer or background contributor lookup; an already accepted temporary contributor retains its verified attachment until reconnect.

The page enforces ownership (`net.mayDrive`, checked by `pilot.possess` through the scene's `mayPossess`). The room independently enforces it (`claimRefusal` in `worker/src/protocol.js`, over the cast `npm run build:site` writes to `worker/src/characters.gen.json`), so a tampered page cannot take another contributor's Ooga; a refused claim answers `release { name, reason }` and is never shown to anyone. Without a backend (GitHub Pages, the test suite), any available Ooga can be driven locally.

A second tab of the same account takes over: the first is kicked with `replaced`, stops reconnecting, and its sheet footer offers **Play here**. Every deploy drops every socket; pages reconnect on their own with backoff (0.5 s × 1.7, up to 15 s). A tab hidden for five minutes leaves the room (voice stops) and rejoins when it is shown again.

**What keeps the room cheap.** The room is a Durable Object, billed for the time it is awake and for the messages it receives, and it sleeps (hibernates) only when no timer is pending and nothing arrives for a few seconds. So nothing in it runs on its own: a pose schedules one snapshot, voice lists go out when who hears whom can change (a join or leave, a body or zone, a voice session), `vstate` goes out when a microphone goes live or off or is muted, `hp` when a driven Ooga's health moves, and the stale sweep is an alarm once a minute. Pings are answered without waking it. The NPC host sends only while another page follows it (`followers`), four frames a second, and skips a frame when no Ooga changed and nothing happened (at most 2 s).

## The crew in step

Signed-in players on the island see the same Oogas doing the same things (`src/js/npc-sync.js`). Without it every page runs its own crew, and random choices and frame timing drift each page apart within seconds.

- **One page runs the crew.** The room elects a host: the page longest in the room among those showing the island (the hub scene, in a visible tab; `{ t: "hub", on }` reports it). The room tells everyone with `host { id, followers }` and hands over when the host leaves the hub, hides its tab or closes.
- **The host streams what shows.** While at least one other page follows it, four times a second it sends one binary frame with every Ooga nobody drives: a header (format, a signature of the ordered crew names and work-site identities, a record count, the event bytes), one record of floats per Ooga, then the events since the last frame as JSON. A frame identical to the last one sent, with no events, is skipped for up to 2 s. A record carries the body (root position, rotation, quaternion, scale and visibility; legs, arms, head with its eyes open or closed, torso), the gear (which holder the club and rifle hang from, hand, back sling or bed, and their pose; the rifle's bananas; the flash; the snack; the bed's weapons), status (stun birds, fire embers and scorch, colourway, a built-in jetpack's flame) and the work the gorillas follow (state, phase, the cave worked, the cave planned). Events are what happens once: speech, sleep marks, landing dust and jetpack sparks, every banana shot's flight, and the gorillas' plan and hit. About 6 KB a frame for a dozen Oogas. The room takes frames only from the host (16 KB and 20 a second at most), relays them to every other page on the island, and keeps the latest for anyone arriving.
- **Followers pose puppets and replay events.** On every other signed-in page those Oogas are puppets (`cave.puppet`): `crew.update` skips their AI, and npc-sync eases them toward the latest frame after the crew's update, snapping when one jumps far (into a bed, back from a fall). Gear changing holder is moved there and the mirror and outlines refreshed. Events replay through the page's own effects; shots fly as visual-only rounds (`crew.showShot`: no hits, no mirror crossing), and the gorillas get the host's plans and hits, so they travel and react in step without a stream of their own. An Ooga someone drives is never a puppet: its driver's page runs it and the others show it as a remote player.
- **Measured** (at the earlier ten frames a second): two and three pages on one machine kept every Ooga within 0.4 of the host's (0.05 on average), and every undriven Ooga's gear, eyes, colourway and work state identical in samples 6 s apart; a follower replayed the host's sleep marks, 71 shots with their 70 gorilla hits, the gorillas' plans and a poked Ooga's speech. A host closing handed over within seconds and a new page followed the new host.
- Visitors who are not signed in have no room and keep their own crew. No database is involved: the latest frame lives in the room's memory.

The banana pile level, donations, crates and what shots do to the world (the mirror, breakables) stay each page's own. The gorillas' own motion runs on each page from the same plans and hits, so it stays close rather than exact.

## The pile's sound

**Switched off for now (2026-09-27):** the page no longer loads `pile-audio.js` and the hub no longer creates it. The module and the room's `loopEpoch` stay, so turning it back on is its script tag in `src/index.html` and three lines in `scene-hub.js` (create with the remote pool, update with the listener each frame, dispose in `leave`). The description below is how it works when on.

Everyone in the room hears the same fire at the pile at the same moment (`src/js/pile-audio.js`). The room stores the moment the loop started (`loopEpoch`, kept in Durable Object storage so a redeploy keeps the phase) and sends it in `welcome`; each page estimates the room's clock from the timestamps on `welcome` and `state` (`net.serverNow`) and plays the loop at `(serverNow - loopEpoch) mod 8 s`, re-seeking if it drifts past a quarter second. Two pages measured 32–35 ms apart.

The sound is an eight-second crackle over an ember rumble, synthesized in Web Audio from a fixed seed, so the crackles fall at the same seconds on every machine: no audio file. It is quiet on purpose (half its first level), full within 5 of the pile and gone by 16, heard from the driven Ooga, or from where the camera looks while roaming free. It plays only for signed-in visitors while the room is live, starts after the first click or key (browsers allow sound only after a gesture), and honours the page-wide mute (`oogaboogaland.audio`, which the games' M key sets).

## Voice

Signed-in players can talk (`src/js/voice.js`, `worker/src/room.js`, `worker/src/sfu.js`), over a Cloudflare Realtime SFU app per Worker (`REALTIME_APP_ID` in `wrangler.<env>.jsonc`, `REALTIME_SECRET` a Worker secret).

- **Join voice** in the sheet footer asks for the microphone, then becomes **Mute** / **Unmute**; a failure says why on the button.
- **Who hears whom: the same zone group** (see Zones). Players driving an Ooga or gorilla hear each other while they are in the same group, and nobody outside it. Within a group every voice plays at the same volume, however far apart the actors stand. A detached player, one in a game or nowhere (`none`) is out of voice. Every scene with an actor to drive keeps the driving rules, reports the actor driven there every frame with its pose and health (`net.setBody`, `sendPose`, `setHealth`) and clears it in `leave`. On the island, an actor taken over where it already stands inside a cave counts as in that cave, not only one that walked in through the mouth.
- **The Ember Den's tables.** In `ember-den`, players also need the same table open to hear each other (`poker-voice`): opening a table, to play or to watch, joins its voice, and walking the floor returns to the floor's. Everyone stays visible on the floor whichever voice they are in.
- Each page opens two peer connections, one publishing its microphone (the browser offers, the SFU answers) and one receiving (the SFU offers, the browser answers). Every SFU call goes page → Worker (`POST /api/voice/{session,publish,live,pull,renegotiate,close,leave}`, same-site and signed in, 120 a minute) → room → SFU. Only the room holds the secret; a page never sees another player's session.
- A microphone is announced only after its publishing connection is up (`live`): pulling a publication before it connects fails. The room recomputes who hears whom whenever it can change, sends `voice { peers, gens }` when a list changes, and re-checks it on every `pull`, so a page cannot pull a voice it may not hear. The last list each player got is kept in its socket's attachment (`sent`), so a room that slept still sends a list that has just gone empty; it used to assume one had been sent, which left a page hearing a player who had gone, or deaf to one who came back. Each microphone that goes live gets a new count (`gens`), so a page re-pulls a player who published again rather than staying on their dead track. Each page applies one change at a time; a change that fails, or a pull that misses a wanted voice, is retried once on a fresh receive session before the button says voice is unavailable. The first publish gets a second try, and a connection that fails or stays dropped five seconds after it was up starts voice over on its own.
- **Alone, the microphone is off** (#181). The page's `voice` list is exactly whom it may hear, and since everyone in voice publishes, it is also everyone who could hear it: while that list is empty the page holds its microphone track off as a mute does (`stats.alone` in `voice.js`), still published so a newcomer is listed and pulls it, and turns it back on when the room lists someone. It is a client-side gate: the room is not told and needs no change, and a visitor's own mute stands. The note under the clock says "Alone · mic off".
- Sign-out and another tab taking over release the microphone; a reconnect (every deploy) rejoins voice on its own and keeps the visitor's mute.
- **The roster shows it.** In the Ooga Boogas panel each signed-in player's row (their own Ooga, else the one they drive) carries a voice mark after the name: grey while in voice, green while speaking, red with a cross when they muted their microphone. The room's NPC host has a black dot. Speaking is measured on each page (an analyser on its own microphone and on every voice it receives), so it shows only for this visitor and the voices they hear; others show grey or red. A click on another player's mark mutes them for this visitor alone (a slash) and again unmutes them: kept by GitHub login in this browser's localStorage (`oogaboogaland.voice-muted`), never sent anywhere. Their voice is still received, only not played.

The place is reported by the page, as positions are; a tampered page could claim another place to listen there, but only as a signed-in player whose login the room knows.

## The Ember Den's live tables

A signed-in visitor who joins the live tables in the Ember Den holds a second socket, to `/poker`, while they play or watch there (`src/js/poker-net.js`). The Worker checks the site's origin, the session and `POKER_LIMITER` (20 connections a minute per player), sets the `x-player-*` headers as it does for the room, and hands the upgrade to the Durable Object `PokerDen` named `ember-den` (`worker/src/poker-den.js`), which deals all ten tables. Its messages and limits are in `worker/src/poker-protocol.js`; how the tables play is in `docs/banana-poker.md`.

| Direction | Message | Meaning |
|---|---|---|
| client → den | `{ t: "sit", table, seat }` | take a seat (`-1` for the first free one), mid-hand too: dealt in next hand. All of the account's poker bananas come to the table |
| client → den | `{ t: "stand" }` | leave the seat, at once when out of the running hand, otherwise folding at its next turn and leaving when the hand ends; the stack goes back to the account |
| client → den | `{ t: "act", a, n, v }` | fold, check, call or raise to the round total `n`, with the table version `v` the page saw: a version from before the current turn is refused |
| client → den | `{ t: "seed", table, s }` | a seated page's random seed (64 hex) for the next deal, once per deal, after it sees that deal's `commit` |
| client → den | `{ t: "deal" }`, `{ t: "out", on }`, `{ t: "topup" }` | deal now; sit out, or be dealt in again (which also takes back a leave asked for mid-hand); the free daily top-up to 1,000 |
| den → client | `welcome { you, now, wallet, tables }` | on connect: the account, its bananas off the tables and every table's view |
| den → client | `table { i, s, now }` | a table changed: its view for this page, with `deadline` (the acting player's clock) and `dealAt` (the next deal), both in the den's milliseconds |
| den → client | `wallet`, `notice`, `error`, `kick` | the account's bananas changed; something the dealer did for the player; a refused request and why; `replaced` (a newer tab), `full` (64 sockets, though a seated player is always let back in), `stale` (silent 90 s; the page reconnects), `revoked` (the account was banned or deleted) or `signed-out` (it signed out: its seat and bananas are gone) |

A view is the rules engine's `snapshot(viewer)`, the viewer named from the session: the viewer's own cards where they sit, nulls for every other hidden card. The deck and the hole cards never leave the object; its storage holds each table (deck included) and each account's bananas (`w:<id>`), written together whenever a hand moves them. One alarm, for the earliest turn clock, deal or stand-up, does the timing, so the den sleeps whenever no table waits on anything. A page that goes away sits out at once and stands up two minutes later between hands, its stack back in its bananas; a seat whose socket dropped in a deploy, unheard, is treated the same at the next deal, and so is a socket silent for 90 seconds, which the den sweeps once a minute while anyone is there, as the island room does, letting a banned or deleted account go at the same sweep. `DELETE /api/me` calls the den's `forget`, which closes the account's socket, deletes its bananas and frees its seat (after the running hand if its chips are in it, paying it nothing).

## Ooga Chat

One conversation for every signed-in player on the island, in the sheet's last tab (`src/js/chat.js`, `worker/src/room.js`, the `CHAT_*` rules in `worker/src/protocol.js`).

- **Who sees it.** The tab shows only where a backend answered `/api/me`. Signed out, the log still shows and the input is off, with the footer's **Sign in with GitHub** beside it. Choosing the tab focuses the input on a mouse or trackpad, not on a touch screen, so a phone keyboard does not cover the log until asked for.
- **Names come from the session.** Every row shows the editable display name alongside the authenticated `@login`, so a display name does not stand in for identity. The chat panel edits the display name through the existing same-origin `PATCH /api/me` (3–24 supported characters); success reconnects the room using fresh authenticated headers. Whatever identity a page puts in a chat frame is dropped. Existing rows keep the name used when sent.
- **Text.** Kept to the donations note's characters (letters, digits, `_`, space and `.,!?'@#:-`; `src/js/donations.js`), trimmed, 1–160 characters (`CHAT_MAX`). The input explicitly flags unsupported characters and blocks sending until corrected; the server still drops unusable frames softly. Letters here mean A–Z/a–z; emoji and other Unicode letters are not supported. The shared donation sanitizer is unchanged. A chat frame may run to 1,024 characters so a long paste is dropped softly; longer ones are not read. Rows are text, never HTML.
- **Rate.** Each authenticated account has a bucket of 3 lines refilled at 1 a second (`CHAT_BURST`, `CHAT_HZ`), retained across disconnects and tab replacement while the room remains awake; lines over it are refused with `chat-rejected { clientId, reason }` and the socket stays. The input keeps its draft until the room acknowledges its outgoing `clientId` with `chat-ack`, allows one pending send, and preserves edits made while waiting; a refusal asks the player to retry. A disconnect also keeps the draft.
  The bucket map holds at most 64 accounts (`CHAT_BUCKET_KEEP`). Joins and sends needing a bucket opportunistically remove fully replenished inactive entries; if the map is full, a new account is rate-refused until space is available, rather than evicting an account with outstanding debt. No cleanup timer or durable storage is added. Hibernation, restart or redeploy resets all buckets, so this is awake-room anti-spam hardening, not a durable account quota. The outer `/room` connection limiter still allows at most 20 connections per minute per account.
- **Retries.** The page retains a random outgoing `clientId` across a disconnect or rate refusal and reuses it when the same sanitized draft is sent again. Editing into a different message or sending an identical text after acknowledgement creates a new id. Acknowledgements and refusals only affect their matching pending id. The room remembers the newest 3,200 accepted `(authenticated player id, clientId)` pairs and SHA-256 text digests in memory across socket reconnects; a recognized retry is acknowledged without another broadcast or rate-limit token. Reusing an accepted id for different text is refused. Oldest entries expire at the cap; sleep/hibernation, restart or redeploy clears them, and reloading the page loses its retry id. This prevents recognized retries, not durable exactly-once delivery after reset or eviction.
- **Ephemeral retention.** The room keeps the last 100 lines (`CHAT_KEEP`) in memory only, never in storage or D1, and sends them to each joiner. The room sleeps when nothing has happened for a short while, even with players connected (hibernation), and waking clears that memory, so a quiet island's history is soon gone. A page keeps every line it has seen up to 100, merged by id with what a rejoin brings, until it reloads or explicitly signs out. Successful sign-out clears this page’s transcript, draft and pending retry; temporary disconnects preserve them. The retry map keeps digests rather than older full message text; digests are not encrypted history and may be guessed for predictable messages. Other connected pages keep their own transcript until their reload or sign-out. Line ids follow the room's clock, so a woken room does not reuse one.
- **Delivery and input.** One bounded 10-second timer runs only for an outgoing line awaiting a receipt. Timeout reports uncertain delivery and enables a retry with the same id; it does not claim failure or automatically resend. A matching late receipt can resolve that send, but cannot clear a later edited draft (including edits back to identical text). The transcript is not a live region: only new visible live lines and status transitions are announced, never reconnect history or old rows drawn on opening. Enter sends and Escape leaves the input outside IME composition; keyboard focus stays in the sheet, and its inputs do not drive the game.
- **Cost.** No frame work: a line heard while the tab is not showing only joins a capped list, drawn in one batch when it shows. The log follows new lines only while scrolled to its foot, including on reconnect; a reader keeps the same visible line when history merges. There are no idle chat timers; the pending receipt timer is cleared on resolution, disconnect or sign-out.

### Validation boundary (2026-10-09 follow-up)

The same-account immediate-reconnect regression failed before the account bucket change and passes after it. Mocked Room tests cover socket replacement, natural refill, capacity refusal, opportunistic cleanup, wake/reset and accepted-id retry acknowledgement. The page's deterministic chat checks cover drafts and receipts; these do not prove real OAuth or device behavior.

On 2026-10-08, a read-only staging check returned HTTP 200 for `/` and `/api/me`, with `player: null`; the served page contained neither the chat tab marker nor `chat-ack`, so it does not validate this PR's chat implementation. No deployment or sign-in was performed. Real GitHub sign-in/callback, authenticated room reconnection and tab takeover still require the PR on staging and an existing authorized test account. Two-account delivery and scroll/focus behavior need a second consenting test participant in a controlled session; do not send test chat into an occupied public room. A physical iOS/Android phone is needed for software-keyboard opening/closing, visual viewport and safe-area behavior, touch focus, rotation and background/resume. Desktop phone emulation cannot close that gap. The focused local Google Chrome suite uses canned identities and transport, not real OAuth or other players. Actual screen-reader announcement/focus acceptance still needs a user with their screen reader; DOM assertions do not prove what it speaks.

## Banning

A ban refuses the next sign-in and the next room connection. The existing once-a-minute room alarm also checks each connected account in D1 and kicks a banned or deleted account with `revoked`; active chat, presence and room voice eligibility end at the next successful sweep (normally within a minute). A failed D1 read leaves that account connected and retries on the next sweep, so an outage can extend that interval. The check uses the existing operator D1 ban below: no player-facing moderation endpoint or new permission system. It adds at most one player read per connected account per sweep and no new timer.

This is account-level revocation, not per-session revocation: deleting session rows alone (including signing out all sessions) refuses subsequent HTTP requests and reconnects but does not end another already-open socket. An already-established SFU connection is not forcibly closed by the ban check; the room drops the player and removes its voice eligibility from peers, whose clients stop receiving it. Revoking SFU credentials or immediately terminating media independently of cooperating clients would need a separate service-supported design.

```sh
cd worker
npx wrangler d1 execute oogaboogaland --remote --command \
  "UPDATE players SET banned_at = unixepoch(), ban_reason = 'reason' WHERE login = 'someone'; DELETE FROM sessions WHERE player_id IN (SELECT id FROM players WHERE login = 'someone');"
```
