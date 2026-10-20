// The Ember Den's wire format, clocks and limits, as pure functions the tests can reach (the dealer is poker-den.js).
//
// Client → den:  { t: "sit", table, seat }   take seat `seat` (0-8, or -1 for the first free one) at `table` (0-9)
//                { t: "stand" }              leave the seat: at once when out of the running hand; otherwise fold at its
//                                            next turn and leave when the hand ends
//                { t: "act", a, n, v }       fold, check, call or raise to the round total `n`, seen at table version `v`
//                { t: "deal" }               deal the next hand now rather than wait for the automatic deal
//                { t: "out", on }            sit out of the next deals (true), or be dealt in again (false), which also
//                                            takes back a leave asked for mid-hand
//                { t: "topup" }              the free top-up to BUY_IN bananas, once a UTC day, when running low
//                { t: "seed", table, s }     a seated page's random seed (64 hex) for the next deal at `table`, sent once
//                                            it sees that deal's `commit`; the deck comes from the dealer's seed and these
//                "ping"                      answered "pong" without waking the den
// Den → client:  welcome { you, now, wallet, tables }  on connect: who you are, your bananas and every table's view
//                table { i, s, now }        table `i` changed: its view for you, your own cards only where you sit
//                wallet { bananas, topUp }  your bananas off the tables, and whether today's top-up is open
//                notice { text }            something the dealer did for you (sat you out, stood you up)
//                error { text }             your request was refused, and why
//                kick { reason }            `replaced` (a newer tab), `full`, `stale` (silent STALE_MS: reconnect) or
//                                            `revoked` (banned or deleted); the socket closes after it
// A view is the rules engine's `snapshot(viewer)` plus the dealer's clocks: `deadline`, when the player to act runs
// out of time, and `dealAt`, when the next hand deals (server milliseconds; 0 for none). It also carries the deal's
// commit-reveal: `commit`, the SHA-256 commitment to the dealer's seed for the hand being played or the next one;
// `seeded`, the seats whose seed the next deal holds; and once a hand is over `reveal`, `{ hand, seed, commit, seeds,
// order }`, enough for any page to recompute that hand's deck.

export const TABLES = 10;
export const SEATS = 9;
export const MAX_SOCKETS = 64;
export const MESSAGE_MAX = 256;
// A turn's clock, and the shorter one for a player whose page has gone (so a closed tab does not hold the table).
export const TURN_MS = 30000;
export const AWAY_TURN_MS = 5000;
// The automatic deal: after a table first has two players ready, and between hands (time to see the result).
export const FIRST_DEAL_MS = 3000;
export const DEAL_GAP_MS = 5000;
// A player whose page is gone this long is stood up between hands, their stack back in their bananas.
export const AWAY_STAND_MS = 120000;
// Turns run out in a row before the dealer sits a player out.
export const MISSED_OUT = 2;
// Requests a second per socket, bursting to ACT_BURST.
export const ACT_HZ = 4;
export const ACT_BURST = 8;
export const DAY_MS = 86400000;
export const CLOSE_KICK = 4000;
export const CLOSE_PROTOCOL = 4400;
export const DEN_NAME = "ember-den";

/** The UTC day a millisecond time falls on: the top-up's calendar. */
export const dayOf = (ms) => Math.floor(ms / DAY_MS);

const int = (v, lo, hi) => Number.isSafeInteger(v) && v >= lo && v <= hi;
const ACTIONS = new Set(["fold", "check", "call", "raise"]);
const HEX64 = /^[0-9a-f]{64}$/;

/** A parsed client message, `null` for one to ignore, or `false` for one that should close the socket. */
export const parsePokerMessage = (text) => {
  if (typeof text !== "string" || text.length > MESSAGE_MAX) return false;
  let msg;
  try {
    msg = JSON.parse(text);
  } catch {
    return false;
  }
  if (!msg || typeof msg !== "object" || Array.isArray(msg)) return false;
  if (msg.t === "sit") return int(msg.table, 0, TABLES - 1) && int(msg.seat, -1, SEATS - 1) ? { t: "sit", table: msg.table, seat: msg.seat } : null;
  if (msg.t === "stand") return { t: "stand" };
  if (msg.t === "act") {
    if (!ACTIONS.has(msg.a) || !int(msg.v, 0, Number.MAX_SAFE_INTEGER)) return null;
    if (msg.a !== "raise") return { t: "act", a: msg.a, v: msg.v };
    return int(msg.n, 1, Number.MAX_SAFE_INTEGER) ? { t: "act", a: "raise", n: msg.n, v: msg.v } : null;
  }
  if (msg.t === "deal") return { t: "deal" };
  if (msg.t === "out") return typeof msg.on === "boolean" ? { t: "out", on: msg.on } : null;
  if (msg.t === "topup") return { t: "topup" };
  if (msg.t === "seed") return int(msg.table, 0, TABLES - 1) && typeof msg.s === "string" && HEX64.test(msg.s) ? { t: "seed", table: msg.table, s: msg.s } : null;
  return null;
};

/** Whether today's free top-up is open: not yet taken today, and bananas on and off the table below `buyIn`. */
export const topUpOpen = (wallet, stack, now, buyIn) => wallet.d !== dayOf(now) && wallet.b + stack < buyIn;
