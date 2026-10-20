// Live block and mining readings for the Timechain Sphere's rooms, from mempool.space's public REST API (the fields,
// units and caveats are verified in docs/timechain-sphere/data-contract.json). These are equivalent public sources for
// the Timechain Index chart families, attributed to mempool.space; they are not Timechain Index's own formulas.
//
// Interior-only: the active room makes one reader on entry (`create`) and disposes it on leaving, so the island, the
// keypad and a room never entered ask for nothing. What it has read stays in a small page-wide cache (`cache`: one
// value per dataset and at most HISTORY_KEEP blocks), so a later room starts from it and asks only for what is due.
// Each dataset keeps one request in flight, its own cadence, a timeout, backoff after a failure (Retry-After honoured)
// and its last good value, shown STALE rather than dropped; nothing is asked while the tab is hidden. A new block on
// the page's mempool socket makes the block-bound datasets due at once. Off under `nosim` (unless `timechain=1`) and
// `timechain=0`, where every dataset reads PAUSED.
//
// The last 144 blocks are a window of heights, not of time: they are fetched a page of 15 at a time down from the
// tip, kept only while each block's parent hash is the block below it, and summarized only when all 144 (and the
// one before, for the first interval) are there. Header timestamps can run backwards, so intervals are reported as
// they are and a non-positive one is counted, never shown as a zero-second block. Hashrate (H/s) and difficulty
// (dimensionless) stay separate series. The weekly pool counts carry no reward sums, so none are made up.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const BASE = "https://mempool.space/api";
  const SOURCE = "mempool.space";
  const PAGE = 15, WINDOW = 144, HISTORY_KEEP = WINDOW + 16, TIMEOUT_MS = 15000, PAGE_GAP_MS = 400;
  const MAX_DELAY = 30 * 60e3, BACKOFF_MS = 30e3;
  // How long a reading is current: past `every` × STALE_AFTER it reads STALE until the next one arrives.
  const STALE_AFTER = 3;

  const fail = (what) => { throw new Error(`Invalid ${what}`); };
  const int = (v, what, min = 0) => Number.isSafeInteger(v) && v >= min ? v : fail(what);
  const num = (v, what, min = -Infinity) => typeof v === "number" && Number.isFinite(v) && v >= min ? v : fail(what);
  // reward-stats sends its totals as decimal strings.
  const numeric = (v, what) => typeof v === "string" && /^\d{1,18}$/.test(v) ? int(Number(v), what) : int(v, what);
  const hash = (v, what) => typeof v === "string" && /^[0-9a-f]{64}$/.test(v) ? v : fail(what);
  const text = (v, what) => typeof v === "string" && v.trim() && v.length <= 80 ? v.trim() : fail(what);
  const list = (v, what, max) => Array.isArray(v) && v.length && v.length <= max ? v : fail(what);

  // /v1/blocks and /v1/blocks/:height: up to 15 blocks, newest first, each the child of the next.
  const block = (b) => {
    if (!b || typeof b !== "object") fail("block");
    const extras = b.extras && typeof b.extras === "object" ? b.extras : fail("block extras");
    const pool = extras.pool && typeof extras.pool === "object" && typeof extras.pool.name === "string" && extras.pool.name.trim() ? extras.pool.name.trim().slice(0, 40) : "Unknown";
    const weight = int(b.weight, "weight", 1);
    if (weight > 4e6) fail("weight");
    return {
      height: int(b.height, "height"), id: hash(b.id, "block hash"), prev: b.height === 0 ? null : hash(b.previousblockhash, "parent hash"),
      time: int(b.timestamp, "timestamp"), tx: int(b.tx_count, "transaction count", 1), size: int(b.size, "size", 1), weight,
      fees: int(extras.totalFees, "fees"), reward: int(extras.reward, "reward"),
      medianFee: extras.medianFee == null ? null : num(extras.medianFee, "median fee", 0), pool
    };
  };
  const blocks = (rows) => {
    const out = list(rows, "blocks", 30).map(block);
    for (let i = 1; i < out.length; i++) if (out[i].height !== out[i - 1].height - 1 || out[i - 1].prev !== out[i].id) fail("block sequence");
    return out;
  };
  // /mempool: the backlog. `total_fee` is satoshis here (the socket's is BTC).
  const mempool = (m) => {
    if (!m || typeof m !== "object") fail("mempool");
    if (!Array.isArray(m.fee_histogram)) fail("fee histogram");
    return { count: int(m.count, "count"), vsize: int(m.vsize, "vsize"), fees: int(m.total_fee, "total fee") };
  };
  // /v1/fees/precise: sat/vB, with sub-satoshi precision kept.
  const FEE_KEYS = ["fastestFee", "halfHourFee", "hourFee", "economyFee", "minimumFee"];
  const fees = (f) => {
    if (!f || typeof f !== "object") fail("fees");
    const out = {};
    for (const key of FEE_KEYS) out[key] = num(f[key], key, 0);
    return out;
  };
  // /v1/fees/mempool-blocks: the projected next blocks.
  const projected = (rows) => list(rows, "projected blocks", 64).map((p) => ({
    vsize: num(p.blockVSize, "projected vsize", 0), tx: int(p.nTx, "projected count"), fees: int(p.totalFees, "projected fees"),
    medianFee: num(p.medianFee, "projected median", 0)
  }));
  // /v1/difficulty-adjustment: the epoch so far. Times are milliseconds except `previousTime` (seconds).
  const difficulty = (d) => {
    if (!d || typeof d !== "object") fail("difficulty");
    const progress = num(d.progressPercent, "progress", 0);
    if (progress > 100) fail("progress");
    return {
      progress, change: num(d.difficultyChange, "change"), previous: num(d.previousRetarget, "previous change"),
      retargetAt: int(Math.round(num(d.estimatedRetargetDate, "retarget date", 0)), "retarget date"), remainingBlocks: int(d.remainingBlocks, "remaining blocks"),
      remainingMs: num(d.remainingTime, "remaining time", 0), nextHeight: int(d.nextRetargetHeight, "next height"), averageMs: num(d.timeAvg, "average time", 1)
    };
  };
  // /v1/mining/pools/1w and /24h: blocks attributed to each pool in the window, and the window's whole count.
  const pools = (p) => {
    if (!p || typeof p !== "object") fail("pools");
    const total = int(p.blockCount, "block count", 1);
    const rows = list(p.pools, "pool list", 400).map((r) => ({ name: text(r.name, "pool name"), blocks: int(r.blockCount, "pool blocks") }));
    rows.sort((a, b) => b.blocks - a.blocks);
    if (rows.reduce((sum, r) => sum + r.blocks, 0) > total) fail("pool counts");
    return { total, pools: rows, hashrate: p.lastEstimatedHashrate == null ? null : num(p.lastEstimatedHashrate, "hashrate", 0) };
  };
  // /v1/mining/reward-stats/144: totals over an inclusive height range, sent as strings.
  const reward = (r) => {
    if (!r || typeof r !== "object") fail("reward stats");
    const start = int(r.startBlock, "start block"), end = int(r.endBlock, "end block");
    if (end - start + 1 !== WINDOW) fail("reward window");
    return { start, end, reward: numeric(r.totalReward, "total reward"), fees: numeric(r.totalFee, "total fee"), tx: numeric(r.totalTx, "total tx") };
  };
  // /v1/mining/hashrate/1y: daily hashrate (H/s) and each retarget's difficulty, as two separate series.
  const hashrate = (h) => {
    if (!h || typeof h !== "object") fail("hashrate");
    const rates = list(h.hashrates, "hashrates", 1000).map((r) => [int(r.timestamp, "hashrate time"), num(r.avgHashrate, "hashrate", 0)]);
    const steps = list(h.difficulty, "difficulty steps", 400).map((d) => [int(d.time, "difficulty time"), num(d.difficulty, "difficulty", 0), int(d.height, "difficulty height")]);
    rates.sort((a, b) => a[0] - b[0]); steps.sort((a, b) => a[0] - b[0]);
    return { rates, steps, current: num(h.currentHashrate, "current hashrate", 0), difficulty: num(h.currentDifficulty, "current difficulty", 0) };
  };

  // The 144 heights up to the tip, as summaries: only when every one is there and each block's parent is the one
  // below it (the one below the window too, for the first interval). `blocksAt` is height → block.
  const summarize = (blocksAt, tip, nowSec) => {
    if (!Number.isSafeInteger(tip)) return null;
    const first = tip - WINDOW + 1;
    let coverage = 0;
    for (let h = first; h <= tip; h++) if (blocksAt.has(h)) coverage++;
    if (coverage < WINDOW || !blocksAt.has(first - 1)) return { complete: false, coverage, first, tip };
    for (let h = first; h <= tip; h++) if (blocksAt.get(h).prev !== blocksAt.get(h - 1).id) return { complete: false, coverage, first, tip, broken: h };
    let tx = 0, fees = 0, size = 0, fullness = 0, lastHour = 0, backwards = 0;
    let fastest = Infinity, fastestAt = 0, slowest = -Infinity, slowestAt = 0;
    let richest = null, fullest = null, biggest = null, busiest = null;
    const intervals = new Float64Array(WINDOW), poolCounts = new Map();
    for (let h = first, i = 0; h <= tip; h++, i++) {
      const b = blocksAt.get(h), gap = b.time - blocksAt.get(h - 1).time;
      intervals[i] = gap;
      tx += b.tx; fees += b.fees; size += b.size; fullness += b.weight / 4e6;
      if (b.time > nowSec - 3600) lastHour++;
      if (gap <= 0) backwards++;
      else if (gap < fastest) { fastest = gap; fastestAt = h; }
      if (gap > slowest) { slowest = gap; slowestAt = h; }
      if (!richest || b.fees > richest.fees) richest = b;
      if (!fullest || b.weight > fullest.weight) fullest = b;
      if (!biggest || b.size > biggest.size) biggest = b;
      if (!busiest || b.tx > busiest.tx) busiest = b;
      poolCounts.set(b.pool, (poolCounts.get(b.pool) || 0) + 1);
    }
    const pools = [...poolCounts].map(([name, blocks]) => ({ name, blocks })).sort((a, b) => b.blocks - a.blocks || (a.name < b.name ? -1 : 1));
    return {
      complete: true, coverage: WINDOW, first, tip, tx, fees, averageSize: size / WINDOW, fullness: fullness / WINDOW,
      // The header-time span over the window's 144 intervals; header times are miners' clocks.
      averageInterval: (blocksAt.get(tip).time - blocksAt.get(first - 1).time) / WINDOW,
      fastest: Number.isFinite(fastest) ? fastest : null, fastestAt, slowest, slowestAt, backwards, lastHour, intervals,
      richest: { height: richest.height, fees: richest.fees }, fullest: { height: fullest.height, weight: fullest.weight },
      biggest: { height: biggest.height, size: biggest.size }, busiest: { height: busiest.height, tx: busiest.tx }, pools
    };
  };

  // What each dataset reads, how often while a room is open, and whether a new block makes it due at once.
  const DATASETS = {
    recent: { path: "/v1/blocks", every: 60e3, onBlock: true, parse: blocks },
    mempool: { path: "/mempool", every: 60e3, onBlock: true, parse: mempool },
    fees: { path: "/v1/fees/precise", every: 60e3, onBlock: true, parse: fees },
    projected: { path: "/v1/fees/mempool-blocks", every: 60e3, onBlock: true, parse: projected },
    difficulty: { path: "/v1/difficulty-adjustment", every: 180e3, onBlock: true, parse: difficulty },
    pools24h: { path: "/v1/mining/pools/24h", every: 300e3, onBlock: true, parse: pools },
    pools1w: { path: "/v1/mining/pools/1w", every: 900e3, onBlock: false, parse: pools },
    reward144: { path: "/v1/mining/reward-stats/144", every: 300e3, onBlock: true, parse: reward },
    hashrate: { path: "/v1/mining/hashrate/1y", every: 1800e3, onBlock: false, parse: hashrate }
  };
  const NAMES = Object.keys(DATASETS);
  // The page's readings, kept across rooms: `value` and `at` (ms) of the last good one, `checked` the last attempt.
  const cache = { tip: null, blocks: new Map(), sets: Object.fromEntries(NAMES.map((n) => [n, { value: null, at: 0, checked: 0, failed: false }])) };

  // Keeps the block cache to the window under the tip; a block whose parent hash disagrees with the block below it
  // drops the lower one, which the next page fetches again (the newer chain above wins).
  const trim = () => {
    const tip = cache.tip;
    if (tip === null) return;
    for (const h of cache.blocks.keys()) if (h > tip || h < tip - WINDOW - 1) cache.blocks.delete(h);
    for (let h = tip; h > tip - WINDOW; h--) {
      const b = cache.blocks.get(h), below = cache.blocks.get(h - 1);
      if (b && below && b.prev !== below.id) cache.blocks.delete(h - 1);
    }
  };
  const remember = (rows, authoritative) => {
    for (const b of rows) {
      const known = cache.blocks.get(b.height), above = cache.blocks.get(b.height + 1);
      // A page never replaces a block the chain above it already confirms.
      if (!authoritative && known && above && above.prev === known.id) continue;
      cache.blocks.set(b.height, b);
    }
    if (cache.blocks.size > HISTORY_KEEP * 2) {
      const heights = [...cache.blocks.keys()].sort((a, b) => b - a);
      for (let i = HISTORY_KEEP; i < heights.length; i++) cache.blocks.delete(heights[i]);
    }
  };
  // The highest height the window still lacks, or null when it has them all.
  const missing = () => {
    if (cache.tip === null) return null;
    for (let h = cache.tip; h >= cache.tip - WINDOW; h--) if (!cache.blocks.has(h)) return h;
    return null;
  };

  const create = ({ onChange = null, fetch: fetcher = null } = {}) => {
    const q = new URLSearchParams(location.search);
    const enabled = q.get("timechain") !== "0" && (!q.has("nosim") || q.get("timechain") === "1");
    const get = fetcher || ((url, init) => window.fetch(url, init));
    const states = Object.fromEntries(NAMES.map((n) => [n, { timer: 0, controller: null, pending: false, failures: 0, due: 0 }]));
    const history = { timer: 0, controller: null, pending: false, failures: 0, due: 0 };
    // `version` moves with every reading, success or failure, so a room repaints only after one.
    let disposed = false, started = false, summary = null, unsubscribeBlocks = null, version = 0;
    const changed = (name) => {
      version++;
      if (onChange && !disposed) onChange(name);
    };
    const resummarize = () => {
      summary = summarize(cache.blocks, cache.tip, Date.now() / 1000);
      changed("history");
    };
    const delayAfter = (state, every, retry) => {
      if (!state.failures) return every;
      const backoff = Math.min(MAX_DELAY, BACKOFF_MS * 2 ** Math.min(state.failures - 1, 6));
      return Math.min(MAX_DELAY, Math.max(Number.isFinite(retry) ? retry : 0, backoff));
    };
    const retryAfter = (response) => {
      const value = response.headers.get("Retry-After");
      if (!value) return 0;
      return /^\d+$/.test(value) ? Number(value) * 1000 : Math.max(0, Date.parse(value) - Date.now());
    };
    // One request with a timeout; resolves to the parsed body or throws (with `retry` on a refusal).
    const request = async (path, controller) => {
      const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        const response = await get(BASE + path, { signal: controller.signal, credentials: "omit", cache: "no-store" });
        if (!response.ok) {
          const error = new Error("Request failed");
          error.retry = retryAfter(response);
          throw error;
        }
        return await response.json();
      } finally {
        clearTimeout(timeout);
      }
    };
    const schedule = (state, run, delay) => {
      clearTimeout(state.timer);
      state.timer = 0;
      state.due = Date.now() + delay;
      if (!disposed && !document.hidden) state.timer = setTimeout(run, Math.min(delay, 2147483647));
    };
    const poll = async (name) => {
      const state = states[name], set = cache.sets[name], spec = DATASETS[name];
      if (disposed || document.hidden || state.pending) return;
      clearTimeout(state.timer);
      state.timer = 0;
      const controller = state.controller = new AbortController();
      state.pending = true;
      let retry = 0;
      try {
        const value = spec.parse(await request(spec.path, controller));
        if (disposed || controller.signal.aborted) return;
        set.value = value; set.at = set.checked = Date.now(); set.failed = false; state.failures = 0;
        if (name === "recent") {
          const tip = value[0].height;
          if (cache.tip === null || tip >= cache.tip) cache.tip = tip;
          remember(value, true);
          trim();
          resummarize();
          pump(0);
        }
      } catch (error) {
        if (disposed || controller.signal.aborted && document.hidden) return;
        state.failures++;
        set.checked = Date.now(); set.failed = true;
        retry = error && error.retry;
      } finally {
        state.pending = false;
        state.controller = null;
        if (!disposed) {
          schedule(state, () => poll(name), delayAfter(state, spec.every, retry));
          changed(name);
        }
      }
    };
    // The window's next page, one at a time, newest missing height first.
    const page = async () => {
      if (disposed || document.hidden || history.pending) return;
      const from = missing();
      if (from === null) return;
      history.timer = 0;
      const controller = history.controller = new AbortController();
      history.pending = true;
      let retry = 0;
      try {
        const rows = blocks(await request(`/v1/blocks/${from}`, controller));
        if (disposed || controller.signal.aborted) return;
        if (rows[0].height !== from) fail("page start");
        remember(rows, false);
        trim();
        history.failures = 0;
      } catch (error) {
        if (disposed || controller.signal.aborted && document.hidden) return;
        history.failures++;
        retry = error && error.retry;
      } finally {
        history.pending = false;
        history.controller = null;
        if (!disposed) {
          resummarize();
          if (missing() !== null) pump(history.failures ? delayAfter(history, PAGE_GAP_MS, retry) : PAGE_GAP_MS);
        }
      }
    };
    const pump = (delay) => {
      if (history.pending || disposed) return;
      schedule(history, page, delay);
    };
    // A new block on the page's own mempool socket: the block-bound readings are due now.
    const onBlock = () => {
      for (const name of NAMES) if (DATASETS[name].onBlock && !states[name].pending) schedule(states[name], () => poll(name), 0);
    };
    const visibility = () => {
      for (const name of NAMES) {
        const state = states[name];
        clearTimeout(state.timer);
        state.timer = 0;
        if (document.hidden) { if (state.controller) state.controller.abort(); }
        else if (!state.pending) schedule(state, () => poll(name), Math.max(0, state.due - Date.now()));
      }
      clearTimeout(history.timer);
      history.timer = 0;
      if (document.hidden) { if (history.controller) history.controller.abort(); }
      else pump(Math.max(0, history.due - Date.now()));
    };
    const start = () => {
      if (started || disposed) return;
      started = true;
      summary = summarize(cache.blocks, cache.tip, Date.now() / 1000);
      if (!enabled) return;
      document.addEventListener("visibilitychange", visibility);
      if (BL.mempool && BL.mempool.subscribe) unsubscribeBlocks = BL.mempool.subscribe((event) => { if (event.type === "block") onBlock(); });
      const now = Date.now();
      // From the page's cache, only what is due: a room entered a minute after another asks for little.
      for (const name of NAMES) {
        const set = cache.sets[name], wait = set.at && !set.failed ? Math.max(0, set.at + DATASETS[name].every - now) : 0;
        schedule(states[name], () => poll(name), wait);
      }
      pump(PAGE_GAP_MS);
    };
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      document.removeEventListener("visibilitychange", visibility);
      if (unsubscribeBlocks) unsubscribeBlocks();
      unsubscribeBlocks = null;
      for (const state of [...Object.values(states), history]) {
        clearTimeout(state.timer);
        state.timer = 0;
        if (state.controller) state.controller.abort();
      }
    };
    // A dataset's reading and how current it is: LIVE, STALE (with its age), LOADING, NO READING or PAUSED.
    const status = (name) => {
      const set = cache.sets[name];
      if (!enabled) return set.value ? "STALE" : "PAUSED";
      if (!set.value) return set.failed ? "NO READING" : "LOADING";
      return set.failed || Date.now() - set.at > DATASETS[name].every * STALE_AFTER ? "STALE" : "LIVE";
    };
    // The window's own: LIVE once all 144 chain together under a current tip, else how far it has got.
    const historyStatus = () => {
      if (summary && summary.complete) return status("recent") === "LIVE" && !history.failures ? "LIVE" : "STALE";
      if (!enabled) return "PAUSED";
      return history.failures && !history.pending ? "NO READING" : "LOADING";
    };
    return {
      start, dispose, status, historyStatus, enabled, source: SOURCE,
      value: (name) => cache.sets[name].value,
      at: (name) => cache.sets[name].at,
      get summary() { return summary; },
      get version() { return version; },
      get tip() { return cache.tip; },
      get pending() { return NAMES.filter((n) => states[n].pending).length + (history.pending ? 1 : 0); },
      get timers() { return NAMES.filter((n) => states[n].timer).length + (history.timer ? 1 : 0); }
    };
  };
  BL.timechainBlocks = { create, summarize, cache, DATASETS, NAMES, BASE, SOURCE, WINDOW, parse: { blocks, mempool, fees, projected, difficulty, pools, reward, hashrate } };
})();
