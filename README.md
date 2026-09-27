# Ooga Booga Land

A WebGL2 floating island whose cliff caves are games. Voxel cavemen stand in for the contributors of [OogaBoogaX](https://github.com/OogaBoogaX); donated bananas feed them, the live Bitcoin mempool makes the weather, and the rim jumbotron shows the org's live stats. Plain JavaScript, no dependencies, read-only network connections only. Payments are a simulator for now; visitor state stays in the visitor's browser.

## Run it

Open `src/index.html` in a browser, or serve `src/` with any static server.

```sh
npm run serve   # build, then serve the built page at http://127.0.0.1:8080/
npm run watch   # the same, rebuilding on every change under src/
```

`PORT` picks another port and `HOST=0.0.0.0` opens the server to the network. Reload the tab after a rebuild.

## The island

- **Fly:** **W A S D**, **Q E** turn, **Z**/**Space** up, **X** down; drag to orbit, scroll to zoom. On a phone the left stick moves and the right stick looks.
- **Play an Ooga:** double-tap one. **Space** jumps (twice for a double jump) and uses whatever is beside you; **Escape** lets go.
- **Views:** **X** switches carry and combat. Combat has first-person, shoulder and birds-eye (scroll out from shoulder); in birds-eye the mouse points your Ooga, **Q E** rotate and **N** turns north up. **Right-click** returns to shoulder.
- **Weapons:** **G** switches, **1** club, **2** rifle. **Left mouse** fires or swings (hold to charge), **R** swaps magazines, **Space** at the pile reloads. Boxes, barrels and rocks break and drop pickups; the mirror cracks and heals.
- **Jetpack:** **J** puts it on; hold **Space** to climb.

Roster colours show activity across every OogaBoogaX repo: yellow worked in the last hour, orange in the last day, gray asleep. Working Oogas load bananas at the pile and shoot them into their project's cave, where their gorilla companions build. HQ's ramps lead down to a basement of beds.

Around the rim: **EntropyLab** (11 o'clock), **Ooga Rally** (9), **Ooga Drop** (the plane on the rally roof), **Ooga Mine** (10), **Ooga Orbit** (the bridge off the south rim), the **Mempool island** (4) and the **Timechain Sphere** (southwest). Every game opens on a title card; **Enter** starts, **Escape** leaves.

## Playing together

On https://obl.ruleswithoutrulers.com, **Sign in with GitHub** at the foot of the side panel to share the island. Signed-in players see each other: whoever drives an Ooga appears as that Ooga, moving live, with their name above it, while the rest of the crew keeps working around them. The panel shows how many are online. Opening the island in a second tab moves you there; the first tab offers **Play here** to move back.

Who drives which Ooga:

- **Contributors drive their own.** If your GitHub login is a contributor's in `src/characters/`, signing in hands you your own Ooga, and while you are signed in nobody else can drive it. Contributors drive only their own Ooga.
- **Everyone else** (signed in or not) may drive an Ooga only when its contributor is not signed in, nobody else is driving it, and it is not working (yellow in the roster). Resting and sleeping Oogas are free to borrow.
- **Owners come first.** When a contributor signs in, their Ooga is handed back to them, and whoever was driving it lets go.

Players driving an Ooga can also talk: **Join voice** at the foot of the panel asks for your microphone, then becomes **Mute**. You hear everyone driving an Ooga in the same place as you, all at the same volume: out on the island, in HQ, or inside the same cave. Step into a cave and you hear only who is in there with you.

Ownership goes by GitHub login, not by name. These rules apply on the signed-in site; the plain GitHub Pages build has no accounts and every Ooga is free there. How it works: `docs/auth-and-presence.md`.

## Timechain Sphere

Sani's hangout: a walk-in sphere whose six inner walls show live [Timechain Index](https://timechainindex.com) data (BTC distribution, address balances, UTXO sizes, ETF and exchange holdings, top holders). The walls load once you come near and refresh every five minutes. Tap a wall for a close-up and its source; tap Sani to spin his chair. Holdings are on-chain balances and API attributions, not proof of ownership. `timechain=0` turns the feed off.

## Games

- **Ooga Rally:** three laps on one of three tracks. **W** go, **S** brake, **A D** steer, hold **Space** to drift and release to boost, **E** throws your item. Win gold in the Cup to open Mirror.
- **Ooga Drop:** jump from the plane, fly through eight hoops (**W S** pitch, **A D** roll, **Q E** turn), **Space** pulls the chute, land on the pile.
- **Ooga Orbit:** build a rocket, launch, reach the Sky Top at 500 up, spacewalk to measure the space rock (**V**), then fall home shield first and chute onto the pad.
- **Ooga Mine:** a mining tycoon about margin. Place gear, watch power, heat and the halving, put out fires, and mine 21 coin within the hour. **W A S D** walk, **Space** works, **V** looks round, **P** pauses; the run saves as you go.
- **The Agent:** double-click it to play; **Shift** gallops, **Space** jumps, **C** beats its chest.

## Weather

The mempool is the weather over the Mempool island: the fee-paying backlog sets how hard it rains (six steps, dry to downpour), incoming transactions set the wind, and every block strikes lightning.

## Debug

`?scene=lab`, `race`, `drop`, `orbit`, `mine` or `dsb` opens that scene; `?nosim=1` silences the simulator and every feed; `?canvas2d=1` forces the Canvas 2D fallback; `?debug=1` exposes `window.__ooga`. AGENTS.md lists every flag and fixture.

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

The rules-without-rulers fork serves the same page from a Cloudflare Worker at https://obl.ruleswithoutrulers.com, with GitHub sign-in. It deploys on every merge to `rock`; `docs/cloudflare-setup.md` covers the setup and local development with `wrangler dev`, and `docs/auth-and-presence.md` the sign-in flow.

To add your Ooga, add one file to `src/characters/` named after your GitHub handle; click **2140data** on the island for a prompt that walks you through it.

## Privacy

No analytics and no personal data. Read-only requests only, nothing about the visitor sent: mempool.space (falling back to Esplora), Coinbase and other public price feeds, the oogatron stats worker and Timechain Index. The donation handle and message stay in localStorage.

On the Cloudflare site, signing in with GitHub is optional. A signed-in player's GitHub id, login, avatar URL, display name and session records are kept in the site's database until they sign out, the session expires or they delete the account (`DELETE /api/me`). The GitHub token is used once and never stored. Nothing is kept for visitors who don't sign in.

DSB Land additionally contacts public Bitcoin feeds and radio/media services; payment is always an explicit action in the visitor's wallet. Zuzu uses local mock replies and deterministic fallback and sends no conversations to an AI provider. Its provider-neutral backend is prepared but not deployed.

## License

Public domain under [The Ooga Booga License](LICENSE), a caveman-speak dedication with the meaning of The Unlicense.

## Contributing

Read [AGENTS.md](AGENTS.md) first: the module layout, the engine patterns, how to add things, and the checks every change must pass.

## DSB Land

Reached through the **Ooga Portal** in HQ's basement. As an Ooga, press **Space** at a lever beside the Pit to switch the portal on, pick **DSB Land** on the screen, then drop through the glowing Pit. To come home, use the **DSB Dialer** beside the upright gate and walk back through it.

Inside: a river boat and the **Bitcoin coaster** (ride on the live price), the **Meme Shop** (demo tokens for snacks and tomatoes), and **NodeRunner TV**, whose radio takes song requests paid over Lightning from your own wallet. **Turtle view** shows the whole land. A direct visit is `?scene=dsb`.

### Zuzu

Zuzu is DSB Land's physical black cat. Approach her and choose **Talk to Zuzu** for a compact free-form conversation panel. Replies are currently clearly labelled local mocks, with deterministic fallback; no real AI provider is connected. Conversation history resets when leaving DSB. The provider-neutral backend foundation is documented in [server/zuzu/README.md](server/zuzu/README.md); it is not deployed or bundled into the game.
