// The Ember Den's dealer (src/poker-den.js) on a mocked Durable Object host, with the real rules engine: who sees
// which cards, the clocks, absence, storage across a restart, bananas, and the wire format (src/poker-protocol.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import * as protocol from "../src/protocol.js";
import * as poker from "../src/poker-protocol.js";
import "../../src/js/lifehash.js";
import "../../src/js/poker-rules.js";

const R = globalThis.BL.pokerRules;
const { AWAY_STAND_MS, AWAY_TURN_MS, DEAL_GAP_MS, FIRST_DEAL_MS, MISSED_OUT, TURN_MS, parsePokerMessage } = poker;

// One host per test: a fake clock, storage that outlives a den (a restart is a new den on the same store) and sockets
// that keep every message they were sent.
const host = () => {
  const clock = { now: 1_800_000_000_000 };
  const store = new Map();
  const accepted = [];
  let alarm = null, loading = null;
  const socket = () => ({
    sent: [], closed: null, attachment: null,
    send(text) { this.sent.push(JSON.parse(text)); },
    close(code, reason) { this.closed = { code, reason }; },
    serializeAttachment(value) { this.attachment = JSON.parse(JSON.stringify(value)); },
    deserializeAttachment() { return this.attachment; },
  });
  class WebSocketPair { constructor() { this[0] = socket(); this[1] = socket(); } }
  class Response { constructor(body, init = {}) { this.status = init.status; this.webSocket = init.webSocket; } }
  const source = readFileSync(new URL("../src/poker-den.js", import.meta.url), "utf8")
    .replace(/^import\b[\s\S]*?;\s*$/gm, "")
    .replace("export class PokerDen", "class PokerDen") + "\nglobalThis.PokerDen = PokerDen;";
  const context = {
    ...protocol, ...poker, BL: globalThis.BL,
    DurableObject: class { constructor(ctx, env) { this.ctx = ctx; this.env = env; } },
    WebSocketPair, Response, WebSocketRequestResponsePair: class {}, Date: { now: () => clock.now }, console, crypto: globalThis.crypto,
    // db.js's read, over whatever `env.DB` a test passes to `den(env)`.
    getPlayer: (db, id) => db.getPlayer(id),
    getHandsWon: (db, id) => db.getHandsWon(id),
    addHandsWon: (db, entries) => db.addHandsWon(entries),
  };
  runInNewContext(source, context);
  const clone = (v) => v === undefined ? undefined : structuredClone(v);
  const writes = { count: 0 };
  const storage = {
    async get(key) {
      if (!Array.isArray(key)) return clone(store.get(key));
      const out = new Map();
      for (const k of key) if (store.has(k)) out.set(k, clone(store.get(k)));
      return out;
    },
    put(key, value) {
      writes.count++;
      if (typeof key === "object") for (const [k, v] of Object.entries(key)) store.set(k, clone(v));
      else store.set(key, clone(value));
      return Promise.resolve();
    },
    delete(key) { return Promise.resolve(store.delete(key)); },
    setAlarm(at) { alarm = at; return Promise.resolve(); },
    deleteAlarm() { alarm = null; return Promise.resolve(); },
  };
  const ctx = {
    setWebSocketAutoResponse() {}, blockConcurrencyWhile: (fn) => { loading = fn(); },
    acceptWebSocket: (ws) => accepted.push(ws), getWebSockets: () => accepted.filter((ws) => !ws.closed && !ws.gone), storage,
    getWebSocketAutoResponseTimestamp: (ws) => ws.pingedAt ? new Date(ws.pingedAt) : null,
  };
  const den = async (env = {}) => {
    const d = new context.PokerDen(ctx, env);
    await loading;
    return d;
  };
  const connect = async (d, id, name = `p${id}`) => {
    const before = accepted.length;
    await d.fetch({ url: "https://den.invalid/poker", headers: new Headers({ upgrade: "websocket", "x-player-id": String(id), "x-player-login": name, "x-player-display": name }) });
    return accepted[before];
  };
  const say = (d, ws, msg) => d.webSocketMessage(ws, JSON.stringify(msg));
  // Time passes: every open page pings, as a page does every 10 s (a `silent` one has lost its network without a
  // close), and the alarm fires if it fell due.
  const wait = async (d, ms) => {
    clock.now += ms;
    for (const ws of accepted) if (!ws.closed && !ws.gone && !ws.silent) ws.pingedAt = clock.now;
    if (alarm !== null && alarm <= clock.now) await d.alarm();
  };
  const hangUp = (d, ws) => { ws.gone = true; d.webSocketClose(ws); };
  return { clock, store, writes, den, connect, say, wait, hangUp, get alarm() { return alarm; } };
};

