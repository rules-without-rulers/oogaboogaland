# AGENTS.md

Rules for AI agents and people changing Ooga Booga Land. Read it before changing anything. The bar: dependency-free JavaScript at engine quality, correct, measured, allocation-conscious and consistent with the modules around it.

## What this is

A WebGL2 floating island whose cliff caves are projects. The page lands on the hub. The open caves are the EntropyLab lab, where donated bananas feed voxel cavemen who stand for its contributors, and Ooga Rally, a three-track kart race. A plane on the rally cave's roof launches Ooga Drop, a skydive; a launch islet off the south rim flies Ooga Orbit; a vine bridge at 4 o'clock reaches the Mempool island, whose cave reads the chain out in stone; Ooga Mine is the 10 o'clock cave. Pile, crew, effects and loot crates are shared systems, and the pile level is shared everywhere.

The page is static with three live feeds: the mempool.space socket (`mempool.js`), the chain snapshot (`chain.js`: REST from mempool.space or Esplora, plus the Coinbase price socket and its REST fallbacks) and the oogatron stats poller (`oogatron-live.js`: the jumbotron every minute, fireworks when org activity rises). Payments are a simulator stub and all state lives in localStorage. A payments backend comes later and must fit the contract in `src/js/donations.js`; add no network code for it before it exists. Served from Cloudflare, the page sits behind the Worker in `worker/`, which adds GitHub sign-in (`docs/auth-and-presence.md`); served anywhere else it finds no backend and runs as it always has. Player controls are in the README.

## Ground rules

- Read a file before editing it.
- Never run git commands. The maintainer commits. No branches, stashes or `.gitignore` changes unless asked.
- Vanilla JavaScript only: no frameworks, TypeScript, bundler, npm dependencies, external scripts or fonts. `package.json` holds only the build and test scripts.
- Keep the content policy strict. `src/index.html` allows `self` scripts and styles and `connect-src 'self' https: wss:` (an owner decision so the page can poll its feeds; `'self'` lets local `wrangler dev` reach the Worker over http); the build pins inline blocks by hash. Never add `unsafe-inline`, `unsafe-eval`, or a non-`self` script or style origin.
- Smallest change that works. No refactors, reformatting or renames the task does not need. Match the surrounding style.
- No console noise. The suite fails a check if the console is not clean.
- Testing follows the Testing section. Never weaken or skip a check.

## Repository

| Path | What it is |
|---|---|
| `src/index.html`, `src/style.css`, `src/js/` | the sources; open `src/index.html` directly after one `npm run build`, which writes `src/js/characters.gen.js` |
| `src/characters/` | one file per contributor with a custom look, voice or alias |
| `oogaboogaland.html` | the built single-file page; gitignored, built with `npm run build`, committed back by CI's `artifact` job after merges to `rock`. Never commit it by hand |
| `scripts/characters.mjs` | joins `src/characters/*.js` into the gitignored `src/js/characters.gen.js`; the build and the suite run it first |
| `scripts/build.mjs` | inlines `src/` in script order and pins the content-policy hashes |
| `.github/workflows/pages.yml` | builds and deploys on pushes to `rock`, a ten-minute cron or manual runs. The deploy job's token stays read-only with `persist-credentials: false`; only the separate `artifact` job takes `contents: write`, and only on merges to `rock`. Keep that split |
| `test/run.mjs`, `test/browser.mjs` | the suite and its headless Chrome driver, the whole of `test/` |
| `worker/` | the Cloudflare Worker: GitHub sign-in, D1 sessions and `/api/*` in `src/`, migrations, `node --test` checks, `wrangler.jsonc`. Its own `package.json` holds `wrangler`, so the root one keeps only build and test scripts. `npm run build:dist` at the root writes the page and `worker/_headers` into the gitignored `dist/` it serves |
| `.github/workflows/deploy-cloudflare.yml` | on pushes to `rock` and manual runs: unit checks, a fresh jumbotron snapshot, `build:dist`, the Worker's checks, D1 migrations, `wrangler deploy`. Read-only token and no cron, because every deploy drops live sockets. Setup in `docs/cloudflare-setup.md` |
| `docs/` | contracts and runbooks: activity, sign-in, the networking inventory, Cloudflare setup |
| `untracked/` | local planning notes, ignored by git |

Nothing to install. `npm test` needs Node 22 or newer and Chrome; the driver looks at the macOS application path, so elsewhere set `CHROME` to the binary. `npm run test:unit` needs neither Chrome nor a build. Deploy only `oogaboogaland.html`, served as `index.html`: the workflow uploads only `_site/index.html`, never the source tree, and does not run the browser suite.

## Modules and load order

Classic scripts, each an IIFE with `"use strict"`, sharing `window.BL`. A file exposes `BL.<name>` after its file name (`gl-renderer.js` is `BL.glRenderer`), a scene registers on `BL.scenes.<id>`, and `director.js` exposes `window.__ooga` under debug only. The `<script>` tags in `src/index.html` are the dependency and build order: a new module goes after everything it uses, and `director.js` loads last.

