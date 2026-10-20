# Cursor and view controls audit

Status: source audit complete; native carry cursor, Escape order, gorilla multiplayer presence, T switching, camera gestures that preserve carry/combat, signed-in-only local green markers, contributor-only sign-in, shared selection and last-actor retake, independent scroll stops, destination travel, camera-only reset, combat-only island cutaways with clear-camera restoration, right-click return to shoulder, right-click recapture/sleep/gesture parity, shared Tab release/navigation and carry-orbit right-click targeting are implemented. Remaining touch and exceptional-controller details are still open.

Baseline: `origin/rock` at `4113d59b69cbcd0f85207902ce4e36bbec8dfca4`, fetched on 2026-10-18. Work proceeds on `codex/controls-audit` in a separate worktree; existing uncommitted work in the original checkout is outside this PR.

## Purpose and sequence

1. Record the current flows and their source evidence.
2. Identify differences that a player can encounter.
3. Agree the intended flows one scenario at a time.
4. Implement those decisions in small commits on this draft PR.
5. Verify with the repository's requested testing level and the maintainer's play-test.

This document is the review log for the work. Proposed behavior must remain explicitly proposed until agreed. Runtime observations must be distinguished from source inspection.

## Scenario inventory

| Dimension | Cases to compare |
|---|---|
| Controlled subject | Ooga; hub companion gorilla; detached camera; legacy scene Agent where available |
| View | Carry; combat shoulder; first person; orbit/bird's-eye; detached free/orbit views |
| Account | No backend; Worker signed out; signed-in contributor; signed-in noncontributor; ownership/room changes |
| Pointer | Native cursor; locked virtual cursor; focused mouse look; pointer-lock denied or lost |
| Input | Mouse and keyboard; touch sticks and buttons; text fields; dialogs and side panel |
| Transitions | Select/retake actor; switch actor; change view; detach; reset; navigate; enter/leave scene; blur/resume |

## Implementation map

| Source | Responsibility |
|---|---|
| `src/js/interact.js` | Picking, pointer gestures, tap/double-tap, drag, wheel and pinch |
| `src/js/controls.js` | Held keyboard state, touch sticks, Space/action priority, two-button walking |
| `src/js/cursor.js` | Virtual cursor, pointer-lock event routing, native form-control handoff |
| `src/js/pilot.js` | Ooga and detached camera/view state, pointer focus, cursor integration |
| `src/js/clanker-play.js` | Hub companion possession, gorilla keyboard and pointer behavior |
| `src/js/agent.js` | Dedicated scene Agent controller |
| `src/js/net.js` | Account and Ooga ownership permission |
| `src/js/scene-hub.js` and interior scene modules | Controller handoffs, selection, defaults, scene-specific navigation |
| `src/js/hud.js`, `src/js/director.js`, `src/index.html` | Buttons, help, modal handling and top-level shortcut routing |
| `README.md`, `docs/auth-and-presence.md` | Published player controls and ownership rules |
| `test/run.mjs` | Existing control, ownership and view coverage to inspect before extending |

## How to read the current behavior

There are four separate pieces of state: **who is controlled**, **camera view**, **carry/combat intent**, and **pointer focus/capture**. Shoulder view can be carry or combat. Combat can remain selected with a native cursor after capture is released. Account status chooses who can be controlled and the arrival path; the shared cursor and gesture modules do not branch on authentication.

