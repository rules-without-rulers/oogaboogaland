// The Ember Den's dealer: one Durable Object, named `ember-den`, deals all ten live tables. The page's side is
// src/js/poker-net.js, shown by src/js/scene-poker.js. The Worker is its only door (`/poker`) and names the player
// from the session in x-player-* headers, as it does for the island room; nothing a page sends changes who it is.
// Cards: every table is the rules engine's dealer table (src/js/poker-rules.js, loaded here too). Its deck and every
// hole card live in this object alone, in memory and in its storage. A page gets `snapshot(viewer)`, with the
// viewer's own two cards where they sit and nulls for everyone else's until a showdown shows the hands still in;
// folded cards are never sent. Spectators get the public view. The viewer is the session's, never a message's.
// Time: a turn lasts TURN_MS (AWAY_TURN_MS while the player's page is gone), and when it runs out the dealer checks
// or folds for them (a player leaving always folds); MISSED_OUT misses in a row sit them out. While anyone is here a
// sweep every SWEEP_MS lets go of sockets silent past STALE_MS and of accounts banned or deleted, as the room's does. A table with two players ready deals by itself,
// FIRST_DEAL_MS after it fills and DEAL_GAP_MS after a hand. All of it rides one alarm set for the next deadline,
// so the den sleeps whenever no table is waiting on anything; nothing here runs on a timer.
// Bananas: each account keeps its own until it signs out (`w:<id>`: `b` off the tables). Sitting takes all of them
// to the table and standing brings the stack back; with none left on or off the table a free refill to BUY_IN is open. Free play money: nothing buys, sells, transfers or redeems them, and they never meet donations.
// Storage: `t<i>` is table i (its dump and the den's clocks for it), written in one put with any wallet it moved.
// `forgotten` lists deleted accounts whose chips were in a running hand, so that hand pays them nothing.

import { DurableObject } from "cloudflare:workers";
import "../../src/js/lifehash.js";
import "../../src/js/poker-rules.js";
import { STALE_MS, SWEEP_MS, playerFromHeaders, takeToken } from "./protocol.js";
import { addHandsWon, getHandsWon, getPlayer } from "./db.js";
import {
  ACT_BURST, ACT_HZ, AWAY_STAND_MS, AWAY_TURN_MS, CLOSE_KICK, CLOSE_PROTOCOL, DEAL_GAP_MS, FIRST_DEAL_MS, MAX_SOCKETS, MISSED_OUT, TABLES, TURN_MS,
  parsePokerMessage, topUpOpen,
} from "./poker-protocol.js";

const R = globalThis.BL.pokerRules;
// How stale a socket's stored `seen` may grow before a message writes it again: a sixth of STALE_MS.
const SEEN_SAVE_MS = STALE_MS / 6;
const tableKey = (i) => `t${i}`;
const walletKey = (id) => `w:${id}`;
// `turnVersion`: the table's version when the current turn began; an action seen before it is stale.
// `ended`: the last hand whose leavers were stood up. `gone`: seat → when its page went. `away`: seats sat out by that.
// `fair`: the next hand's commitment, `{ seed, commit, seeds }` (the dealer's secret seed, its hash shown to every
// page, and each seated page's seed by seat id). `reveal`: the last hand dealt, `{ hand, seed, commit, seeds, order }`,
// shown once that hand is over so any page can recompute its deck (poker-rules.js `checkReveal`).
const freshMeta = () => ({ deadline: 0, dealAt: 0, turnVersion: 0, ended: 0, misses: {}, leaving: [], gone: {}, away: [], fair: null, reveal: null, won: {} });
const randomHex = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("");
const committed = () => {
  const seed = randomHex();
  return { seed, commit: R.commitFor(seed), seeds: {} };
};
const ready = (rules) => rules.snapshot().seats.filter((s) => s && s.stack > 0 && !s.out).length;