const lastTable = (ws, i) => ws.sent.filter((m) => m.t === "table" && m.i === i).at(-1)?.s || ws.sent.find((m) => m.t === "welcome")?.tables[i];
const lastOf = (ws, t) => ws.sent.filter((m) => m.t === t).at(-1);
const bananas = (h, d, ids) => ids.reduce((n, id) => n + (d.wallets.get(id)?.b ?? h.store.get(`w:${id}`)?.b ?? 0), 0);
const onTables = (d) => d.tables.reduce((n, t) => n + t.rules.snapshot().seats.reduce((m, s) => m + (s ? s.stack + s.totalBet : 0), 0), 0);
// Every message a socket got: a seat other than the viewer's shows cards only at a showdown, for a hand still in.
const leaks = (ws, viewer) => {
  const out = [];
  const check = (s) => {
    for (const seat of s.seats) {
      if (!seat || seat.id === viewer || seat.cards.every((c) => c === null)) continue;
      if (!(s.phase === "showdown" && s.result?.revealed && seat.inHand && !seat.folded)) out.push({ phase: s.phase, seat: seat.id, cards: seat.cards });
    }
  };
  for (const m of ws.sent) {
    if (m.t === "table") check(m.s);
    if (m.t === "welcome") m.tables.forEach(check);
  }
  return out;
};

test("poker wire: sit, act and the rest parse; junk is ignored or closes the socket", () => {
  assert.deepEqual(parsePokerMessage('{"t":"sit","table":3,"seat":-1}'), { t: "sit", table: 3, seat: -1 });
  assert.deepEqual(parsePokerMessage('{"t":"act","a":"raise","n":40,"v":7}'), { t: "act", a: "raise", n: 40, v: 7 });
  assert.deepEqual(parsePokerMessage('{"t":"act","a":"call","v":7,"n":"x"}'), { t: "act", a: "call", v: 7 });
  assert.equal(parsePokerMessage('{"t":"act","a":"raise","v":7}'), null, "a raise names its total");
  assert.equal(parsePokerMessage('{"t":"sit","table":10,"seat":0}'), null);
  assert.equal(parsePokerMessage('{"t":"sit","table":0,"seat":9}'), null);
  assert.equal(parsePokerMessage('{"t":"act","a":"steal","v":1}'), null);
  assert.equal(parsePokerMessage('{"t":"peek","seat":2}'), null, "there is no message that asks for someone else's cards");
  assert.equal(parsePokerMessage("{nope"), false);
  assert.equal(parsePokerMessage("[1]"), false);
  assert.equal(parsePokerMessage(" ".repeat(poker.MESSAGE_MAX + 1)), false);
  assert.equal(poker.SEATS, R.SEATS);
});

test("poker den: two players sit, the dealer deals by itself and each page sees only its own cards", async () => {
  const h = host(), d = await h.den();
  const a = await h.connect(d, 1, "ana"), b = await h.connect(d, 2, "bo"), watcher = await h.connect(d, 3, "cy");
  assert.equal(a.sent[0].t, "welcome");
  assert.equal(a.sent[0].wallet.bananas, R.BUY_IN, "a newcomer starts with BUY_IN bananas");
  await h.say(d, a, { t: "sit", table: 6, seat: 2 });
  await h.say(d, b, { t: "sit", table: 6, seat: 5 });
  assert.equal(lastOf(a, "wallet").bananas, 0, "sitting takes every banana to the table");
  assert.equal(lastTable(a, 6).phase, "waiting");
  assert.ok(lastTable(a, 6).dealAt > h.clock.now, "the table says when it deals");
  await h.wait(d, FIRST_DEAL_MS);
  const ownA = lastTable(a, 6), ownB = lastTable(b, 6), open = lastTable(watcher, 6);
  assert.equal(ownA.phase, "preflop");
  assert.ok(ownA.seats[2].cards.every(Number.isInteger) && ownA.seats[5].cards.every((c) => c === null));
  assert.ok(ownB.seats[5].cards.every(Number.isInteger) && ownB.seats[2].cards.every((c) => c === null));
  assert.ok(open.seats[2].cards.every((c) => c === null) && open.seats[5].cards.every((c) => c === null), "a spectator sees no hole cards");
  assert.ok(!("deck" in open) && !JSON.stringify(watcher.sent).includes('"deck"'), "no deck ever leaves the den");
  assert.ok(open.deadline > h.clock.now, "the player to act has a clock");
  assert.equal(h.alarm, open.deadline);
});