| File | Job |
|---|---|
| `qr.js` | QR code for the donation link |
| `math.js` | `mat4`, unit `quat`, easing, damping, hashing, `rayFromView`, stable `sortByKey` with caller-owned `sortScratch` |
| `daylight.js` | the local solar clock: sun, moon and star frame, sky and light factors, six phases; `sample`, `createClock` |
| `scene.js` | nodes (a node with a `quaternion` turns by it instead of its Euler `rotation`), world transforms, camera, bounds cache, tweens |
| `mirror-ripples.js`, `mirror-body.js`, `mirror-damage.js` | the mirror's impact waves, contact atlas, cracks, per-panel health, falling panels and healing |
| `character-visibility.js` | shared geometry bakes and visibility scratch for partly visible characters |
| `gl-renderer.js` | WebGL2: instancing, culling, shadows, sky, sea, clouds, point lights (`POINT_LIGHT_CAPACITY` 32; tiers draw 32/20/10), wind sway, water, lava and road faces (roads cut to marching-squares edges from the 8-neighbour mask `terrain.js` writes into each path tile), `smooth` geometry (averaged vertex normals) and explicit per-vertex `normals` (zeros mean unset), voxel block detail from a geometry's `voxel` grid, bloom and grade |
| `canvas-renderer.js` | the Canvas 2D fallback with the same API; also draws locker icons |
| `models.js` | procedural geometry and shared builders (`box`, `bevelBox` for chunky timber, `lathe`, `merge`, `makeVox`, `voxelGeometry`, `cached`), the lab room, `caveman`, props, crates, `SWAG`. The caveman's belt and loincloth never draw from `k.rand` |
| `convex.js` | `sweptCylinder`: GJK of a body's swept cylinder against rock pieces, for `terrain.js` |
| `terrain.js` | voxel grid, greedy meshing, the island: `heightAt`, `surfaceAt`, `onLand`, `isPath`, mouths |
| `hub-models.js` | cached hub props, `caveSign`/`postSign`, `SIGN_ICONS` and the signs' `SIGN_BADGES`. Foliage is cartoon geometry, not voxels: `leafy` clumps of two-sided leaf cards lit by canopy normals, `puff`, `flower`, `limb`; trees keep a voxel `collisionGeometry` for walking. `flatInto` appends flat-shaded parts (timber, boxes) to a `smooth` geometry and `padNormals` fills zeros after `limb`, so one mesh mixes both `SIGN_GLYPHS`, the 3x5 alphabet every carved sign uses, must stay complete: a missing key silently drops a letter |
| `dressing.js` | the one set-dressing kit (see Set dressing) |
| `lifehash.js` | LifeHash v2 from Blockchain Commons (BSD-2-Clause-Patent; keep the header notice) |
| `jumbotron-data.js`, `jumbotron.js` | baked oogatron stats (schema 3) and the hub board. `refreshData` takes live payloads; the module never fetches. Its 5x7 `FONT` is shared with the Mempool cave; an unknown character draws as a box |
| `headquarters-models.js`, `headquarters-sleep.js` | HQ and basement geometry (11 + 8 bed slots reused across visits) and the validated waypoint graph to the beds: `route`, `clearSegment` |
| `hole-guides.js`, `wall-apertures.js`, `slope-guides.js`, `cave-guides.js`, `rock-guides.js`, `object-guides.js`, `sight-guides.js`, `pile-guides.js`, `banana-cover.js`, `mirror-guides.js`, `camera-cover.js` | the visibility stack, below |
| `caves.js` | the eight cave slots (clock, status, scene, name, repo, `theme`, `soon`) and the gate |
| `characters.js`, `contributors.js` | the registry `src/characters/` calls (`add`, `get`, `all`; rejects duplicate handles), and the roster built from it: oogatron activity (schemas 1-3), working, chilling and sleeping, hashed traits |
| `donations.js` | donation request, simulator, event contract, `sanitize` |
| `mempool.js` | the mempool.space socket: `block`, `fees`, `stats`, backoff, `STALL_MS` redial. Never `want` `track-mempool` (about 225 MB an hour). Off under `nosim` and `mempool=0` |
| `oogatron-live.js` | polls `/v2/stats` once a minute while visible. The `contribution` baseline is the first live poll, never the baked snapshot. Off under `nosim` and `oogatron=0` |
| `chain.js` | the chain `snapshot`, mutated in place; `derive` sets `soak` and `gale`. Off under `chain=0` |
| `weather.js` | the Mempool island's weather: six `STEPS` from `soak`, wind from `gale`, block strikes; `create` returns the instance |
| `weapon-targets.js` | cached triangle BVHs, weapon rays and melee contacts; the nearest contact does not depend on traversal order |
| `interact.js`, `controls.js`, `cursor.js` | pointer gestures and picking; held keys, sticks and chords folded into one axes object per frame; the virtual cursor and pointer lock |
| `pilot.js` | the visitor's view in any scene: orbit camera and presets, free flight, third person, the act button; `possess` asks the scene's optional `mayPossess(cave)` first and toasts its refusal |
| `game.js` | loot tiers, deterministic loot, inventory, localStorage, `formatLarge` |
| `hud.js`, `fx.js` | the DOM panel (roster, meter, feed dialog, locker, toasts, tooltip; `showAccount` fills the sheet foot's sign-in line); the particle pool, speech bubbles, zzz marks, overlay drawing |
| `net.js` | the account and the island room: one `/api/me` look on `start`, then for a signed-in visitor one socket to `/room` for the page life (backoff reconnects; a newer tab's `replaced` kick stops it until `rejoin`). `remotes` (id → login, display, body, pose) is updated in place from the room's 15 Hz snapshots; a scene reports the driven Ooga with `setBody` and `sendPose` (self-throttled). `login`, `logout`, `subscribe`, `state` (`backend`, `me`, `room`, `online`). No JSON from `/api/me` means no backend, and nothing shows. Off under `nosim` and `net=0` |
| `pile-audio.js` | the pile's shared sound for signed-in visitors: an eight-second crackle loop baked once from a fixed seed, played at `(net.serverNow() - net.state.loopEpoch) mod 8 s` so every page hears the same moment, re-seeked past 0.25 s of drift, full within 5 of the pile and gone by 16; a context only after a real gesture, the page-wide mute key, closed in `dispose`. The hub creates it with the remote pool and feeds it the driven Ooga's position, or the camera target |
| `remote-players.js` | the hub's pool of other visitors: a caveman per remote body from `models.caveman`, eased to the room's poses with a walk cycle, a nameplate on the overlay, the crew's own copy of that Ooga sent `away` while someone else drives it, and `actors` for the crew's `outsideActors`; capped at 32, created in `enter`, disposed in `leave` before the crew. A released Ooga comes back through `refreshStates(true)`, settled in place, because a walk back in from `away` assumes a work slot. The hub's `claimOwnOoga` hands a signed-in contributor their own Ooga once a visit. Who may drive which Ooga is `net.mayDrive`, checked in `pilot.possess` through the scene's `mayPossess` (hub and lab); the room keeps its own copy of the ownership rules over the cast `build:dist` writes to the gitignored `worker/src/characters.gen.json` (see `docs/auth-and-presence.md`) |
| `crew.js` | cavemen: work trips, weapons, pile reloading, sleep, strolls, possession, jetpack, swag; `tint` colourways follow the day's price |
| `npc-paths.js` | the surface path graph: 4096 fixed nodes in typed arrays with a binary heap, rebuilt when `path.version` changes |
| `pile.js` | the banana pile: surface layer, then a layered shell over a mound; `MAX_BANANAS`; level on the shared `world` |
| `crates.js`, `critters.js`, `breakables.js`, `solid-props.js` | loot crates; instanced butterflies, fireflies and embers by phase and tier; capped destructible props with safe respawns; props whose render mesh is their collision shell (`segmentClear`, `supportAt`, `ceilingAt`) |
| `agent.js` | the Agent, a voxel gorilla NPC: `create`, `createPlay` |
| `scene-hub.js`, `scene-lab.js`, `scene-pool.js` | the island (registers first, so it is the landing scene), the lab, the Mempool cave |
| `race-track.js`, `racers.js`, `race-items.js`, `race-hud.js`, `race-audio.js`, `race-models.js`, `scene-race.js` | Ooga Rally: tracks, mounts and the AI driver, items, HUD, sound, geometry, the scene. The sector `bake` carries each piece's shading normals (explicit, or averaged for `smooth` ones), so cartoon decor keeps its soft shading merged |
| `skydiver.js`, `drop-hud.js`, `drop-audio.js`, `drop-models.js`, `scene-drop.js` | Ooga Drop: the diver's physics, HUD, sound, the roof plane and course props, the scene |
| `rocket-parts.js`, `rocket.js`, `rocket-models.js`, `rocket-hud.js`, `rocket-audio.js`, `scene-orbit.js` | Ooga Orbit: the part catalog and build checks, flight physics, geometry and launch site, HUD, sound, the scene |
| `mine-rigs.js`, `mine-sim.js`, `mine-models.js`, `mine-hud.js`, `mine-audio.js`, `mine-crew.js`, `scene-mine.js` | Ooga Mine: catalog arithmetic, the seeded allocation-free sim (`snapshot`, `save`, `load`), the cave and its `LAYOUT`, panels, sound, operators, and the scene, which is only a view of the sim |
| `pool-models.js` | the Mempool island's geometry: cartoon flora, animals, bridge and stairwell from the hub kit, solid pieces walking on their first block build (`collisionGeometry`). `merge` does not carry `lineWidth`; set it on the merged geometry |
| `pool-wildlife.js` | the Mempool island's animals, alive: `poolModels.beastRig` faceted rigs driven by a small state machine (idle, walk, rest and sleep, glide for climbing, the log and flight) on the gorillas' pattern; `create` returns `list`, `update`, `startle`, `dispose` |
| `timechain-models.js`, `timechain-beer.js`, `timechain-data.js`, `timechain-boards.js` | the Timechain Sphere off the southwest rim: the walk-in LED ball (sixteen screen lunes and a logo layer lit by `show` through `glow`/`highlight`), its bridge, recliner and beer; the timechainindex.com feed (off under `nosim` unless `timechain=1`) and the six wall boards, built when the camera comes near. Solids count crossings on an upward ray, so a collision shell must be closed: the screen stays off it and the doorway's cut between the skins is walled in the shell |
| `director.js` | the app: renderer, frame loop, governor, keys, donations, routing, transitions |

Load-order constraints beyond "after what it uses":
- `chain.js` loads after `mempool.js`, whose socket it subscribes to, and before any scene reads a snapshot.
- `weather.js` (after `models.js`), `pool-models.js`, `pool-wildlife.js` (after it), `race-models.js`, `drop-models.js`, `rocket.js`, `rocket-models.js` and `solid-props.js` load before `scene-hub.js`, which reads them all at load.
- `rocket-parts.js` and `mine-rigs.js` load before `game.js`, which validates saves with them. `mine-models.js` loads after `hub-models.js`.
- Game scenes load after the hub and the lab, so the hub stays the landing scene, and before `director.js`.

**The visibility stack.** The hub's outlines and cover are the largest system after the scenes. `rock-guides.js` owns the stone the camera looks through and builds `slopeGuides`, `caveGuides`, `holeGuides` and `wallApertures` itself; nothing else creates them, so they load before it. `object-guides.js` is the registry every outline goes through (`pileGuides` and `mirrorGuides` join as providers), `sight-guides.js` draws the result (the hub runs two, one per camera view), and `camera-cover.js` and `banana-cover.js` paint interiors the camera ends up inside. Geometry is built once per island and memoised; fade and camera state belong to the visit. A build-side change must hold for every later visit, and state must return to base in `leave`. `enter` builds `rockGuides` through `ensureRockGuides` and it stays there: deferring it past the first paint stalls the loading curtain. Anything new that reads `headquarters.rockGuides` must guard, as `resetSurface` and `dispose` do, or call `ensureRockGuides()`.

Both renderers implement the same surface: `render(root, camera, opts)` returning whether a frame was drawn, `project(x, y, z, out)`, `ray(px, py, camera, out)`, `resize`, `setQuality`, `releaseGeometry`, `releaseUnused(liveSet)`, `dispose`, and the getters `kind`, `quality`, `ready`, `failure`, `stats` (`records`, `active`, `mirrorResources`, `culled`, `drawn`), `size`. Gameplay code stays renderer-agnostic; anything new goes into both.

## Scenes and the director

One scene is active at a time. `director.js` owns what outlives a scene: the renderer (WebGL2, or Canvas 2D when the context or programs fail), the overlay canvas, the frame loop, governor, quality auto-tier, minute housekeeping, keydown routing (Shift+Delete and Shift+R there, every other key to `active.onKey`), the visibility pause, `game`, `world`, the donation subscription, `?scene=` routing, transitions, the `[data-scene]` HUD sections, `__ooga`, and `destroy` on pagehide. A scene builds its root, camera, input, HUD and systems in `enter` and drops them in `leave`. `world.mine` holds Ooga Mine's whole run across visits; it is cleared when a finished run is left or played again.

The quality auto-tier only steps down. It judges the interval between delivered frames, never the cost of issuing one, because GL calls return before the GPU draws. A window closes at 45 frames or 900 ms, and two slow windows in a row must agree before it steps. Unfocused frames, transitions and the debug `advance` are not evidence. `tierFromBoot` starts the page a tier or two down when the first scene's build passes `BOOT_MEDIUM` (3600 ms) or `BOOT_LOW` (5400 ms), set against the hub building in about 2.35 s on an M4 Max. Check anything that slows the hub build against them with `__ooga.timing` (`ready` minus `renderer`).

The scene contract, as `scene-lab.js` and `scene-hub.js` implement it:

| Member | Role |
|---|---|
| `id` | the key in `BL.scenes` and in `?scene=` |
| `enter(ctx)` | build the visit; set `root`, `camera`, `input`, `debug` on the scene object |
| `update(dt, elapsed)` | per frame, allocation-free; `elapsed` is scene time, restarting at 0 on every enter |
| `overlay(dt)` | draw the frame's 2D overlay (`fx.drawOverlay`); the director paints the fade after it |
| `onDonation(donation)` | a donation event while this scene is active |
| `onKey(e)` | keys the director does not handle itself |
| `onLootCleared()` | the locker was emptied with Shift+Delete |
| `renderOpts` | any of `clear`, `sky`, `ground`, `sun`, `light`, `shadowCenter`, `shadowExtent`, `bloomStrength`; with `horizon` and `zenith` the sky pass draws (plus `moon`, `stars`, `time`); `clouds` (0 to 1); `lights`, a `Float32Array` of up to `POINT_LIGHT_CAPACITY` `x, y, z, radius, r, g, b, 0` entries in priority order with `lightCount`, clamped to the tier; `fog` (rgb) with `fogNear` and `fogFar`, off when absent |
| `leave()` | tear the visit down; returns `{ targets }`, the input target count read before `input.dispose` |
| `stats()` | `visibleNodes`, `allNodes`, `tweens`, `targets` plus the stats of fx, crates, crew, the pile and, in the hub, the critter counts |
| `liveGeometry(set)` | add geometry kept off the graph but wanted on the GPU (the cavemen's swapped heads) |
| `root`, `camera`, `input`, `debug` | set in `enter`; `input` and `debug` nulled in `leave` |
| `agent`, `agentView`, `agentControls`, `agentHandoff` | the Agent hooks the director reads; the hub and lab set all four, the rally, drop and orbit only `agent` and `agentControls` |
| `inMotion` | getter, true while the pile or fx animate; the governor keeps full rate for it even unfocused |

`ctx` is one object for the page life: `{ renderer, canvas, overlay, game, world, go, lootEnabled, testBananas, agentPlay, from }`. `go(id)` starts a transition (throws on an unknown id, ignored while one runs); `from` is the scene being left, `null` on boot. The hub ignores it and always starts on its landing view.

A transition fades to black for 0.25 s, then in one frame: `leaving.leave()`, `clearTweens()`, `enter(next)`, `renderer.releaseUnused(live)` with every geometry under the new root plus its `liveGeometry`, then 0.25 s back in. Under `?debug=1` the director throws if the leave contract is broken: children left on the old root, input targets reported by `leave()`, tweens surviving `clearTweens`, or more GPU records than the new scene has live geometries. `leave` must also clear timers, dispose its systems, input and HUD, and null the visit's module-level references.

## Engine patterns to keep

- **Allocation-free frame loop.** Nothing in `frame`, `updateCaveman`, `drawOverlay` or the renderers allocates per frame. Hoist literals, write into scratch objects (`setVec`, `SCREEN`, `MUZZLE`), reuse arrays. Director simulation, input and overlay work goes in `step`, shared by `frame` and the debug `advance`, so fixed-step checks exercise the displayed-frame path.
- **Pool and cap.** Particles, bullets, bubbles, sleep marks, crates, inventory and the pile have fixed capacities. Anything spawned repeatedly needs a pool or a cap; if in doubt, spawn it in a loop and read `stats()`.
- **Instance by geometry.** Nodes sharing a geometry object are one draw call. Reuse geometry; cache builders with `cached()` or a `Map` keyed by parameters. Cached character clones share immutable geometry but own their nodes, quaternions and part arrays; remap every array member to the clone.
- **Shared builders and index sorts.** Voxel props use `makeVox`, `voxCoords` and `voxelGeometry`. Bounding-volume indexes use `BL.math.sortByKey` with one `sortScratch` allocation, never comparator sorts. Geometry and island-query changes claimed to preserve behaviour need before/after golden hashes.
- **Release what you stop using.** Nodes removed from the graph leave picking and the GPU at the next housekeeping pass. Call `input.remove` for anything you registered.
- **Deterministic cosmetics.** Contributor traits hash from the handle, loot from the donation id via `fnv1a`. `Math.random` only for throwaway effects; `randomInt` (crypto) only where fairness matters, such as the die.
- **Frame rate is sacred.** Full rate whenever focused. Reduce work through the quality tiers (pixel density, effects), never by throttling frames.
- **Camera moves only on input.** No auto-orbit, drift or inertia. Held keys and sticks move the target or the driven caveman while held; damping settles within a few frames.
- **Games run on a fixed step.** The rally, the drop and the orbit accumulate frame time into 1/120 s substeps (at most four a frame), so handling is identical at any frame rate; `pose` and the camera run once per frame. Track data lives in typed arrays or preallocated objects, decor bakes into one merged geometry per sector so the renderer culls a sector at a time, and dynamic batches are fixed-capacity `instanceData`. The drop's course is laid once per visit by flying the diver's own physics without frames.
- **Sound is synthesized and pooled.** No audio files. Every node is built once; a cue only schedules automation on a pooled voice. The context is created only from a gesture the browser has activated (`navigator.userActivation`), and `leave` closes it.
- **The clock is the hub's.** `daylight.sample` writes the hub's `RENDER_OPTS` in place every frame; its phases drive lamps, critters, quotes and toasts. The lab passes no sky; the drop samples the same clock so its sky matches. Working, chilling and sleeping come from contribution age, never from the clock.
- **Free rotation is a quaternion.** Bodies that turn about all three axes (the plane, the diver) carry `node.quaternion` and integrate a world-frame angular velocity with `quat.integrate`; Euler `rotation` stays for anything that only yaws or swings.

## Checks and trust

Validate at boundaries: localStorage on load (`game.load`), donation text (`donations.sanitize`), browser capability (renderer fallback, context loss, program failure) and pointer input (cancellation, second finger, stale targets). Inside those boundaries trust the code. No guards for states our own code cannot produce; a thrown error beats a silent fallback.

## Adding things

**A contributor.** Add one file, `src/characters/<handle>.js`, and nothing else: no shared file, list or test changes. A plain IIFE (`const BL = window.BL;`) calling `BL.characters.add({ handle, joined, lastCommit, look, voice, github, display, dress })`:
- `joined` (Unix seconds) orders the roster, which sets digit keys, grid slots and the default pick. `lastCommit` is the activity until the backend refreshes it.
- `look` overrides the hashed `skin`, `hair`, `fur` and `height` and carries body flags: `build: "slim"`, `bald`, `cleanShaven`, `wideEyes`, `hairless`, `noBrow`, `noPupils`, `face` (`"nose"`, `"smirk"`, `"beard"`, `"none"`), `eyeColor` with `eyeGlow`, `hatY` (sixteenths of height). `crew.js` reads the behaviour flags (`gasMask`, `cigarette`, `skater`, `pumpkin`, `stoneAxe`, `nunchaku`, `recipe`); `contributors.js` reads `maintainer`, which keeps that character working at every project cave until the backend reports its commits. A character that builds `parts.jetpack` (with `parts.jetFlame` under it) flies for good: `crew.js` drives it as it drives the jetpack, and `removeJetpack` only cuts its thrust.
- `voice` is `{ poke, idle: [...] }`. `github` is the login behind the handle; without it, stats keyed by a different login never reach the Ooga, who then sleeps in the HQ forever. `display` is an optional in-game name; matching and hashes still key on `github || handle`.
- `dress` hooks run inside `models.buildCaveman` with the build kit `k` (`h`, `u`, `rand`, `P`, `color(hex)`, `jit`, `skinJ`, `hairJ`, `leopard`, `vg`, `root`, `parts`, `armX`, `eyeCells`, and the settable `nose`, `lid`, `headEmissive`): `torso(k, v)`, `club(k)` (returns `{ voxels, palette, goldPalette }` or `{ default, gold }` geometry, plus `rest` and `carry` angles), `gear(k)`, `skull(k, v)` (true replaces the head block), `crown(k, v)`, `eyes(k, v)` (true replaces the eyes), `mark(k, v)`, `hatY(k)`, `headgear(k)`, `extras(k)`, `tint(k, palette)` (return a second palette and every voxel part bakes again under it; `crew.js` switches between the two on its own timer). Keep accessory builders and their caches in the file. Hooks draw from the shared `k.rand` in build order, so never reorder another character's draws.
- Run `npm run build` to regenerate `characters.gen.js`, then check the "characters" unit check. `npm run characters` lists the cast one line each.

`npm run characters:json` prints every character as the row a backend would hold (`handle`, `github_login`, `display`, `joined_at`, `last_commit_at`, `look`, `voice`). Keep the field names in step with that table. `dress` has no column: geometry stays code. When the backend arrives it owns the dates, as `applyActivity` and `applySnapshot` already overwrite `lastCommit`.

**A prop in the lab.** Build geometry in `models.labRoom` from `box`, `lathe`, `tube`, `ring`, `polyline`, `merge`, or voxels. Return the node in `equipment` if interactive, register it in `scene-lab.js` with `addProp` (which unregisters it in `leave`) using an `owner.kind`, then handle that kind in `tooltipFor` and `onTap`.

**A swag item.** Add an entry to `SWAG` in `models.js`: `id`, `name`, `tier`, `slot` (`head`, `hand`, `face`, `gun`), optional `offset`, `rotation`, `float`, `spin`, and a `build` returning geometry. Weapons are skins: `skin: "club"` or `skin: "gun"` turns the caveman's own club or rifle gold, and `build` only feeds the locker icon. Sizes are fractions of caveman height; the head is about 0.28 wide and 0.22 deep at hair level, so anything wrapping it needs radius 0.38 or more. Stacks cap at `STACK_MAX` (9): `game.lootFor` rolls only items under the cap and `addItem` refuses the tenth.

**A caveman behaviour.** Add state to the `cave` object in `crew.js`, drive it in `updateCaveman`, reset it in `resetPose` if it changes limbs. One-off arm animations must settle back (see cheer and catch). Workers use `cave.work.phase`: `outbound`, `station`, `shoot`, `return`, then `reload` at the pile; `act.kind` tracks meals, builds, wandering, idling and player control. A donation pauses worker movement, bursts and reload timers while the free hand cheers; keep the work phase, ammunition and rifle grip so work resumes. Strolls run only when the scene passes `wanderSpot`; `walkToSlot` leaves a stroller alone unless forced (`rush` forces). Walkers stand on `groundAt`, so a scene with terrain passes its `heightAt`. The hub supplies `bedRoute` and `bedRouteClear` together; shortcuts reuse `headquartersSleep.clearSegment`, and swept walking handles props and other actors.

**Set dressing.** Dress a place from `BL.dressing`, never with one-off props: make a `set()`, `put` kit pieces and `cable` lamps, `build` once and cache it, then add its `solid` (registered with the scene's solids or obstacles), `hang` and `glow` nodes; only `solid` collides. A new piece is a function in `KIT` writing voxels into the three layers; `crate`, `coalCrate`, `dynamiteCrate` and `barrel` are `MESHES` instead, the hub's cartoon crate and barrel fitted to the piece and baked into `solid` (their `keep` voxels, coal and dynamite, still write). Every placed piece is pokeable: `build` also returns `picks` (kind, variant, pick sphere), the hub turns them into off-graph pick targets with `addPieceTargets`, and a new piece gets its tooltip, particles and lines in `PIECES` in `scene-hub.js`. Each mouth's facade comes from `THEMES` in `scene-hub.js`, its sign from `caveSign(name, icon)`. Horizon scenery, palms and the dressing's hanging and glow meshes carry `sightHidden`, because the outline registry bakes every other node under the root and would otherwise cost hundreds of MB and most of a second of boot. A set's `lights` go into the scene's point lights after its own lamps, so the tiers keep torches and fires first. `mineModels.LAYOUT.DRESS_AT` is also the mine walkers' obstacle list. The hub's instanced lawn is relaid when `island.path.version` moves and skipped on Canvas 2D.

**A lamp in the hub.** Build a geometry whose flame faces are the only emissive ones, then `addLamp(node, LAMP.kind, x, y, z)` in `scene-hub.js`: `node.glow` follows the dusk ramp in stagger order and lit lamps fill the point-light array in registration order. A critter kind is a batch in `critters.js`: fixed capacity, homes seeded by `mulberry32`, motion written straight into `instanceData`, population eased toward a phase- and tier-scaled target.

**A rally track.** Add a definition to `TRACKS` in `race-track.js`: `id`, `name`, a `theme` from `THEMES`, `laps`, `seed`, `hazard`, medal `targets` in milliseconds and `points` through `P(x, z, y, { w, bank, surface, wall, curb, pad })`. `slabY` is the driving surface and `roadY` the centreline profile launches read. `build` takes `rain` (greys the outdoor sky, wets the slab, raises `slipAt`); the scene rolls it with `randomInt` per load and `?debug=1&rain=1` or `rain=0` pins it. The spline must not cross itself at the same height; a bridge (`surface: SURF.board`) may cross a lower road. A `SURF.gap` point opens a jump fed by a `pad: 1` on the point before; keep the run-up straight. Then read `spawns` and `checkpoints`, run the `race tracks` check, and make sure every racer finishes under the autopilot.

**A mount.** Add an entry to `MOUNTS` in `racers.js` (top speed, acceleration, brake, turn, drift turn, mass, hop, off-road factor, body radius, garage bars) and a builder in `race-models.js` returning `{ node, seatY, seatZ }` plus the parts `pose` animates. Dinos draw the three shared `DINO_HIDES` so each part is one instanced draw per hide, and their legs pivot at the hip.

**An item.** Add its name to `ITEMS` and `ITEM_NAMES` and its odds to `ODDS` in `race-items.js`, handle it in `use`, and give the AI a rule in `drive`.

**A donation-driven event.** Hook `onDonation` in the scene module. Never change the event shape `{ id, sats, handle, message, at }`; the backend will emit exactly that.

**A launcher on the island.** A scene need not be a cave. The drop's plane is a hub prop (`addProp("plane", …)`) at `dropModels.roofSpot`, with its roof point on `launchers`, a `presets.drop` view and `enterLaunch` (a dolly, then `go("drop")`). Claim its footprint so the scatter keeps off it.

**A cave.** The eight mouths exist in the terrain, one per slot in `caves.js`; a slot with a `repo` is also a work site the crew shoots bananas into. Opening one is one line there (`scene`, `status: "open"`, `name`) plus a scene module registering `BL.scenes.<scene>`. `buildMouth` dresses an open mouth by its `scene`. The new scene needs Escape and a `leave` action back to `"hub"`, and its own `data-scene` sections in `src/index.html` if its HUD differs. On the lowest tier (ten lights) a further open mouth carries `glowOnly`: its torches glow but cast no light.

**A scene.** An IIFE loaded after the systems it uses and before `director.js`, registering every contract member. `update` and `overlay` allocate nothing; `leave` clears timers, disposes crates, pile, crew, fx and the pilot, removes every input target it added, empties `root`, disposes `input` and `hud`, nulls the visit's references and returns `{ targets }`. The camera comes from `pilot.create` with the scene's presets and bounds (`clampTarget`, `clampCamera`): call `readInput` before the crew moves and `update` after, spread `pilot.hooks` into the input hooks, route `act`, `reset-view`, Escape and 0 to it, and `bind` it the shared systems. Give the crew `walkable` and `useNear`, and answer `onTap` for every prop worth a reaction. Register it in the suite (see Testing).

**A HUD element.** Markup in `src/index.html`, styles in `src/style.css` with the existing tokens, wiring in `hud.js` behind a small method, a `data-action` button if it triggers behaviour. Dialogs (`#feed` via `openFeed`/`closeFeed`, `#recipe` via `openRecipe`/`closeRecipe`) keep their keys from the scene. Every readable board (the jumbotron, the Mempool island's chain board and weather sign) opens in the one `#board-modal` through `hud.openBoard(board)`: a board is any object with `title`, `help`, `canvas`, `count`, `index`, `caption`, `note`, `version` and `go(index)` (plus an optional `wide`, which widens the dialog on desktop), the dialog pages it with chevrons, one dot a page and the arrow keys, and repaints when `version` moves (`hud.updateBoard` each frame). Change a board, never the dialog. Counts from a thousand up go through `game.formatLarge`. Blur controls after use so shortcuts keep working. The director writes the active scene to `body[data-active-scene]` (never `data-scene`, which marks the scene sections); the games use it to hide the sheet and the pile count. A game's side panels fold one way everywhere: the panel carries `fold-panel` with `fold-left` or `fold-right`, a `panel-fold` button with `data-fold="<panel id>"` sits in its head, and a `panel-edge` tab with the same `data-fold` follows as its next sibling; `hud.js` toggles `data-folded` and the stylesheet does the rest. A panel title is `.panel-head h3`; a heading inside a panel is `.section-head`. Accent-coloured text on wood uses `--accent-text`; `--accent` stays for fills and borders.

**Panel text.** Nothing truncates: no `text-overflow: ellipsis` anywhere; size a slot for its longest words, stack a stat as label over value over note (`.mine-row`), and let a name that will not fit wrap (`overflow-wrap: anywhere`). A help or keys line is one line, or two split on purpose at a clause (`\n` under `white-space: pre-line`); headings and labels never wrap. Shorten the words before shrinking the type: labels 8.5–9.5px, notes 9.5–10px, values 14px. Prose in intro and results dialogs may wrap. Every popup closes on a press outside it through `hud.dismissOutside(node, close)`; results and intro screens are game state, and only their buttons move on.

**A game's title card.** A `<section class="race-results game-intro" data-intro="<scene id>">` in the game's div, on the mine card's pattern: kicker, sign title, a 16x16 pixel badge, the goal line, six `.game-rules` with 9x9 icons, a `.game-intro-go` button with `data-action="intro-go"`, and Exit Game. The director shows it on every arrival; its button, Enter, Space or Escape close it, and no key reaches the scene while it shows. A `[data-coarse]` line swaps in touch wording.

## Debug

`?debug=1` exposes `window.__ooga`. It owns the page-level handles (`game`, `renderer`, `input`, `scene`, `go`, `advance(seconds, dt)`, `housekeep`, `stats`, `timing`, `frameInterval`, `renderedFrames`, `level`) and forwards a fixed list of names to the active scene's `debug` object. The `for (const key of [...])` loop at the foot of `director.js` is the only reliable inventory: a new handle is one name there plus the field on the scene's `debug`. Each game's handle (`__ooga.race`, `drop`, `orbit`, `mine`) carries `phase` and `simulate(seconds)`, which runs the scene's own update in fixed steps without frames; `__ooga.racers.autopilot = true` lets the AI drive the visitor. Per-character weapon state is on `crew.cavemen` entries.

Debug keys: B adds test bananas (100, or `&b=`), L a legendary tip, P fills the pile, Shift+Delete or Shift+Backspace clear the locker (loot on), Shift+R resets everything. Shift+A plays the active scene's Agent (in the hub it calls in another); `BL.agent.createPlay` lives in the director, reaches scenes as `ctx.agentPlay` and takes its keys in the capture phase. The Konami code toggles the feed panel on any scene without debug (`__ooga.feedPanel`); it subscribes and ticks only while open. Keys are ignored in text fields and on auto-repeat.

One jetpack exists per page, owned by the visitor on `world.jetpack` so it survives a scene change. Its tuning lives in `crew.js` (`JET_*`) and the hub (`JETPACK_*`); `jetpackAllowed` refuses it underground except up the basement shaft, and an abyss fall puts it back on a cloud.

URL flags:
- `?scene=<id>` opens that scene (unknown ids land on the hub). `?canvas2d=1` forces the fallback. `?yaw=` sets the starting camera angle.
- `?nosim=1` silences the simulator and keeps the mempool socket closed; `?mempool=0` closes the socket alone; `?oogatron=0` stops the stats poll; `?net=0` keeps the account module from asking `/api/me`; `?chain=0` stops the REST polling and the price socket, and `?chain=esplora` or `?chain=https://host/api` pins the provider. `__ooga.mempool` (`emit`, `parse`) drives the weather offline, `__ooga.weather.apply` sets its two axes, and `__ooga.chain` readers take raw payloads.
- With `debug=1`: `bananas=` sets the pile level (clamped to `pile.MAX_BANANAS`, ten million); `hour=` pins the clock's starting hour, `time=HHMM` freezes it, `day=` picks the day of year, `latitude=` changes the test latitude and `daylen=` runs a day in that many seconds (`__ooga.setHour(h, daylen, day)` resets it); `loot=1` turns loot on (it ships off behind `LOOT_DEFAULT`).
- Fixtures, applied at startup only: `mag=1|2` grants spare magazines; `solo=1&character=<handle>` builds only that Ooga (none without a valid handle, across scenes); `weapon=1|2` holds the primary or secondary; `ammo=N` (0–30) or `ammo=unlimited` sets that actor's magazine; `character=`, `firstperson=1`, `jetpack=1` and `view=`. In the hub the position readout is on with debug (`pos=0` hides it); clicking it copies a `pose=` URL, and `pos`, `body`, `head`, `camera`, `look` and `mode=carry|shoulder|first-person|birds-eye|orbit|eye-level` set a pose by hand, and `combat=1|0` sets combat.
- **Unfinished games.** A game still being built sets `wip: true` on its scene object, and `director.js` unregisters it unless the page opts in: `?wip=<scene id>` opens that game without `debug`, `wip=1` opens every one. A closed game's cave seals to rock, `?scene=` lands on the hub, `go()` throws, and the hub's other entry points toast "Not open yet"; its saves are never touched. Opening a game for everyone is deleting its `wip: true`. No game is `wip` today.

## Combat and the mirror

A default melee swing deals 1 damage, a full hold charge 1.5 and an AK banana 0.5. Boxes, barrels and rocks have 1, 2.25 and 4.25 health; vegetation is not a target. The mirror takes 68 damage in all: the first 20 form every crack without a hole, then each of its 48 panels holds one health point, and overflow carries to the nearest panel. Debris is a capped pool that settles flat above its support.

Each panel heals at `2 / 48` a second; a missing panel starts growing back after three quiet seconds, scaled by the square root of its health, and cracks seal over a final 1.5 s once every panel has returned. An interrupted repair keeps unhit panels' growth. Until the mirror fully shatters its plane blocks the actor's head, eye and near-plane corners while weapon contacts pass; full shattering lasts the session, releases that barrier and stops the doorway's glyph hint. The room button raises and lowers the bars; occupancy or the latched button turns on character glyphs and the island-wide wave. The mirror room's static faces stay glyphed behind the plane, while other caves keep their materials when the wave is off. Keep all of this state and its caches bounded and reused.

New event geometry and pickup nodes must stay capped and take part in `liveGeometry` and scene disposal. Contributor activity is local snapshot data (`docs/activity-contract.md`), separate from human control presence.

## Testing

**When to test.** The maintainer play-tests every change, so a test run is never automatic. Default to "wait". Run "fast" or "full" only when the task says so. With "wait", a change ends with `npm run build` and `node --check` on every touched file (the build never parses JS, so a stray brace otherwise blanks the page) and nothing else: no scenes, no probe scripts, no screenshots. "fast" means the scenes you touched; "full" means `npm run test:full`. Batch the work first and test once at the end, never after each edit.

**Scenes are the unit of testing.** `npm test -- race mine` runs the global tier plus those two scenes, one Chrome each, side by side. Pick scenes from the files you touched:

| Files | Scene |
|---|---|
| `scene-hub.js`, `hub-*`, `headquarters*`, `critters.js`, `pool-wildlife.js`, `timechain-*`, `weather*`, `jumbotron*`, `npc-paths.js`, `pilot.js` | `hub` |
| `scene-lab.js`, `lab-*` | `lab` |
| `scene-race.js`, `race-*`, `racers.js` | `race` |
| `scene-drop.js`, `drop-*`, `skydiver.js` | `drop` |
| `scene-orbit.js`, `rocket*` | `orbit` |
| `scene-mine.js`, `mine-*` | `mine` |
| `scene-pool.js`, `pool-*`, `chain.js`, `mempool.js` | `pool` |
| anything shared (`director.js`, `scene.js`, the renderers, `crew.js`, `pile.js`, `fx.js`, `game.js`, `hud.js`, `models.js`, `terrain.js`) | `full` |

| Command | Runs | Takes |
|---|---|---|
| `npm run test:unit` or `npm test` | the global tier: the rules as functions in Node, no Chrome (the mine's seeded sim, every game's saves, rocket parts and flights, characters, activity, feeds, adaptive quality, island geometry, collision, sight guides) | about 3 s |
| `npm test -- <scene> …` | the global tier plus those scenes | about 5–15 s a scene, in parallel |
| `npm run test:perf` | the frame-rate floor alone; close other Chrome windows first | one serial session |
| `npm run test:full` | every scene and the perf floor | under a minute |

What each scene proves:

| Scene | Steps |
|---|---|
| `hub` | lab work lanes (open); a donation lands; W A S D walk an Ooga and the Agent their way on screen; Space at the rally mouth, the plane and the rocket pad and a tap on the Mempool stair enter each game; walking off the edge comes back to the pile |
| `lab` | a donation lands; an Ooga and the Agent walk their way on screen and Shift+A leaves no key held; B lands 100 test bananas; Escape lets go, then leaves |
| `race` | Enter through the title card into the race, A D and arrows steer their way on screen; every track builds; Escape pauses; a whole cup under the autopilot; a gold cup opens the mirror, where steering stays true; Race again |
| `drop` | Space closes the title card without taking off, Space at the mark jumps, Escape in the air returns to the board; A Q left and D E right in freefall and under the canopy; a jump lands on target and is saved; a crash keeps its ring points but is never a best |
| `orbit` | the full flight and its log; every key its way on screen on the climb, falling home, under the chute and on the spacewalk; a rocket that falls back names the missed orbit first, even on the pad; Escape to the builder, then to the island |
| `mine` | a run left mid-way resumes after a reload and finishes to its results; Space leaves the intro alone, Enter starts, W A S D and Q E their way on screen, P pauses, Escape closes, pauses, leaves |
| `pool` | Escape returns to the island |

Extra sessions, each its own Chrome: `hub weapons` (the AK spends and R swaps magazines unaimed; one melee swing breaks a box, three a barrel, five a rock, and it comes back; the jetpack climbs on fuel, refills, and the abyss takes it with one notice), `hub mirror` (the Matrix button raises the bars and the wave and lowers them; 68 damage shatters the mirror open and it stays broken), `hub canvas2d` (every scene boots and paints on Canvas 2D), and a `<scene> phone` session per scene at 390x844 with touch (title cards in touch words that start on a tap; nothing clipped, wrapped by accident or off screen; every control on screen and uncovered).

Every scene ends with a round trip: away and back twice under the `?debug=1` leave contract; the second visit may hold nothing the first did not, and a donation handed to the scene mid-visit is taken. Steering is always measured on screen (keys held through the real keyboard path, the move projected through the camera), never derived: signs worked out on paper in this frame come out mirrored. A new scene or game registers with `scene(id, { steps })` in `run.mjs`: its playthrough, its keys on screen and a `trip(id)`.

**The value rule, enforced.** Every step declares why it exists, and the runner refuses to start without it:
- `regression: …` reproduces a real bug that was found and fixed; it stays.
- `playthrough: …` proves the game reaches its result, shown and saved.
- `rule: …` guards something a player would feel break: saves, scoring, the economy, determinism, a gate.
- `contract: …` is the round trip.

A new check must not repeat an existing one: extend that check or leave it. No per-feature pixel checks, no check per `?debug=` flag, and no probe that re-implements a formula from `src/` as its oracle; measure the app through its own functions and controls. A removed feature takes its checks with it in the same change. A scene over `SCENE_BUDGET_S` (25 s) prints `SLOW`.

**Failures and hangs.** A pass prints nothing, a failure prints one `FAIL` line, and the run ends with `N/M checks passed`; `VERBOSE=1` prints every `PASS` and the per-session `TIME` lines.
- A session over two minutes has its Chrome killed and fails; a DevTools command with no reply in 90 s (10 s while Chrome starts) fails its step. A driver error before any assertion reruns the session once on a fresh Chrome and prints `RETRY`. An assertion failure is never retried.
- `untracked/test-ledger.json` records every failing check: its streak, since when and its last detail. A pass clears it. Read it before touching a failure.
- One failure, one attempt: read the check and the code it measures, fix the code (never the threshold), and rerun that scene only.
- When the same check fails a second run in a row, the runner prints `STOP`. Do not try again: report the ledger entry to the maintainer and move on. A handover saying checks fail is not a request to run them.
- A step marked `open` is a known, unfixed bug: it prints `OPEN` with the reason and does not fail the run. Fixing the bug removes the `open`.

**Files.** `test/` is two files: `run.mjs` holds every check and probe, `browser.mjs` is the Chrome driver. Do not add a third. Every page opens with `?debug=1&nosim=1&hour=12&day=80`. A page build costs far more than a check, so make the suite faster with fewer page builds, not faster checks. Never return a scene node or a pick hit from an evaluate, only the fields a check reads.

**The regressions.**
- `wall movement performance` (hub, perf): movement plain and behind cave walls during a donation holds 55 FPS at 1920x1080. If it fails, profile the overlay and cave outlines; never loosen the floor.
- `work movement lab lanes` (hub, open): walkers keep to their facing-right side; on some boots the lane targets sit on the centre or far side.
- `race tracks` (race): every track builds into culled sectors with checkpoints clear of its gaps and releases the old track's GPU records.
- `orbit flow` (orbit): launch, orbit, spacewalk, re-entry and the flight log, including the spacewalk air bonus.

**Frame rate and dice.** The page is vsync-locked, so a check that counts rendered frames measures the display: on battery or in Low Power Mode the same machine renders 30 fps and the app is still correct. Drive motion with an explicit `dt` (`advance`, `simulate`) and keep the one real floor in the perf lane; before trusting a timing failure, check `pmset -g batt` and close other Chrome windows. The clock runs on the page's day of year unless `day=` pins it, the race rolls rain unless `rain=` pins it, and the mine seeds from the clock in the page but takes `{ seed }` in Node. The crew draws some choices with `randomInt` (crypto, not seedable), so a fixture must never be "the first free one" of something the crew also picks from: name it and keep a fallback.

**Not tested:** the hub camera in live play (its guides and outlines are checked in Node), NPC navigation beyond the lane, gorilla and clanker checks, and GPU residency beyond two visits. A regression there reaches the maintainer's play-test first; if one bites, the fix comes with the check that would have caught it.

Profile before optimizing. Boot phases are `performance.mark`s readable from `__ooga.timing`.

## Privacy

No analytics, no external requests, no personal data in the page. Visitor handle and message stay in localStorage. A visitor who signs in on the Cloudflare site has their GitHub id, login, avatar URL, chosen display name and session records (token hash, times, a truncated user agent) kept in D1, and can delete them with `DELETE /api/me`; the GitHub token is never stored. Nothing is kept for visitors who do not sign in. The roster lists public contributor handles only. Every deliberate likeness lives in that person's own file in `src/characters/`, opt-in and removable; all other looks are hashed from the handle. No personal details about real people anywhere else. Test scripts must not embed absolute paths, user names or machine names.

## Before you finish

1. `npm run build` is clean and every touched file passes `node --check`; the scenes you touched pass when the task asked for tests.
2. No new per-frame allocations, no new unbounded arrays, nothing left registered or on the GPU after removal.
3. Both renderers still expose the same surface if you touched one.
4. A scene you touched still keeps the leave contract.
5. Keys, phone layout, and the built `oogaboogaland.html` still work in the scenes you touched: shown by the suite when tests were asked for, otherwise listed under Found for the maintainer's play-test.
6. Your change is the smallest that does the job, and it reads like the code around it.