export class PokerDen extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.players = new Map();
    this.wallets = new Map();
    this.forgotten = new Set();
    this.alarmAt = null;
    // Wins not yet in D1, by account id: stored, so a failed write goes with the next and a sleep or deploy loses none.
    this.stats = {};
    this.flushing = null;
    // The next sweep for silent sockets and revoked accounts, due while anyone is here (0 for none). Stored, so a den
    // woken by its alarm still knows the sweep fell due.
    this.sweepAt = 0;
    this.tables = Array.from({ length: TABLES }, () => ({ rules: R.createDealer(), meta: freshMeta() }));
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
    ctx.blockConcurrencyWhile(async () => {
      const rows = await ctx.storage.get(this.tables.map((_, i) => tableKey(i)));
      for (let i = 0; i < TABLES; i++) {
        const row = rows.get(tableKey(i));
        if (row) this.tables[i] = { rules: R.createDealer(row.rules), meta: { ...freshMeta(), ...row.meta } };
      }
      this.forgotten = new Set((await ctx.storage.get("forgotten")) || []);
      this.sweepAt = (await ctx.storage.get("sweepAt")) || 0;
      this.stats = (await ctx.storage.get("stats")) || {};
      // Everyone seated keeps their wallet in memory, so a hand ending pays it without waiting on storage; a deleted
      // account still seated until its hand ends has none.
      const seated = this.tables.flatMap((t) => t.rules.snapshot().seats.filter(Boolean).map((s) => Number(s.id))).filter((id) => !this.forgotten.has(id));
      if (seated.length) {
        const found = await ctx.storage.get(seated.map(walletKey));
        for (const id of seated) this.wallets.set(id, found.get(walletKey(id)) || { b: 0 });
      }
    });
    // A woken den rebuilds who is here from the attachments its sockets carry.
    for (const ws of ctx.getWebSockets()) {
      const a = ws.deserializeAttachment();
      if (a) this.players.set(a.id, this.record(ws, a));
    }
  }

  // `seen` in the attachment is when the page last spoke, so a woken den does not take a silent page for a fresh one.
  record(ws, a) {
    const seenAt = a.seen || Date.now();
    return { ws, id: a.id, login: a.login, display: a.display, bucket: { tokens: ACT_BURST, at: Date.now() }, seenAt, seenSaved: seenAt };
  }

  attach(p) {
    p.ws.serializeAttachment({ id: p.id, login: p.login, display: p.display, seen: p.seenAt });
    p.seenSaved = p.seenAt;
  }

  send(ws, msg) {
    try {
      ws.send(typeof msg === "string" ? msg : JSON.stringify(msg));
    } catch {
      // A socket closing under us is dropped by its close event.
    }
  }

  byWs(ws) {
    const a = ws.deserializeAttachment();
    const p = a && this.players.get(a.id);
    return p && p.ws === ws ? p : null;
  }

  // Table i as `viewer` sees it (null for the public view), with the den's clocks.
  view(i, viewer = null) {
    const t = this.tables[i], s = t.rules.snapshot(viewer), f = t.meta.fair, r = t.meta.reveal;
    s.deadline = t.meta.deadline;
    s.dealAt = t.meta.dealAt;
    // The commitment for the hand being played, or for the next one; never a seed before its hand is over.
    s.commit = t.rules.playing ? r && r.commit : f ? f.commit : null;
    s.seeded = f && !t.rules.playing ? Object.keys(f.seeds) : [];
    s.reveal = !t.rules.playing && r && r.hand === s.hand ? r : null;
    s.won = t.meta.won;
    return s;
  }

  // Where an account sits: { table, seat, p } (p its public seat), or null.
  seatOf(id) {
    const key = String(id);
    for (let i = 0; i < TABLES; i++) {
      const seats = this.tables[i].rules.snapshot().seats, seat = seats.findIndex((s) => s && s.id === key);
      if (seat >= 0) return { table: i, seat, p: seats[seat] };
    }
    return null;
  }

  // Table i to every page: its own view to each player seated there, the one public view to everyone else.
  publish(i) {
    const now = Date.now(), seated = new Set();
    for (const s of this.tables[i].rules.snapshot().seats) if (s) seated.add(s.id);
    let open = null;
    for (const p of this.players.values()) {
      const key = String(p.id);
      if (seated.has(key)) this.send(p.ws, { t: "table", i, s: this.view(i, key), now });
      else this.send(p.ws, open || (open = JSON.stringify({ t: "table", i, s: this.view(i), now })));
    }
  }

  // An account's bananas, from memory or storage; a newcomer starts with BUY_IN.
  async wallet(id) {
    if (this.wallets.has(id)) return this.wallets.get(id);
    let w = (await this.ctx.storage.get(walletKey(id))) || null;
    if (this.wallets.has(id)) return this.wallets.get(id);
    if (!w) {
      w = { b: R.BUY_IN };
      this.ctx.storage.put(walletKey(id), w);
    }
    this.wallets.set(id, w);
    return w;
  }

  walletView(id, now = Date.now()) {
    const w = this.wallets.get(id), at = this.seatOf(id);
    return { bananas: w ? w.b : 0, topUp: !!w && topUpOpen(w, at ? at.p.stack : 0) };
  }

  sendWallet(p, now = Date.now()) {
    this.send(p.ws, { t: "wallet", ...this.walletView(p.id, now) });
  }

  // Table i and the wallets it moved, in one write; then everyone's view of it and the next wake.
  commit(i, ids = []) {
    const t = this.tables[i], put = { [tableKey(i)]: { rules: t.rules.dump(), meta: t.meta } };
    for (const id of ids) if (this.wallets.has(id) && !this.forgotten.has(id)) put[walletKey(id)] = this.wallets.get(id);
    this.ctx.storage.put(put);
    this.publish(i);
    this.reschedule();
  }

  // Whatever falls due at table i, then the write; `ids` are wallets the caller already moved.
  settle(i, now, ids = []) {
    const moved = this.advance(i, now) || [];
    this.commit(i, ids.concat(moved));
    for (const id of moved) {
      const p = this.players.get(id);
      if (p) this.sendWallet(p, now);
    }
  }

  // The clock for whoever acts now: theirs, a gone player's short one, or none at all for one leaving.
  armTurn(i, now) {
    const t = this.tables[i], s = t.rules.snapshot();
    if (!t.rules.playing || s.turn < 0) {
      t.meta.deadline = 0;
      return;
    }
    const id = s.seats[s.turn].id;
    t.meta.turnVersion = s.version;
    t.meta.deadline = t.meta.leaving.includes(id) ? now : now + (this.players.has(Number(id)) ? TURN_MS : AWAY_TURN_MS);
  }

  // The automatic deal: due `gap` from now once two players are ready, cleared when they are not.
  armDeal(i, now, gap = FIRST_DEAL_MS) {
    const t = this.tables[i];
    if (t.rules.playing || ready(t.rules) < 2) t.meta.dealAt = 0;
    else if (!t.meta.dealAt) {
      t.meta.dealAt = now + gap;
      // Committed as the deal is booked, so the seated pages see the commitment and add their seeds before it.
      if (!t.meta.fair) t.meta.fair = committed();
    }
  }

  // The hand from the committed seed and every seed the seated pages sent in time; what deals it is kept to reveal.
  dealHand(i) {
    const t = this.tables[i];
    if (!t.meta.fair) t.meta.fair = committed();
    const f = t.meta.fair, hand = t.rules.snapshot().hand + 1, seeds = Object.values(f.seeds);
    t.rules.start(R.deckFrom(f.seed, seeds, hand));
    t.meta.reveal = { hand, seed: f.seed, commit: f.commit, seeds, order: R.dealOrder(t.rules.snapshot()) };
    t.meta.fair = null;
  }

  // A seated page's seed for the next deal, taken once per page while the deal is still to come.
  seed(p, i, value) {
    const at = this.seatOf(p.id), t = this.tables[i], key = String(p.id);
    if (!at || at.table !== i || t.rules.playing || !t.meta.fair || key in t.meta.fair.seeds) return;
    t.meta.fair.seeds[key] = value;
    this.commit(i);
  }

  // A seat's stack back into its owner's bananas, and the seat freed; only for a seat out of the running hand.
  cashOut(i, key) {
    const t = this.tables[i], seat = t.rules.snapshot().seats.find((s) => s && s.id === key);
    if (!seat) return;
    t.rules.leave(key);
    const id = Number(key);
    if (this.forgotten.has(id)) {
      this.forgotten.delete(id);
      this.wallets.delete(id);
      this.ctx.storage.put("forgotten", [...this.forgotten]);
    } else {
      const w = this.wallets.get(id) || { b: 0 };
      w.b += seat.stack;
      this.wallets.set(id, w);
    }
    delete t.meta.misses[key];
    delete t.meta.won[key];
    delete t.meta.gone[key];
    t.meta.leaving = t.meta.leaving.filter((k) => k !== key);
    t.meta.away = t.meta.away.filter((k) => k !== key);
  }

  // Everything due at table i by `now`: turns run out, the end of a hand (its leavers and the long gone stood up),
  // the next deal. Returns the accounts whose bananas moved, or null when nothing changed.
  advance(i, now) {
    const t = this.tables[i], moved = [];
    let changed = false;
    for (let guard = 0; guard < 400; guard++) {
      if (t.rules.playing) {
        if (!t.meta.deadline || now < t.meta.deadline) break;
        // A player leaving folds; anyone else whose clock ran out checks when that is free.
        const s = t.rules.snapshot(), seat = s.seats[s.turn], key = seat.id, l = t.rules.snapshot(key).legal;
        t.rules.act(key, l.check && !t.meta.leaving.includes(key) ? "check" : "fold");
        changed = true;
        const p = this.players.get(Number(key));
        if (p && !t.meta.leaving.includes(key)) {
          t.meta.misses[key] = (t.meta.misses[key] || 0) + 1;
          if (t.meta.misses[key] >= MISSED_OUT && !seat.out) {
            t.rules.setOut(key, true);
            this.send(p.ws, { t: "notice", text: "Your turn ran out twice, so the dealer sat you out. Press Deal me in when you're back." });
          }
        }
        this.armTurn(i, now);
        continue;
      }
      const hand = t.rules.snapshot().hand;
      if (hand && t.meta.ended !== hand) {
        t.meta.ended = hand;
        changed = true;
        this.tally(i);
        for (const key of [...t.meta.leaving]) {
          this.cashOut(i, key);
          moved.push(Number(key));
        }
        // Whoever stays hears whether the free refill is now open for them, a bust stack's or a winner's.
        for (const seat of t.rules.snapshot().seats) {
          const p = seat && this.players.get(Number(seat.id));
          if (p) this.sendWallet(p, now);
        }
        this.armDeal(i, now, DEAL_GAP_MS);
      }
      // A seat with no page here and no mark of going (its socket dropped in a restart or a deploy, whose close the
      // den never heard) is gone from now on, so no hand is dealt to it and it stands up in time.
      for (const p of t.rules.snapshot().seats) {
        if (!p || this.players.has(Number(p.id)) || p.id in t.meta.gone) continue;
        t.meta.gone[p.id] = now;
        if (!p.out) {
          t.rules.setOut(p.id, true);
          t.meta.away.push(p.id);
        }
        changed = true;
      }
      for (const [key, at] of Object.entries(t.meta.gone)) {
        if (now - at < AWAY_STAND_MS) continue;
        this.cashOut(i, key);
        moved.push(Number(key));
        changed = true;
      }
      if (t.meta.dealAt && now >= t.meta.dealAt) {
        t.meta.dealAt = 0;
        changed = true;
        if (ready(t.rules) >= 2) {
          this.dealHand(i);
          this.armTurn(i, now);
          continue;
        }
      }
      const dealAt = t.meta.dealAt;
      this.armDeal(i, now);
      if (t.meta.dealAt !== dealAt) changed = true;
      break;
    }
    return changed ? moved : null;
  }

  // One alarm for the den: the earliest turn deadline, automatic deal or gone player's stand-up across every table,
  // and while anyone is here the sweep, at most SWEEP_MS away.
  reschedule() {
    if (this.players.size && !this.sweepAt) {
      this.sweepAt = Date.now() + SWEEP_MS;
      this.ctx.storage.put("sweepAt", this.sweepAt);
    }
    let next = this.sweepAt || Infinity;
    for (const t of this.tables) {
      if (t.rules.playing) {
        if (t.meta.deadline) next = Math.min(next, t.meta.deadline);
        continue;
      }
      if (t.meta.dealAt) next = Math.min(next, t.meta.dealAt);
      for (const at of Object.values(t.meta.gone)) next = Math.min(next, at + AWAY_STAND_MS);
    }
    if (next === this.alarmAt) return;
    this.alarmAt = next;
    if (next === Infinity) this.ctx.storage.deleteAlarm();
    else this.ctx.storage.setAlarm(next);
  }

  // Wallets stay in memory only while their owner is here or seated.
  tidy() {
    for (const id of [...this.wallets.keys()]) if (!this.players.has(id) && !this.seatOf(id)) this.wallets.delete(id);
  }

  async fetch(request) {
    if (request.headers.get("upgrade") !== "websocket") return new Response("Expected WebSocket", { status: 426 });
    const who = playerFromHeaders(request.headers);
    if (!who) return new Response("Forbidden", { status: 403 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server, [String(who.id)]);
    const older = this.players.get(who.id);
    if (older) this.evict(older, "replaced");
    // A full den still lets a seated player back to their own seat.
    if (this.players.size >= MAX_SOCKETS && !this.seatOf(who.id)) {
      this.send(server, { t: "kick", reason: "full" });
      server.close(CLOSE_KICK, "full");
      return new Response(null, { status: 101, webSocket: client });
    }
    const p = this.record(server, who);
    this.attach(p);
    this.players.set(who.id, p);
    const [, won] = await Promise.all([this.wallet(who.id), this.handsWon(who.id)]);
    p.won = won;
    if (this.players.get(who.id) === p) this.arrive(p, Date.now());
    this.reschedule();
    return new Response(null, { status: 101, webSocket: client });
  }

  // A page (back) at the den: dealt in again if only its absence sat it out, then shown every table.
  arrive(p, now) {
    const at = this.seatOf(p.id), key = String(p.id);
    let back = false;
    if (at) {
      const t = this.tables[at.table];
      back = key in t.meta.gone || t.meta.away.includes(key);
      delete t.meta.gone[key];
      if (t.meta.away.includes(key)) {
        t.meta.away = t.meta.away.filter((k) => k !== key);
        t.rules.setOut(key, false);
      }
      if (back) this.armDeal(at.table, now);
    }
    this.send(p.ws, { t: "welcome", you: { id: p.id, login: p.login, display: p.display }, now, wallet: this.walletView(p.id, now),
      tables: this.tables.map((_, i) => this.view(i, at && at.table === i ? key : null)) });
    if (back) this.settle(at.table, now);
  }

  async webSocketMessage(ws, message) {
    const p = this.byWs(ws);
    if (!p) return;
    const msg = parsePokerMessage(typeof message === "string" ? message : "");
    if (msg === false) {
      this.left(p);
      ws.close(CLOSE_PROTOCOL, "unreadable message");
      return;
    }
    const now = Date.now();
    p.seenAt = now;
    if (now - p.seenSaved >= SEEN_SAVE_MS) this.attach(p);
    if (!msg) return;
    if (!takeToken(p.bucket, ACT_HZ, now, ACT_BURST)) {
      this.send(ws, { t: "error", text: "One move at a time, please." });
      return;
    }
    try {
      if (msg.t === "sit") await this.sit(p, msg.table, msg.seat, now);
      else if (msg.t === "stand") this.stand(p, now);
      else if (msg.t === "act") this.act(p, msg, now);
      else if (msg.t === "deal") this.deal(p, now);
      else if (msg.t === "seed") this.seed(p, msg.table, msg.s);
      else if (msg.t === "out") this.out(p, msg.on, now);
      else if (msg.t === "topup") await this.topUp(p, now);
    } catch (error) {
      this.send(ws, { t: "error", text: error.message });
    }
  }

  // All of the account's bananas to the seat (refilled to BUY_IN first when there are none).
  async sit(p, i, seat, now) {
    if (this.seatOf(p.id)) throw new Error("You already have a seat. Leave it before taking another.");
    const w = await this.wallet(p.id);
    if (this.players.get(p.id) !== p || this.seatOf(p.id)) return;
    const empty = w.b <= 0;
    const key = String(p.id), t = this.tables[i];
    t.rules.join(key, p.display, false, seat, empty ? R.BUY_IN : w.b);
    w.b = 0;
    t.meta.misses[key] = 0;
    if (Number.isInteger(p.won)) t.meta.won[key] = p.won;
    this.armDeal(i, now);
    this.settle(i, now, [p.id]);
    this.sendWallet(p, now);
  }

  // Out of the running hand the seat goes at once; in it, the player is folded when their turn comes and stood
  // up when the hand ends.
  stand(p, now) {
    const at = this.seatOf(p.id);
    if (!at) return;
    const t = this.tables[at.table], key = String(p.id);
    if (t.rules.playing && at.p.inHand) {
      if (t.meta.leaving.includes(key)) return;
      t.meta.leaving.push(key);
      t.rules.setOut(key, true);
      if (t.rules.snapshot().turn === at.seat) t.meta.deadline = now;
      this.send(p.ws, { t: "notice", text: "You'll leave the table when this hand ends." });
      this.settle(at.table, now);
    } else {
      this.cashOut(at.table, key);
      this.settle(at.table, now, [p.id]);
    }
    this.sendWallet(p, now);
  }

  act(p, msg, now) {
    const at = this.seatOf(p.id);
    if (!at) throw new Error("Take a seat to play.");
    const t = this.tables[at.table], key = String(p.id);
    if (msg.v < t.meta.turnVersion) throw new Error("The table moved on. Please choose your action again.");
    t.rules.act(key, msg.a, msg.n);
    t.meta.misses[key] = 0;
    this.armTurn(at.table, now);
    this.settle(at.table, now);
  }

  deal(p, now) {
    const at = this.seatOf(p.id);
    if (!at) throw new Error("Take a seat to deal.");
    const t = this.tables[at.table];
    if (t.rules.playing) throw new Error("A hand is already running.");
    if (ready(t.rules) < 2) throw new Error("One more player is needed.");
    t.meta.dealAt = now;
    this.settle(at.table, now);
  }

  // Sit out of the next deals, or be dealt in again; dealt in again also takes back a leave asked for mid-hand (a
  // deleted account's leave stands). A request that changes nothing writes nothing.
  out(p, on, now) {
    const at = this.seatOf(p.id);
    if (!at) throw new Error("Take a seat first.");
    const t = this.tables[at.table], key = String(p.id);
    const stay = !on && t.meta.leaving.includes(key) && !this.forgotten.has(p.id);
    if (!!at.p.out === on && !stay) return;
    t.rules.setOut(key, on);
    if (!on) {
      t.meta.misses[key] = 0;
      t.meta.away = t.meta.away.filter((k) => k !== key);
      if (stay) t.meta.leaving = t.meta.leaving.filter((k) => k !== key);
    }
    this.armDeal(at.table, now);
    this.settle(at.table, now);
  }

  // With no bananas left on or off the table, a free refill to BUY_IN, as often as it runs out.
  async topUp(p, now) {
    const w = await this.wallet(p.id);
    if (this.players.get(p.id) !== p) return;
    const at = this.seatOf(p.id);
    if (!topUpOpen(w, at ? at.p.stack : 0)) throw new Error("You still have bananas. The free refill opens when they run out.");
    if (at) {
      this.tables[at.table].rules.refill(String(p.id));
      this.armDeal(at.table, now);
      this.settle(at.table, now, [p.id]);
    } else {
      w.b = R.BUY_IN;
      this.ctx.storage.put(walletKey(p.id), w);
    }
    this.sendWallet(p, now);
  }

  // The prototype's note stands: on this compatibility date close handlers must not call ws.close().
  webSocketClose(ws) {
    const p = this.byWs(ws);
    if (p) this.left(p);
  }

  webSocketError(ws) {
    const p = this.byWs(ws);
    if (p) this.left(p);
  }

  // A page gone: its seat waits, sat out of new deals, its turns on the short clock, stood up after AWAY_STAND_MS.
  left(p) {
    if (this.players.get(p.id) !== p) return;
    this.players.delete(p.id);
    const at = this.seatOf(p.id), now = Date.now();
    if (!at) {
      this.wallets.delete(p.id);
      return;
    }
    const t = this.tables[at.table], key = String(p.id);
    t.meta.gone[key] = now;
    if (!at.p.out) {
      t.rules.setOut(key, true);
      t.meta.away.push(key);
    }
    if (t.rules.playing && t.rules.snapshot().turn === at.seat) t.meta.deadline = Math.min(t.meta.deadline || Infinity, now + AWAY_TURN_MS);
    this.armDeal(at.table, now);
    this.settle(at.table, now);
  }

  // An explicit kick before the close: a server-initiated close alone can leave the client in CLOSING.
  evict(p, reason) {
    this.players.delete(p.id);
    this.send(p.ws, { t: "kick", reason });
    try {
      p.ws.close(CLOSE_KICK, reason);
    } catch {
      // Already closed.
    }
  }

  // As the island room sweeps: a socket silent past STALE_MS (auto-answered pings included) is gone, and so is an
  // account the operator banned or deleted in D1. A failed D1 read is retried at the next sweep, never read as a ban.
  async sweep(now) {
    for (const p of [...this.players.values()]) {
      if (this.env.DB) {
        let row;
        try { row = await getPlayer(this.env.DB, p.id); } catch { /* the next sweep tries again */ }
        if (this.players.get(p.id) !== p) continue;
        if (row !== undefined && (!row || row.banned_at)) { this.drop(p, "revoked"); continue; }
      }
      const pinged = this.ctx.getWebSocketAutoResponseTimestamp(p.ws);
      if (now - Math.max(p.seenAt, pinged ? pinged.getTime() : 0) > STALE_MS) this.drop(p, "stale");
    }
  }

  // The den lets a page go: its seat as when a page closes, then the kick and the close.
  drop(p, reason) {
    this.left(p);
    this.send(p.ws, { t: "kick", reason });
    try {
      p.ws.close(CLOSE_KICK, reason);
    } catch {
      // Already closed.
    }
  }

  // Hands won so far by an account (null when D1 is out of reach, so its plate shows none rather than a wrong count).
  async handsWon(id) {
    if (!this.env.DB) return null;
    try { return await getHandsWon(this.env.DB, id); } catch { return null; }
  }

  // The hand just over at table i: every seat that took a pot other than its own uncalled bet back won it (each
  // winner of a split pot too). Counted here once per hand, before any leaver stands up, then sent to D1.
  tally(i) {
    const t = this.tables[i], s = t.rules.snapshot(), winners = new Set();
    if (s.result) for (const pot of s.result.pots) if (!pot.refund) for (const j of pot.winners) if (s.seats[j]) winners.add(s.seats[j].id);
    if (!winners.size) return;
    for (const key of winners) {
      const id = Number(key), p = this.players.get(id);
      if (this.forgotten.has(id)) continue;
      this.stats[id] = (this.stats[id] || 0) + 1;
      if (key in t.meta.won) t.meta.won[key]++;
      if (p && Number.isInteger(p.won)) p.won++;
    }
    this.ctx.storage.put("stats", this.stats);
    this.flushStats();
  }

  // The outbox to D1 in one batch; what was sent comes off it only once D1 took it.
  async flushStats() {
    if (!this.env.DB || this.flushing) return;
    const entries = Object.entries(this.stats).map(([id, n]) => [Number(id), n]);
    if (!entries.length) return;
    this.flushing = addHandsWon(this.env.DB, entries).then(() => {
      for (const [id, n] of entries) {
        const left = (this.stats[id] || 0) - n;
        if (left > 0) this.stats[id] = left;
        else delete this.stats[id];
      }
      this.ctx.storage.put("stats", this.stats);
    }, () => {
      // Kept for the next hand's flush or the next alarm.
    }).finally(() => { this.flushing = null; });
    await this.flushing;
  }

  async alarm() {
    const now = Date.now();
    this.alarmAt = null;
    if (this.sweepAt && now >= this.sweepAt) {
      this.sweepAt = 0;
      this.ctx.storage.put("sweepAt", 0);
      await this.sweep(now);
    }
    for (let i = 0; i < TABLES; i++) {
      const moved = this.advance(i, now);
      if (!moved) continue;
      this.commit(i, moved);
      for (const id of moved) {
        const p = this.players.get(id);
        if (p) this.sendWallet(p, now);
      }
    }
    this.reschedule();
    this.tidy();
    await this.flushStats();
  }

  // The account was deleted (DELETE /api/me, reason `revoked`) or signed out (/auth/logout, `signed-out`): its page
  // is closed, its bananas go, and its seat goes now, or when the running hand ends if its chips are in it (that hand
  // then pays it nothing). Its hands won stay in D1 on sign-out; deleting the account removes them there.
  async forget(id, reason = "revoked") {
    const p = this.players.get(id);
    if (p) this.evict(p, reason);
    this.wallets.delete(id);
    const at = this.seatOf(id), now = Date.now(), key = String(id);
    if (at) {
      const t = this.tables[at.table];
      if (t.rules.playing && at.p.inHand) {
        this.forgotten.add(id);
        this.ctx.storage.put("forgotten", [...this.forgotten]);
        if (!t.meta.leaving.includes(key)) t.meta.leaving.push(key);
        t.rules.setOut(key, true);
        if (t.rules.snapshot().turn === at.seat) t.meta.deadline = now;
      } else {
        this.forgotten.add(id);
        this.cashOut(at.table, key);
      }
      this.settle(at.table, now);
    }
    await this.ctx.storage.delete(walletKey(id));
  }
}