// Rule (#224 review): the deck is committed before the deal and revealed after it, so any page can check the dealer
// did not choose it; seated pages' seeds go into it, and nobody else's.
test("poker den: each deal is committed before it is dealt, takes the seated pages' seeds, and is revealed after", async () => {
  const h = host(), d = await h.den();
  const a = await h.connect(d, 1, "ana"), b = await h.connect(d, 2, "bo"), watcher = await h.connect(d, 3, "cy");
  await h.say(d, a, { t: "sit", table: 6, seat: 0 });
  await h.say(d, b, { t: "sit", table: 6, seat: 4 });
  const commit = lastTable(a, 6).commit;
  assert.match(commit, /^[0-9a-f]{64}$/, "the next deal is committed as soon as it is booked");
  const seedA = "a1".repeat(32), seedB = "b2".repeat(32);
  await h.say(d, a, { t: "seed", table: 6, s: seedA });
  await h.say(d, b, { t: "seed", table: 6, s: seedB });
  await h.say(d, watcher, { t: "seed", table: 6, s: "c3".repeat(32) });
  await h.say(d, a, { t: "seed", table: 6, s: "d4".repeat(32) });
  assert.deepEqual(lastTable(watcher, 6).seeded.sort(), ["1", "2"], "a spectator's seed and a second seed are ignored");
  await h.wait(d, FIRST_DEAL_MS);
  const dealt = lastTable(a, 6);
  assert.equal(dealt.phase, "preflop");
  assert.equal(dealt.commit, commit, "the hand plays under the commitment shown before it");
  assert.equal(dealt.reveal, null);
  const secret = d.tables[6].meta.reveal.seed;
  for (const ws of [a, b, watcher]) assert.ok(!JSON.stringify(ws.sent).includes(secret), "the dealer's seed stays secret during the hand");
  const first = dealt.seats[dealt.turn].id === "1" ? a : b;
  await h.say(d, first, { t: "act", a: "fold", v: lastTable(first, 6).version });
  const over = lastTable(a, 6), reveal = over.reveal;
  assert.ok(reveal && reveal.hand === over.hand && reveal.commit === commit && R.commitFor(reveal.seed) === commit);
  assert.deepEqual([...reveal.seeds].sort(), [seedA, seedB].sort());
  assert.deepEqual(reveal.order.slice().sort(), ["1", "2"]);
  assert.ok(R.checkReveal(reveal, dealt), "the revealed deck deals ana's own cards");
  assert.ok(R.checkReveal(reveal, lastTable(b, 6)), "and bo's");
  assert.ok(R.checkReveal(reveal, lastTable(watcher, 6)), "and agrees with a spectator's view");
  assert.ok(!R.checkReveal({ ...reveal, seed: "e5".repeat(32) }, dealt), "another seed fails the commitment");
  assert.ok(!R.checkReveal({ ...reveal, seeds: [seedA] }, dealt), "leaving a page's seed out makes a different deck");
  assert.match(lastTable(a, 6).commit, /^[0-9a-f]{64}$/, "the next deal is committed afresh");
  assert.notEqual(lastTable(a, 6).commit, commit);
});

test("poker den: up to 300 hands at a four-player table never show a page a card that is not theirs to see", async () => {
  const h = host(), d = await h.den();
  const ids = [11, 12, 13, 14], socks = new Map();
  for (const id of ids) socks.set(id, await h.connect(d, id));
  const watcher = await h.connect(d, 99, "watcher");
  for (const [n, id] of ids.entries()) await h.say(d, socks.get(id), { t: "sit", table: 6, seat: n * 2 });
  const total = bananas(h, d, ids) + onTables(d);
  let hands = 0;
  for (let step = 0; step < 6000 && hands < 300; step++) {
    const t = d.tables[6].rules, s = t.snapshot();
    if (!t.playing) {
      for (const id of ids) {
        const p = s.seats.find((x) => x && x.id === String(id));
        if (p && p.stack === 0) await h.say(d, socks.get(id), { t: "stand" });
      }
      if (ready(t) < 2) break;
      await h.wait(d, DEAL_GAP_MS);
      if (t.playing) hands++;
      continue;
    }
    // A human's pace: the den lets a page make ACT_HZ moves a second.
    await h.wait(d, 400);
    const id = Number(s.seats[s.turn].id), ws = socks.get(id), view = lastTable(ws, 6), l = view.legal;
    const roll = R.randomInt(10);
    if (roll === 0) await h.say(d, ws, { t: "act", a: "fold", v: view.version });
    else if (roll < 3 && l.canRaise) await h.say(d, ws, { t: "act", a: "raise", n: Math.min(l.max, l.min + R.randomInt(3) * R.BIG), v: view.version });
    else await h.say(d, ws, { t: "act", a: l.check ? "check" : "call", v: view.version });
  }
  assert.ok(hands >= 20, `played ${hands} hands`);
  for (const [id, ws] of socks) assert.deepEqual(leaks(ws, String(id)), [], `player ${id} saw only what was theirs`);
  assert.deepEqual(leaks(watcher, null), [], "the spectator saw only showdowns");
  assert.equal(bananas(h, d, ids) + onTables(d), total, "no banana made or lost");
});
const ready = (rules) => rules.snapshot().seats.filter((s) => s && s.stack > 0 && !s.out).length;

