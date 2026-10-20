# The Ember Den poker floor

Ten tables of no-limit Texas Hold'em, nine seats each, with suited gorilla dealers and five cave themes, under
₿IFRÖST. Walk through The Ember Den's window beside DSB Land's and the same Ooga steps straight into the room; the
return mirror brings it back before that window.

There are three ways to play:

| Tables | Where | Who deals |
| --- | --- | --- |
| Practice | any page, the built file included | the page itself, against computer opponents |
| Live | the page the Cloudflare Worker serves (oogabooga.land, staging, `wrangler dev`), signed in with GitHub | the Worker's dealer, the `PokerDen` Durable Object (`worker/src/poker-den.js`) |
| Encrypted deck | a page served by `npm run poker:serve` | the players' own browsers, through the experimental protocol in [poker-protocol.md](poker-protocol.md) |

**Join live tables** in the lobby picks the right one: the dealer's on the Worker's page (signing in first, and
coming back to the room), the encrypted-deck service elsewhere.

## Playing

Choose a table in the lobby (or click one on the floor) to open it, then click an open seat. **Play a practice
hand** seats you at a table with computer opponents and deals. The table opens in one of two views, kept per
browser and switched in its head:

- **3D seat view** (the default with a mouse): the camera moves behind your chair, or over the dealer's shoulder when
  you watch. Every seated Ooga sits in its chair with a name plate above it: name, stack, D, SB or BB, what it last
  did, and while it acts its name turns gold with its clock under it. The pot floats over the felt. Your two cards lie
  face up in front of you on your screen alone; everyone else sees their backs. Bets go out on the felt as bananas,
  and each stack is a hand of bananas sized by how much it holds. Your cards and every action sit in the dock below.
- **Table view** (the default on touch screens): the oval table, with your seat at the bottom, D/SB/BB badges, stacks,
  bets and a side rail with the hand's actions, table options, recent hands and how to play.

Fold, Check/Call and Bet/Raise keep their places. The amount is your **total for the round**; the presets (min, half,
three-quarter, pot, all in) only choose a size, and a pot raise includes the call. The rules enforce minimums, all-in
caps and raise rights. **Walk the floor** keeps your seat; the lobby's return button brings you back. **Leave seat**
during a hand frees the seat when the hand ends: in practice your remaining turns check or fold, and at a live table
you fold when your turn comes, unless **Deal me in** takes the leave back first. Escape walks the floor, then leaves
through the mirror; on a live table, leave your seat first.

## Live tables

Sign in with GitHub, join the live tables, and sit at any open seat, mid-hand too: you are dealt into the next hand.
The dealer deals by itself three seconds after a table has two players ready and five seconds after each hand, and
**Deal now** skips the wait. Each turn has 30 seconds; when it runs out the dealer checks for you when that is free
and folds otherwise, and two in a row sit you out until you press **Deal me in**. A player whose page goes away is
sat out at once, their turns run on a five-second clock, and two minutes later, between hands, they stand up with
their stack back in their bananas. Reloading inside that time puts you back in your seat, dealt in again. A page
whose network drops without closing is found by the same sweep the island room runs, after 90 silent seconds, and
is treated as gone; an account banned or deleted meanwhile is let go at that sweep.

Your Ooga sits in your chair on everyone's screen: the scene reads which Ooga each seated player drives from the
island room, and hides that player's walking copy while they sit. A page that arrives before the room has said who
drives what spreads its pick by the visitor's login, and if the room still refuses it, the page drives another free
Ooga in its place, so nobody loses their voice or their look at the table.

**Voice** follows the table you have open, players and spectators alike; walking the floor returns you to the floor's
voice. These are public conversations, not private channels.

### Who sees which cards