The main cursor discrepancy is direct: **Ooga carry releases pointer lock and uses the native cursor; focused gorilla carry keeps pointer lock and uses a visible virtual cursor.** Despite its name, the pilot's `carryCursor` currently starts only for combat bird's-eye, as a hidden constrained pointer. Its centered-carry camera transition does not activate a virtual cursor. Evidence: [pilot `armed`/`aimView`](https://github.com/OogaBoogaX/oogaboogaland/blob/4113d59b69cbcd0f85207902ce4e36bbec8dfca4/src/js/pilot.js#L239), [pilot `syncAim`](https://github.com/OogaBoogaX/oogaboogaland/blob/4113d59b69cbcd0f85207902ce4e36bbec8dfca4/src/js/pilot.js#L407), [gorilla `syncCursor`](https://github.com/OogaBoogaX/oogaboogaland/blob/4113d59b69cbcd0f85207902ce4e36bbec8dfca4/src/js/clanker-play.js#L61).

The current-behavior tables below preserve the upstream baseline, before this PR's changes. They are not a claim of browser reproduction. Source links are pinned to that baseline; the agreed change is recorded separately below.

## Current subject and pointer flows

| Scenario | Current behavior | Evidence |
|---|---|---|
| Detached aerial camera | Native cursor. WASD/arrows translate; Q/E turn; R/F pitch; Z/Space rise; X descends. Drag orbits; wheel/pinch zooms. Speed depends on distance. | [controls](https://github.com/OogaBoogaX/oogaboogaland/blob/4113d59b69cbcd0f85207902ce4e36bbec8dfca4/src/js/controls.js#L5), [pilot input](https://github.com/OogaBoogaX/oogaboogaland/blob/4113d59b69cbcd0f85207902ce4e36bbec8dfca4/src/js/pilot.js#L2084) |
| Detached eye-level camera | Zooming to the minimum enters a ground-following close view. Movement follows ground/falling rules; vertical flight input no longer translates the camera. `pilot.mode` still reports `detached`. | [close entry](https://github.com/OogaBoogaX/oogaboogaland/blob/4113d59b69cbcd0f85207902ce4e36bbec8dfca4/src/js/pilot.js#L1415), [movement](https://github.com/OogaBoogaX/oogaboogaland/blob/4113d59b69cbcd0f85207902ce4e36bbec8dfca4/src/js/pilot.js#L2117) |
| Ooga carry | Native cursor, drag to look/orbit, no combat reticle. First-person, shoulder and orbit are available. Two mouse buttons together walk forward when the shared shooter state is false. | [cursor release](https://github.com/OogaBoogaX/oogaboogaland/blob/4113d59b69cbcd0f85207902ce4e36bbec8dfca4/src/js/pilot.js#L407), [orbit hooks](https://github.com/OogaBoogaX/oogaboogaland/blob/4113d59b69cbcd0f85207902ce4e36bbec8dfca4/src/js/pilot.js#L1908), [chord](https://github.com/OogaBoogaX/oogaboogaland/blob/4113d59b69cbcd0f85207902ce4e36bbec8dfca4/src/js/controls.js#L138) |
| Ooga combat shoulder/first-person | Reticle; focused/locked mouse motion looks. After focus is released, the first ordinary canvas click captures input without attacking. Later left press attacks; right hold focuses aim. | [mouse look](https://github.com/OogaBoogaX/oogaboogaland/blob/4113d59b69cbcd0f85207902ce4e36bbec8dfca4/src/js/pilot.js#L1070), [attack entry](https://github.com/OogaBoogaX/oogaboogaland/blob/4113d59b69cbcd0f85207902ce4e36bbec8dfca4/src/js/pilot.js#L1164) |
| Ooga combat bird's-eye | Hidden constrained virtual pointer. Vertical motion moves aim along the upper centerline; horizontal motion rotates. Q/E rotate; N restores north. | [cursor](https://github.com/OogaBoogaX/oogaboogaland/blob/4113d59b69cbcd0f85207902ce4e36bbec8dfca4/src/js/pilot.js#L420), [north](https://github.com/OogaBoogaX/oogaboogaland/blob/4113d59b69cbcd0f85207902ce4e36bbec8dfca4/src/js/pilot.js#L1206), [overhead input](https://github.com/OogaBoogaX/oogaboogaland/blob/4113d59b69cbcd0f85207902ce4e36bbec8dfca4/src/js/pilot.js#L2137) |
| Focused gorilla carry | Visible virtual arrow under pointer lock, routed to real HUD/world targets. Drag looks/orbits; shared move/look axes operate. This differs from Ooga carry. | [cursor](https://github.com/OogaBoogaX/oogaboogaland/blob/4113d59b69cbcd0f85207902ce4e36bbec8dfca4/src/js/clanker-play.js#L61), [movement](https://github.com/OogaBoogaX/oogaboogaland/blob/4113d59b69cbcd0f85207902ce4e36bbec8dfca4/src/js/clanker-play.js#L588) |
| Gorilla combat shoulder/first-person | Reticle and focused mouse look. First ordinary unfocused canvas click focuses without starting a smash. Later left hold charges smash; release attacks. Holding G changes the interaction to grab/throw. | [focus](https://github.com/OogaBoogaX/oogaboogaland/blob/4113d59b69cbcd0f85207902ce4e36bbec8dfca4/src/js/clanker-play.js#L206), [pointer handling](https://github.com/OogaBoogaX/oogaboogaland/blob/4113d59b69cbcd0f85207902ce4e36bbec8dfca4/src/js/clanker-play.js#L403) |
| Gorilla combat bird's-eye | Fixed center reticle; horizontal mouse movement rotates, vertical movement is ignored. It does not reproduce Ooga vertical reach aiming. | [center ray](https://github.com/OogaBoogaX/oogaboogaland/blob/4113d59b69cbcd0f85207902ce4e36bbec8dfca4/src/js/clanker-play.js#L87), [look](https://github.com/OogaBoogaX/oogaboogaland/blob/4113d59b69cbcd0f85207902ce4e36bbec8dfca4/src/js/clanker-play.js#L444) |
| Sleeping Ooga | Possession stays out of combat. Space wakes; close view can look from the sleeping pose. Mode toggle asks the visitor to wake/stand first. | [toggle](https://github.com/OogaBoogaX/oogaboogaland/blob/4113d59b69cbcd0f85207902ce4e36bbec8dfca4/src/js/pilot.js#L1730), [possession](https://github.com/OogaBoogaX/oogaboogaland/blob/4113d59b69cbcd0f85207902ce4e36bbec8dfca4/src/js/pilot.js#L1774) |
| Touch | Shared movement/look sticks and drag/pinch. Ooga capture explicitly skips coarse devices. Gorilla capture lacks that guard; canvas combat interception excludes touch and attacks use the smash button. The resulting phone/hybrid cursor presentation needs play-testing. | [Ooga capture](https://github.com/OogaBoogaX/oogaboogaland/blob/4113d59b69cbcd0f85207902ce4e36bbec8dfca4/src/js/pilot.js#L360), [gorilla capture](https://github.com/OogaBoogaX/oogaboogaland/blob/4113d59b69cbcd0f85207902ce4e36bbec8dfca4/src/js/clanker-play.js#L206), [touch exclusion](https://github.com/OogaBoogaX/oogaboogaland/blob/4113d59b69cbcd0f85207902ce4e36bbec8dfca4/src/js/clanker-play.js#L421) |

## Selection, view changes and release

| Action | Ooga | Hub gorilla |
|---|---|---|
| Single click/tap through world picking | Pokes/reacts; does not possess. | Shows its tooltip as a toast. |
| Double-click/tap another actor | Permission check, then possession. Restores that Ooga's carry/combat preference, initially combat. Successful combat selection explicitly requests focus/lock. | Any active visible companion can be possessed. Always resets to combat shoulder and requests focus/lock. |
| Select from high detached view | At least 21 m above the head preserves altitude and enters combat bird's-eye or carry orbit. | Enters shoulder regardless of height. |
| Double-click the same actor | Releases it, when the gesture reaches world picking. | Releases it, when the gesture reaches world picking. |
| Automatic/URL selection | `possess()` alone does not request pointer capture. Signed-in own-Ooga claim uses this path. | Debug URL selection starts combat shoulder but waits for a canvas click to focus. |
| X / selected portrait tap | Toggles carry/combat where the scene forwards the action. Remembered per Ooga for the page session, including across scene visits. | Toggles carry/combat; the next possession resets that preference. |
| Portrait hold | After 650 ms, dispatches detach, where the scene forwards it. | After 650 ms, releases the gorilla. |
| Scroll/pinch | First-person ↔ shoulder ↔ carry orbit/combat bird's-eye. Stops at mode boundaries per gesture. | Same broad sequence, but inward carry-orbit transition forces combat shoulder. |
| Right-click from overhead/orbit | Returns to previous close view, normally shoulder; a first-person exit can return to first-person. Preserves carry/combat intent. | Always returns to combat shoulder. |
| Quick double-right-click in close view | Goes out to carry orbit/combat bird's-eye. | Goes out to carry orbit/combat bird's-eye. |
| Right Shift | In combat shoulder: tap swaps shoulders; hold with A/D peeks. | In combat shoulder: tap swaps shoulders; hold with A/D peeks. |
| Hub map/destination | Keeps and relocates the Ooga, retaining its mode. | Releases the gorilla, then navigates detached. |
| Detach | Preserves the displayed camera eye/heading into free view. | Clears capture/action state and rebases detached pilot from displayed view. |
| Tab | Combat intercepts Tab to release capture/focus. Carry/detached use normal focus traversal. | Intercepts Tab while possessing, even after already unfocused; does not toggle back into capture. |
| Escape | Locked combat first releases capture; afterward the scene decides whether to detach or leave. With soft focus but no lock, Escape can reach the scene immediately. | Focused/locked first releases capture/focus; another Escape releases possession. |

Evidence: [Ooga possession](https://github.com/OogaBoogaX/oogaboogaland/blob/4113d59b69cbcd0f85207902ce4e36bbec8dfca4/src/js/pilot.js#L1763), [Ooga release](https://github.com/OogaBoogaX/oogaboogaland/blob/4113d59b69cbcd0f85207902ce4e36bbec8dfca4/src/js/pilot.js#L1821), [double-tap](https://github.com/OogaBoogaX/oogaboogaland/blob/4113d59b69cbcd0f85207902ce4e36bbec8dfca4/src/js/pilot.js#L2003), [Ooga right-click](https://github.com/OogaBoogaX/oogaboogaland/blob/4113d59b69cbcd0f85207902ce4e36bbec8dfca4/src/js/pilot.js#L1122), [Ooga wheel](https://github.com/OogaBoogaX/oogaboogaland/blob/4113d59b69cbcd0f85207902ce4e36bbec8dfca4/src/js/pilot.js#L1936), [Ooga Tab/Escape](https://github.com/OogaBoogaX/oogaboogaland/blob/4113d59b69cbcd0f85207902ce4e36bbec8dfca4/src/js/pilot.js#L1195), [gorilla possession](https://github.com/OogaBoogaX/oogaboogaland/blob/4113d59b69cbcd0f85207902ce4e36bbec8dfca4/src/js/clanker-play.js#L269), [gorilla keys](https://github.com/OogaBoogaX/oogaboogaland/blob/4113d59b69cbcd0f85207902ce4e36bbec8dfca4/src/js/clanker-play.js#L333), [gorilla right-click](https://github.com/OogaBoogaX/oogaboogaland/blob/4113d59b69cbcd0f85207902ce4e36bbec8dfca4/src/js/clanker-play.js#L390), [gorilla wheel](https://github.com/OogaBoogaX/oogaboogaland/blob/4113d59b69cbcd0f85207902ce4e36bbec8dfca4/src/js/clanker-play.js#L456), [portrait gestures](https://github.com/OogaBoogaX/oogaboogaland/blob/4113d59b69cbcd0f85207902ce4e36bbec8dfca4/src/js/hud.js#L1641), [map handoff](https://github.com/OogaBoogaX/oogaboogaland/blob/4113d59b69cbcd0f85207902ce4e36bbec8dfca4/src/js/scene-hub.js#L7240), [Ooga navigation](https://github.com/OogaBoogaX/oogaboogaland/blob/4113d59b69cbcd0f85207902ce4e36bbec8dfca4/src/js/pilot.js#L2753).

Space is intentionally context-sensitive today: Oogas jump/use nearby controls, while gorillas jump/double-jump, dismount a climb or drop-and-roll when burning. Gorillas do not have the Ooga's general nearby-use action. Weapons, grabs and actor abilities should be considered separately from camera consistency.

## Account scenarios

| Account situation | Ooga selection and arrival | Gorilla / detached behavior |
|---|---|---|
| No backend, static host or `net=0` | All Oogas permitted by `mayDrive`; hub ordinarily starts detached unless a fixture/return applies. | No shared room identity. Gorilla controls use the same local controller. |
| Worker signed out | New claims of working Oogas refused; resting/sleeping can be borrowed locally. No room socket, so online owner/driver information is unavailable. | No authentication gate for companion possession. |
| Signed-in contributor | Own Ooga only. Hub claims it once per visit; explicit detachment stays detached until retake or next visit. Automatic claim does not request mouse capture. | Any active visible companion remains locally selectable; map/retake can release it. |
| Signed-in account with server-added temporary Ooga | A server-vouched Oogatron contributor not yet bundled can receive an own Ooga before scene construction; then own-Ooga rules apply. It requires sign-in to control. This is not universal guest creation. | Same companion controls. |
| Signed-in account with no registered/temporary Ooga | Can borrow nonworking Oogas subject to the room's owner-present/taken information. | Same companion controls. |
| Owner arrival/server rejection while borrowing | Hub releases disallowed Ooga and shows the reason. | No equivalent companion ownership check. |
| Sign-out while driving | Clears room/remotes and voice. Existing bundled Ooga is rechecked with `working=false`, so a working Ooga can remain locally driven although a fresh claim would fail; temporary own Ooga is refused. | No analogous sign-out release for a controlled gorilla. |

Evidence: [account lookup](https://github.com/OogaBoogaX/oogaboogaland/blob/4113d59b69cbcd0f85207902ce4e36bbec8dfca4/src/js/net.js#L275), [temporary registration](https://github.com/OogaBoogaX/oogaboogaland/blob/4113d59b69cbcd0f85207902ce4e36bbec8dfca4/src/js/contributors.js#L31), [room connection gate](https://github.com/OogaBoogaX/oogaboogaland/blob/4113d59b69cbcd0f85207902ce4e36bbec8dfca4/src/js/net.js#L263), [permissions](https://github.com/OogaBoogaX/oogaboogaland/blob/4113d59b69cbcd0f85207902ce4e36bbec8dfca4/src/js/net.js#L467), [hub account changes/claim](https://github.com/OogaBoogaX/oogaboogaland/blob/4113d59b69cbcd0f85207902ce4e36bbec8dfca4/src/js/scene-hub.js#L8285), [gorilla possession](https://github.com/OogaBoogaX/oogaboogaland/blob/4113d59b69cbcd0f85207902ce4e36bbec8dfca4/src/js/clanker-play.js#L269).

Two boundaries matter for the intended design:

- The README says signed-out borrowers cannot take an online owner's Ooga, but signed-out pages do not receive the room's ownership information. This is a documentation/enforcement mismatch, not a different low-level cursor implementation.
- Only `crew.player` is reported as the network body. Normal gorilla possession releases that Ooga, leaving the network body null, like detached mode. Gorilla movement is not published as the visitor's room avatar, and room voice requires a body. Equal cursor controls would not by themselves provide multiplayer gorilla identity. Evidence: [shared body](https://github.com/OogaBoogaX/oogaboogaland/blob/4113d59b69cbcd0f85207902ce4e36bbec8dfca4/src/js/scene-hub.js#L8371), [remote visibility](https://github.com/OogaBoogaX/oogaboogaland/blob/4113d59b69cbcd0f85207902ce4e36bbec8dfca4/src/js/scene-hub.js#L8384), [voice eligibility](https://github.com/OogaBoogaX/oogaboogaland/blob/4113d59b69cbcd0f85207902ce4e36bbec8dfca4/worker/src/protocol.js#L220).

Initial account lookup is awaited before the first scene builds ([director](https://github.com/OogaBoogaX/oogaboogaland/blob/4113d59b69cbcd0f85207902ce4e36bbec8dfca4/src/js/director.js#L623)); the audit does not claim a normal startup race between delayed account lookup and gorilla selection.

## Scene exceptions

These Escape outcomes apply after any modal and pointer-capture handling above them.

| Scene | Escape | Mode-control wiring |
|---|---|---|
| Hub | Detach Ooga; detached stays on island. | X and portrait actions supported; map navigation has actor-specific handoff. |
| Debug lab | Detach, then another Escape leaves. | X and portrait actions supported. |
| Factory | Close guide menu if present; otherwise leave. Kiosk has its own flow. | X and portrait actions supported. |
| Arcade | Close prizes if present; otherwise leave. | Explicitly forces empty-handed carry and hides mode HUD. |
| Bifrost | Leave chamber. | Portrait appears through shared HUD, but only `mode-retake` is forwarded. Tap toggle/hold detach have no handler; X absent. |
| DSB | Detached overview when not inside/transitioning. | Portrait `mode-*` forwarded; X absent. |
| Poker | Leave focused table UI, then stand if seated, otherwise leave floor. | Portrait `mode-*` forwarded; X absent. |

Evidence: [hub](https://github.com/OogaBoogaX/oogaboogaland/blob/4113d59b69cbcd0f85207902ce4e36bbec8dfca4/src/js/scene-hub.js#L10328), [lab](https://github.com/OogaBoogaX/oogaboogaland/blob/4113d59b69cbcd0f85207902ce4e36bbec8dfca4/src/js/scene-lab.js#L337), [Factory](https://github.com/OogaBoogaX/oogaboogaland/blob/4113d59b69cbcd0f85207902ce4e36bbec8dfca4/src/js/scene-factory.js#L1015), [Arcade](https://github.com/OogaBoogaX/oogaboogaland/blob/4113d59b69cbcd0f85207902ce4e36bbec8dfca4/src/js/scene-arcade.js#L855), [Arcade forced carry](https://github.com/OogaBoogaX/oogaboogaland/blob/4113d59b69cbcd0f85207902ce4e36bbec8dfca4/src/js/scene-arcade.js#L1733), [Bifrost Escape](https://github.com/OogaBoogaX/oogaboogaland/blob/4113d59b69cbcd0f85207902ce4e36bbec8dfca4/src/js/scene-bifrost.js#L239), [Bifrost HUD](https://github.com/OogaBoogaX/oogaboogaland/blob/4113d59b69cbcd0f85207902ce4e36bbec8dfca4/src/js/scene-bifrost.js#L536), [DSB](https://github.com/OogaBoogaX/oogaboogaland/blob/4113d59b69cbcd0f85207902ce4e36bbec8dfca4/src/js/scene-dsb.js#L477), [poker](https://github.com/OogaBoogaX/oogaboogaland/blob/4113d59b69cbcd0f85207902ce4e36bbec8dfca4/src/js/scene-poker.js#L312).

The legacy scene Agent is a third controller, not the hub companion. It has camera-relative movement, Q/E turn, C chest beat, H stance and one Escape to release, but no companion carry/combat/overhead/capture flow. Right Shift+A summons/releases it where offered; the hub explicitly excludes it. Evidence: [Agent controller](https://github.com/OogaBoogaX/oogaboogaland/blob/4113d59b69cbcd0f85207902ce4e36bbec8dfca4/src/js/agent.js#L2132), [director](https://github.com/OogaBoogaX/oogaboogaland/blob/4113d59b69cbcd0f85207902ce4e36bbec8dfca4/src/js/director.js#L449). Arcade games' own controls are separate from this walking-camera audit.

## Pointer gestures, UI and interruption

- World gestures: movement beyond 7 px becomes drag; a pending release within 420 ms is a tap; the second tap within 380 ms and 24 px on the same actor/target is double-tap. The first tap already fires. Touch grab waits 320 ms; a second finger cancels grab for pinch. Wheel and pinch share zoom hooks. Evidence: [interact](https://github.com/OogaBoogaX/oogaboogaland/blob/4113d59b69cbcd0f85207902ce4e36bbec8dfca4/src/js/interact.js#L194).
- Virtual cursor: routes pointer presses, primary clicks, hover and wheel to real DOM/world targets. Direct fields and modal dialogs release capture for native interaction. Failed/pending lock consumes canvas presses to retry, while native HUD presses stop virtual mode; right-click can still change view. Evidence: [cursor routing](https://github.com/OogaBoogaX/oogaboogaland/blob/4113d59b69cbcd0f85207902ce4e36bbec8dfca4/src/js/cursor.js#L162), [fallback](https://github.com/OogaBoogaX/oogaboogaland/blob/4113d59b69cbcd0f85207902ce4e36bbec8dfca4/src/js/cursor.js#L218).
- Sheet focus differs by actor. Ooga/shared/director guards exclude all of `#sheet`; gorilla/legacy Agent guards exclude fields/dialogs but not the sheet. Gorilla capture-phase Space/Tab/Escape can consume focused sheet-button keys. Legacy Agent additionally captures arrows/WASD. Evidence: [shared guard](https://github.com/OogaBoogaX/oogaboogaland/blob/4113d59b69cbcd0f85207902ce4e36bbec8dfca4/src/js/controls.js#L65), [pilot guard](https://github.com/OogaBoogaX/oogaboogaland/blob/4113d59b69cbcd0f85207902ce4e36bbec8dfca4/src/js/pilot.js#L1196), [gorilla guard](https://github.com/OogaBoogaX/oogaboogaland/blob/4113d59b69cbcd0f85207902ce4e36bbec8dfca4/src/js/clanker-play.js#L149), [gorilla keys](https://github.com/OogaBoogaX/oogaboogaland/blob/4113d59b69cbcd0f85207902ce4e36bbec8dfca4/src/js/clanker-play.js#L333), [Agent keys](https://github.com/OogaBoogaX/oogaboogaland/blob/4113d59b69cbcd0f85207902ce4e36bbec8dfca4/src/js/agent.js#L2143).
- Field guards also disagree on `select`/`contenteditable`. Existing sheet selects are protected by their ancestor for Oogas; the mismatch is a policy gap, not evidence every field currently misbehaves.
- Native double-click resets sheet height. The virtual cursor synthesizes `click` with detail 1 and does not retarget `dblclick`, so focused gorilla carry cannot use the same reset gesture on that handle. Evidence: [synthetic click](https://github.com/OogaBoogaX/oogaboogaland/blob/4113d59b69cbcd0f85207902ce4e36bbec8dfca4/src/js/cursor.js#L47), [compatibility suppression](https://github.com/OogaBoogaX/oogaboogaland/blob/4113d59b69cbcd0f85207902ce4e36bbec8dfca4/src/js/cursor.js#L258), [sheet reset](https://github.com/OogaBoogaX/oogaboogaland/blob/4113d59b69cbcd0f85207902ce4e36bbec8dfca4/src/js/hud.js#L1929).
- Chat-tab selection focuses its input on desktop, but virtual cursor post-click unlock checks only for a modal. Indirect focus from gorilla carry needs a play-test for cursor/focus behavior. Evidence: [Chat focus](https://github.com/OogaBoogaX/oogaboogaland/blob/4113d59b69cbcd0f85207902ce4e36bbec8dfca4/src/js/chat.js#L235), [post-click](https://github.com/OogaBoogaX/oogaboogaland/blob/4113d59b69cbcd0f85207902ce4e36bbec8dfca4/src/js/cursor.js#L198).
- Generic feed/recipe/board dialogs do not themselves reset every held movement key; some specialized interfaces explicitly suspend the pilot. The consequence of opening one while holding movement remains to be measured. New key presses in dialogs are filtered, and key-up still clears held state. Evidence: [controls](https://github.com/OogaBoogaX/oogaboogaland/blob/4113d59b69cbcd0f85207902ce4e36bbec8dfca4/src/js/controls.js#L65), [feed](https://github.com/OogaBoogaX/oogaboogaland/blob/4113d59b69cbcd0f85207902ce4e36bbec8dfca4/src/js/hud.js#L970), [board](https://github.com/OogaBoogaX/oogaboogaland/blob/4113d59b69cbcd0f85207902ce4e36bbec8dfca4/src/js/hud.js#L1383), [recipe](https://github.com/OogaBoogaX/oogaboogaland/blob/4113d59b69cbcd0f85207902ce4e36bbec8dfca4/src/js/hud.js#L1555).
- Window blur clears shared held keys/chords and releases controller focus. Pointer-lock loss clears attacks/virtual presses. Gorilla catches synchronous lock errors; Ooga only handles promise rejection/lock-error events. No failure-path browser observation has been made. Evidence: [controls blur](https://github.com/OogaBoogaX/oogaboogaland/blob/4113d59b69cbcd0f85207902ce4e36bbec8dfca4/src/js/controls.js#L89), [pilot capture](https://github.com/OogaBoogaX/oogaboogaland/blob/4113d59b69cbcd0f85207902ce4e36bbec8dfca4/src/js/pilot.js#L360), [pilot lock loss](https://github.com/OogaBoogaX/oogaboogaland/blob/4113d59b69cbcd0f85207902ce4e36bbec8dfca4/src/js/pilot.js#L1246), [gorilla capture](https://github.com/OogaBoogaX/oogaboogaland/blob/4113d59b69cbcd0f85207902ce4e36bbec8dfca4/src/js/clanker-play.js#L206).

## Findings to resolve

| ID | Finding | Evidence status | Decision |
|---|---|---|---|
| C01 | Native cursor in Ooga carry versus locked virtual cursor in gorilla carry. | Source-confirmed | Native cursor agreed and implemented below |
| C02 | Capture/Tab/Escape behavior varies with actor, capture success and entry path. | Source-confirmed | Escape order and shared Tab release/navigation implemented below |
| C03 | Gorilla right-click and inward zoom can change carry to combat; Ooga preserves intent. | Source-confirmed | Mode preservation agreed and implemented below |
| C04 | Ooga remembers mode/preserves high selection; gorilla resets combat shoulder. | Source-confirmed | Replaced by the agreed shared selection/retake flow |
| C05 | Ooga bird's-eye has vertical aim; gorilla has fixed center aim. | Source-confirmed | Distinct aim models retained; gorilla right-click to shoulder aims at ground 10m ahead |
| C06 | Hub map keeps Ooga but releases gorilla; generic presets also detach Oogas. | Source-confirmed | Current map/reset audit and recommendations below; agreement pending |
| C07 | Sheet keyboard handling and field exclusions differ by actor. | Source-confirmed dispatch paths | Gorilla sheet key guard and shared Escape UI priority implemented; other focus flows pending |
| C08 | Bifrost mode buttons lack handlers; X/HUD and Escape differ across walking scenes. | Source-confirmed wiring | Escape and missing X/HUD routing implemented; existing scene restrictions retained |
| C09 | Virtual/native HUD gestures differ; Chat indirect focus and coarse-device gorilla capture need review. | Missing dblclick route confirmed; visual consequences untested | Pending |
| C10 | Signed-out ownership wording exceeds available presence data; gorilla has no shared room body. | Source-confirmed boundary | Gorilla room body implemented; signed-out presence boundary unchanged |
| C11 | Close-view look may apply twice: carry Q/E and R/F, and look-stick yaw/pitch in carry or combat, except lying. Combat keyboard Q/E applies once. | Suspected sensitivity defect, unmeasured: [first application](https://github.com/OogaBoogaX/oogaboogaland/blob/4113d59b69cbcd0f85207902ce4e36bbec8dfca4/src/js/pilot.js#L2059), [tail](https://github.com/OogaBoogaX/oogaboogaland/blob/4113d59b69cbcd0f85207902ce4e36bbec8dfca4/src/js/pilot.js#L2150) | Measure if runtime checks requested |
| C12 | Forced Arcade carry can become the Ooga's remembered mode on return. | Source-confirmed state path; intent undecided | Pending |

At the upstream baseline, help also lagged behavior: README omitted Tab, capture-only first click, detached eye-level, portrait hold and double-right-click. “Escape lets go” missed capture/scene layers. Some weapon hints said scroll out for navigation although combat zoom stayed in combat overhead. AGENTS asked shared scenes to route 0 to pilot, but several walking scenes had no 0 handler. Help changes are recorded with each agreed flow below.

## Proposed agreement order

Native/captured cursor choice, Escape order, multiplayer companions, T switching and camera mode preservation are agreed below. Other recommendations remain proposals.

| Order | Scenario | Proposed rule | Open choice |
|---|---|---|---|
| 1 | Cursor while exploring/carrying | Detached and both actors in carry use a native cursor; drag looks, wheel zooms. Combat can capture the mouse after a deliberate gesture. | Native cursor choice agreed; sheet key guard now aligned. |
| 2 | Freeing/resuming the cursor | Tab frees capture without changing actor/view/combat. Once free, Tab can navigate UI. A canvas click resumes capture without attacking. Escape closes the top UI, then frees capture, then detaches; a separate final Escape may leave a cave. | Escape order, detached interior exit and Tab release/navigation implemented below. |
| 3 | Selecting/retaking an actor | Same manual selection flow for Ooga/gorilla. Automatic arrivals keep native cursor until a gesture. Preserve carry/combat preference; selection and zoom should not silently change combat intent. | Agreed below: detached acquisition keeps the eye and enters carry/orbit; active switches keep mode/view; same-actor selection does nothing. |
| 4 | Camera modes | Wheel and right-click preserve carry/combat; X switches it. Gorilla combat bird's-eye right-click aims shoulder view at ground 10m ahead; Ooga keeps its selected point. | Agreed, including whole-gesture shoulder stops, nearby scroll entry and right-click always returning to shoulder. |
| 5 | Map, reset and scene transitions | Define actor retention explicitly and apply it consistently. Keep selected mode unless a scene has a clearly communicated limitation. | Map transports controlled actor, or always detaches? How should Arcade's carry restriction restore prior preference? |
| 6 | Accounts and exceptional controllers | Authentication changes eligibility/presence, with the same controls for permitted actors. Document legacy Agent and game exceptions. | Gorilla multiplayer identity is now in scope and implemented below; exceptional controllers still need review. |

Touch should provide equivalent actions using sticks/buttons and native touch UI, without requiring mouse capture. Sleeping, climbing, kiosk/table interactions and actor-specific abilities remain explicit cases to discuss.

## Agreed change: native cursor in carry

On 2026-10-18 the maintainer chose **native cursor in detached/carry** for Oogas and gorillas, with drag-to-look and wheel-to-zoom, and captured mouse look in combat.

- Gorilla combat-to-carry now releases capture and focus. It no longer constructs a virtual cursor or keeps its pointer-position/resize bookkeeping.
- Native left-drag and wheel retain the existing interaction hooks. Tab in carry reaches native keyboard navigation, as it does for Oogas; combat Tab behavior remained unchanged at this checkpoint and is addressed by the later Tab agreement below.
- Returning to combat requests capture. At this checkpoint the carry-orbit zoom boundary still changed to combat shoulder and requested focus; the later camera-gesture agreement below removes that mode change.
- Grab/throw retains its existing reticle and button handling in carry without acquiring pointer lock. Other abilities, ownership, map behavior, view defaults and scene Escape policies are unchanged.
- The existing `gorilla camera modes` check now requires native cursor state, no focus/lock and unconsumed Tab in its carry shoulder/first-person/orbit samples. This regression coverage is authored, not run under the current **wait** policy.

Found for play-test: toggle combat/carry in all three camera distances; drag, wheel, native HUD clicks and Tab in carry; capture-only canvas click and left attack after freeing combat focus; carry G/grab/throw; pending/denied capture; signed-in/out and touch behavior. The C07 sheet-key interception is addressed in the Escape checkpoint below.

## Agreed change: Escape order

The maintainer approved **close active UI → free captured mouse look → detach actor → leave interior**, one step per press, for both actor types and either sign-in state. Inapplicable steps are skipped; detached on the hub does not leave.

- The HUD handles visible floating panels and the open sheet before controller handlers. Nested dialog actions and Chat's editor blur remain their own first step; IME composition is left alone. Holding Escape does not cascade through multiple steps.
- Shared `pilot.escape()` and `clankerPlay.escape()` release soft focus, pending/acquired capture, or the browser's just-released capture before releasing possession. The next explicit press can detach immediately.
- Lab, Factory, Arcade, Bifrost and the Ember Den use the shared order after their local menus/seating actions. DSB closes venue UI, frees capture, detaches, leaves the venue, then leaves DSB from its detached exterior. Arcade retains its existing carry restriction.
- An explicit detached interior handoff uses `world.pilotDetached`, so the hub's signed-in arrival claim does not reattach the player. Initial signed-in arrival still claims the owner's Ooga.
- Gorilla shortcuts now respect keyboard focus inside the sheet, matching the Ooga's guard. The legacy lab Agent still has its own controller and no captured mouse look; the shared HUD closes UI before that controller detaches.

## Agreed change: multiplayer companions and T switching

The maintainer requested multiplayer gorilla tracking and a key to cycle their own pair. After reviewing the G conflict, they chose **T**. **G remains grab/throw for gorillas and weapon switch for Oogas.**

- On the hub, T changes from the owned Ooga to its active companion, or from a companion/detached view to the owned Ooga. It changes control at the actor's existing position. Repeat and modified key presses do not cycle; input fields and focused sheet controls retain their keys. Combat selection requests mouse look; carry keeps the native cursor.
- This operates wherever the hub's companions already exist, including its connected islands and carved caves. Separate interior scenes do not contain those companions; this work does not create gorillas in those scenes. DSB's seated T/tomato action remains local to that venue.
- Signed-in contributors can claim only their own companion (including registered GitHub aliases and server-vouched temporary contributors). The page and room both enforce this. Signed-out/static companion play remains local and uses the same Escape/cursor flow.
- The room body is an Ooga handle, `gorilla:<handle>`, or null when detached. Existing position snapshots retain their stride; optional bounded gorilla locomotion carries airborne/biped/climb/run/lab/office state, speed, climbing stride/direction/side and swim amount.
- Remote gorillas use the managed gorilla rig with eased position/heading, owner name, normalized health and voice indicator. Their local AI copy releases its reservations and hides until the remote lets go. Their Ooga remains a separate crew member. Voice follows the driven actor's zone.
- This is player presence and locomotion. Gorilla attacks, held Oogas, throws, damage authority and general NPC gorilla pose synchronization are not newly replicated. Older open pages must refresh to recognize a gorilla body; old Ooga position messages remain compatible.

## Agreed change: camera gestures preserve carry/combat

The maintainer approved **zoom and right-click preserve carry/combat; X switches modes**, for either actor and either sign-in state. The portrait remains the equivalent button action. Detached flight retains its existing movement keys; it has no carry/combat state.

| Starting state | Zoom/right-click result | Mode |
|---|---|---|
| Ooga or gorilla carry | Move between first person, shoulder and orbit at the existing distance stops | Carry; native cursor |
| Ooga or gorilla combat | Move between first person, shoulder and bird's-eye at the existing distance stops | Combat |
| Gorilla combat bird's-eye, right-click | Shoulder view aimed at the ground 10m in front of its heading at the click | Combat; mouse look resumes |
| Ooga combat bird's-eye, right-click | Shoulder view aimed at its selected centerline point | Combat; existing movable aim range retained |
| Controlled actor, X or portrait tap | Switch carry/combat without selecting another actor | Cursor follows the chosen mode |

- Gorilla carry orbit no longer enters combat or requests capture when zoom reaches shoulder. Right-click from carry orbit also stays carry. The Ooga already preserved intent; its camera helper no longer exposes an unused combat setter, and weapon hints now identify X as the mode switch.
- The gorilla's 10m point is a one-time selection, not a target that follows its turning body. Shoulder framing compensates for the selected shoulder and the current head/arm height. It samples ground below shoulder height in the current layer, including solid surfaces and water; with no ground there it uses the gorilla's feet plane. Residual peek is cleared on entry; later look/peek inputs remain manual.
- X and the portrait are now wired consistently in Bifrost, DSB and the poker floor. Typing, held/modified X, venue menus, transitions, and seated poker UI retain their existing priority. Arcade's intentional carry-only walking and game controls are unchanged. Lab and Factory already forwarded X.
- Existing double-right-click and distance thresholds remain unchanged. The later right-click agreement below removes the Ooga's remembered first-person return; both actors now return to shoulder.
- Existing Ooga/gorilla camera scenarios now cover both sign-in states and carry/combat preservation. The gorilla scenario projects the resulting camera ray onto the actual ground plane to check the 10m point on both shoulders. Existing Bifrost, DSB and poker scenarios cover X/portrait routing and UI priority. These checks are authored, not executed under **wait**.

## Selection and retake review after `9d38a28`

This records the PR behavior at `9d38a28`, distinct from the upstream tables above. Source inspection only. The agreed contributor-only sign-in and shared-selection checkpoints below supersede these historical rows.

| Account situation | Ooga selection | Gorilla selection | Retake |
|---|---|---|---|
| Static/no backend | Any locally controllable Ooga | Any active, visible local companion | No personal portrait or T shortcut |
| Worker, signed out | Resting/sleeping bundled Oogas; fresh working claims refused | Any active, visible bundled companion | Find and double-click the actor again |
| Signed in with a bundled or server-vouched personal character | Own Ooga only | Own gorilla only | Own-Ooga portrait; T cycles the pair, or takes the Ooga from detached |
| Signed in without a personal character | Available nonworking Oogas, subject to room ownership | No companion borrowing | No personal portrait or T shortcut |

Signed-out pages have no room socket or roster of remote players. Their local selection cannot establish whether an owner is online elsewhere, and it is not published to multiplayer. A temporary personal Ooga is provided only for a server-vouched contributor, not automatically for every GitHub account. [Permission rules](https://github.com/OogaBoogaX/oogaboogaland/blob/9d38a28d041fd0e4781b0fd79efed95864ee59fc/src/js/net.js#L519), [connection gate](https://github.com/OogaBoogaX/oogaboogaland/blob/9d38a28d041fd0e4781b0fd79efed95864ee59fc/src/js/net.js#L305).

| Selection detail | Current difference |
|---|---|
| World gesture | Both use double-click/tap to select and double-click the selected actor to detach. Single clicks react. Roster names are not selection buttons. Captured combat owns canvas presses; a freed combat cursor's next canvas press resumes capture, so world selection is normally from carry/detached. |
| Mode | Oogas remember carry/combat per character for the page session, initially combat. Gorillas always reset to combat. Sleeping Oogas stay noncombat until woken. |
| Camera | High detached Ooga selection keeps altitude (21m above the head threshold) and uses orbit/bird's-eye; gorilla selection always enters shoulder. T also goes through the ordinary close Ooga path rather than the high-view double-click path. |
| Capture | Manual combat selection/retake asks for capture. Automatic signed-in hub arrival selects the own Ooga without requesting capture. Explicit detachment remains detached for that visit. |
| Retake target | The secondary portrait means **your Ooga**, not the last actor. There is no last-gorilla or signed-out retake. It appears only where the scene has the owned Ooga. |
| Unavailable target | T checks an away Ooga before releasing the gorilla. World Ooga selection and the own-Ooga portrait release the gorilla first; refusal or an away body can leave the visitor detached. An unavailable portrait can also silently do nothing. |
| Logout | Bundled actors can remain controlled locally; temporary actors are released. The retained Ooga's recheck skips the working restriction, so logout can keep an actor that a new signed-out selection would refuse. |

Evidence: [Ooga retake/selection](https://github.com/OogaBoogaX/oogaboogaland/blob/9d38a28d041fd0e4781b0fd79efed95864ee59fc/src/js/pilot.js#L1726), [gorilla selection](https://github.com/OogaBoogaX/oogaboogaland/blob/9d38a28d041fd0e4781b0fd79efed95864ee59fc/src/js/clanker-play.js#L255), [hub account/T handling](https://github.com/OogaBoogaX/oogaboogaland/blob/9d38a28d041fd0e4781b0fd79efed95864ee59fc/src/js/scene-hub.js#L8288), [world/HUD routing](https://github.com/OogaBoogaX/oogaboogaland/blob/9d38a28d041fd0e4781b0fd79efed95864ee59fc/src/js/scene-hub.js#L11084).

Recommended flow at that checkpoint; the later shared-selection agreement implements this with the detached-camera rule below replacing item 4:

1. Use the same selection path for world double-click, a retake button and T. Check ownership and availability before releasing the current actor; explain refusals and keep the current view/control intact.
2. While detached, offer **Return to [last actor]** for both Oogas and gorillas, signed in or out. Retake at the actor's current position, without teleporting it. Disable with a reason if it is unavailable in the current scene. Keep T's already agreed own-pair meaning, including own Ooga from detached.
3. Treat carry/combat as the visitor's current choice: selection and retake preserve it across actor switches. Start a fresh visit in carry, with native cursor; X or the portrait chooses combat. This would replace per-Ooga memory and the gorilla reset with one rule.
4. Preserve a high detached view for either actor; use the same close-view rule for world, button and T selection. Automatic arrival should still wait for a deliberate gesture before capture. Sleeping/seated limitations remain explicit.
5. Make selecting an already controlled actor a no-op. Use the agreed Escape flow or portrait hold to detach, avoiding accidental release during repeated selection.
6. Recheck logout against the same eligibility used for a new selection. Keep control when still allowed; otherwise detach with a reason. Clear local signed-in markers immediately in either case.

The maintainer's indicator requirement is separate from these proposals and is implemented: **local control alone must not produce a green signed-in marker**. The HUD gates local tooltip and roster presence on the current signed-in account, with remote presence tracked separately. Login/logout repaints cached rows. Signed-out/static control retains selection and activity presentation; authenticated remote players keep their online markers. Existing walking/integration checks cover static play, signed-out play, login/logout, both actor kinds and remote presence; they remain unrun under **wait**.

## Agreed change: contributor-only sign-in and owner selection

Only a GitHub account with its own Ooga may sign in. The Worker checks this before writing a player or session: a bundled character's owning login qualifies directly; a new contributor must be verified by the existing Oogatron policy (`counts.commits >= 1`) for a temporary Ooga. A character's display/handle alias never grants another GitHub account ownership. Bundled owners do not depend on the live feed. An unbundled login is refused when the bounded cached lookup cannot verify it.

The same rule applies when reading existing sessions for account, room, voice and signed-in donation attribution. Historical guest cookies no longer identify an eligible player. Valid historical sessions can still sign out or delete their account. The room also refuses guests before socket acceptance and evicts historical guest attachments on wake, message or its existing sweep, without new timers or upstream polling. Accepted temporary contributors retain their verified room attachment until reconnect.

| Account | Selection and retake after this change |
|---|---|
| Signed-in contributor, bundled or verified temporary | Own Ooga and own gorilla only. Automatic hub arrival takes the Ooga once; its portrait retakes it; T switches the pair or retakes the Ooga from detached. No signed-in borrowing fallback. |
| Worker, signed out | Resting/sleeping bundled Oogas and active visible bundled companions remain local choices. Double-click/tap selects; no personal portrait or T shortcut, room presence or local green online marker. |
| Static/no backend | Existing unrestricted local selection remains available, without an account or multiplayer presence. |

Hub world Ooga selection, the own-Ooga portrait and T now validate ownership, local availability and remote control before releasing a controlled gorilla. Refusal shows a reason and retains the current actor, camera and carry/combat mode. Gorilla possession already validates its target before handing off. A missing own-character mapping refuses selection rather than permitting signed-in borrowing.

That checkpoint did not change successful selection's camera/mode defaults or add a last-actor retake button. Those are covered by the subsequent agreement below. Auth, room, permission and existing hub regressions were extended; these changes remain in the draft PR and have not been deployed or runtime-tested.

## Agreed change: selection, retake and detached camera

The maintainer approved the shared selection flow and last-actor portrait, retaining T's existing meaning. Their camera clarification replaces the proposed high/close split: **every acquisition from detached view keeps the camera eye exactly where it is, recenters its look on the chosen actor, and enters carry/orbit with the native cursor**. This applies to world double-click/tap, the retake portrait, T and automatic sign-in. Direct switches between controlled actors preserve carry/combat and the view family.

| Situation | Current agreed flow |
|---|---|
| Detached, either sign-in state | Double-click/tap an available actor or use the last-actor portrait. Eye position stays fixed; look smoothly recenters; carry/orbit starts without capture. The actor stays at its existing position. |
| Controlling an actor | Selecting the same actor does nothing. Selecting another permitted actor smoothly moves the camera to that actor, carrying mode and view family across. Escape and portrait hold remain the explicit detach actions. |
| Last-actor portrait | Shown only while detached after a successful selection in this scene. It shows the last Ooga or gorilla and its health, signed in or out. Unavailable or forbidden retakes explain the refusal and preserve the detached view. |
| Signed-in contributor | Only the owned pair is selectable. T switches that pair; from detached it selects the own Ooga, independently of which actor the portrait remembers. |
| Signed out or static | Available bundled Oogas and companions are local choices, including working Oogas. T does not switch. Local control does not show a green online marker. |
| Settled sleeping actor | Selection retains sleep. Space or WAKE UP consumes a wake action; movement and attacks wait. An actor still walking to bed is awake and remains ordinarily controllable. |
| Logout | Eligible bundled control remains local; a temporary actor requires sign-in and is released. Retake always rechecks the current account and target availability. |

- The fixed eye is held while the actor and camera input remain still, including viewpoints above or below the ordinary orbit limits. The first wheel gesture approaches the normal range proportionally. Deliberate movement/look/zoom resumes normal camera following and constraints.
- Selection and T handoffs start at the exact displayed view and ease to the incoming actor's current framing over 0.4 seconds. Position, look direction, camera up and projection stay continuous. Repeating T or selecting another actor during the move starts from the view currently on screen; selecting the same actor neither jumps nor restarts it. Detached acquisition keeps its eye throughout the turn toward the actor.
- Both controllers share the camera handoff. Their camera constraints solve the incoming endpoint separately from the displayed interpolation, so a previous actor's camera cannot feed back into the new actor's first-person collision checks. Underground combat handoffs retain the cutaway until the displayed camera has a clear view; carry and detached keep the intact island.
- GitHub sign-in navigates away from the page. A bounded, tab-local session-storage snapshot carries eye/target/up/FOV and the route through that round trip; DSB adds an allowlisted venue id to rebuild the same room. It is consumed once, only on a matching route within ten minutes with an eligible account. Denied storage or a missing/expired snapshot uses the normal landing camera. Restored arrival selects the available own Ooga without scene arrival framing, cinematics or debug presets overriding the camera.
- Auto-claim no longer forces the owner's activity state to working. Settled Oogas and gorillas retain sleep until explicitly woken. The gorilla room payload adds a sleeping bit and resting pose within its existing six-number locomotion record so other players see the controlled sleeper correctly.
- Existing selection, camera, ownership, remote-rig and protocol checks are extended. Runtime results remain pending under **wait**; actual OAuth navigation, touch and multiplayer should be included in maintainer play-testing.

## Map and reset-view review after `94aa144`

Historical source inspection at `94aa144`; this section records behavior before the approved map/reset implementation below. These actions did not branch on sign-in. Ownership controlled which actor could be selected; signed-in navigation also changed the position/body reported to the room.

| Current action | Controlled Ooga | Controlled gorilla | Detached |
|---|---|---|---|
| Hub destination cycle | Moves the same Ooga to a checked arrival and retains carry/combat and view family; resets framing to the destination. | Releases the gorilla where it stands, frees the cursor, and moves the detached camera. The gorilla resumes AI or sleep. | Moves the camera to the destination; remains detached, including an existing eye-level view. |
| Generic scene camera preset | Releases the Ooga, frees the cursor and eases the camera to the preset; the actor is not transported. | No exposed equivalent for hub companions. | Eases to the preset and clears eye-level mode. |
| DSB “Walk” (`reset-view`) | Keeps the active Ooga but resets yaw/pitch/distance at its current position. | Companions do not exist in this separate scene. | Acquires the scene's Ooga, then reframes at yaw π, pitch .22, distance 7, overriding the fixed-eye retake framing. |

Evidence: [hub destination validation and handoff](https://github.com/OogaBoogaX/oogaboogaland/blob/94aa14408f1478cb87197c9eeb58c8f435a48181/src/js/scene-hub.js#L7143), [shared travel](https://github.com/OogaBoogaX/oogaboogaland/blob/94aa14408f1478cb87197c9eeb58c8f435a48181/src/js/pilot.js#L2852), [camera preset](https://github.com/OogaBoogaX/oogaboogaland/blob/94aa14408f1478cb87197c9eeb58c8f435a48181/src/js/pilot.js#L2113), [DSB overview/Walk](https://github.com/OogaBoogaX/oogaboogaland/blob/94aa14408f1478cb87197c9eeb58c8f435a48181/src/js/scene-dsb.js#L110).

- The exposed hub control cycles **Pile → Lab → Mirror → HQ → Basement → Mempool → Pile**. It has no hold action, destination picker or map dots. The old direct hub buttons are always hidden by the director. README and the blocked-arrival toast still mention nonexistent dots. A blocked destination leaves control and camera intact but does not advance the cycle, so repeated clicks retry the same blocked place with no visible way to choose another. [Cycle](https://github.com/OogaBoogaX/oogaboogaland/blob/94aa14408f1478cb87197c9eeb58c8f435a48181/src/js/hud.js#L600), [hidden navigation](https://github.com/OogaBoogaX/oogaboogaland/blob/94aa14408f1478cb87197c9eeb58c8f435a48181/src/js/director.js#L215).
- The shared destination button is visible but inert in Factory, Bifrost, DSB and Poker. Standalone Lab accepts it but announces island names for local camera presets: Lab selects Racks, Mirror selects Bunks, and HQ/Basement/Mempool all select Bench. Arcade hides the shared control with CSS; its own camera preset tabs work. [HUD visibility](https://github.com/OogaBoogaX/oogaboogaland/blob/94aa14408f1478cb87197c9eeb58c8f435a48181/src/js/hud.js#L687), [Lab remapping](https://github.com/OogaBoogaX/oogaboogaland/blob/94aa14408f1478cb87197c9eeb58c8f435a48181/src/js/scene-lab.js#L473).
- There is no common visible “Reset view” button: the only rendered `reset-view` action is DSB's **Walk**. Poker also routes **0** to its entrance preset; the hub and other walking interiors do not share that shortcut. The latent hub reset handler calls the Ooga pilot's preset method even while a gorilla owns the camera, so it mutates the shared orbit without handing off gorilla control. This is an unwired handler inconsistency, not a normal exposed hub button. [Visible Walk](https://github.com/OogaBoogaX/oogaboogaland/blob/94aa14408f1478cb87197c9eeb58c8f435a48181/src/index.html#L285), [hub handler](https://github.com/OogaBoogaX/oogaboogaland/blob/94aa14408f1478cb87197c9eeb58c8f435a48181/src/js/scene-hub.js#L11142).
- Ooga travel silently wakes a manually controlled sleeper and clears seating, ladder, jump and flight motion. DSB Walk does not check whether possession succeeded before calling navigation without a detached target; an unavailable avatar can reach a missing-target dereference. These are source-confirmed paths requiring regression coverage, not observed runtime failures. [Relocation](https://github.com/OogaBoogaX/oogaboogaland/blob/94aa14408f1478cb87197c9eeb58c8f435a48181/src/js/crew.js#L5523), [detached target use](https://github.com/OogaBoogaX/oogaboogaland/blob/94aa14408f1478cb87197c9eeb58c8f435a48181/src/js/pilot.js#L2898).
- Existing hub map checks cover Ooga/detached cycle behavior and labels, and DSB checks cover Overview → Walk. Gorilla/auth combinations, blocked-cycle escape and interior destination usability are not covered by those assertions. No runtime checks were run for this review.

Recommended flow at the audit checkpoint (subsequently approved):

1. **Map means destination travel.** Open a scene-appropriate destination picker without changing actor or camera. Choosing a place moves the controlled Ooga or gorilla and its camera together; detached selection moves only the camera. Retain carry/combat and the view family. This is an explicit travel action; the fixed-eye rule still applies when acquiring/retaking an actor.
2. **Reset camera means reframing only.** Keep the current actor and its position, carry/combat and view family, restoring comfortable framing for that view. Detached reset stays detached and levels/reframes around its current focal point. It must not retake, detach, transport or wake an actor. Use a consistent label and entry point in walking scenes.
3. **UI keeps the cursor available.** Opening the picker frees captured look without changing combat intent; selecting a destination does not recapture it. Click the canvas to resume combat look. Reset does not change existing cursor focus. Carry and detached retain native cursor behavior.
4. **Validate before changing anything.** Check the actual actor's dimensions, support and camera at the arrival. Refuse sleeping/seated travel with a wake/stand-first explanation, preserving the explicit-wake agreement. Unsafe/unavailable destinations leave actor, camera and mode intact and the picker allows another choice. Keep respawn recovery separate from map/reset.
5. **Use accurate scene controls.** Supply real local destinations or hide unsupported travel. Label camera-only tours as Viewpoints/Overview with explicit detach semantics. Use the existing last-actor portrait for Return; DSB Walk should not be a second conflicting retake flow. Remove references to nonexistent map dots.

## Agreed change: independent scroll steps and nearby bird's-eye entry

The maintainer requested a fresh scroll to cross shoulder view in either direction, and a continuous transition from shoulder to bird's-eye instead of lifting immediately to its old minimum height.

- First person → shoulder consumes the remaining gesture; orbit/bird's-eye → shoulder does the same. Starting a fresh gesture from shoulder enters first person or the wider view. Outward scrolling can continue changing distance after leaving shoulder.
- Both controllers use the shared wheel/pinch gesture identity. A wheel pause longer than 220 ms or a reversal starts a new gesture; momentum remains part of the existing gesture. A pinch keeps its identity until a new touch gesture. The shoulder stop no longer expires while that gesture continues.
- Gorilla wheel input now follows the same route and scaling as Ooga input. The separate gorilla capture listener previously bypassed the shared gesture identity and used a shorter 180 ms gap; the Ooga stop previously expired after 350 ms.
- View handoffs preserve an active two-finger pinch, including on fine-pointer touchscreen devices. Virtual mouse events cannot overwrite or cancel a touch with the same pointer ID. Ordinary input resets still end gestures.
- Combat scroll entry starts near the shoulder camera's radius and eases outward/upward. Scroll can return to that nearby range before entering shoulder, rather than switching at the old 21 m Ooga / 8 m hub gorilla overhead minimum. Gorilla entry also eases its target from head height toward its forward ground anchor. Existing right-click/X framing and the gorilla's 10 m right-click aim remain separate.
- Carry/combat and signed-in/out behavior stay the same. Detached zoom and special seated/sleeping Ooga camera paths retain their existing view families; no shoulder camera is added where one is unavailable.
- Regression coverage is extended in the existing camera scenarios; execution remains pending under **wait**.

## Agreed change: destination travel and camera reset

The maintainer approved destination travel plus a separate camera-only reset, shared by Oogas, gorillas and detached view in either sign-in state. After local play-testing, the Map control returns to one-click cycling and the Reset camera button is removed; the **0** shortcut remains.

| Control | Controlling an Ooga or gorilla | Detached |
|---|---|---|
| Map | Each click tries the next destination and frees the cursor. A valid arrival translates the actor and camera together, retaining heading, relative framing, carry/combat and view family. | Each click moves only the camera to the next destination using its destination framing. |
| 0 | Restores comfortable framing for the current view family around the same actor, without moving, detaching, waking or switching mode. Existing cursor focus is preserved. | Remains detached; orbit reframes around the current focal point and eye-level view levels its look at the same eye position. |
| Last-actor portrait | Not shown while controlling an actor. | Retakes the remembered actor using the agreed fixed-eye carry/orbit acquisition. |

- The island Map cycles through Pile, Lab, Mirror, HQ, Basement, Mempool, LN Factory, Ooga Arcade, B.C.A., North gate, ₿IFRÖST and TC Sphere, then wraps to Pile. Travelling does not recapture combat look. Click the canvas to resume aiming.
- Arrival checks include support, the controlled actor's body size, other local/remote actors and the translated camera eye. A refusal keeps actor and camera in place and shows an explanation; the next Map click tries the following destination. A viewpoint too large for a room can be refused rather than silently replacing its framing. Successful direct navigation synchronizes the cycle to that destination.
- Sleeping, seated, held, climbing, airborne or busy actors must finish that state before travel. Travel has its own guarded relocation path; it does not reuse respawn healing/recovery or silently wake a sleeper. Existing respawn and authored scene-arrival behavior remain separate.
- The **0** reset shortcut is available in the hub and the six walking interiors: Lab, Factory, Arcade, Bifrost, DSB and Poker. There is no Reset camera button. Scene interactions and transition guards still apply. Unsupported interior Map buttons are hidden. Existing camera tabs and DSB's Island overview explicitly identify themselves as camera viewpoints that release control.
- DSB no longer uses a Walk/reset action to acquire an actor or overwrite detached acquisition framing. Its last-actor portrait supplies retake, and its ordinary scene arrival remains unchanged.
- Existing map, camera, accessibility, remote-actor and DSB regressions are extended for the new flow. These are authored coverage, not runtime results; play-testing remains pending under **wait**.

## Agreed change: combat-only lower-level cutaways

The maintainer requested consistent island slicing for Oogas and clankers: reveal lower levels in combat bird's-eye, and retain the intact island in carry/orbit.

Source inspection found that cutaway activation used the remaining projection blend without checking combat intent. Below ground, it also retained slicing whenever the camera was high enough, with an extra Ooga-only exception for orbit or an unfinished shoulder entry. Thus carry could continue slicing even after its projection settled. Detached view retained the previous cut during a short restoration scan.

- One shared combat requirement now applies to both actors, regardless of sign-in. Combat bird's-eye reveals the current floor and ramps using the existing height and head-clearance rules.
- Switching to carry or detaching clears the cut, local regions, ramp openings, section caps and ramp markers on the next scene update, even while the camera's projection continues blending. Props and actors hidden as whole units by slicing are restored too. Detached acquisition/retake stays in intact carry/orbit.
- The initial checkpoint retained combat slicing while projection blended or the eye remained above the actor's cut plane. The maintainer clarified that shoulder and first-person must restore the intact island once the camera is in view. Source inspection found that the old height test could retain a slice indefinitely in a settled shoulder view, including when its eye was already in the room.
- A bird's-eye exit now retains its cut until the displayed close camera has a clear volume and connection to the actor through the intact terrain, ramp slopes, entrance frames, beds and solid props. This includes the Mempool roof. Residual projection alone does not postpone restoration underground. Once restored, ordinary close-view obstructions do not reopen the slice.
- Underground combat close cameras shorten their boom toward clear air near the actor, blended through the existing entry motion. The Ooga then resolves its selected aim point from the corrected eye. A clear gorilla shoulder target keeps the original aim ray while its boom shortens; if that target is blocked, its saved 10m world point guides the corrected view until deliberate input changes it. First-person correction keeps its look direction. Pinned climbing handoffs complete their projection and pending cutaway recovery. Carry/orbit remains unrestricted.
- The gorilla overlay now checks combat intent as the Ooga overlay already did, so a sleeping gorilla with a retained bird's-eye view does not bypass ordinary rock visibility.
- Existing floor/cutaway regressions are updated for carry restoration, detached release/retake and both actors/sign-in states. Runtime results remain pending under **wait**.

## Right-click review after `a7b806f`

This is a source audit, not a runtime observation. Once an actor is controlled, the handlers have no sign-in branch; the differences below apply signed in and out.

| Starting state | Ooga at audit checkpoint | Gorilla at audit checkpoint |
|---|---|---|
| Combat bird's-eye | Returns to shoulder and preserves the selected world aim point, except a remembered first-person double-click exit can return directly to first person | Always enters shoulder aimed at ground 10m ahead of the heading at the click |
| Carry orbit | Enters shoulder toward the clicked world point, with the same remembered first-person exception | Enters shoulder using the retained view direction |
| Combat shoulder or first person, captured | Single press keeps the view; holding focuses weapon aim (narrower FOV, slower look and movement) | Single press keeps the view; no weapon-aim hold effect |
| Combat shoulder or first person, cursor freed | Right press attempts recapture without attacking; native-lock failure differs from the distant-view fallback | Right press does not recapture; ordinary left canvas click does |
| Carry shoulder or first person | Single press keeps view; no weapon-aim effect | Same |
| Short double-right-click in either close view | Returns to carry orbit or combat bird's-eye; remembers a first-person departure | Returns to carry orbit or combat bird's-eye; no first-person memory |
| Settled sleeping actor | Rejects right-click view changes without waking | Still accepts view changes; effective combat/capture remain off |
| Interrupted gestures | Blur/cancel clears double-click history; other-button presses invalidate it | Blur/cancel and other-button presses can leave timing behind; right-button release can also complete a pending left-button action because release matches pointer ID alone |

Both use a first tap of at most 350ms and 8px movement, followed by a second press within 350ms. Holding or dragging right alone is not carry-mode camera look. The browser context menu is suppressed. Detached camera has no actor close-view right-click transition.

Evidence: [Ooga gesture state and routing](https://github.com/OogaBoogaX/oogaboogaland/blob/a7b806fb16fd0ba47aea1f4ebf2469c5afb5f383/src/js/pilot.js#L1161), [Ooga view handoff and hidden return](https://github.com/OogaBoogaX/oogaboogaland/blob/a7b806fb16fd0ba47aea1f4ebf2469c5afb5f383/src/js/pilot.js#L1691), [gorilla target and right press](https://github.com/OogaBoogaX/oogaboogaland/blob/a7b806fb16fd0ba47aea1f4ebf2469c5afb5f383/src/js/clanker-play.js#L476), [gorilla release routing](https://github.com/OogaBoogaX/oogaboogaland/blob/a7b806fb16fd0ba47aea1f4ebf2469c5afb5f383/src/js/clanker-play.js#L609).

**Agreed and implemented:** right-click from bird's-eye always enters third-person shoulder for either actor, never directly first person. The Ooga's hidden first-person memory is removed, including its carry-orbit return path. Carry/combat and existing target selection are preserved. First person remains a fresh inward scroll from shoulder. Existing actor/auth camera scenarios now include first-person → double-right-click distant → right-click shoulder.

**Subsequently agreed and implemented:**

- Keep single right-click in a close view there, and double-right-click returning to the distant view for its current mode.
- In shoulder/first-person combat, a right-click with a freed cursor only recaptures mouse look, for both actors. Its hold and release neither attack nor seed a double-click. Native pointer-lock failure retains the existing soft mouse-look fallback. A subsequent focused Ooga right hold keeps its precision aiming; gorillas gain no new attack or aim ability.
- From bird's-eye or carry orbit, right-click still enters shoulder. Combat resumes capture as part of that deliberate view change; carry retains the native cursor. The selected Ooga world point and gorilla 10m ground point remain unchanged.
- Ignore view-changing right-clicks while asleep; Space remains the explicit wake action.
- Clear gesture timing on blur, cancellation, other-button input and actor/mode/view changes. Native mouse chords report intermediate button changes as pointer moves: releasing right cannot finish a gorilla's left-button charge, and releasing left completes it even when right stays held. Cancelled holds do not resume when a stale release arrives.

The same handlers run signed in and out. Existing Ooga/gorilla scenarios are extended for recapture without view changes or attacks, preserved Ooga precision aim, sleeping actors, interrupted taps and native mouse chords. These are authored regressions, not runtime results.

Carry-orbit target selection (clicked point versus retained direction) was left for the subsequent audit and agreement below. Native look remains a left-drag gesture.

## Tab review at `3860229` and agreed flow

This source audit records the state after right-click parity, before the Tab change. No runtime behavior was observed. Neither controller's Tab handler branches on sign-in.

| Starting state | Behavior at `3860229` |
|---|---|
| Awake combat, any view, captured or soft-focused | Both actors consume Tab/Shift+Tab and free mouse look, preserving actor, carry/combat and view. Pending or denied native lock uses the same release path. |
| Awake combat, cursor already free | Both still consume Tab, preventing ordinary keyboard focus traversal outside their UI exclusions. Tab does not recapture. |
| Held Tab | Both consume repeats. Ooga repeats its release cleanup; gorilla runs cleanup only on the initial press. |
| Carry, detached or asleep | Tab uses normal browser focus navigation immediately. |
| Focused UI | Both exclude inputs, textareas, dialogs and the sheet. Gorilla additionally excludes selects and contenteditable. Ordinary HUD buttons/links remain subject to combat Tab interception. |
| Held gameplay input during release | Pointer actions are cancelled, but shared keyboard state survives. Held W can continue movement with a free cursor; a quick Right Shift+Tab can later swap shoulders when Shift is released. |

Evidence: [Ooga Tab and UI guard](https://github.com/OogaBoogaX/oogaboogaland/blob/3860229/src/js/pilot.js#L1283), [Ooga release cleanup](https://github.com/OogaBoogaX/oogaboogaland/blob/3860229/src/js/pilot.js#L352), [gorilla Tab](https://github.com/OogaBoogaX/oogaboogaland/blob/3860229/src/js/clanker-play.js#L402), [gorilla release cleanup](https://github.com/OogaBoogaX/oogaboogaland/blob/3860229/src/js/clanker-play.js#L179), [shared Shift release](https://github.com/OogaBoogaX/oogaboogaland/blob/3860229/src/js/controls.js#L82), [pointer-only reset](https://github.com/OogaBoogaX/oogaboogaland/blob/3860229/src/js/controls.js#L173), [gorilla movement and shoulder swap](https://github.com/OogaBoogaX/oogaboogaland/blob/3860229/src/js/clanker-play.js#L751).

**Agreed and implemented:**

- In combat with captured, soft-focused or pending mouse look, the first Tab or Shift+Tab frees the cursor and cancels held movement, sprint/jump, aiming and pending actions. It keeps the controlled actor, mode and view. The held-W continuation and delayed Right Shift shoulder swap are explicitly removed by this cleanup.
- Consume that Tab hold through its key release, including repeats, so one hold cannot both release mouse look and start navigating UI. A subsequent Tab/Shift+Tab uses native forward/backward focus navigation. There is no promise of a particular first focus target.
- Interrupted keys and mouse chords stay inactive until release. An ordinary mouse move with a button still held cannot restart walking, charging or combat capture; a cancelled Shift cannot modify a new gameplay shortcut before it is released.
- With the cursor already free, Tab navigates immediately. Carry, detached view and sleeping actors also use native Tab navigation immediately; Tab does not wake, acquire or switch an actor.
- Focused UI controls own Tab, including buttons, links, selects, text fields, contenteditable, the sheet and dialogs. Ctrl/Meta/Alt browser shortcuts remain untouched.
- The same policy applies to Oogas and gorillas, all their view families and either sign-in state. T remains the signed-in owned-pair switch. An explicit world click resumes combat mouse look under the existing capture-only rules.

README describes the shared flow. Existing actor/auth scenarios now cover soft and pending capture, held Tab, interrupted movement and attacks, both Shift keys, native UI navigation, carry/detached mouse chords and sleeping actors. The new keyboard gate is enabled by the shared walking pilot; the separate game controllers do not opt into it. These are authored regressions, not runtime results.

## Carry/orbit right-click review after `f1b248d`

Source inspection found identical behavior signed in and out once an actor was controlled, but different target selection between actors:

| Starting state | Behavior before this checkpoint |
|---|---|
| Ooga carry/orbit | Right press entered shoulder toward the clicked world point, turning the actor. Empty unobstructed rays used a point 60m from the camera. Near-body targets and foreground cover hiding the head preserved actor facing. |
| Gorilla carry/orbit | Right press entered shoulder using orbit yaw/pitch, ignoring the clicked location. A stationary gorilla did not have to turn. |
| Carry shoulder/first person | Single right-click left the view alone; double-right-click returned to orbit. |
| Detached | Right-click and right-drag had no view or selection effect. |
| Two-button movement | Adding right to a held left button could enter Ooga shoulder view; gorilla carry retained its movement chord. |

Both actors retained carry/native cursor, used left-drag for camera look and ignored view-changing right-clicks while sleeping. These are source findings, not runtime observations.

**Agreed and implemented:**

- Both actors use the same visible-world target picker in carry/orbit. A short right-click enters shoulder facing the chosen location, smoothly turning the actor and camera while keeping carry and the native cursor. It does not attack, move the actor to the target or select a different actor.
- Empty sky uses the clicked viewing direction rather than a finite camera-relative target. A target too close to the actor or a foreground obstruction hiding them preserves their facing. The controlled actor is excluded from picking.
- Entry waits for the right-button release (at most 350ms held and 8px travel). Dragging, another mouse button in either press order, cancellation or interrupted input discards the candidate. Two-button walking/turning therefore never also changes the carry view. The entry click does not seed the close-view double-click return.
- Detached right-click remains inactive. Left-drag remains camera look. Carry shoulder/first-person single and double-right-click behavior and sleeping suppression remain unchanged, with the same behavior signed in and out.
- Combat targeting remains separate: Ooga bird's-eye retains its aimed point, gorilla bird's-eye retains ground 10m ahead, and close-view recapture and Ooga precision aiming keep their agreed flow.

Existing actor/auth camera scenarios are extended for target selection, empty sky, release classification and cancelled/chord gestures. Execution remains pending under **wait**.

## Occlusion outlines and Matrix lever

Source inspection after `189b8d0` found that the hub's occlusion overlay selected only the controlled Ooga and used its camera state, treating a controlled gorilla as detached. Both actors should use the same silhouette and nearby object/rock guides when scenery blocks them, with their own body dimensions and close-view state. First-person, combat bird's-eye, cutaway and Mempool-specific visibility rules still apply; sign-in does not change them.

The Matrix wave previously started on room entry or lever activation. Turning the lever off while inside kept the wave expanding. The approved flow makes the lever the only wave control: down turns it on, up makes it recede even while occupied, and crossing the doorway never changes its direction. Living objects follow the receding front instead of losing glyphs immediately. The mirror room retains its permanent local glyphs and the existing gate and mirror-damage rules. Lever orientation, ON/OFF labels, tooltip and action prompt agree.

## Combat entry from the orbit angle

Before this checkpoint, X from carry/orbit always entered combat bird's-eye for both actors, including low cameras looking horizontally across the character. The approved rule uses the displayed eye relative to the actor's normal orbit focus: at or below 45° above horizontal enters shoulder combat; only a steeper angle enters bird's-eye. Exactly 45° and cameras below the character choose shoulder. The Ooga focus is its root; the gorilla focus is its existing raised carry anchor, so both compare the angle around the body rather than an arbitrary camera target or pending orbit pitch.

X and the mode portrait share this rule, signed in or out. Entry starts at the displayed camera, including a pending selection/T handoff, and smoothly follows the native camera arc. Existing shoulder/first-person toggles retain their view family; combat-to-carry and sleeping/posture restrictions keep their prior behavior.

## Gorilla throw aiming

Throws previously used the camera ray in every mode and view. Carry mode (including its close views) and combat bird's-eye now throw along the gorilla's facing at 45° above horizontal. Running momentum does not alter that fixed launch angle; charge still controls launch speed. Only combat first-person and shoulder views retain crosshair aiming and their existing inherited movement. The rule is chosen when the charged throw is released and retained through the arm swing, signed in or out. G still grabs/drops, and interrupted inputs and autonomous rage retain their existing handling.

## Validation and play-test queue

The pile hover label and Bananas panel now display the same current donation value to two decimals. Previously the pile label rounded the remaining gameplay stock, while the panel converted all donated sats at the latest BTCUSD price; the screenshot's 79 versus 77.97 came from those different sources. Both labels now share the panel's calculation and missing-price behavior. Hovering the visible pile also watches the existing shared price feed, released when neither the pile label nor panel is visible. Gameplay stock and donor receipt values retain their existing meanings.

Earlier checkpoints used **wait** and left runtime verification pending. For the idle-arm twitch, the maintainer explicitly requested reproduction and regression testing. Its rig measurements and focused test results are recorded below; other play-test scenarios remain pending.

Existing checks to extend if implementation and runtime testing are requested: `hubBirdsEye` (selection, view gestures and cursor handoffs), `hubWalking`/`labWalking` (movement), `hubChat` (focus), and relevant scene walking/exit checks in `test/run.mjs`. Their presence is not evidence they passed on this branch. Keep the existing value/STOP rules; do not add parallel duplicate checks.

For the maintainer's play-test, exercise each agreed flow with:

1. No backend, Worker signed out, signed-in own Ooga (bundled/temporary), and refused noncontributor sign-in/old guest sessions. Include canonical login aliases and contributor-feed failure. Use manual and automatic arrival separately; `nosim` disables accounts and cannot validate the signed-in rows.
2. Ooga/gorilla/detached; carry/combat; shoulder/first-person/orbit/overhead; native cursor, successful lock, denied/lost lock, and blur/resume.
3. World selection, portrait tap/hold, X, wheel/pinch, right-click/double-right-click, Tab/Escape, map/reset, and each walking scene boundary. For right-click, include recapture with denied lock, a later Ooga precision hold, sleeping actors, blur/cancel/other-button interruptions, and both release orders of a left/right chord during gorilla smash or throw.
4. Keyboard-focused sheet buttons, Chat, native form controls and modal dialogs; mouse and coarse/touch devices; clean console throughout.
5. Detached selection/retake/T/sign-in from close, distant, overhead and underground viewpoints; eye position stays fixed while the view smoothly recenters, until actor movement or deliberate view input. Include a real GitHub round trip on hub and interior routes, plus expired/denied session storage.
6. Last Ooga/gorilla portrait after detachment, same-actor repeated selection, unavailable/remote-controlled/forbidden retakes, direct switches through all view families, settled sleep and explicit wake. Check a smooth start, progress and settled framing for double-click and T, including rapid T reversals, actor movement and selection during a transition. Confirm the sleeping gorilla and its wake on another signed-in page.
7. Long wheel swipes with momentum, fresh scrolls and new pinches in both directions through shoulder, for both actors and sign-in states. Check small outward increments, low ceilings, floors at different heights, both carry/combat modes and right-click after nearby bird's-eye zoom.
8. Map cycling through all destinations and wrapping, arrival refusal followed by the next destination, controlled Ooga/gorilla and detached travel, and **0** reset in each walking scene. Include close/overhead views, underground arrivals, occupied destinations, sleepers, seated/climbing/airborne actors, both sign-in states and a second multiplayer page. Check the LN Factory/TC Sphere labels and absence of the picker and Reset camera button.
9. HQ, basement and Mempool cutaways with each actor signed in/out: combat bird's-eye reveals the floor; X to carry and detachment restore it immediately; close-view exits retain the cut while obstructed, restore only once clear and settle with an intact island; detached retake keeps intact carry/orbit. Include steep Ooga aim, gorilla 10m ground aim with a blocked shoulder target, low roofs, both shoulders, pinned climbing handoffs and direct first-person zoom during the descent.
10. Tab/Shift+Tab with successful, pending and denied capture; first release, held repeats, keyup and a fresh navigation press. Include held W, sprint/jump, a charged action and Right Shift peek/tap, plus carry, detached, sleeping actors and focused UI controls. Actor/mode/view stay unchanged; gameplay input does not resume from the cancelled hold. Check both actors and sign-in states, and leave Ctrl/Meta/Alt browser shortcuts alone.
11. Carry/orbit right-click with each actor signed in/out: click visible ground/props at different elevations and sides, empty sky, near-body points and foreground cover. Check smooth shoulder entry, actor facing, native cursor and retained carry. Include both mouse-button press/release orders, right-drag, long holds, blur/cancel/Tab, and release outside the canvas. Detached right-click stays inactive; combat Ooga aim and gorilla 10m ground targeting retain their prior behavior.
12. Ooga/gorilla occlusion behind rock, nearby objects and the pile in carry/orbit and shoulder views, signed in/out. Compare actor silhouettes and surrounding outlines; clear views, first person and combat bird's-eye must not retain stale outlines. Include underground ramps and Mempool's actor-only rim.
13. Enter the mirror room with the lever off: only its local glyphs remain. Pull down to turn on, leave and return while on, then push up and remain inside until the world wave recedes completely. Cross the doorway during retreat and reverse the lever mid-wave. Check the lever labels, hints, gate movement and living-object glyph retreat.
14. X and mode-portrait combat entry from low, exactly 45°, high and below-character carry/orbit views for both actors signed in/out. Include off-target camera looks, detached retakes, pressing X during a selection/T handoff, rolled views and underground cameras. Check smooth start/progress/settling, shoulder for low angles, bird's-eye for steep angles, unchanged close-view toggles and no combat entry while asleep.

15. Grab and throw in every carry view and combat bird's-eye: launch forward at 45° regardless of camera pitch, charge, running or jumping. Combat first-person/shoulder throws follow the crosshair. Check signed in/out, both shoulders, canvas/HUD releases, mode/view changes while charging and camera movement during the arm swing.

16. Hover the pile with the Bananas panel open: totals and two-decimal formatting match through price changes and new donations, signed in/out and in demo mode. Close/reopen the panel, leave/re-enter the hover, hide/resume the page and change scenes. Check zero donations and missing/stale price data; no duplicate price socket or listener remains after leaving. Check phone layout and controls in the rebuilt page.

## Review checkpoints

- `8d5346f`: baseline and audit scope, draft PR opened against `rock`.
- `28fb6b8`: current flows, source references, inconsistencies, proposals and play-test queue recorded. `npm run build` passed; no runtime tests requested or run.
- Native carry cursor decision: approved; implementation and existing regression coverage updated. `npm run build`, `node --check src/js/clanker-play.js`, `node --check test/run.mjs` and `git diff --check` passed. Runtime verification remains pending under **wait**.
- `05fc676`: gorilla room identity, bounded locomotion and remote rig transport, with server regression coverage authored.
- Escape, multiplayer companion integration and T switching: approved; implementation and existing regression coverage updated in this checkpoint. `npm run build`, syntax checks on all 19 changed JavaScript files and `git diff --check` passed. Added network/remote checks participate in the existing unit/full path. Browser, unit and worker runtime tests remain unrun under **wait**.
- `18b0ef6`: Escape order, companion integration and T switching committed and pushed to the draft PR.
- Camera gesture checkpoint: wheel/right-click preserve carry/combat; X/portrait routing completed in walking interiors; gorilla combat bird's-eye right-click aims at ground 10m ahead. `npm run build`, `node --check` on all seven changed JavaScript files and `git diff --check` passed. Runtime checks remain unrun under **wait**.
- `9d38a28`: camera gestures and gorilla 10m shoulder aim committed and pushed.
- Selection review: current authentication, selection, camera and retake differences logged; recommended shared selection flow remains proposed. Green local presence now requires sign-in; signed-out availability documentation corrected. `npm run build`, `node --check` on all three changed JavaScript files and `git diff --check` passed. Runtime checks remain unrun under **wait**.
- `3571c69`: signed-in-only local green markers and selection review committed and pushed.
- `e4ada46`: contributor-only OAuth/session access, room admission and historical guest eviction committed and pushed.
- Contributor-only sign-in and selection guards: approved; server admission/session/room rules and client ownership/selection paths updated. `npm run build`, `node --check` on all 17 changed JavaScript files and `git diff --check` passed. Runtime checks remain unrun under **wait**.
- `de18caa`: owned-pair selection guards committed and pushed; refusal preserves current control.
- Shared selection and retake: approved with fixed-eye carry/orbit acquisition from detached, active mode/view preservation, last-actor portrait for both sign-in states, locally available working Oogas and explicit sleeper wake. GitHub returns retain the camera across hub/interior startup, including the registered DSB venue. `npm run build`, `node --check` on all 15 changed JavaScript files and `git diff --check` passed. Existing regression coverage was extended; runtime tests and actual OAuth navigation remain unrun under **wait**.
- `94aa144`: shared selection/retake and detached camera preservation committed and pushed.
- Map/reset review: current actor/auth/scene behavior, missing map dots, blocked-cycle trap, inert interior destination controls and reset naming differences recorded. Recommendations await agreement; no map/reset runtime behavior changed.
- `de88eb7`: map/reset source audit committed and pushed for review.
- Independent scroll steps: approved; both actors stop at shoulder for the whole gesture and scroll into bird's-eye from nearby. `npm run build`, `node --check` on all four changed JavaScript files and `git diff --check` passed. Existing regressions cover long native wheel bursts and actual two-finger pinch handoffs; runtime checks remain unrun under **wait**.
- `6ba9434`: independent scroll steps and nearby bird's-eye entry committed and pushed.
- Destination travel and camera reset: approved; picker, guarded actor travel, separate Reset camera / 0, interior visibility and DSB retake distinction implemented. `npm run build`, `node --check` on all 13 changed JavaScript files and `git diff --check` passed. Existing regressions were extended; runtime checks remain unrun under **wait**.
- `f7db4a4`: destination travel and camera reset committed and pushed.
- Combat-only island cutaway: shared mode gate and geometric handoff rule implemented for Oogas/clankers; carry and detached restore all cover. `npm run build`, `node --check` on both changed JavaScript files and `git diff --check` passed. Existing floor/cutaway regressions cover both actors and sign-in states; runtime checks remain unrun under **wait**.
- `a7b806f`: combat-only lower-level cutaways committed and pushed.
- Right-click source review: remaining focus, weapon-aim, sleep and gesture differences logged. Always returning to shoulder is approved and implemented; other recommendations remain proposals. Clear-camera restoration of lower-floor combat cutaways is also approved and implemented. `npm run build`, `node --check` on all four changed JavaScript files and `git diff --check` passed. Existing camera regressions cover first-person departures returning to shoulder and lower-floor restoration for both actors/sign-in states. Runtime checks remain unrun under **wait**.
- `c0f48ae`: shoulder return and clear-camera island restoration committed and pushed, with the remaining right-click audit.
- Consistent right-click recapture, sleep suppression and interrupted-gesture cleanup: implemented for both actors and sign-in states, retaining Ooga precision aiming. `npm run build`, `node --check` on all three changed JavaScript files and `git diff --check` passed. Existing regressions now cover denied-lock recapture, later precision holds, sleeping actors, interrupted taps and native mouse chords, including distant shoulder entry and gorilla charge release. Runtime checks remain unrun under **wait**.
- `3860229`: right-click recapture, sleep suppression and gesture cleanup committed; source baseline for the Tab review.
- Shared Tab release/navigation: implemented for Oogas, gorillas and detached mode, signed in or out, with held-key/mouse cancellation, Shift protection and UI priority. `npm run build`, `node --check` on all five changed JavaScript files and `git diff --check` passed. Existing regressions cover the agreed flows; runtime checks remain unrun under **wait**.
- `f1b248d`: shared Tab release/navigation and held-input cancellation committed and pushed.
- Carry/orbit right-click targeting: approved for both actors and sign-in states; shared visible-world picking, sky direction, facing fallback and release-classified gestures implemented. `npm run build`, `node --check` on all three changed JavaScript files and `git diff --check` passed. Existing actor/auth scenarios cover surface/sky/near targets, clean click history, gorilla facing commands, chords, drag/cancel and detached inactivity. Runtime checks remain unrun under **wait**.
- Map follow-up: restored one-click destination cycling, including advancing past refused arrivals; removed the destination popup and Reset camera button. **0** still resets framing. Map labels use LN Factory and TC Sphere. `npm run build`, `npm run build:site`, `node --check` on all four changed JavaScript files and `git diff --check` passed. Existing map/reset regressions now exercise cycling and shortcut-only reset; runtime checks remain pending under **wait**.
- Smooth actor acquisition: double-click, retake and T now ease from the displayed camera over 0.4 seconds, preserving detached eye position and active mode/view family. Rapid reversals reuse the current view; first-person head visibility and underground combat cutaways follow the displayed camera. `npm run build`, `npm run build:site`, `node --check` on all four changed JavaScript files and `git diff --check` passed. Existing selection/auth/view cases cover initial continuity, progress, settling, same-actor no-op and rapid first-person reversal with head restoration. Runtime checks remain pending under **wait**.
- Gorilla occlusion and Matrix lever: controlled gorillas now share the Ooga silhouette and nearby object/rock/pile guides with their own dimensions and camera state. Room entry no longer starts the world glyph wave; down/on spreads it and up/off recedes it even inside, including living objects. `npm run build`, `npm run build:site`, `node --check` on all four changed JavaScript files and `git diff --check` passed. Existing regressions cover signed-in/out gorilla silhouette and item outlines, clear-view cleanup, view suppression, lever orientation, inside retreat and doorway crossings. Runtime checks remain pending under **wait**.
- Orbit-angle combat entry: X and the mode portrait now choose shoulder at or below 45° above the actor's carry focus, and bird's-eye above that angle, for both actors and sign-in states. Entry uses the displayed eye and preserves the smooth camera transition, including interrupted selection/T handoffs. `npm run build`, `npm run build:site`, `node --check` on all three changed JavaScript files and `git diff --check` passed. Existing regressions now cover below-character, exact-boundary and steep views during rolled, off-target acquisitions, with requested orbit pitch deliberately opposing the displayed view. Runtime checks remain pending under **wait**.
- Gorilla throw angle: carry in every view and combat bird's-eye now launch forward at 45°, with charge controlling speed and no running momentum altering that angle. Combat close views retain cursor aiming. `npm run build`, `npm run build:site`, `node --check` on all three changed JavaScript files and `git diff --check` passed. Existing release coverage now checks fixed-angle launch speed and direction, stale aim reset and retained aimed-throw momentum; the carry-jump case checks its input release chooses the fixed arc. Runtime checks remain pending under **wait**.
- Controlled gorilla idle arms: reproduced a roughly 0.3-radian (17°) snap at rest in the actual managed rig. Hand collision corrections fed back into the next damped animation pose, repeatedly lowering and lifting the arms. The fitter's offset is now removed before calculating each new pose, matching the existing foot-correction lifecycle; collision checks remain in place. New cases cover ape/code meshes at 30/60 Hz, level/raised contact, stable arms, clearance and obstacle removal. `npm run build`, `npm run build:site`, both touched JavaScript syntax checks and whitespace checks passed. The global suite passed 242/242, focused carry/jump/throw checks passed 246/246, and prop traversal/wall-handoff checks passed 246/246. Two standalone browser simulation probes timed out; the rig reproduction and repository gameplay checks completed.
- Banana display consistency: replaced the pile's whole gameplay-stock label with the panel's shared current donation value and formatting. The shared price subscription stays active for either visible display and is released with the HUD. Existing donation client checks now cover the reported figures, rate precedence, changed totals, zero/missing values and demo totals. `npm run build`, `npm run build:site`, syntax checks on all three changed JavaScript files and whitespace checks passed. Runtime verification remains pending under **wait**.
- Remaining decisions: touch and exceptional-controller details.

## Opus review follow-up (18 October 2026)

Review [5564970405](https://github.com/OogaBoogaX/oogaboogaland/pull/230#pullrequestreview-5564970405) identified genuine regressions as well as checks whose setup still assumed the old controls. The maintainer authorized focused checks followed by the full suite. This remains one draft PR as requested, with separate commits for review; the sign-in restriction, gorilla multiplayer, Matrix lever, idle arms and banana display were each explicitly requested during this work.

The agreed behavior remains intentional:

- Escape releases focus, then the actor, then leaves. Tests that mean to carry an actor between scenes must use an explicit exit or walk through the portal. A detached visit must not silently acquire an actor.
- Manual detached selection and sign-in preserve the eye and recenter in carry/orbit. Authored Arcade and poker arrivals instead have a settled camera behind the arriving actor; applying the manual acquisition transition there left an unintended steep orbit.
- Carry/orbit remains a perspective orbit at high angles. Only combat bird's-eye forces the overhead projection. The old carry-pole assertion described the previous behavior.
- Contributor-only sign-in stays in this PR because it makes the signed-in selection rule unambiguous: the visitor has an owned pair. Temporary contributors retain access during a failed refresh only until the original verified snapshot is 24 hours old, as explicitly approved by the maintainer. Unknown identities stay denied; successful refreshes replace the cache immediately.
- Gorilla identity extends the existing position protocol but requires updated pages to render correctly. An older page can display a hashed Ooga beside its local gorilla. Refresh participating pages together; no protocol-version negotiation is implemented. Attacks, captives and throws remain outside this replication scope.

The follow-up fixes ordinary movement while a nonmodal button or summary has focus, held movement across scene changes, detached camera exits in Factory/Bifrost, Arcade game return identity, and authored arrival framing. It also guards nonfinite outgoing gorilla locomotion, handles an expired pointer capture, maps a combat/orbit actor handoff into a valid gorilla view, removes duplicate gorilla yaw input, respects remote-body dimensions in crew collision, clears retained camera-transition nodes on leaving, and explains unavailable destinations. Sign-in refusal returns to the saved destination with a notice; the account documentation explains historical-session removal and multiplayer compatibility. Dead local-presence hooks and outdated ownership comments are removed.

Validation is paused at the maintainer’s request. The first focused run passed 288/296 checks; the follow-up passed 326/330. Four repeated failures are recorded in `untracked/test-ledger.json`: Bifrost return placement (72.6 metres from the expected arrival), two map checks whose actor remains asleep, and the Ooga pending-focus Tab fixture whose held-attack precondition is false. A separate Arcade/poker/gorilla run passed 276/277; Arcade walking, cabinet/machine return identity and poker round trips passed. The gorilla map fixture followed an unfinished charged smash. Advancing the world to finish recovery allowed the first arrival, but subsequent destinations still reported blocked arrivals; its recheck passed 263/264 and also reached STOP. On 18 October 2026 the maintainer explicitly chose to keep all five checks paused and document their failures. Further diagnosis, fixes, reruns and the full suite remain paused; no thresholds were relaxed or ledger entries cleared. The full suite has not run yet. The contributor/sign-in checkpoint `db27862` passes all 87 Worker checks, including cache expiry, successful-refresh removal and denial without account/session creation. Build/site, changed-file syntax and whitespace checks pass. Remaining runtime outcomes will be recorded before declaring this PR ready.

## Final Opus review follow-up (18 October 2026)

Review [5565400723](https://github.com/OogaBoogaX/oogaboogaland/pull/230#pullrequestreview-5565400723) confirms the previous code findings were addressed and identifies two new defects worth fixing. Neither is an intended control or access-policy change:

- Denied sign-in normalized dot segments before constructing a relative redirect. A path such as `/.//evil.example` became `//evil.example`, which a browser treats as another host. The shared return-path validator now rejects paths whose normalized pathname begins with two slashes, including encoded dot segments. Denial still returns home with its notice, writes no account/session, and preserves ordinary valid destination queries and fragments.
- Blur can miss a keyup delivered to another application. A fresh, non-repeat keydown now clears that key's cancellation block, so the first W or Shift+W press after returning works. Repeats from an interrupted hold remain blocked; a still-blocked Shift continues to suppress its chords. This changes only the shared keyboard guard, not actor selection or view behavior.

The review's intentional items remain as approved above: contributor-only sign-in and the bounded cache, documented historical-account removal, older-client companion rendering, perspective carry orbit, and one draft PR with separate checkpoints. The review's look-stick objection was withdrawn because `axes.yaw` already includes the stick.

The five failures and full suite remain paused by the maintainer. They are not reclassified as passing or marked `open` to bypass validation. The review also records unverified real-mouse Map activation, DSB's Escape/detached return, respawn/interior arrival support, actual OAuth navigation, two-client multiplayer, phone layout and Canvas 2D. These remain play-test gaps; this follow-up does not diagnose or change the paused arrival flows.

Validation for these two fixes: build/site, syntax on all four changed JavaScript files and whitespace checks pass. The Worker suite passes 87/87 with the actual denied callback exercised across plain, encoded and nested dot segments and a valid destination with query/fragment. The focused lab walking run, including the global tier and the new focus-recovery regression, passes 251/251. It checks W and both Shift keys, interrupted repeats, and a fresh press without a preceding keyup through the focused canvas's keyboard event path. All five paused ledger entries remain unchanged; no full-suite run was made.

## ACK scope and opposite-Shift recovery (18 October 2026)

Opus [ACKed `540ce11`](https://github.com/OogaBoogaX/oogaboogaland/pull/230#issuecomment-6256635998) for its redirect and fresh-key fixes, explicitly excluding whole-PR merge approval. The comment identifies one remaining input edge: after a missed keyup during blur, a stale Left Shift block could suppress a fresh Right Shift, or vice versa.

This edge is a defect, not an intentional restriction. A fresh Shift now clears blocks for Shift keys no longer tracked as physically held. Blur clears that tracking, so either Shift can recover after returning from another app. Tab keeps the tracking, so a fresh opposite Shift cannot release a Shift still held through Tab. The existing focus-recovery regression covers both directions and both interruption cases; the five paused checks are unchanged.

Merge assessment: keep this PR draft. The ACK applies to one commit's fixes, the five known failures remain unresolved by explicit maintainer choice, and there is no full-suite result for the final branch. The observed pending `Character intake` status follows the coordinator's draft gate (`scripts/character-bundles.mjs`); it is not evidence of a new test failure. No gate is bypassed, and no paused failure is marked `open` or passing to enable a merge.

Validation: build/site, both changed JavaScript syntax checks and whitespace checks pass. Focused lab walking plus the global tier passes 251/251, including the extended recovery cases. All five paused ledger entries match their pre-run values exactly. The full suite remains paused.

## Resumed validation (18 October 2026)

The maintainer explicitly resumed the five checks before merge. This supersedes the pause recorded above. Investigation distinguishes placement defects from obsolete fixture assumptions:

- Bifrost return: the widest Ooga's collision body overlaps the first stair at the authored arrival. Searching only sideways cannot find a clear landing. Arrival placement now searches forward as well, while still validating both body and camera against the real geometry. The focused exit fixture also depended on earlier entrance steps: with those filtered out it ran chamber coordinates on the hub and reported a misleading 72-metre offset. It now performs the actual entrance flow when needed, including the actor handoff; a direct debug scene change intentionally enters detached and is not a substitute.
- Ooga Map refusal and arrival labels: the post-matrix fixtures selected an Ooga that had returned to sleep. Selection intentionally preserves sleep. These travel fixtures now explicitly wake the selected actor; the wake-before-travel guard stays unchanged.
- Pending-focus Ooga Tab: the overhead virtual cursor intentionally consumes a left capture click while pointer lock is pending. It must not start a melee charge. The fixture now checks that suppression, held movement cancellation and late-lock safety; the soft-focus case still verifies that Tab cancels an actual held attack. Gorilla charge cancellation remains covered in both cases.
- Gorilla Map: preceding combat probes leave NPCs crowding all valid Lab arrivals. The collision refusal is correct. The successful-travel matrix now temporarily hides that NPC traffic and restores every visibility flag afterward. Actor identity, carry/combat, view family and exact camera translation assertions remain unchanged.

Reproducing the crowded combat scenario also exposed a real exception: Ooga damage-number rendering referenced an unbound `fx` variable. It now uses the crew's scene effects (`ctx.fx`), and a global regression verifies visible versus silent hits, health changes and recovery delay.

Focused validation: the four control assertions now pass. The combined recheck passed 300/301 checks with only the Bifrost prerequisite exception; after using the real entrance flow, the Bifrost/global recheck passed 251/251. All five original failure assertions have cleared from the ledger through passing results. Historical step-exception entries remain because the runner only clears matching assertion names; none were manually removed. Build/site, changed-file syntax and whitespace checks pass. No thresholds were relaxed or checks marked `open`.

### Full-suite follow-up

The full suite ran while the signed checkpoint was waiting for the maintainer's hardware key: **1279/1289 checks passed in 18.8 minutes**. This is not a green merge gate. Its ten failures were investigated separately from the original five:

- Two cutaway assertions exposed a real transition defect. A briefly clear eye cleared the handoff guard, but the residual swoop could touch the ceiling again a frame later. Clearance is now checked throughout the remaining overhead blend, allowing the slice to reopen during that transition. A settled close camera still does not reopen the island merely because a wall obstructs it. The existing blocked/clear camera assertions are unchanged.
- Two precise-aim assertions mixed stationary zoom with deliberate pointer movement. With the continuous low overhead entry, their target projects as far as 139 pixels above the viewport. Repeatedly requesting that pixel clamps the cursor to the edge and changes its world aim. The fixture now tests stationary-pointer object retention and replays the original per-frame movement separately, asserting viewport clamping, same-floor aim and stable shoulder centering. Both object-hit and shoulder/first-person precision assertions remain and pass. The added replay resets the bearing after the preceding close-view aim probe, but its centering assertion still fails as described below.
- The long native pointer-lock scenario exceeded the existing 120-second watchdog while sharing focus with another browser lane. It now uses the runner's existing exclusive-session scheduling; the watchdog and its assertions are unchanged.
- The Map accessibility fixture compared title-case DOM text with Chrome's uppercase accessible name, produced by the existing CSS text transform. It now checks that rendered name while preserving all twelve destination, wraparound and removed-control assertions.
- Both DSB arrival fixtures expected the former shoulder default. Fresh possession intentionally enters carry/orbit. They now require orbit with combat off while retaining actor identity, real movement, tour clearance and input cleanup assertions.
- The AK camera-ray assertion also fails on the PR's merge-base, `4113d59b69cbcd0f85207902ce4e36bbec8dfca4`. The fixture now explicitly enters combat before applying shoulder mouse deltas, since weapon selection preserves mode. That setup correction alone did not resolve the ray miss in the runner; ammunition, damaging hits, empty-magazine behavior and carry reload all pass. The second consecutive failed assertion reaches the repository's STOP rule. Further diagnosis and reruns are paused pending maintainer direction.
- Worker cave-trip navigation also fails on that merge-base. On the PR, one worker performs a recovery jump and reaches a 0.15-metre step; on the base, a worker stalls for 16.05 seconds and relocates 0.9 metres. All five workers eventually complete the required trips in both runs. This is pre-existing navigation instability, not evidence of a controls regression; its strict no-stall/jump/relocation assertion remains unchanged and unresolved.

The base comparison used a separate temporary archive and passed 241/243 checks: only worker trips and AK aim failed there. No failure was hidden by changing a threshold, marking it open, clearing its ledger entry or discarding its input coverage. Full-suite results must remain visible alongside subsequent focused validation; PR #230 stays unmerged.

Follow-up validation passed **329/331** checks: all eight other full-suite failures cleared, while the AK ray assertion and the new moving-cursor edge assertion failed. The edge replay was given its one correction attempt, resetting the overhead bearing after the preceding close-view aim probe. Its recheck passed **260/261**: clamping, same-floor aim, shoulder entry and exact world-anchor retention pass, but final centering is still 0.762799 pixels off against the existing 0.1-pixel precision requirement. That new check is now also at STOP. Its root cause is unresolved; the bearing-reset hypothesis did not fix it. Further diagnosis or reruns of either stopped check require maintainer direction. Worker cave-trip navigation remains unresolved at its first PR failure. No second full run was attempted because it would rerun the stopped assertions. The original five checks remain resolved, but the current branch is not fully validated for merge.

### Remaining checks resumed

The maintainer subsequently authorized resuming both stopped checks, investigating worker navigation and running focused checks followed by the full suite. Checkpoint `5800dc0` records the preceding fixes and their unresolved results; it is signed and pushed to PR #230.

- AK targeting was a fixture obstruction: the nearest camera-ray hit is the crate west of the selected barrel, while the lower muzzle ray can hit the barrel. The west-side approach therefore cannot satisfy the camera's barrel-hit assertion. The fixture now approaches from the east, where the real nearest-hit query confirms the barrel. It still requires a camera hit on that exact mesh, damaging shots, correct magazine consumption, no empty-magazine fire and a successful carry-mode reload. No collision or weapon behavior changed.
- The moving-cursor replay measured final centering before its camera blend finished. At its old one-second sample, the overhead blend is still 0.001876 and the visible reticle correctly sits 0.762799 pixels from center. Ten frames later the blend is zero and the error is about 0.000105 pixels. The fixture now checks the selected point against the displayed moving reticle throughout the remaining blend, then requires screen-center precision after semantic completion, bounded to 90 frames. The 0.1-pixel precision requirement and exact world-anchor assertion remain unchanged.
- Worker navigation has not reproduced in the isolated diagnostics: six seeded boots, a replay including the preceding queue probes and a five-minute fixed-step simulation completed without jumps or relocation. In the long simulation, each of the five workers returned from every cave at least five times. This does not establish a fix for the earlier intermittent failure. The original assertion remains unchanged; its failure detail now captures the first bad frame's position, phase, route, recovery state and nearby workers before recovery erases that evidence. Failure rows lead the detail so the ledger's truncation retains the relevant actor.

The resumed focused run passes **269/269**, including all three assertions; their ledger entries clear through genuine passes. Changed-file syntax and whitespace checks pass. A full run follows the signed checkpoint. The worker result is a passing observation, not a claim that its intermittent cause has been repaired.

### Full validation of the resumed fixes

Signed checkpoints `5800dc0` and `44716d8` are pushed to PR #230. The subsequent full suite passes **1297/1298 checks in 19.8 minutes**. All five original assertions and all three later resumed assertions pass. The exclusive native-pointer camera session passes all 30 checks in 75.5 seconds, within the unchanged 120-second watchdog. Worker trips complete without stalls, jumps or relocation in this run; the earlier intermittent cause remains unproven. No thresholds were relaxed, checks marked open or ledger entries manually cleared.

The one failure is the existing high-density wall-movement performance check during donation effects. It averages 56.02 FPS, but its 95th-percentile frame interval is 33.3 ms against the unchanged requirement below 25 ms. Its slowest sampled frame spends 29.4 ms in the overlay. Ordinary movement passes, and the machine is on AC power. This is a failed smoothness gate, despite meeting the average-FPS floor.

A separate CPU-instrumented replay also misses the requirement (42.72 FPS, 33.4 ms p95, adaptive quality drops to low). Instrumentation changes delivery, so that result is not directly comparable to the uninstrumented full suite. The diagnostic script then fails to export the CPU profile; there is no captured profile supporting a root-cause claim or production optimization. Conservatively applying the repository's second-failure STOP rule, further performance diagnosis/runs are paused pending maintainer direction. The runner's ledger retains the full-suite failure at streak one; the external diagnostic did not write the ledger. PR #230 remains draft and unmerged. The full-suite result is not green.

### Resumed overlay diagnosis

The maintainer authorized further profiling and a focused performance check. The validation record above is signed and pushed as `fc12555`. Correcting the diagnostic script's DevTools response access captured a CPU profile: the covered overlay accounts for about 3.84 seconds, with approximately 1.66 seconds under `ownerBoundaryAt`. Triangle-grid candidate scans and exact triangle predicates dominate that query cost. Separate per-owner instrumentation points chiefly to nearby cave-front and scenery owners, rather than the controlled actor's silhouette. Instrumented timing is diagnostic only and is not a passing performance gate.

One candidate conservatively removed triangle-grid entries whose cells cannot intersect the triangle and avoided retesting the adjacent ray's already-rejected triangle. Existing exact visibility and storage regressions passed 247/247, including near-plane crossings and agreement with the unrestricted triangle scan. However, the final uninstrumented performance/global run passed only **249/250**: covered movement fell to **34.49 FPS**, p95 **49.9 ms**, with adaptive quality falling to low. The candidate and its test extension were removed completely. Later contention evidence means the timing difference cannot reliably be attributed to index construction alone. Restored source syntax and build checks pass.

The performance assertion now has runner ledger streak **2**, first failure `2026-10-19T01:16:58.998Z`, latest failure `2026-10-19T01:24:58.001Z`. Further diagnosis, fixes and reruns require renewed direction under the STOP rule. The ledger was not edited. The profile is retained locally under `untracked/overlay-profile.cpuprofile`; the last full-suite result remains 1297/1298, and PR #230 remains draft and unmerged.

The maintainer then explicitly overrode STOP for this one performance assertion until its unchanged gate passes. Diagnosis checkpoint `b3a9680` is signed and pushed. Lazy grid refinement, dense-mesh BVH selection and paired-ray traversal all failed the focused timing gate and were removed; no candidate remains in source. The assertion's ledger streak is six after these authorized runs. Browser checks load `src/index.html`, so both lazy-refinement invocations measured that candidate, including the first invocation made before rebuilding the distribution artifact.

Before further comparisons, a process inspection with no test browser running found a Chrome renderer using 106% CPU, a Chrome helper at 48% and WindowServer at 46%, with no thermal/power warning. Browser inventory showed an existing production `https://oogabooga.land/` tab. This is substantial uncontrolled rendering contention, and the candidate timing comparisons do not establish causal regressions or improvements. Automatic approval review initially denied access to that potentially signed-in production tab. The maintainer then approved backgrounding it; on the next inventory the tab was already closed, so no production-page interaction was needed. All experimental source changes are removed, and the restored build and syntax checks pass. No test limit or ledger entry was changed.

### Performance recheck without competing game rendering

With all experimental source changes removed and the production game tab closed, the unchanged focused performance check passes **3/3**. Both ordinary movement and covered movement hold **60.00 FPS**, **16.7 ms p95**, **16.8 ms maximum sampled frame interval**, and high quality. Covered movement retains outlines in all 301 samples, completes the donation and shows 26 particles; its worst measured work gap is 30.4 ms, below the unchanged 50 ms limit. The runner clears the performance failure through this passing result.

This strongly supports competing rendering as the cause of the failed smoothness measurement, rather than a demonstrated code regression. It does not validate any rejected optimization or claim that outline work has no cost. No source or test change is needed for this performance resolution. The full suite was then rerun in the same conditions.

### Final full-suite result

**1298/1298 checks pass in 14.3 minutes** on source checkpoint `b3a9680` (the source is unchanged since the restored performance baseline). This includes all five originally paused assertions, the three later resumed checks, and the unchanged performance gate. In this full run, both movement scenarios hold 60.00 FPS and 16.7 ms p95 at high quality. Covered movement has outlines in all 301 samples, active donation effects and a worst measured work gap of 30.7 ms. The native-pointer camera session passes all 30 checks in 53.3 seconds, below its unchanged 120-second watchdog. The full-run build and final whitespace check pass.

The runner has cleared the performance assertion through passing results. Historical ledger entries for earlier step exceptions and renamed expectations remain untouched; they are not failures in this final run. No thresholds were loosened, checks marked open or ledger entries manually cleared. The earlier intermittent worker-navigation cause remains unproven, although its unchanged assertion passes in both recent full runs.

PR #230 remains draft and unmerged for review of the final fixes and evidence. The existing Opus ACK covers only `540ce11`, not the later changes or the whole PR. Real OAuth navigation and simultaneous two-client multiplayer remain human play-test coverage; this automated pass does not claim those were exercised. No deployment was performed.

### Whole-PR ACK and integration with current rock

[Opus's final comment](https://github.com/OogaBoogaX/oogaboogaland/pull/230#issuecomment-6258037110) ACKs the whole PR at `0fade80` with no blocking code finding, but says it is not ready to merge until current `rock` is integrated and validated and the draft/required-status gates are satisfied. The maintainer authorized completing this round and merging without another Opus review.

Current `rock` at `e1b6a04` integrates cleanly. Its Rally garage uses the existing `net.ownCharacter()` and one-argument `net.mayDrive(name)` contracts, whose ownership meaning this PR preserves. The combined tree retains Rally's field/selection changes and the controls/authentication changes.

The nonblocking Map occupancy gap is now covered by extending the existing gorilla Map assertion. After its successful-travel matrix, the fixture places real crew Oogas at arrival positions selected by the real Map, until the Lab arrival is occupied. Signed in and out, refusal must show the blocked-arrival notice, advance the destination label, preserve actor control, mode, position and camera, and allow travel once those blockers are removed. Actor positions and visibility are restored afterward. The first fixture attempt started at its own target and therefore could not distinguish arrival from refusal; starting at the Mirror fixes that setup error. The focused recheck passes **265/265**, and the preceding focused run passed Rally and the global tier, with only that fixture setup failing (**296/297**). No production behavior or assertion threshold changed.

The other nonblocking observations remain explicit: Map names follow the visible uppercase styling; old clients need a refresh for gorilla identity; worker-navigation intermittency remains unproven; performance measurements require no competing game rendering. The fixture still uses DOM activation rather than a real mouse press, and the DSB character-continuity fixture leaves through the explicit Leave control. These are coverage limits, not new evidence of faulty behavior. Real OAuth and simultaneous signed-in multiplayer/voice are not claimed covered by the local automated suite. Full validation of the combined tree follows.


The first combined full run reproduced the intermittent worker failure: `w-s-bitcoin` began a recovery hop on the Lab station approach at approximately (-5.3381, -14.7586), with target (-4.9576, -15.6868) and no nearby crew traffic. That run was stopped before changing source, rather than reported as complete. Geometry inspection found every supported step on that one-metre approach clear. A deterministic replay of the recorded position with an exhausted local-search state reproduced the unwanted jump on the old code.

`jumpWalker` now rechecks the existing supported ground-route query before committing to a recovery jump. If the route has cleared during the search, it releases recovery back to walking; blocked ground routes retain the existing crowd, landing and jump-arc checks. This runs only at jump recovery, uses the existing bounded scratch, and adds no per-frame allocation. The same replay now stays grounded with zero jumps. The unchanged worker-trip assertion and global tier pass **253/253**. The extended movement regression explicitly checks a reopened ground path, a still-blocked path and a valid obstacle jump; the global tier passes **247/247** after completing the fixture's jump-state setup. This fixes the demonstrated stale-search hop; it does not prove every historical navigation failure shared that cause. Final full validation of the combined tree passes **1302/1302 in 14.4 minutes**, including the strengthened Map and movement checks, upstream Rally changes and all previously resumed assertions. The native-pointer session passes all 30 checks in 51.6 seconds; covered performance holds 59.20 FPS and 16.8 ms p95 at high quality against unchanged limits. The full-run build, touched-file syntax and whitespace checks pass. The maintainer explicitly accepted the remaining manual play-test gaps and authorized merging after these automated checks, without another Opus review. Real OAuth and simultaneous two-client multiplayer/voice have not been claimed tested.