test("poker den: a turn that runs out checks or folds; two in a row sit the player out until they are back", async () => {
  const h = host(), d = await h.den();
  const a = await h.connect(d, 1), b = await h.connect(d, 2);
  await h.say(d, a, { t: "sit", table: 7, seat: 0 });
  await h.say(d, b, { t: "sit", table: 7, seat: 1 });
  await h.wait(d, FIRST_DEAL_MS);
  const before = d.tables[7].rules.snapshot();
  const sleeper = before.seats[before.turn].id, sleeperWs = sleeper === "1" ? a : b, other = sleeper === "1" ? b : a;
  await h.wait(d, TURN_MS - 1);
  assert.equal(d.tables[7].rules.snapshot().turn, before.turn, "the clock has not run out yet");
  await h.wait(d, 1);
  const after = d.tables[7].rules.snapshot();
  assert.notEqual(after.version, before.version, "the dealer acted for the sleeper");
  assert.equal(after.phase, "showdown", "heads-up preflop, the button facing the blind folds");
  // The next hand: the sleeper misses again and is sat out.
  for (let i = 0; i < 6 && !d.tables[7].rules.snapshot().seats.find((s) => s?.id === sleeper).out; i++) {
    await h.wait(d, DEAL_GAP_MS);
    const s = d.tables[7].rules.snapshot();
    if (!d.tables[7].rules.playing) continue;
    if (s.seats[s.turn].id === sleeper) await h.wait(d, TURN_MS);
    else { const v = lastTable(other, 7); await h.say(d, other, { t: "act", a: v.legal.check ? "check" : "call", v: v.version }); }
  }
  assert.ok(d.tables[7].rules.snapshot().seats.find((s) => s?.id === sleeper).out, `sat out after ${MISSED_OUT} misses`);
  assert.ok(lastOf(sleeperWs, "notice").text.includes("sat you out"));
  // The hand it was sat out in plays on: the sleeper's clock runs, the other player acts.
  while (d.tables[7].rules.playing) {
    const s = d.tables[7].rules.snapshot();
    if (s.seats[s.turn].id === sleeper) await h.wait(d, TURN_MS);
    else { const v = lastTable(other, 7); await h.say(d, other, { t: "act", a: v.legal.check ? "check" : "call", v: v.version }); }
  }
  await h.wait(d, DEAL_GAP_MS);
  assert.ok(!d.tables[7].rules.playing, "one player ready deals nothing");
  await h.say(d, sleeperWs, { t: "out", on: false });
  await h.wait(d, FIRST_DEAL_MS);
  assert.ok(d.tables[7].rules.playing, "back in, the table deals again");
});

test("poker den: a stale action is refused; a raise to an illegal size is refused with the rules' reason", async () => {
  const h = host(), d = await h.den();
  const a = await h.connect(d, 1), b = await h.connect(d, 2);
  await h.say(d, a, { t: "sit", table: 8, seat: 0 });
  await h.say(d, b, { t: "sit", table: 8, seat: 1 });
  await h.wait(d, FIRST_DEAL_MS);
  const s = d.tables[8].rules.snapshot(), ws = s.seats[s.turn].id === "1" ? a : b, other = ws === a ? b : a;
  await h.say(d, ws, { t: "act", a: "call", v: 0 });
  assert.match(lastOf(ws, "error").text, /moved on/);
  await h.say(d, ws, { t: "act", a: "raise", n: 11, v: lastTable(ws, 8).version });
  assert.match(lastOf(ws, "error").text, /Invalid raise/);
  await h.say(d, other, { t: "act", a: "check", v: lastTable(other, 8).version });
  assert.match(lastOf(other, "error").text, /Wait for your turn/);
});

test("poker den: a closed page sits out at once, its turns run fast, and it is stood up with its bananas later", async () => {
  const h = host(), d = await h.den();
  const a = await h.connect(d, 1), b = await h.connect(d, 2), c = await h.connect(d, 3);
  for (const [n, ws] of [a, b, c].entries()) await h.say(d, ws, { t: "sit", table: 9, seat: n });
  await h.wait(d, FIRST_DEAL_MS);
  const s = d.tables[9].rules.snapshot(), goneId = s.seats[s.turn].id, goneWs = [a, b, c][Number(goneId) - 1];
  h.hangUp(d, goneWs);
  assert.ok(d.tables[9].rules.snapshot().seats.find((p) => p?.id === goneId).out, "sat out of the next deals");
  await h.wait(d, AWAY_TURN_MS);
  assert.notEqual(d.tables[9].rules.snapshot().turn, s.turn, "its turn ran on the short clock");
  const stack = () => d.tables[9].rules.snapshot().seats.find((p) => p?.id === goneId)?.stack;
  while (d.tables[9].rules.playing) await h.wait(d, TURN_MS);
  const kept = stack();
  await h.wait(d, AWAY_STAND_MS);
  assert.equal(stack(), undefined, "stood up after AWAY_STAND_MS");
  assert.equal(h.store.get(`w:${goneId}`).b, kept, "its stack is back in its bananas");
});