The dealer deals a commit-reveal deck and keeps it and every hole card inside its Durable Object, in memory and in
its own storage. When it books a deal it draws a secret seed with `crypto.getRandomValues` and shows every page the
seed's SHA-256 commitment (`commit`); each seated page then sends a random seed of its own (`seed`), and the deck is a
Fisher-Yates driven by SHA-256 over the dealer's seed, the hand number and the seated pages' seeds (`deckFrom` in
`poker-rules.js`). Once the hand is over the view carries `reveal` (the seed, the seeds, who was dealt in and in what
order), and every page recomputes the deck and replays the deal against the cards it saw (`checkReveal`); the table's
status line reads "Hand N deck verified ✓" or that the check failed. This shows the deck was fixed before the deal and
not picked by the dealer alone; it does not hide the cards from the dealer during the hand, which the encrypted-deck
service ([poker-protocol.md](poker-protocol.md)) does at a large cost in time and phones' CPU. Each page gets the rules
engine's `snapshot(viewer)` for every table, where the viewer is the account the Worker vouched for from its session,
never a field a page sends. That view carries the viewer's own two cards where they sit and nulls for everyone else's.
At a showdown the hands still in are shown to all; folded cards and a hand that wins uncontested are never sent to
anyone. Spectators get the public view. No message can ask for another player's view. The worker checks
(`worker/test/poker-den.test.mjs`) play up to 300 hands at a four-player table and check every message each page
received for a card it may not see.

Players trust the dealer not to look, as at the big online sites. The encrypted-deck protocol is the option that
needs no such trust; it stays in the repository for the local service.

### Bananas

Each account keeps its own poker bananas, starting at 1,000. Sitting down brings all of them to the table and
leaving brings your stack back. Once a UTC day, when your bananas on and off the table are below 1,000, a free
top-up brings them back to 1,000; sitting down with none uses it. They are play money: nothing buys, sells,
transfers or redeems them, and they never meet the donation bananas that feed the Oogas. Practice chips stay
session-only and refill free.

### The dealer

One Durable Object named `ember-den` deals all ten tables (`worker/src/poker-den.js`, its wire format and limits in
`worker/src/poker-protocol.js`). The Worker routes `/poker` there after the same checks as the island room: the site's
own origin, a live session, and `POKER_LIMITER` (20 connections a minute per player). Each table is the rules engine's
dealer table (`BL.pokerRules.createDealer`), saved after every change with any wallet it moved in one storage write,
so a hand outlives the object sleeping, an eviction or a deploy. One alarm, set for the earliest turn clock,
automatic deal or stand-up across the tables, does all the timing; nothing runs on a timer, and the object sleeps
whenever no table is waiting on anything. `DELETE /api/me` tells it to forget the account: its bananas go, its page
closes, and its seat goes at once, or when the running hand ends if its chips are in it.

The page's side is `src/js/poker-net.js`: one socket while you play or watch, the dealer's latest view of every
table in the shape a practice table has, reconnects with backoff, and `busy` while a move awaits the dealer, so a
second click cannot send a second bet.

## Rules

- No-limit Texas Hold'em; blinds 5/10.
- Best five of seven cards, including ace-low straights; heads-up blind and action order.
- Integer accounting, side pots, uncalled excess refunds, ties, and odd chips clockwise from the button. Zero rake.
- A raise's amount is the total for the betting round. A short raise is allowed only all in, and a short all-in does
  not reopen raising unless the action faced adds up to a full raise. No betting into an uncontested dry side pot.
- Practice: free refills below 1,000 between hands, computer opponents, optional automatic deals, no turn clock.

## Practice shuffle and privacy

Each practice hand uses a fresh Fisher-Yates shuffle driven by `crypto.getRandomValues`; without secure randomness
nothing is dealt and no balance changes. The practice table keeps its deck inside a closure and bots act on their own
filtered view. That reduces accidental disclosure; it is not a security boundary against the owner of the browser.

## Look and themes

The room uses ivory limestone, emerald upholstery, brass sunburst panels, geometric floor inlays and chandeliers built
from the world's hanging lantern kit, with vines for the island's character. Cards have rounded paper edges, proper
suits, corner ranks at both ends, pip layouts, original Jack, Queen and King portraits and identical navy-and-gold
banana backs; `poker-cards.js` supplies one cached vector design to both the tabletop meshes and the HUD's SVGs. Card
backs look the same from every side, so walking behind a seat reveals nothing.

