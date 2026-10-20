// Play-chip Hold'em. Local practice uses a private shuffled deck. The sealed
// variant deals public encrypted-deck positions and never receives a whole deck.
// The dealer variant is the live tables' (worker/src/poker-den.js, which loads this file too): its seats can be
// taken mid-hand for the next deal, a seat can sit out, and `dump` hands its whole state, deck included, to the
// dealer's own storage so a hand outlives the dealer sleeping or a deploy. A dump never leaves the dealer.
(() => {
  "use strict";
  const scope = typeof window === "undefined" ? globalThis : window;
  const BL = scope.BL = scope.BL || {};
  const SEATS = 9, BUY_IN = 1000, SMALL = 5, BIG = 10;
  const LABELS = ["High card", "Pair", "Two pair", "Three of a kind", "Straight", "Flush", "Full house", "Four of a kind", "Straight flush"];
  const word = new Uint32Array(1);
  const randomInt = (bound) => {
    if (!Number.isInteger(bound) || bound < 1 || bound > 0x100000000) throw new RangeError("Invalid random bound");
    if (!globalThis.crypto?.getRandomValues) throw new Error("Secure random is unavailable. No hand was dealt.");
    const limit = 0x100000000 - 0x100000000 % bound;
    do { globalThis.crypto.getRandomValues(word); } while (word[0] >= limit);
    return word[0] % bound;
  };
  const shuffledDeck = () => {
    const deck = Array.from({ length: 52 }, (_, i) => i);
    for (let i = 51; i > 0; i--) { const j = randomInt(i + 1), c = deck[i]; deck[i] = deck[j]; deck[j] = c; }
    return deck;
  };
  // The live tables' commit-reveal deck. Before a deal the dealer publishes `commitFor(seed)` for a secret seed of its
  // own; each seated page adds a random seed; the deck is `deckFrom(seed, seeds, hand)`, a Fisher-Yates driven by
  // SHA-256 blocks, so the dealer cannot pick it once committed and no page can predict it. After the hand the seed is
  // revealed and `checkReveal` recomputes the deck and replays the deal against every card a view shows. The dealer
  // still knows the cards during the hand: this proves the deck was fixed before the deal, not that it stayed hidden.
  const HEX64 = /^[0-9a-f]{64}$/;
  const hex = bytes => Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
  const sha = text => BL.lifehash.sha256(new TextEncoder().encode(text));
  const commitFor = seed => hex(sha("ooga-den-commit|" + seed));
  const deckFrom = (seed, seeds, hand) => {
    if (!HEX64.test(seed) || !Array.isArray(seeds) || !seeds.every(s => HEX64.test(s)) || !Number.isSafeInteger(hand)) throw new Error("Invalid deck seeds");
    const key = hex(sha(`ooga-den-deck|${seed}|${hand}|${[...seeds].sort().join(",")}`));
    const deck = Array.from({ length: 52 }, (_, i) => i);
    let block = null, at = 32, counter = 0;
    const word = () => {
      if (at === 32) { block = sha(`${key}|${counter++}`); at = 0; }
      const w = (block[at] << 24 | block[at + 1] << 16 | block[at + 2] << 8 | block[at + 3]) >>> 0;
      at += 4;
      return w;
    };
    for (let i = 51; i > 0; i--) {
      const bound = i + 1, limit = 0x100000000 - 0x100000000 % bound;
      let w;
      do w = word(); while (w >= limit);
      const j = w % bound, c = deck[i]; deck[i] = deck[j]; deck[j] = c;
    }
    return deck;
  };
  // Who a view's hand was dealt to, in dealing order: from the dealer's left round to the dealer.
  const dealOrder = s => {
    const ids = [];
    for (let k = 1; k <= SEATS; k++) { const p = s.seats[(s.dealer + k) % SEATS]; if (p && p.cards.length === 2) ids.push(p.id); }
    return ids;
  };
  // Whether a revealed hand is honest for this view: the seed matches the commitment published before the deal, and
  // its deck holds every hole card and board card the view shows where `start` dealt them (two rounds, then the board).
  const checkReveal = (reveal, s) => {
    if (!reveal || !HEX64.test(reveal.seed) || commitFor(reveal.seed) !== reveal.commit || !Array.isArray(reveal.order)) return false;
    const deck = deckFrom(reveal.seed, reveal.seeds, reveal.hand), n = reveal.order.length;
    for (let round = 0; round < 2; round++) for (let k = 0; k < n; k++) {
      const p = s.seats.find(q => q && q.id === reveal.order[k]), c = p ? p.cards[round] : null;
      if (c !== null && c !== undefined && c !== deck[round * n + k]) return false;
    }
    for (let k = 0; k < s.board.length; k++) if (s.board[k] !== null && s.board[k] !== deck[2 * n + k]) return false;
    return true;
  };
  const rank = c => c % 13 + 2;
  const suit = c => Math.floor(c / 13);
  const cardName = c => "23456789TJQKA"[c % 13] + "♣♦♥♠"[suit(c)];
  const five = cards => {
    const rs = cards.map(rank).sort((a, b) => b - a), counts = new Map();
    for (const r of rs) counts.set(r, (counts.get(r) || 0) + 1);
    const groups = [...counts].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
    const flush = cards.every(c => suit(c) === suit(cards[0]));
    const unique = [...counts.keys()];
    const straight = unique.length === 5 && (rs[0] - rs[4] === 4 ? rs[0] : rs.join() === "14,5,4,3,2" ? 5 : 0);
    let category = 0, kickers = rs;
    if (straight && flush) { category = 8; kickers = [straight]; }
    else if (groups[0][1] === 4) { category = 7; kickers = groups.map(g => g[0]); }
    else if (groups[0][1] === 3 && groups[1][1] === 2) { category = 6; kickers = groups.map(g => g[0]); }
    else if (flush) category = 5;
    else if (straight) { category = 4; kickers = [straight]; }
    else if (groups[0][1] === 3) { category = 3; kickers = groups.map(g => g[0]); }
    else if (groups[0][1] === 2) { category = groups[1][1] === 2 ? 2 : 1; kickers = groups.map(g => g[0]); }
    let score = category;
    for (let i = 0; i < 5; i++) score = score * 15 + (kickers[i] || 0);
    return { score, category, name: LABELS[category] };
  };
  const evaluate = cards => {
    if (!Array.isArray(cards) || cards.length < 5 || cards.length > 7 || new Set(cards).size !== cards.length || cards.some(c => !Number.isInteger(c) || c < 0 || c > 51)) throw new Error("Expected five to seven distinct cards");
    let best = null;
    for (let a = 0; a < cards.length - 4; a++) for (let b = a + 1; b < cards.length - 3; b++)
      for (let c = b + 1; c < cards.length - 2; c++) for (let d = c + 1; d < cards.length - 1; d++)
        for (let e = d + 1; e < cards.length; e++) {
          const result = five([cards[a], cards[b], cards[c], cards[d], cards[e]]);
          if (!best || result.score > best.score) best = result;
        }
    return best;
  };
  // Pure settlement also permits independently specified fixtures. Folded chips stay in
  // their side pots; uncalled excess returns to its owner. Odd chips go left of the button.
  const settle = (seats, board, dealer) => {
    const awards = new Array(SEATS).fill(0), pots = [];
    const levels = [...new Set(seats.filter(Boolean).map(s => s.totalBet).filter(Boolean))].sort((a, b) => a - b);
    const scores = seats.map(s => s && s.inHand && !s.folded ? evaluate(s.cards.concat(board)).score : -1);
    let previous = 0;
    for (const level of levels) {
      const contributors = seats.map((s, i) => s && s.totalBet >= level ? i : -1).filter(i => i >= 0);
      const amount = (level - previous) * contributors.length;
      const eligible = contributors.filter(i => scores[i] >= 0);
      const best = Math.max(...eligible.map(i => scores[i]));
      const winners = contributors.length === 1 ? contributors : eligible.filter(i => scores[i] === best);
      if (!winners.length) throw new Error("Pot has no eligible player");
      winners.sort((a, b) => (a - dealer + SEATS - 1) % SEATS - (b - dealer + SEATS - 1) % SEATS);
      const share = Math.floor(amount / winners.length), remainder = amount % winners.length;
      winners.forEach((i, n) => { awards[i] += share + (n < remainder ? 1 : 0); });
      pots.push({ amount, winners: winners.slice(), refund: contributors.length === 1 });
      previous = level;
    }
    return { awards, pots };
  };
  const create = (sealed = false, initial = null, { late = false, saved = null } = {}) => {
    const seats = new Array(SEATS).fill(null);
    let deck = [], cursor = 0, board = [], phase = "waiting", turn = -1, dealer = -1;
    let currentBet = 0, lastRaise = BIG, hand = 0, version = 0, lastPot = 0, result = null, history = [], smallBlind = -1, bigBlind = -1;
    let known = new Map(), before = null, beforeDealer = -1;
    // The dealer's own dump, read back from its storage: trusted as written.
    if (saved) {
      const s = JSON.parse(JSON.stringify(saved));
      s.seats.forEach((p, i) => { seats[i] = p; });
      ({ deck, cursor, board, phase, turn, dealer, currentBet, lastRaise, hand, version, lastPot, result, history, smallBlind, bigBlind } = s);
    }
    if (initial) {
      if (!sealed || !Array.isArray(initial.seats) || initial.seats.length !== SEATS || !Number.isInteger(initial.dealer) || initial.dealer < -1 || initial.dealer >= SEATS || !Number.isSafeInteger(initial.hand) || initial.hand < 0 || !Number.isSafeInteger(initial.version) || initial.version < 0) throw new Error("Invalid table checkpoint");
      const ids = new Set();
      initial.seats.forEach((s, i) => {
        if (!s) return;
        if (typeof s.id !== "string" || !s.id || ids.has(s.id) || typeof s.name !== "string" || s.name.length > 32 || !Number.isSafeInteger(s.stack) || s.stack < 0 || s.stack > 1000000000) throw new Error("Invalid checkpoint seat");
        ids.add(s.id); seats[i] = { id: s.id, name: s.name, bot: false, stack: s.stack, cards: [], inHand: false, folded: false, roundBet: 0, totalBet: 0, acted: false, lastActedBet: 0, lastAction: "" };
      });
      dealer = initial.dealer; hand = initial.hand; version = initial.version;
    }
    const playing = () => phase !== "waiting" && phase !== "showdown";
    const log = text => { history.push(text); if (history.length > 12) history.shift(); version++; };
    const pot = () => seats.reduce((n, s) => n + (s ? s.totalBet : 0), 0);
    const next = (from, predicate) => {
      for (let n = 1; n <= SEATS; n++) { const i = (from + n + SEATS) % SEATS; if (seats[i] && predicate(seats[i])) return i; }
      return -1;
    };
    const contenders = () => seats.filter(s => s && s.inHand && !s.folded);
    const pay = (s, amount) => { const paid = Math.min(s.stack, amount); s.stack -= paid; s.roundBet += paid; s.totalBet += paid; };
    const finish = () => {
      if (sealed && contenders().length > 1 && (board.some(c => !known.has(c)) || contenders().some(s => s.cards.some(c => !known.has(c))))) { phase = "reveal"; turn = -1; version++; return; }
      lastPot = pot();
      if (contenders().length === 1) {
        const winner = seats.indexOf(contenders()[0]), awards = new Array(SEATS).fill(0); awards[winner] = lastPot;
        result = { awards, pots: [{ amount: lastPot, winners: [winner], refund: false }], revealed: false };
      } else result = { ...settle(sealed ? seats.map(s => s && ({ ...s, cards: s.cards.map(c => known.get(c)) })) : seats, sealed ? board.map(c => known.get(c)) : board, dealer), revealed: true };
      result.names = seats.map(s => s?.name || null);
      result.awards.forEach((amount, i) => { if (seats[i]) seats[i].stack += amount; });
      for (const s of seats) if (s) { s.roundBet = s.totalBet = 0; }
      phase = "showdown"; turn = -1;
      log(result.awards.map((n, i) => n ? `${seats[i].name} +${n}` : "").filter(Boolean).join(" · "));
    };
    const street = () => {
      if (phase === "river") { finish(); return; }
      cursor++; // Burn one card on every street, including an all-in runout.
      const count = phase === "preflop" ? 3 : 1;
      for (let i = 0; i < count; i++) board.push(deck[cursor++]);
      phase = phase === "preflop" ? "flop" : phase === "flop" ? "turn" : "river";
      currentBet = 0; lastRaise = BIG;
      for (const s of seats) if (s) { s.roundBet = 0; s.acted = false; s.lastActedBet = 0; if (!s.folded && s.stack > 0) s.lastAction = ""; }
      log(phase[0].toUpperCase() + phase.slice(1));
    };
    const advance = from => {
      if (contenders().length === 1) { finish(); return; }
      const funded = contenders().filter(s => s.stack > 0);
      // With only one player who can still bet, do not demand chips into a dry
      // side pot (notably when the big blind is all in for less than its blind).
      if (funded.length === 1) currentBet = Math.min(currentBet, Math.max(...contenders().filter(s => s !== funded[0]).map(s => s.roundBet)));
      if (!funded.length || funded.length === 1 && funded[0].roundBet >= currentBet) {
        while (playing() && phase !== "reveal") street();
        return;
      }
      turn = next(from, s => s.inHand && !s.folded && s.stack > 0 && (!s.acted || s.roundBet < currentBet));
      if (turn < 0) { street(); if (playing() && phase !== "reveal") advance(dealer); }
    };
    // A dealer table seats a newcomer mid-hand for the next deal; the others seat only between hands.
    const join = (id, name, bot = false, index = -1, stack = BUY_IN) => {
      if (playing() && !late) throw new Error("Take a seat between hands");
      if (typeof id !== "string" || !id.length || seats.some(s => s && s.id === id)) throw new Error("Player already seated or invalid");
      if (index === -1) index = seats.indexOf(null);
      if (!Number.isInteger(index) || index < 0 || index >= SEATS || seats[index]) throw new Error("No free seat");
      if (!Number.isSafeInteger(stack) || stack < 0) throw new Error("Invalid stack");
      seats[index] = { id, name: String(name).slice(0, 32), bot: !!bot, stack, cards: [], inHand: false, folded: false, roundBet: 0, totalBet: 0, acted: false, lastActedBet: 0, lastAction: "", out: false };
      log(`${seats[index].name} takes seat ${index + 1}`); return index;
    };
    // A seat dealt out of the running hand has no chips in it, so a dealer table lets it go at once.
    const leave = id => {
      const i = seats.findIndex(s => s && s.id === id);
      if (i < 0) return;
      if (playing() && (!late || seats[i].inHand)) throw new Error("Stand between hands; your committed chips stay in this hand");
      log(`${seats[i].name} stands`); seats[i] = null;
    };
    const refill = id => {
      const s = seats.find(s => s && s.id === id);
      if (playing() && (!late || s?.inHand)) throw new Error("Refill between hands");
      if (!s || s.stack >= BUY_IN) return;
      s.stack = BUY_IN; log(`${s.name} refills free play chips`);
    };
    // Sitting out keeps the seat and its stack and skips the next deals until the player is back.
    const setOut = (id, on) => {
      const s = seats.find(s => s && s.id === id);
      if (!s || !!s.out === !!on) return;
      s.out = !!on; log(`${s.name} ${on ? "sits out" : "is back"}`);
    };
    // `dealt`: a deck chosen elsewhere (the live dealer's commit-reveal deck), checked to be all 52 cards once each.
    const start = (dealt = null) => {
      if (playing()) throw new Error("A hand is already running");
      if (seats.filter(s => s && s.stack > 0 && !s.out).length < 2) throw new Error("At least two funded players are needed");
      if (dealt && (!Array.isArray(dealt) || dealt.length !== 52 || new Set(dealt).size !== 52 || !dealt.every(c => Number.isInteger(c) && c >= 0 && c < 52))) throw new Error("Invalid deck");
      const fresh = sealed ? Array.from({ length: 52 }, (_, i) => i) : dealt ? dealt.slice() : shuffledDeck(); // Fail before mutating any hand or balance.
      before = seats.map(s => s?.stack ?? null); beforeDealer = dealer; known = new Map();
      deck = fresh; cursor = 0; board = []; result = null; lastPot = 0; hand++; phase = "preflop";
      currentBet = BIG; lastRaise = BIG;
      for (const s of seats) if (s) { s.cards = []; s.inHand = s.stack > 0 && !s.out; s.folded = false; s.roundBet = s.totalBet = 0; s.acted = false; s.lastActedBet = 0; s.lastAction = ""; }
      dealer = next(dealer, s => s.inHand);
      let at = dealer;
      for (let round = 0; round < 2; round++) for (let n = 0; n < contenders().length; n++) { at = next(at, s => s.inHand); seats[at].cards.push(deck[cursor++]); }
      const sb = contenders().length === 2 ? dealer : next(dealer, s => s.inHand), bb = next(sb, s => s.inHand);
      pay(seats[sb], SMALL); pay(seats[bb], BIG);
      smallBlind = sb; bigBlind = bb; seats[sb].lastAction = "Small blind"; seats[bb].lastAction = "Big blind";
      log(`Hand ${hand} · blinds ${SMALL}/${BIG}`); advance(bb);
    };
    const legal = id => {
      const s = seats[turn];
      if (!playing() || !s || s.id !== id) return null;
      const call = Math.min(s.stack, Math.max(0, currentBet - s.roundBet)), max = s.roundBet + s.stack;
      const rights = !s.acted || currentBet - s.lastActedBet >= lastRaise;
      const canRaise = rights && max > currentBet && contenders().some(o => o !== s && o.stack > 0);
      return { call, check: call === 0, canRaise, min: currentBet + lastRaise, max };
    };
    const act = (id, action, amount) => {
      const l = legal(id); if (!l) throw new Error("Wait for your turn");
      const s = seats[turn], from = turn;
      if (action === "fold") { s.folded = true; s.lastAction = "Fold"; log(`${s.name} folds`); }
      else if (action === "check" || action === "call") {
        if (action === "check" && l.call) throw new Error("You must call or fold");
        pay(s, l.call); s.lastAction = s.stack === 0 ? "All in" : l.call ? "Call" : "Check"; log(`${s.name} ${l.call ? `calls ${l.call}` : "checks"}`);
      } else if (action === "raise") {
        if (!l.canRaise || !Number.isSafeInteger(amount) || amount <= currentBet || amount > l.max || amount < l.min && amount !== l.max) throw new Error("Invalid raise; use the minimum or your all-in amount");
        const size = amount - currentBet, opening = currentBet === 0;
        pay(s, amount - s.roundBet); currentBet = amount;
        if (size >= lastRaise) lastRaise = size;
        s.lastAction = s.stack === 0 ? "All in" : opening ? "Bet" : "Raise";
        log(`${s.name} raises to ${amount}${s.stack === 0 ? " · all in" : ""}`);
      } else throw new Error("Unknown action");
      s.acted = true; s.lastActedBet = currentBet; advance(from);
    };
    const snapshot = (viewer = null) => ({
      phase, turn, dealer, smallBlind, bigBlind, currentBet, hand, version, pot: pot(), lastPot, board: sealed ? board.map(c => known.get(c) ?? null) : board.slice(), history: history.slice(),
      result: result ? { revealed: result.revealed, names: result.names.slice(), awards: result.awards.slice(), pots: result.pots.map(p => ({ ...p, winners: p.winners.slice() })) } : null,
      seats: seats.map(s => s ? { id: s.id, name: s.name, bot: s.bot, stack: s.stack, inHand: s.inHand, folded: s.folded, roundBet: s.roundBet, totalBet: s.totalBet, lastAction: s.lastAction, out: !!s.out,
        cards: s.id === viewer || phase === "showdown" && result?.revealed && s.inHand && !s.folded ? s.cards.map(c => sealed ? known.get(c) ?? null : c) : s.cards.map(() => null) } : null),
      legal: legal(viewer)
    });
    const api = { join, leave, refill, start, act, snapshot, get version() { return version; }, get playing() { return playing(); } };
    if (late) Object.assign(api, {
      setOut,
      dump: () => JSON.parse(JSON.stringify({ seats, deck, cursor, board, phase, turn, dealer, currentBet, lastRaise, hand, version, lastPot, result, history, smallBlind, bigBlind }))
    });
    if (sealed) Object.assign(api, {
      checkpoint: () => ({ seats: seats.map(s => s && ({ id: s.id, name: s.name, stack: s.stack })), dealer, hand, version }),
      plan: () => ({ holes: seats.map(s => s?.inHand ? { id: s.id, positions: s.cards.slice(), folded: s.folded } : null), board: board.slice(), reveal: phase === "reveal" }),
      open: entries => {
        const allowed = new Set(board); if (phase === "reveal") for (const s of contenders()) for (const c of s.cards) allowed.add(c);
        const copy = new Map(known);
        for (const entry of entries) {
          if (!Array.isArray(entry) || entry.length !== 2) throw new Error("Invalid opening");
          const [position, card] = entry;
          if (!allowed.has(position) || !Number.isInteger(card) || card < 0 || card > 51 || copy.has(position) && copy.get(position) !== card) throw new Error("Unauthorized card opening");
          copy.set(position, card);
        }
        if (new Set(copy.values()).size !== copy.size) throw new Error("Duplicate card opening");
        known = copy; version++;
      },
      resolve: () => { if (phase !== "reveal") throw new Error("Not at showdown"); finish(); },
      abort: () => {
        if (!playing() || !before) throw new Error("No hand to refund");
        seats.forEach((s, i) => { if (s) { s.stack = before[i]; s.roundBet = s.totalBet = 0; s.cards = []; s.inHand = false; s.folded = false; s.lastAction = ""; } });
        dealer = beforeDealer; phase = "waiting"; turn = -1; deck = []; board = []; known.clear(); result = null; lastPot = 0; smallBlind = bigBlind = -1; log("Hand canceled · all play chips refunded");
      }
    });
    return api;
  };
  // Bot receives precisely the same filtered view as a human, never the table's deck.
  const botAction = (table, id) => {
    const s = table.snapshot(id), l = s.legal; if (!l) return;
    const own = s.seats[s.turn], rs = own.cards.map(rank), roll = randomInt(100);
    const strong = s.board.length >= 3 ? evaluate(own.cards.concat(s.board)).category >= 2 : rs[0] === rs[1] || Math.min(...rs) >= 10;
    if (l.canRaise && l.max >= l.min && roll < (strong ? 30 : 5)) table.act(id, "raise", Math.min(l.max, l.min + BIG * (strong ? 2 : 0)));
    else if (l.call && !strong && roll < (l.call > own.stack / 3 ? 65 : 18)) table.act(id, "fold");
    else table.act(id, l.check ? "check" : "call");
  };
  BL.pokerRules = { SEATS, BUY_IN, SMALL, BIG, randomInt, shuffledDeck, evaluate, settle, create: () => create(), createSealed: initial => create(true, initial),
    createDealer: (saved = null) => create(false, null, { late: true, saved }), botAction, cardName, commitFor, deckFrom, dealOrder, checkReveal };
})();