test("poker den: a page that comes back in time is dealt in again; a newer tab takes over the same seat", async () => {
  const h = host(), d = await h.den();
  const a = await h.connect(d, 1), b = await h.connect(d, 2);
  await h.say(d, a, { t: "sit", table: 7, seat: 3 });
  await h.say(d, b, { t: "sit", table: 7, seat: 4 });
  h.hangUp(d, a);
  assert.ok(d.tables[7].rules.snapshot().seats[3].out);
  const again = await h.connect(d, 1);
  assert.ok(!d.tables[7].rules.snapshot().seats[3].out, "back, and dealt in");
  assert.ok(again.sent[0].tables[7].seats[3].id === "1");
  const tab = await h.connect(d, 1);
  assert.equal(lastOf(again, "kick").reason, "replaced");
  assert.equal(d.tables[7].rules.snapshot().seats[3].id, "1", "the seat stays with the account");
  assert.ok(tab.sent[0].t === "welcome");
});

test("poker den: a hand survives the den restarting mid-hand, cards and chips unchanged", async () => {
  const h = host(), d = await h.den();
  const a = await h.connect(d, 1), b = await h.connect(d, 2), c = await h.connect(d, 3);
  for (const [n, ws] of [a, b, c].entries()) await h.say(d, ws, { t: "sit", table: 6, seat: n });
  await h.wait(d, FIRST_DEAL_MS);
  const s = d.tables[6].rules.snapshot(), id = s.seats[s.turn].id, ws = [a, b, c][Number(id) - 1];
  await h.say(d, ws, { t: "act", a: "call", v: lastTable(ws, 6).version });
  const cards = [1, 2, 3].map((p) => d.tables[6].rules.snapshot(String(p)).seats[p - 1].cards.join());
  const total = onTables(d);
  const woken = await h.den();
  const after = woken.tables[6].rules.snapshot();
  assert.equal(after.phase, s.phase);
  assert.deepEqual([1, 2, 3].map((p) => woken.tables[6].rules.snapshot(String(p)).seats[p - 1].cards.join()), cards, "the same hole cards");
  assert.equal(onTables(woken), total, "the same chips");
  assert.equal(woken.players.size, 3, "the sockets came back with their attachments");
  const next = after.seats[after.turn].id, nextWs = [a, b, c][Number(next) - 1];
  await woken.webSocketMessage(nextWs, JSON.stringify({ t: "act", a: lastTable(nextWs, 6).legal.check ? "check" : "call", v: lastTable(nextWs, 6).version }));
  assert.equal(lastOf(nextWs, "error"), undefined, "play goes on after the restart");
});

test("poker den: after a restart, a seat whose page never came back is not dealt in and stands up later", async () => {
  const h = host(), d = await h.den();
  const a = await h.connect(d, 1), b = await h.connect(d, 2), c = await h.connect(d, 3);
  for (const [n, ws] of [a, b, c].entries()) await h.say(d, ws, { t: "sit", table: 6, seat: n });
  // A deploy: every socket drops without the den hearing a close; two pages come back, one never does.
  for (const ws of [a, b, c]) ws.gone = true;
  const woken = await h.den();
  assert.equal(woken.players.size, 0);
  await h.connect(woken, 1); await h.connect(woken, 2);
  await h.wait(woken, FIRST_DEAL_MS);
  const s = woken.tables[6].rules.snapshot();
  assert.ok(woken.tables[6].rules.playing, "the two who came back are dealt");
  assert.ok(s.seats[2].out && !s.seats[2].inHand, "the one who did not is sat out");
  while (woken.tables[6].rules.playing) await h.wait(woken, TURN_MS);
  await h.wait(woken, AWAY_STAND_MS);
  assert.equal(woken.tables[6].rules.snapshot().seats[2], null, "and stood up, its bananas kept");
  assert.equal(h.store.get("w:3").b, R.BUY_IN);
});

test("poker den: standing mid-hand folds when due and pays the stack back after the hand", async () => {
  const h = host(), d = await h.den();
  const a = await h.connect(d, 1), b = await h.connect(d, 2), c = await h.connect(d, 3);
  for (const [n, ws] of [a, b, c].entries()) await h.say(d, ws, { t: "sit", table: 7, seat: n });
  await h.wait(d, FIRST_DEAL_MS);
  const s = d.tables[7].rules.snapshot(), id = s.seats[s.turn].id, ws = [a, b, c][Number(id) - 1];
  await h.say(d, ws, { t: "stand" });
  assert.match(lastOf(ws, "notice").text, /when this hand ends/);
  const mid = d.tables[7].rules.snapshot();
  assert.ok(mid.seats.find((p) => p?.id === id).folded || mid.phase === "showdown", "its turn was taken at once");
  while (d.tables[7].rules.playing) await h.wait(d, TURN_MS);
  assert.equal(d.tables[7].rules.snapshot().seats.find((p) => p?.id === id), undefined, "stood up when the hand ended");
  assert.ok(h.store.get(`w:${id}`).b > 0 && lastOf(ws, "wallet").bananas === h.store.get(`w:${id}`).b);
});