Choose **Cave theme** in the lobby or under the table's Room style. A theme changes the stone, chairs, felt, details,
lighting and the HUD together, and ₿IFRÖST's window follows the last one chosen. The preference is kept under
`ooga-poker-theme`; the view under `ooga-poker-view`. Both are conveniences: blocked storage keeps the defaults.

| Theme | Room character |
| --- | --- |
| Banana Club | Ivory limestone, emerald felt, brass fanlights and chandeliers. |
| Crystal Grotto | Blue stone, cyan/amethyst wall crystals, teal lanterns and lagoon felt. |
| Ember Cavern | Basalt colors, glowing amber fissures, copper trim and warm red felt. |
| Jungle Ruins | Mossy limestone bands, hanging vines, rune stones and fern-green felt. |
| Moonstone Hollow | Pale mineral bands, silver trim, cool lanterns and violet felt. |

Switching swaps cached scenery and furniture geometry in place; tables, seats, dealers, card nodes, input targets and
controls stay, and a theme can change mid-hand without touching a bet.

## The rules engine

`BL.pokerRules` (`src/js/poker-rules.js`, loaded by the page and by the Worker):

| Member | Meaning |
| --- | --- |
| `create()` | a practice table: seats only between hands |
| `createDealer(saved)` | the live dealer's table, restored from its own `dump()` when given one |
| `createSealed(initial)` | the encrypted-deck protocol's table, dealing encrypted positions |
| `join(id, name, bot, seat, stack)` | take a seat (the first free one for `-1`), with `stack` chips (1,000 by default); a dealer table seats mid-hand for the next deal |
| `leave(id)` | stand; refused mid-hand while the seat's chips are in the hand |
| `refill(id)` | back up to 1,000 when below, between hands |
| `start()` | deal, with at least two funded players who are not sitting out |
| `act(id, action, amount)` | `fold`, `check`, `call`, or `raise` to a round total |
| `snapshot(viewer)` | a copied public view plus that viewer's cards and legal actions |
| `setOut(id, on)`, `dump()` | dealer tables only: sit out of the next deals; the whole state, deck included, for the dealer's storage alone |
| `version`, `playing` | a change counter and whether a hand is running |

## Files

| File | Job |
| --- | --- |
| `src/js/poker-rules.js` | the rules engine above |
| `src/js/poker-cards.js`, `poker-themes.js`, `poker-models.js` | card artwork, the five themes, the room, tables, chairs, cards, banana hands (`bunch`) and dealers |
| `src/js/poker-hud.js` | the lobby and both table views |
| `src/js/poker-net.js` | the page's side of the live tables |
| `src/js/scene-poker.js` | the room: walking, seats, seated Oogas, the 3D seat view and name plates |
| `src/js/poker-live.js`, `poker-crypto.js`, `poker-match.js`, `poker-worker.js`, `server/poker/` | the encrypted-deck service and its page side ([poker-protocol.md](poker-protocol.md)) |
| `worker/src/poker-den.js`, `worker/src/poker-protocol.js` | the live tables' dealer and its wire format |

## Checks

`npm --prefix worker test` runs the dealer on a mocked Durable Object host with the real rules engine: who sees
which cards over up to 300 hands, the deal and turn clocks, sitting out and dealing back in, a closed page, a silent
one and a restart, standing mid-hand, top-ups, account deletion across a restart, a full den, one seat per account,
requests that change nothing and refused moves. The unit tier (`npm run test:unit`)
keeps the rules checks: hand ranking, pots, odd chips, secure entropy, privacy of snapshots and 300 nine-player
practice hands. The browser sessions `poker floor and play`, `poker canvas2d` and `poker phone` cover the room and
practice play.

Local play-testing of the live tables needs the Worker running locally with two signed-in players; see Local
development in [cloudflare-setup.md](cloudflare-setup.md).

## Interaction references

The interface uses established table conventions, not copied branding or assets:

- PokerStars table appearance: https://www.pokerstars.com/help/articles/table-appearance-feature/
- PokerStars bet slider: https://www.pokerstars.com/is/help/articles/bet-slider-options/11042/?ooac=1
- GGPoker mobile controls: https://legal.ggpoker.com/blog/all-about-the-ggpoker-mobile-app/

No real-money features, promotions or cashier flows were carried into this game.
