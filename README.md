# Ooga Booga Land

A WebGL2 floating island whose cliff caves hold projects and an arcade of games. Voxel cavemen stand in for the contributors of [OogaBoogaX](https://github.com/OogaBoogaX); donated bananas feed them, the live Bitcoin mempool makes the weather, and the rim Oogatron shows the org's live stats. Plain JavaScript, no dependencies, read-only network connections only. Payments are a simulator for now; visitor state stays in the visitor's browser.

## Run it

Open `src/index.html` in a browser, or serve `src/` with any static server.

```sh
npm run serve   # build and stage the site, then serve it at http://127.0.0.1:8080/ (try /oogarally)
npm run watch   # the same, rebuilding on every change under src/
```

`PORT` picks another port and `HOST=0.0.0.0` opens the server to the network. Reload the tab after a rebuild.

## The island

- **Destinations:** each press of **Map** cycles to the next island destination: Pile, Lab, Mirror, HQ, Basement, Mempool, LN Factory, Ooga Arcade, B.C.A., North gate, ₿IFRÖST, TC Sphere, then back to Pile. Your controlled Ooga or gorilla travels with its camera, keeping its heading, framing and carry/combat mode; while detached, only the camera travels. **Mempool** goes to the underground room below the rainforest lake. Wake, stand or finish climbing/jumping before travelling; after a blocked arrival, the next press tries the following destination.
- **Reset camera:** **0** restores framing at your current location in walking scenes. It keeps your actor, carry/combat mode and view type; detached stays detached. Use the last-actor portrait to retake control. Camera viewpoint tabs release control and remain separate from travel and reset.
- **Fly:** **W A S D**, **Q E** turn, **Z**/**Space** up, **X** down; drag to orbit, scroll to zoom. On a phone the left stick moves and the right stick looks.
- **Select or retake:** double-click/tap an Ooga or gorilla. From detached view, the camera stays in place and smoothly turns toward the actor in carry/orbit mode. Switching from another actor smoothly moves the view to the new one. The detached portrait returns to the last actor you controlled, signed in or out. Selecting the current actor does nothing; Escape or holding its portrait detaches.
- **Play an Ooga:** hold **Left Shift** while moving to run. **Space** jumps (twice for a double jump) and uses whatever is beside you. Selecting a sleeping Ooga or gorilla leaves it sleeping; **Space** wakes it.
- **Factory ladders:** walk into a ladder to attach automatically. **W/S** climb up/down, **A/D** shift sideways, and **Space** jumps off. Walking outward onto a ladder from its upper landing starts a descent; release the movement key, then use **W/S** to change direction.
- **Play a gorilla:** double-click or double-tap one to take control. **W A S D** walks, hold **Left Shift** to run, and **Space** jumps with an optional second jump in the air. Controlled gorillas walk at 1.8 m/s and run at 5.4 m/s, twice the NPC pace, with the same animations.
- **Gorilla views:** **X** switches carry/combat. Scroll between first person, shoulder, and orbit/bird's-eye without changing mode; combat shows the same crosshair. **Right-click** returns to shoulder, keeping the mode; from combat bird's-eye it aims at the ground 10 metres ahead. **Right Shift** swaps shoulders (**Right Shift + A/D** peeks), and **Q/E** rotate bird's-eye with **N** for north. **C** beats its chest.
- **Enter combat from orbit:** **X** or the mode portrait smoothly moves into shoulder view when the camera is at or below 45° above the character's orbit focus. A steeper angle enters bird's-eye. This uses the view currently on screen for both Oogas and gorillas, signed in or out; toggling from an existing shoulder or first-person view keeps that view.
- **Gorilla attacks:** hold **Left mouse** to charge a smash; rapid hits are weaker until the power bar recovers. Hold **G** to grab an Ooga riding on you; release **G** to drop them. While holding **G**, hold **Left mouse** to charge a throw, then release the mouse. Carry mode and bird's-eye throw forward at 45° above horizontal; only combat first-person and shoulder views aim toward the crosshair. You can run and jump while carrying them.
- **Gorilla rage:** while signed out, hitting an uncontrolled chilling gorilla with 42 distinct banana rounds within 60 seconds makes it chase the Oogas who agitated it, drag them past nearby Oogas and small props to an inland throwing position, and throw them over the hills toward the nearest usable coast. Raging gorillas show the Agent's original bright green pattern, and nearby NPC Oogas flee as they do from fire. Rage lasts at most 60 seconds; emptying its health bar ends it sooner. Signing in cancels rage. See [gorilla behavior and multiplayer handoff](docs/gorilla-behavior.md).
- **Views:** **X** switches carry and combat. Scroll and right-click keep that mode, signed in or out. Combat has first-person, shoulder and birds-eye (scroll out from shoulder); in birds-eye move the mouse up/down to aim along the centerline from the screen's center to its top, and sideways to turn the view. **Q E** also rotate and **N** turns north up. **Right-click** from bird's-eye or orbit always returns to third-person shoulder view, keeping the Ooga's aimed point. Scroll inward from shoulder to enter first person. Double-right-click from either close view returns to orbit/bird's-eye. In shoulder view, **Right Shift + A/D** peeks; tap **Right Shift** to switch shoulders.
- **Carry targeting:** in carry/orbit, right-click a world location to enter shoulder view looking toward it, for either Oogas or gorillas. The view changes on a short click's release; dragging or adding another mouse button cancels it. Empty sky uses the clicked direction; a point too close or a foreground obstruction hiding the actor keeps their facing. Carry and the native cursor stay active. Detached right-click does nothing; holding both mouse buttons walks and turns without changing view.
- **Cursor:** detached view and both Oogas and gorillas in carry mode use the native cursor: left-drag to look and scroll to zoom. Combat captures mouse look. In combat shoulder or first person, the first right-click after freeing the cursor only resumes mouse look; it neither attacks nor starts a double-click. Once focused, hold right-click for Ooga precision aiming. Sleeping actors ignore right-click view changes; Space wakes them. These controls are the same signed in or out.
- **Tab:** in combat, the first **Tab** or **Shift + Tab** frees captured mouse look and cancels held movement, aiming and actions, keeping the actor, mode and view. Release Tab, then press it again to navigate UI; holding it through the release does not advance focus. Carry, detached view, sleeping actors and focused UI controls use normal Tab/Shift + Tab navigation immediately. This is the same signed in or out; **T** remains the owned-pair switch.
- **Scroll stops:** zooming between first person and orbit/bird's-eye stops at shoulder view for the whole scroll gesture, including momentum. Pause and start a new scroll to continue past shoulder, in either direction. A pinch needs a new touch gesture. Zooming outward from shoulder begins nearby and eases into the wider view.
- **Island cutaway:** combat bird's-eye reveals the lower levels for both Oogas and gorillas, signed in or out. Returning to shoulder or first person keeps the cut during the descent, then restores the intact island once the camera has a clear view of the actor. Underground close cameras move inward when rock blocks their view. Switching to carry or detaching restores the cover immediately.
- **Hidden actors:** when scenery hides your Ooga or gorilla in carry/orbit or shoulder view, the same silhouette and nearby scenery outlines help you find them, signed in or out. First person and combat bird's-eye keep their existing visibility rules.
- **Switching views with actors:** switching directly between controlled actors keeps carry/combat and the view type. Selection from detached view always enters carry/orbit without moving the camera, including the return from GitHub sign-in.
- **Escape:** one step per press: close active UI, free captured mouse look, detach, then leave an interior. Steps that do not apply are skipped. Detached on the island stays there; returning from an interior after detaching stays detached, signed in or out.
- **Switch your pair:** while signed in on the island, **T** switches between your own Ooga and gorilla, smoothly moving the camera between them at their current positions. Pressing T again during the move continues from the current view. From detached view it retakes your Ooga. **G** still switches Ooga weapons or holds a gorilla's grab. Companion switching is available in the hub and its connected islands/caves; separate interior scenes and games have their own actors.
- **Weapons:** **G** switches, **1** club, **2** rifle. **Left mouse** fires or swings (hold to charge), **F** strikes with the rifle in combat mode, **R** swaps magazines, **Space** at the pile reloads. Boxes, barrels and rocks break and drop pickups; the mirror cracks and heals.
- **Matrix lever:** pull the mirror-room lever down to spread glyphs across the island; push it up to make them recede. Entering or leaving the room does not change the wave. The room itself keeps its local glyphs.
- **Reset:** **Right Shift + R** resets saved progress. **Left Shift + R** keeps running while swapping magazines.
- **Jetpack:** **J** puts it on; hold **Space** to climb. After a throw, steer back toward the island to brake and reverse the launch momentum while fuel remains.

Roster colours show activity across every OogaBoogaX repo: yellow worked in the last hour, orange in the last day, gray asleep. Working Oogas load bananas at the pile and shoot them into their project's cave, where their gorilla companions build. HQ's ramps lead down to a basement of beds.

Around the rim: **EntropyLab** (11 o'clock), **B.C.A.** (10), Banana Certified Accounting, where suited gorillas count bananas on abacuses, the **Lightning Factory** (2), **Ooga Arcade** (3), where a cabinet opens each game, the **Mempool island** (4) and the **Timechain Sphere** (southwest). Every game opens on a title card; **Enter** starts, **Escape** leaves.

## Playing together

On the Cloudflare Workers ([oogabooga.land](https://oogabooga.land), and [staging](https://oogaboogaland-staging.wickedsmartbitcoin.workers.dev)), **Contributor sign-in** at the foot of the side panel uses GitHub to share the island. Sign-in requires your own Ooga: an existing character or a temporary one verified from Oogatron's contributor feed. Everyone else can explore signed out. Signed-in players see each other as the Ooga or gorilla they drive, moving live with their name and health above them, while the rest of the crew keeps working around them. The panel shows how many are online. Opening the island in a second tab moves you there; the first tab offers **Play here** to move back.

Signed-in players also share the crew: one player's page runs the Oogas for everyone, so each Ooga walks, works and sleeps in the same place on every screen. If that player leaves, another page takes over by itself.

Who drives which Ooga:

- **Contributors drive their own.** If your GitHub login owns a bundled or verified temporary character, signing in hands you your own Ooga. Contributors drive only their own pair in multiplayer.
- **Sign-in always means an owned pair.** Signed-in players cannot borrow another contributor's Ooga or gorilla. A refused selection keeps the actor you currently control.
- **Signed-out visitors** may play available bundled Oogas and gorillas locally, including working ones. Their page does not join the room, so it cannot check who is online elsewhere and does not publish that control. Local control alone does not show a green signed-in marker.
- **Retake or switch.** The detached portrait retakes your last actor. **T** switches your own Ooga and gorilla while signed in, or retakes your Ooga from detached view.
- **Companions belong to the same owner.** Signed-in contributors can drive their own gorilla, including a server-verified temporary contributor's companion. Other companions cannot be borrowed while signed in. Signed-out companion play stays local.

Players driving an Ooga or gorilla can also talk: **Join voice** at the foot of the panel asks for your microphone, then becomes **Mute**. You hear everyone driving an actor in the same place as you, all at the same volume: out on the island, in HQ, or inside the same cave. Step into a cave and you hear only who is in there with you.

While you are in voice, **M** mutes and unmutes your microphone on the island, in the lab, the Lightning Factory, ₿IFRÖST and the Ember Den (in Ooga Arcade and the games, M still mutes their sound), and a note stays on screen while you are muted. Your own speaker mark in the roster does the same. When nobody else in voice is in the same place as you, your microphone stays off (the note says "Alone · mic off") and turns back on by itself when someone joins; if you muted yourself, you stay muted. Walking your Ooga on the island, you hear your own footsteps; nobody else hears them.

Ownership goes by GitHub login, not by name. These rules apply on the signed-in site; the plain GitHub Pages build has no accounts and every Ooga is free there. How it works: `docs/auth-and-presence.md`.

## Timechain Sphere

Nine rooms behind one door. Walk an Ooga over the bridge and press **Space** at the keypad beside the doors (or tap it): choose one room, **1**–**9**, with the number keys or the buttons, then **Enter**; **Back** or **Escape** lets go without going anywhere. Rooms 1–3 are normal sized, 4–6 half as big again and 7–9 twice the size; the doorway, furniture and controls stay human sized. The doors part, your Ooga walks in and the view moves into its eyes: inside it is first person only, with no weapons or jetpack. **Space** at the Exit button beside the doors walks you back out onto the bridge.

Signed in, a room is shared with everyone who picks the same number (you see and hear each other there, and nobody else); signed out, it is a solo copy just for you. Each room has a wall of live block and mining charts drawn from [mempool.space](https://mempool.space)'s public API (mempool and fees, difficulty, the last 144 blocks, miner dominance, block production, hashrate and difficulty), each naming its source, its window and how current it is; tap one for a close-up. The holdings desk shows the [Timechain Index](https://timechainindex.com) readings (BTC distribution, address balances, UTXO sizes, ETF and exchange holdings, top holders); holdings are on-chain balances and API attributions, not proof of ownership. Sani sits in his recliner in every room: tap him to spin his chair. Each room has its own address, `/sphere-1` … `/sphere-9`. `timechain=0` turns the room feeds off.

## Games

- **The Ember Den:** walk through its window in ₿IFRÖST, beside DSB Land's, straight into a room of ten poker tables, nine seats each, suited gorilla dealers and five cave themes. Practice against computer opponents anywhere. Signed in on the Cloudflare site, **Join live tables** to play no-limit Hold'em with friends: every player's own Ooga sits in its chair, the dealer sends each player only their own two cards, and each turn runs on a 30-second clock. Play from the 3D seat view or the oval table view, and talk to the table you have open. Poker bananas are free play money that stay with your account: 1,000 to start and a free top-up once a day when you run low, never bought, redeemed or mixed with donations. No rake. An experimental encrypted-deck mode remains for local play (`npm run poker:serve`). See [the floor](docs/banana-poker.md) and [the encrypted-deck protocol](docs/poker-protocol.md).
- **Ooga Rally:** three laps on one of three tracks against fourteen rivals drawn from the roster, fresh each time you come back to the garage. **W** go, **S** brake, **A D** steer, hold **Space** to drift and release to boost, **E** throws your item. Win gold in the Cup to open Mirror.
- **Ooga Drop:** jump from the plane, fly through eight hoops (**W S** pitch, **A D** roll, **Q E** turn), **Space** pulls the chute, land on the pile.
- **Ooga Orbit:** build a rocket, launch, reach the Sky Top at 500 up, spacewalk to measure the space rock (**V**), then fall home shield first and chute onto the pad.
- **Ooga Mine:** a mining tycoon about margin. Place gear, watch power, heat and the halving, put out fires, and mine 21 coin within the hour. **W A S D** walk, **Space** works, **V** looks round, **P** pauses; the run saves as you go.
- **The Agent:** double-click it to play; **Left Shift** gallops, **Space** jumps, and a second press while airborne adds a double jump. Each jump is 50% higher than an Ooga's. **C** beats its chest. **Right Shift + A** summons or releases it in scenes with an Agent.

## Weather

The mempool is the Mempool island: transactions arriving make its weather (six steps, dry to downpour, and the wind), everything waiting fills its lake, which floods the shore and pours over the cliffs when the backlog is deep, and every block strikes lightning and drops a cube of the lake through the chamber underneath, where wall paintings read the chain out. Walk in through the hill by the bridge.

## Debug

Each game and cave has an address to share, with its own preview card: `/oogarally`, `/oogadrop`, `/oogaorbit`, `/oogamine`, `/mempool`, `/dsb`, `/entropylab`, `/bca`, `/lightning` and `/sphere`. They work on the site and under `npm run serve`, and as `oogaboogaland.html#/oogarally` when the file is opened from disk; routes live in `src/js/routes.js`, and `npm run cards` recaptures the cards. `?scene=lab`, `race`, `drop`, `orbit`, `mine` or `dsb` opens that scene; `?nosim=1` silences the simulator and every feed; `?canvas2d=1` forces the Canvas 2D fallback; `?debug=1` exposes `window.__ooga`. AGENTS.md lists every flag and fixture.

With `debug=1&totemglow=1`, keep all four repository totems' animated glow patterns at full strength, including continuous pulses on the rings between heads and soft pulses across their painted details. This also works with `nosim=1`. Add `time=2200` to see them at night. The flag leaves repository timestamps and celebrations unchanged.

With `debug=1&poolfill=100`, pin the Mempool lake at half depth immediately. `poolfill` runs from 0 (empty bowl) to 200 (overflowing, with flooded shores and waterfalls), is clamped to that range, and ignores blank or invalid values. It controls depth from the bowl bottom through the full flood level, not volume or transaction backlog. Overflow starts around 176; 180 and 190 show partially filled trenches, and 200 fills the trenches completely. It leaves the live rain unchanged. Omit it for the live backlog level. In the debug console, `__ooga.poolIsland.preview.fill(150)` changes it without reloading; `fill(null)` restores the feed.

With `debug=1&poolblock=1`, trigger one block-cube drop from the bottom of the lake per island visit. It uses the normal gathering, hanging and falling animation without changing the backlog or rain. The rounded water cube floats freely for 4.5 seconds before dropping; hover over it to show its block height above it. Debug cubes capture the current known chain height (or show that it is unavailable). Add `view=mempool` to start in the underground chamber, then turn toward the central shaft to watch. While the flag is on, press **P** for another block animation (lightning and cube); it replaces the normal pile shortcut for that visit.

With `debug=1`, contributor states follow activity timestamps; debug mode alone does not reseed or override them. Pass `status=clankin`, `status=chillin` or `status=sleepin` to pin everyone to one state, or repeat `ooga=<handle>:<mode>[:<caves>]` to set individual owners to `clank`, `chill` or `sleep`. Once any `ooga` flag is present, unlisted owners and omitted/invalid modes sleep, including maintainers and Sani. This fixture overrides `status=` and live activity for the visit. GitHub logins also work. Repeating an owner replaces its earlier setting. The companion gorillas follow their owners' modes.

Clanking requires a comma-separated cave list: `lab` for EntropyLab, `bca` for B.C.A., `obl` for Ooga Booga Land, and `lf` for Lightning Factory. Cave IDs (`c11`, `c10`, `c1`, `c2`) and repository names (`oogaboogax/entropylab`, `oogaboogax/bananacertifiedaccounting`, `oogaboogax/oogaboogaland`, `oogaboogax/lightningfoundry`) also work. Historical Lightning Factory/Foundry names and `bananapayserver` resolve to LF. Unknown caves are ignored; a clank entry with no valid caves sleeps. Workers cycle through only their listed caves. `&ooga=` makes everyone sleep. In normal play, recent contributions to either `lightningfoundry` or `bananapayserver` send the Ooga and its Clanker to the Lightning Factory cave.

Example: five clanking owners, five chilling owners, and everyone else sleeping. w-s-bitcoin visits all three repositories, portlandhodl visits lab/OBL, DrNeski visits lab/LF, bc1gui visits the lab, and 2140data visits OBL. Append this query to the built page's address:

```text
?debug=1&nosim=1&ooga=w-s-bitcoin:clank:lab,obl,lf&ooga=portlandhodl:clank:lab,obl&ooga=DrNeski:clank:lab,lf&ooga=bc1gui:clank:lab&ooga=2140data:clank:obl&ooga=SaniExp:chill&ooga=MrHodlX:chill&ooga=Holo-Elfstone:chill&ooga=Tmmmemcee:chill&ooga=YellowBrokeIt:chill
```

B.C.A. seats two gorillas at its desks and stands a third at a wait spot until one frees. Three owners clanking only there show it:

```text
?debug=1&nosim=1&ooga=w-s-bitcoin:clank:bca&ooga=portlandhodl:clank:bca&ooga=DrNeski:clank:bca
```

In the hub, `?debug=1&character=gorilla-SaniExp` starts controlling SaniExp's gorilla. `clanker-SaniExp` is an equivalent selection, and both prefixes work with `solo=1`. A sleeping selected contributor is woken for this debug visit. Click the canvas to focus combat controls.

While controlling a gorilla, **Space** jumps immediately; press it again in the air for the optional second jump. Holding does not charge or repeat. Walk toward a nearby climbable wall or edge to mount it. On the wall, **W/S** climb up/down and **A/D** move sideways; combine them for diagonal climbing. Automatic mounting and dismounting preserve the camera's position; look and zoom remain available, and camera following resumes smoothly when you move again.

With `?debug=1&gorillamove=1`, use detached mode to click a gorilla, then click its destination on the ground, a ledge or a wall. The selected gorilla stays highlighted and plans walking and climbing from its current position. Wall routes can move sideways or diagonally while keeping the gorilla facing the stone. Click another destination to redirect it; **Escape** deselects it. A marker and status show its progress, and a blocked climb stays in place for inspection. The former `climbers=1` flag is an alias for this mode.

With `?debug=1&nosim=1&status=chillin&gorillarage=1`, click an awake gorilla while detached to start continuous rage. It targets eligible Oogas within 35 m without requiring banana hits, using the normal grab, drag, charge and throw sequence. Click another gorilla to switch; **Escape** stops it and releases any captive. Possession, health depletion, signing in or leaving the scene also stops it. This debug flag takes precedence over `gorillamove=1`; ordinary rage keeps its 60-second limit and only targets its agitators.

## Test

```sh
npm test
```

A headless Chrome suite over the DevTools protocol, a clean console required. Needs Node 22+ and Chrome (`CHROME` points at the binary off macOS). `npm run test:full` is the full gate.

## Build and deploy

```sh
npm run build
```

Writes `oogaboogaland.html`, one self-contained page with the content policy pinned to its hashes. CI commits it back after each merge to `rock`, and GitHub Pages serves it at https://oogaboogax.github.io/oogaboogaland/.

Two Cloudflare Workers serve the same site with GitHub sign-in, the shared island and voice: https://oogaboogaland-staging.wickedsmartbitcoin.workers.dev and https://oogabooga.land (production) both deploy by hand through GitHub Actions; `docs/cloudflare-setup.md` covers the setup and local development with `wrangler dev`, and `docs/auth-and-presence.md` the sign-in flow.

### Deploying to Cloudflare

Deploy only through GitHub Actions, and keep Cloudflare's Git connection (Workers Builds) **off** on both Workers. Two deploy systems on the same push race each other. On 2026-10-03 the Git connection deployed a static-only build next to Actions and wiped staging's secrets, which took down sign-in and voice.

| Environment | URL | Deploys |
|---|---|---|
| Staging | https://oogaboogaland-staging.wickedsmartbitcoin.workers.dev | by hand: **Actions → Deploy Cloudflare staging → Run workflow** on `rock` |
| Production | https://oogabooga.land | by hand once staging looks right: **Actions → Deploy Cloudflare production → Run workflow** on `rock` |

Each workflow builds the site (`npm run build:site`), runs the Worker's checks, applies D1 migrations and deploys with `wrangler.<env>.jsonc`. A deploy drops live connections for a moment, and players reconnect on their own.

Don't:
- connect a Git repository under a Worker's **Settings → Build**;
- use **Edit code**, quick edit or deploy buttons on these Workers in the dashboard;
- run a plain `wrangler deploy` without `--config wrangler.<env>.jsonc`.

After each deploy, from `worker/`:
1. `npx wrangler deployments list --config ../wrangler.<env>.jsonc` shows one new deploy for the push.
2. `npx wrangler secret list --config ../wrangler.<env>.jsonc` lists `GITHUB_CLIENT_SECRET` and `REALTIME_SECRET`.
3. `curl -s https://<host>/api/me` returns `{"player":null}`, not HTML.
4. Two players, one of them in a second browser or a private window, sign in with GitHub, see each other move, and hear each other after **Join voice**.

**Emergency deploy**, only when GitHub Actions is unavailable. Run it from an up-to-date checkout of `rock`, logged in with `npx wrangler login` as a member of the Cloudflare account:

```sh
cd worker
npm ci
npm run deploy:staging      # or: npm run deploy:production
```

The scripts build the site, apply D1 migrations and deploy with the right config. They ship whatever is checked out, so pull `rock` first, then run the checks above.

**If sign-in or voice breaks after a deploy**, `wrangler deployments list` shows what deployed. A deploy that didn't come from Actions means something else is deploying: disconnect it. Then set that environment's own secrets again from the shared password manager:

```sh
npx wrangler secret put GITHUB_CLIENT_SECRET --config ../wrangler.<env>.jsonc
npx wrangler secret put REALTIME_SECRET --config ../wrangler.<env>.jsonc
```

Secrets take effect at once, without a redeploy.
- **Lost secrets:** a lost OAuth secret is regenerated on its GitHub OAuth App. A lost Realtime App Secret means a new SFU app, whose App ID goes into `REALTIME_APP_ID`.
- **"GitHub did not answer"** means a missing or wrong `GITHUB_CLIENT_SECRET`.
- **"Voice unavailable"** means a missing `REALTIME_SECRET` or `REALTIME_APP_ID`.

To add your Ooga, add one file to `src/characters/` named after your GitHub handle; click **2140data** on the island for a prompt that walks you through it.

## Privacy

No analytics and no personal data. Read-only requests only, nothing about the visitor sent: mempool.space (falling back to Esplora), Coinbase and other public price feeds, the oogatron stats worker and Timechain Index. The donation handle and message stay in localStorage.

On the Cloudflare site, signing in with GitHub is optional. A signed-in player's GitHub id, login, avatar URL, display name and session records are kept in the site's database until they sign out, the session expires or they delete the account (`DELETE /api/me`). A player who joins the Ember Den's live tables also has their poker bananas, and while seated their seat, kept by the tables' dealer, deleted with the account. The GitHub token is used once and never stored. Nothing is kept for visitors who don't sign in.

DSB Land additionally contacts public Bitcoin feeds and radio/media services; payment is always an explicit action in the visitor's wallet. Zuzu uses local mock replies and deterministic fallback and sends no conversations to an AI provider. Its provider-neutral backend is prepared but not deployed.

## License

Public domain under [The Ooga Booga License](LICENSE), a caveman-speak dedication with the meaning of The Unlicense.

## Contributing

Read [AGENTS.md](AGENTS.md) first: the module layout, the engine patterns, how to add things, and the checks every change must pass.

## DSB Land

Reached through **₿IFRÖST** beyond the north pass. Walk through the DSB window in its chamber. To come home, use the **DSB Dialer** beside the upright gate and walk back through it into ₿IFRÖST.

Inside: a river boat and the **Bitcoin coaster** (ride on the live price), the **Meme Shop** (demo tokens for snacks and tomatoes), and **NodeRunner TV**, whose radio takes song requests paid over Lightning from your own wallet. **Turtle view** shows the whole land. A direct visit is `?scene=dsb`.

### Zuzu

Zuzu is DSB Land's physical black cat. Approach her and choose **Talk to Zuzu** for a compact free-form conversation panel. Replies are currently clearly labelled local mocks, with deterministic fallback; no real AI provider is connected. Conversation history resets when leaving DSB. The provider-neutral backend foundation is documented in [server/zuzu/README.md](server/zuzu/README.md); it is not deployed or bundled into the game.