test("poker den: the free refill opens only with no bananas left, as often as they run out; an empty wallet sits with it", async () => {
  const h = host(), d = await h.den();
  const a = await h.connect(d, 1);
  await h.say(d, a, { t: "topup" });
  assert.match(lastOf(a, "error").text, /still have bananas/);
  d.wallets.get(1).b = 0;
  await h.say(d, a, { t: "sit", table: 8, seat: 0 });
  assert.equal(d.tables[8].rules.snapshot().seats[0].stack, R.BUY_IN, "an empty wallet sat down refilled");
  await h.say(d, a, { t: "stand" });
  d.wallets.get(1).b = 10;
  await h.say(d, a, { t: "topup" });
  assert.match(lastOf(a, "error").text, /still have bananas/, "ten bananas is not none");
  for (let i = 0; i < 2; i++) {
    d.wallets.get(1).b = 0;
    await h.say(d, a, { t: "topup" });
    assert.equal(lastOf(a, "wallet").bananas, R.BUY_IN, "refilled, every time it runs out");
  }
  assert.equal(h.store.get("w:1").b, R.BUY_IN);
});

test("poker den: deleting the account closes its page, frees its seat and forgets its bananas", async () => {
  const h = host(), d = await h.den();
  const a = await h.connect(d, 1), b = await h.connect(d, 2);
  await h.say(d, a, { t: "sit", table: 9, seat: 0 });
  await h.say(d, b, { t: "sit", table: 9, seat: 1 });
  await d.forget(1);
  assert.equal(lastOf(a, "kick").reason, "revoked");
  assert.equal(d.tables[9].rules.snapshot().seats[0], null);
  assert.equal(h.store.get("w:1"), undefined);
  assert.equal(JSON.stringify(h.store.get("t9")).includes('"1"'), false, "nothing of it left in the table's storage");
});

// Rule: bananas last until sign-out; the next sign-in starts afresh, and a running hand pays a signed-out seat nothing.
test("poker den: signing out lets go of the seat and the bananas, and the next visit starts at BUY_IN", async () => {
  const h = host(), d = await h.den();
  const a = await h.connect(d, 1), b = await h.connect(d, 2);
  await h.say(d, a, { t: "sit", table: 8, seat: 0 });
  await h.say(d, b, { t: "sit", table: 8, seat: 1 });
  await h.wait(d, FIRST_DEAL_MS);
  assert.equal(lastTable(a, 8).phase, "preflop");
  await d.forget(1, "signed-out");
  assert.equal(lastOf(a, "kick").reason, "signed-out");
  assert.equal(h.store.get("w:1"), undefined, "the bananas are gone");
  for (let i = 0; i < 4; i++) await h.wait(d, 30000);
  assert.equal(d.tables[8].rules.snapshot().seats[0], null, "the seat is freed once the hand is over");
  assert.equal(h.store.get("w:1"), undefined, "the hand paid the signed-out seat nothing");
  const again = await h.connect(d, 1);
  assert.equal(lastOf(again, "welcome").wallet.bananas, R.BUY_IN);
});

// Rule: hands won are counted once per hand at the live tables, shown on the plates and kept in D1, a failed write
// retried rather than lost.
test("poker den: a hand's winner is counted once, shown on its plate and written to D1, retried after a failure", async () => {
  const won = new Map([[1, 5]]), written = [];
  let failNext = true;
  const env = { DB: {
    getPlayer: async (id) => ({ id }),
    getHandsWon: async (id) => won.get(id) || 0,
    addHandsWon: async (entries) => {
      if (failNext) { failNext = false; throw new Error("D1 unavailable"); }
      written.push(entries);
      for (const [id, n] of entries) won.set(id, (won.get(id) || 0) + n);
    },
  } };
  const h = host(), d = await h.den(env);
  const a = await h.connect(d, 1), b = await h.connect(d, 2);
  await h.say(d, a, { t: "sit", table: 6, seat: 0 });
  await h.say(d, b, { t: "sit", table: 6, seat: 1 });
  assert.deepEqual(lastTable(b, 6).won, { 1: 5, 2: 0 }, "each seat shows its hands won so far");
  await h.wait(d, FIRST_DEAL_MS);
  const s = lastTable(a, 6), folder = s.seats[s.turn].id, winner = folder === "1" ? "2" : "1";
  await h.say(d, folder === "1" ? a : b, { t: "act", a: "fold", v: s.version });
  const before = { 1: 5, 2: 0 };
  assert.equal(lastTable(a, 6).won[winner], before[winner] + 1, "the winner's plate counts the hand");
  assert.equal(lastTable(a, 6).won[folder], before[folder]);
  assert.equal(written.length, 0, "the first write failed");
  assert.deepEqual(h.store.get("stats"), { [winner]: 1 }, "and the win waits in the stored outbox");
  d.alarmAt = null;
  await d.alarm();
  assert.deepEqual(JSON.parse(JSON.stringify(written)), [[[Number(winner), 1]]], "the next flush sends it once");
  assert.deepEqual(h.store.get("stats"), {}, "and empties the outbox");
  assert.equal(won.get(Number(winner)), before[winner] + 1);
});

