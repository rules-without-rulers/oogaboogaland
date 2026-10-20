# Timechain Sphere doorway contract

The shared doorway for [issue #235](https://github.com/OogaBoogaX/oogaboogaland/issues/235), implemented by `src/js/net.js`, `src/js/timechain-gate.js`, `worker/src/room.js` and `worker/src/protocol.js`. Older Workers that do not advertise the capability keep the local fallback.

## What it is for

The Sphere has one doorway on the island (zone `sphere`) and nine rooms behind it (zones `sphere-1` … `sphere-9`). Signed-in players share it, so its short crossing is serialized and shown: an outside observer sees the doors part and the traveler walk into the dim passage and out of sight behind its curtain, and the doors close again. Only the crossing is serialized, never keypad use or loading: a page asks for the doorway only once its room is prepared (code loaded, picture taken), from the waiting spot square to the doors. The reservation coordinates presentation; the room does not simulate anyone's walk.

Signed-out (solo) visits never send any of this: their crossings are local and invisible to everyone else.

## Capability

`welcome` carries `features: ["door", …]` when the room speaks this contract. The page keeps it as `net.state.doorway`; every send below returns `false` and sends nothing without it, and a socket's close clears it.

When a page enters a matching zone, and when a hibernated room wakes, the room replays any live `transit` so that page opens its doors too.

## Messages

Client → room (each under `MESSAGE_MAX`):

| Message | When |
|---|---|
| `{ t: "door", op: "ask", dir: "in" \| "out", room: 1…9 }` | Prepared and standing at the source-side waiting point: outside on the bridge for `in`, hidden behind the passage's curtain (already in zone `sphere`, with a valid pose there) for `out`. |
| `{ t: "door", op: "go", cycle }` | A `grant` arrived and the page rechecked that it is still ready and still where it asked from; the walk starts now. |
| `{ t: "door", op: "done", cycle }` | The traveler is through: behind the curtain at the scene handoff (`in`), or clear of the threshold on the bridge (`out`). |
| `{ t: "door", op: "cancel" }` | Withdraws a pending ask or gives back a grant not yet used (Cancel, a failed recheck, a stale tab). |
| `{ t: "door", op: "pass", door: "sphere-<id>", dir }` | Announces a walk through a room's own doors (arriving in it, or leaving it), so others in that room see them open. Not reserved. |

Room → client:

| Message | Meaning |
|---|---|
| `{ t: "door", op: "wait", ahead? }` | Busy; the request is queued. The page shows "Door in use · waiting" and keeps Cancel. |
| `{ t: "door", op: "grant", cycle, exp }` | The doorway is this page's until `exp` (room clock, ms) if it sends `go` first. |
| `{ t: "door", op: "started", cycle, exp }` | `go` was accepted. This new `exp` bounds the complete crossing; only now does the page open the doors and walk. |
| `{ t: "door", op: "denied", reason }` | Refused (for example, a second pending request). |
| `{ t: "transit", cycle, actor, door, dir, at, exp }` | A crossing started (`go`) or a room door was passed (`pass`): `actor` is the player id, `door` is `sphere` or `sphere-<id>`, `at`/`exp` are room-clock ms. Sent to every page in the doorway's zone (`sphere`) or in that room's zone. The traveler's own page ignores it. |
| `{ t: "transit-end", cycle }` | The crossing finished (`done`), was cancelled, expired, or its traveler disconnected. |

`cycle` is an opaque id of 1–64 characters from `[A-Za-z0-9_-]`, issued by the room.

## Rules the room keeps

- One pending request per socket; a second `ask` while one is pending is `denied`. Requests from signed-out or bodiless sockets are ignored.
- Serve requests in order, one crossing of the shared doorway (`door: "sphere"`) at a time, whichever its direction. A grant that is not followed by `go` within a few seconds lapses and the next request is served.
- A started crossing ends at `done`, `cancel`, body loss, the traveler's disconnect or leaving `sphere`, or its independent crossing `exp`; each sends `transit-end`. A request also drops when its socket closes or is replaced.
- The earliest grant, crossing or room-pass expiry shares the Durable Object alarm with the ordinary minute sweep. A short door alarm expires only door state, so it does not turn account and stale checks into a high-frequency poll. No idle timer keeps the room awake.
- Door queue, active lease and room passes live in hibernatable socket attachments. A wake reconstructs one active exterior lease, its FIFO and all unexpired exact-room passes, then replays matching transits.
- `pass` needs no reservation; the room accepts it only from a bodied player already in that exact room and relays it only there.
- Every operation is rate limited and every queue is bounded by the room's player limit.

## What the page does with it (`timechain-gate.js`)

- Space beside the keypad (or a click on one of its buttons) glides the view into the Ooga's own first person as the Ooga turns to face the physical keypad; nothing loads. Back or Escape glides the view back to the camera the player had.
- Enter on the keypad needs a resolved account (`net.state.resolved`). Signed in, the visit is shared; signed out, solo; unresolved, pressing the selected room retries (`net.recheck`), Enter continues solo, Back returns to room choice and the client never guesses.
- Preparation starts only at Enter and happens before any `ask`, while the Ooga turns to the doors' seam: the room's deferred code, then the room built and painted a slice a frame (`timechain-interior.js` `prepare`), then one picture of it from its handover point and one of the island's passage for the way back. It is bounded at 15 s; a room slower than usual sets the sphere's heartbeat going on the doors. Back cancels it and returns to the keypad with the room still chosen; a failure does the same.
- With `state.doorway`, a shared crossing asks and waits facing the doors; without it (or with no live socket for 6 s), it crosses locally. A lost socket while waiting falls back to the keypad. A grant first receives a server `started` acknowledgement and a fresh crossing deadline; a denial or lapsed grant never opens the doors locally.
- The plug across the doorway (`timechain-models.js`) is lifted only for this page's own guided walk, so nobody tailgates through doors another player opened.
- The walk goes through the doorway onto the passage's axis, and the room's scene takes over without a fade a step past the doors (out of sight from the bridge), from the same eye: the zone goes to `none` there and to the room's once its Ooga stands in it.
- On the way out the room hands over in its vestibule; the hub enters with the Ooga in the passage in front of the curtain, behind the shut doors, in zone `sphere`, waits a beat, asks for `out` when shared, then walks onto the bridge and sends `done` once the doors can close. The island's ordinary camera returns only after they have.

## Zones, presence and voice

`sphere-1` … `sphere-9` match `ZONE_NAME`, have no dot, and are nine separate voice groups, apart from each other and from `sphere`. The page sends the destination body and bounded pose before its zone, and filters remote players by exact zone. A solo visit publishes `none` with no body for its whole length. The Worker rechecks voice eligibility after each asynchronous SFU pull and closes any track whose socket, body, zone, receiving session or publication changed while that call was in flight.