// Rule: the floor's first tables are practice on the page; the dealer seats nobody there.
test("poker den: a seat at a practice table is refused", async () => {
  const h = host(), d = await h.den();
  const a = await h.connect(d, 1);
  await h.say(d, a, { t: "sit", table: R.LIVE_FROM - 1, seat: 0 });
  assert.match(lastOf(a, "error").text, /practice tables/);
  assert.equal(d.seatOf(1), null);
  await h.say(d, a, { t: "sit", table: R.LIVE_FROM, seat: 0 });
  assert.equal(d.seatOf(1).table, R.LIVE_FROM);
});

test("poker den: nobody can act, deal or stand for someone else, and one account holds one seat", async () => {
  const h = host(), d = await h.den();
  const a = await h.connect(d, 1), b = await h.connect(d, 2), c = await h.connect(d, 3);
  await h.say(d, a, { t: "sit", table: 6, seat: 0 });
  await h.say(d, a, { t: "sit", table: 7, seat: 0 });
  assert.match(lastOf(a, "error").text, /already have a seat/);
  await h.say(d, b, { t: "sit", table: 6, seat: 0 });
  assert.match(lastOf(b, "error").text, /No free seat/);
  await h.say(d, c, { t: "deal" });
  assert.match(lastOf(c, "error").text, /Take a seat/);
  await h.say(d, c, { t: "act", a: "fold", v: 99 });
  assert.match(lastOf(c, "error").text, /Take a seat/);
});

// Regressions from review: each reproduced a wrong result before its fix.
test("poker den: a player who stands mid-hand folds, so a leaver cannot check its way to the pot", async () => {
  const h = host(), d = await h.den();
  const a = await h.connect(d, 1), b = await h.connect(d, 2);
  await h.say(d, a, { t: "sit", table: 6, seat: 0 });
  await h.say(d, b, { t: "sit", table: 6, seat: 1 });
  await h.wait(d, FIRST_DEAL_MS);
  const s = d.tables[6].rules.snapshot(), small = s.seats[s.turn].id, big = small === "1" ? "2" : "1";
  const smallWs = small === "1" ? a : b, bigWs = small === "1" ? b : a;
  await h.say(d, smallWs, { t: "act", a: "call", v: lastTable(smallWs, 6).version });
  await h.say(d, bigWs, { t: "stand" });
  assert.equal(d.tables[6].rules.snapshot().phase, "showdown", "the leaver folded at once, with a free check open");
  assert.equal(h.store.get(`w:${big}`).b, R.BUY_IN - R.BIG, "and left with its stack less its blind");
  assert.equal(d.tables[6].rules.snapshot().seats.find((p) => p?.id === big), undefined);
});

test("poker den: Deal me in takes back a leave asked for mid-hand", async () => {
  const h = host(), d = await h.den();
  const socks = [await h.connect(d, 1), await h.connect(d, 2), await h.connect(d, 3)];
  for (const [n, ws] of socks.entries()) await h.say(d, ws, { t: "sit", table: 8, seat: n });
  await h.wait(d, FIRST_DEAL_MS);
  const s = d.tables[8].rules.snapshot(), waiting = s.seats.find((p, i) => p && i !== s.turn).id, ws = socks[Number(waiting) - 1];
  await h.say(d, ws, { t: "stand" });
  await h.say(d, ws, { t: "out", on: false });
  while (d.tables[8].rules.playing) await h.wait(d, TURN_MS);
  assert.ok(d.tables[8].rules.snapshot().seats.some((p) => p?.id === waiting), "still seated after the hand");
});

test("poker den: a page that loses its network without a close is swept as stale and stood up in time", async () => {
  const h = host(), d = await h.den();
  const a = await h.connect(d, 1);
  await h.say(d, a, { t: "sit", table: 6, seat: 0 });
  a.silent = true;
  for (let i = 0; i < 6; i++) await h.wait(d, 30000);
  assert.equal(lastOf(a, "kick")?.reason, "stale");
  assert.ok(!d.players.has(1) && d.tables[6].rules.snapshot().seats[0].out, "gone and sat out");
  for (let i = 0; i < 6; i++) await h.wait(d, 30000);
  assert.equal(d.tables[6].rules.snapshot().seats[0], null, "stood up after AWAY_STAND_MS");
  assert.equal(h.store.get("w:1").b, R.BUY_IN);
});

// Regression (#224 review): a den that hibernates between alarms forgot its sweep was due and took every woken
// socket for fresh, so a silent page and a banned account kept their seats for good.
test("poker den: the sweep still drops a silent page and a banned account when the den sleeps between alarms", async () => {
  const rows = new Map([[1, { id: 1 }], [2, { id: 2 }], [3, { id: 3 }]]);
  const env = { DB: { getPlayer: async (id) => rows.get(id) || null } };
  const h = host();
  let d = await h.den(env);
  const a = await h.connect(d, 1), b = await h.connect(d, 2), c = await h.connect(d, 3);
  await h.say(d, a, { t: "sit", table: 6, seat: 0 });
  await h.say(d, b, { t: "sit", table: 7, seat: 0 });
  a.silent = true;
  rows.set(2, { id: 2, banned_at: 1 });
  for (let i = 0; i < 6; i++) {
    d = await h.den(env);
    await h.wait(d, 30000);
  }
  assert.equal(lastOf(a, "kick")?.reason, "stale", "the silent page is swept");
  assert.equal(lastOf(b, "kick")?.reason, "revoked", "the banned account is swept");
  assert.ok(!d.players.has(1) && !d.players.has(2), "both are gone from the den");
  assert.equal(lastOf(c, "kick"), undefined, "a page that keeps pinging stays");
  assert.ok(d.players.has(3));
});

test("poker den: a hand's end tells each seated player whether the free refill is open", async () => {
  const h = host(), d = await h.den();
  const a = await h.connect(d, 1), b = await h.connect(d, 2);
  await h.say(d, a, { t: "sit", table: 9, seat: 0 });
  await h.say(d, b, { t: "sit", table: 9, seat: 1 });
  await h.wait(d, FIRST_DEAL_MS);
  // All in and called: one stack goes to zero, unless the board splits the pot.
  const s = d.tables[9].rules.snapshot(), first = s.seats[s.turn].id === "1" ? a : b, second = first === a ? b : a;
  await h.say(d, first, { t: "act", a: "raise", n: lastTable(first, 9).legal.max, v: lastTable(first, 9).version });
  await h.say(d, second, { t: "act", a: "call", v: lastTable(second, 9).version });
  const seats = d.tables[9].rules.snapshot().seats;
  for (const [ws, seat] of [[a, seats[0]], [b, seats[1]]]) {
    assert.equal(lastOf(ws, "wallet").topUp, seat.stack === 0, seat.stack === 0 ? "busted: the refill is open" : "chips left: it stays shut");
  }
});

test("poker den: a request that changes nothing writes and sends nothing", async () => {
  const h = host(), d = await h.den();
  const a = await h.connect(d, 1), watcher = await h.connect(d, 9);
  await h.say(d, a, { t: "sit", table: 7, seat: 4 });
  await h.say(d, a, { t: "out", on: true });
  const writes = h.writes.count, sent = watcher.sent.length;
  for (let i = 0; i < 3; i++) await h.say(d, a, { t: "out", on: true });
  assert.equal(h.writes.count, writes);
  assert.equal(watcher.sent.length, sent);
});

test("poker den: a full den still lets a seated player back into their seat", async () => {
  const h = host(), d = await h.den();
  const a = await h.connect(d, 1);
  await h.say(d, a, { t: "sit", table: 8, seat: 2 });
  for (let id = 100; id < 100 + poker.MAX_SOCKETS - 1; id++) await h.connect(d, id);
  h.hangUp(d, a);
  await h.connect(d, 99);
  assert.equal(d.players.size, poker.MAX_SOCKETS);
  const back = await h.connect(d, 1);
  assert.equal(back.sent[0].t, "welcome");
  assert.ok(!d.tables[8].rules.snapshot().seats[2].out, "dealt in again");
  const extra = await h.connect(d, 500);
  assert.equal(extra.sent[0].reason, "full", "a newcomer without a seat still waits");
});

test("poker den: a deleted account's bananas stay deleted when the den wakes before its hand ends", async () => {
  const h = host(), d = await h.den();
  const socks = [await h.connect(d, 1), await h.connect(d, 2), await h.connect(d, 3)];
  for (const [n, ws] of socks.entries()) await h.say(d, ws, { t: "sit", table: 7, seat: n });
  await h.wait(d, FIRST_DEAL_MS);
  const s = d.tables[7].rules.snapshot(), gone = s.seats.find((p, i) => p && i !== s.turn).id;
  await d.forget(Number(gone));
  assert.equal(h.store.get(`w:${gone}`), undefined);
  const woken = await h.den();
  while (woken.tables[7].rules.playing) await h.wait(woken, TURN_MS);
  assert.equal(woken.tables[7].rules.snapshot().seats.find((p) => p?.id === gone), undefined, "its seat went with the hand");
  assert.equal(h.store.get(`w:${gone}`), undefined, "and nothing wrote its bananas back");
});
