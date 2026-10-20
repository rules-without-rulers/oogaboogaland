// The Timechain Sphere's screens, painted natively in the Timechain Index Blocks look: charcoal panels, fine amber
// borders and labels, white values, green mining data. Six chart panels (`PANELS`), the latest-blocks ribbon's cards,
// and the holdings readings that came with the old sphere (`holdings`). A painter draws one
// canvas from what a reader holds (timechain-blocks.js, timechain-data.js) and never fetches; the room repaints a
// canvas only when what it prints has changed. Every panel names its source, its window and how current it is
// (LIVE, STALE with its age, LOADING, NO READING, PAUSED), keeps units apart (sat/vB, BTC, MvB, H/s, difficulty) and
// leaves out what no source verifies: no reward per pool, no "fee pressure" or "mining pace" categories.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const PANEL_W = 768, PANEL_H = 512, CARD_W = 304, CARD_H = 192;
  const FONT = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif';
  const INK = {
    ground: "#0b0b0c", panel: "#121214", inset: "#19191c", rule: "#3a2a12", amber: "#f7931a", label: "#f2a33a",
    value: "#f4f4f2", muted: "#8b8b86", green: "#3ddc84", red: "#ef5a43", blue: "#45b5f0", dim: "#2a2a2e"
  };
  // Pools by rank, then everyone else.
  const POOL_INKS = ["#3ddc84", "#f7931a", "#45b5f0", "#ef5a43", "#c08cf5", "#7c7c78"];

  const group = (n) => Math.round(n).toLocaleString("en-US");
  const btc = (sats, digits = 8) => (sats / 1e8).toFixed(digits);
  const rate = (v) => v < 1 ? v.toFixed(3) : v < 10 ? v.toFixed(2) : v.toFixed(1);
  const signed = (v) => `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;
  const minutes = (sec) => {
    if (sec < 0) return `${(sec / 60).toFixed(1)} min`;
    if (sec < 3600) return `${(sec / 60).toFixed(1)} min`;
    const h = Math.floor(sec / 3600), m = Math.round((sec - h * 3600) / 60);
    return `${h} h ${m} min`;
  };
  const ago = (ms) => {
    const s = Math.max(0, Math.round(ms / 1000));
    return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.floor(s / 60)}m ago` : `${Math.floor(s / 3600)}h ago`;
  };
  const hashrate = (h) => h >= 1e21 ? `${(h / 1e21).toFixed(2)} ZH/s` : `${(h / 1e18).toFixed(1)} EH/s`;
  const diff = (d) => `${(d / 1e12).toFixed(2)} T`;
  const day = (ms) => new Date(ms).toISOString().slice(0, 10);
  // How current a reading is, for a footer: its state and, while it has one, its age.
  const freshness = (status, at, now) => status === "LIVE" ? `LIVE · ${ago(now - at)}`
    : status === "STALE" ? `STALE · ${at ? ago(now - at).replace(" ago", " old") : "no reading"}` : status;
  const statusInk = (status) => status === "LIVE" ? INK.green : status === "STALE" ? INK.label : INK.muted;

  const font = (ctx, size, weight = 600) => { ctx.font = `${weight} ${size}px ${FONT}`; };
  const write = (ctx, s, x, y, ink, size, weight = 600, align = "left") => {
    font(ctx, size, weight);
    ctx.fillStyle = ink;
    ctx.textAlign = align;
    ctx.textBaseline = "alphabetic";
    ctx.fillText(s, x, y);
  };
  // The panel's frame: ground, a thin amber border, the title in amber capitals and a rule under it.
  const frame = (ctx, w, h, title) => {
    ctx.fillStyle = INK.ground;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = INK.panel;
    ctx.fillRect(6, 6, w - 12, h - 12);
    ctx.strokeStyle = INK.amber;
    ctx.lineWidth = 2;
    ctx.strokeRect(7, 7, w - 14, h - 14);
    if (!title) return;
    write(ctx, title, 26, 52, INK.label, 32, 700);
    ctx.fillStyle = INK.rule;
    ctx.fillRect(26, 66, w - 52, 2);
  };
  const footer = (ctx, w, h, source, status, at, now) => {
    write(ctx, source, 26, h - 22, INK.muted, 17, 500);
    write(ctx, freshness(status, at, now), w - 26, h - 22, statusInk(status), 17, 700, "right");
  };
  // A labelled reading: the amber label over its white value, with an optional note under it.
  const stat = (ctx, x, y, label, value, ink = INK.value, size = 26) => {
    write(ctx, label, x, y, INK.label, 18, 600);
    write(ctx, value, x, y + size + 6, ink, size, 700);
  };
  const ring = (ctx, cx, cy, r, share, ink, width = 22) => {
    ctx.lineWidth = width;
    ctx.strokeStyle = INK.dim;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    if (share > 0) {
      ctx.strokeStyle = ink;
      ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, share)); ctx.stroke();
    }
  };
  const chip = (ctx, x, y, s, ink) => {
    font(ctx, 18, 700);
    const w = ctx.measureText(s).width + 20;
    ctx.fillStyle = INK.inset;
    ctx.fillRect(x, y, w, 30);
    ctx.strokeStyle = ink;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + 0.75, y + 0.75, w - 1.5, 28.5);
    write(ctx, s, x + 10, y + 21, ink, 18, 700);
    return w;
  };
  // A panel with nothing yet: what it waits for, in its place.
  const empty = (ctx, w, h, status, what) => {
    write(ctx, status === "PAUSED" ? "LIVE DATA PAUSED" : status === "NO READING" ? "NO READING YET" : "LOADING…", w / 2, h / 2 - 6, INK.muted, 30, 700, "center");
    write(ctx, what, w / 2, h / 2 + 30, INK.muted, 18, 500, "center");
  };

  // MEMPOOL & FEES: the backlog now, the share of it the next projected block takes, and the fee tiers in sat/vB.
  const mempoolPanel = (ctx, r, now) => {
    const w = PANEL_W, h = PANEL_H, m = r.value("mempool"), f = r.value("fees"), p = r.value("projected");
    frame(ctx, w, h, "MEMPOOL & FEES");
    const status = r.status("mempool");
    if (!m) { empty(ctx, w, h, status, "pending transactions from mempool.space"); }
    else {
      const next = p && p.length && m.vsize ? Math.min(1, p[0].vsize / m.vsize) : 0;
      ring(ctx, 150, 214, 86, next, INK.amber);
      write(ctx, `${(m.vsize / 1e6).toFixed(2)}`, 150, 216, INK.value, 36, 700, "center");
      write(ctx, "MvB pending", 150, 244, INK.muted, 18, 600, "center");
      if (p && p.length) write(ctx, `next block takes ${(next * 100).toFixed(1)}%`, 150, 344, INK.label, 17, 600, "center");
      stat(ctx, 296, 104, "Transactions", group(m.count));
      stat(ctx, 530, 104, "Avg size", m.count ? `${group(m.vsize / m.count)} vB` : "—");
      stat(ctx, 296, 186, "Total fees", `${btc(m.fees)} BTC`);
      stat(ctx, 530, 186, "Clearance", `≈ ${(m.vsize / 1e6).toFixed(1)} blocks`);
      stat(ctx, 296, 268, "Next block median", p && p.length ? `${rate(p[0].medianFee)} sat/vB` : "—", INK.value, 26);
      // The tiers on a row of their own across the panel's foot.
      write(ctx, "FEE TIERS · sat/vB", 26, 386, INK.label, 18, 600);
      if (f) {
        let x = 26;
        for (const [label, key] of [["Fast", "fastestFee"], ["30 min", "halfHourFee"], ["1 h", "hourFee"], ["Eco", "economyFee"], ["Min", "minimumFee"]]) x += chip(ctx, x, 398, `${label} ${rate(f[key])}`, INK.green) + 8;
      } else write(ctx, r.status("fees"), 26, 420, INK.muted, 18, 600);
    }
    footer(ctx, w, h, "mempool.space · pending now", status, r.at("mempool"), now);
  };

  // DIFFICULTY: the epoch's progress and the estimated adjustment, next to the last one.
  const difficultyPanel = (ctx, r, now) => {
    const w = PANEL_W, h = PANEL_H, d = r.value("difficulty"), status = r.status("difficulty");
    frame(ctx, w, h, "DIFFICULTY");
    if (!d) empty(ctx, w, h, status, "this retarget epoch from mempool.space");
    else {
      ring(ctx, 150, 250, 98, d.progress / 100, INK.amber);
      write(ctx, `${d.progress.toFixed(1)}%`, 150, 258, INK.value, 38, 700, "center");
      write(ctx, "of epoch", 150, 288, INK.muted, 18, 600, "center");
      stat(ctx, 296, 112, "Expected adjustment", signed(d.change), d.change >= 0 ? INK.green : INK.red);
      stat(ctx, 530, 112, "Previous", signed(d.previous), d.previous >= 0 ? INK.green : INK.red);
      stat(ctx, 296, 200, "Blocks to retarget", group(d.remainingBlocks));
      stat(ctx, 530, 200, "Next height", group(d.nextHeight));
      stat(ctx, 296, 288, "Estimated date (UTC)", day(d.retargetAt));
      stat(ctx, 530, 288, "Avg block time", minutes(d.averageMs / 1000));
    }
    footer(ctx, w, h, "mempool.space · current epoch", status, r.at("difficulty"), now);
  };

  // LAST 144 BLOCKS: a window of heights, summed only once every block is there and chained.
  const windowPanel = (ctx, r, now) => {
    const w = PANEL_W, h = PANEL_H, s = r.summary, totals = r.value("reward144"), status = r.historyStatus();
    frame(ctx, w, h, "LAST 144 BLOCKS");
    if (!s || !s.complete) {
      const have = s ? s.coverage : 0;
      empty(ctx, w, h, status, `${have} of 144 blocks fetched and chained`);
      ctx.fillStyle = INK.dim; ctx.fillRect(184, h / 2 + 52, 400, 10);
      ctx.fillStyle = INK.amber; ctx.fillRect(184, h / 2 + 52, 400 * have / 144, 10);
    } else {
      // The reward endpoint's totals count only when they cover exactly this window.
      const same = totals && totals.start === s.first && totals.end === s.tip;
      write(ctx, `#${group(s.first)} – #${group(s.tip)}`, 26, 100, INK.muted, 18, 600);
      stat(ctx, 26, 126, "Transactions", group(same ? totals.tx : s.tx));
      stat(ctx, 270, 126, "Total fees", `${btc(same ? totals.fees : s.fees)} BTC`);
      stat(ctx, 530, 126, "Avg size", `${(s.averageSize / 1e6).toFixed(2)} MB`);
      stat(ctx, 26, 214, "Avg fullness", `${(s.fullness * 100).toFixed(1)}%`);
      stat(ctx, 270, 214, "Avg interval", minutes(s.averageInterval));
      stat(ctx, 530, 214, "Highest fees", `#${group(s.richest.height)}`, INK.green, 26);
      write(ctx, "RECENT INTERVALS · header time", 26, 322, INK.label, 18, 600);
      let x = 26;
      for (let i = s.intervals.length - 6; i < s.intervals.length; i++) {
        const gap = s.intervals[i], ink = gap <= 0 ? INK.muted : gap < 600 ? INK.green : gap < 1200 ? INK.label : INK.red;
        x += chip(ctx, x, 336, gap <= 0 ? "out of order" : `${(gap / 60).toFixed(1)} min`, ink) + 8;
      }
      write(ctx, `Fullest #${group(s.fullest.height)} · busiest #${group(s.busiest.height)} (${group(s.busiest.tx)} tx)`, 26, 412, INK.muted, 18, 600);
      if (s.backwards) write(ctx, `${s.backwards} header time${s.backwards === 1 ? "" : "s"} ran backwards`, 26, 438, INK.muted, 16, 500);
    }
    footer(ctx, w, h, "mempool.space · 144 heights, not 24 h", status, r.at("recent"), now);
  };

  // MINER DOMINANCE · 1W: each pool's share of the week's blocks; unknown stays unknown.
  const dominancePanel = (ctx, r, now) => {
    const w = PANEL_W, h = PANEL_H, p = r.value("pools1w"), status = r.status("pools1w");
    frame(ctx, w, h, "MINER DOMINANCE · 1W");
    if (!p) empty(ctx, w, h, status, "blocks by pool over a week, from mempool.space");
    else {
      const top = p.pools.slice(0, 5), others = p.total - top.reduce((sum, q) => sum + q.blocks, 0);
      let x = 26;
      const barW = w - 52;
      for (let i = 0; i <= top.length; i++) {
        const n = i < top.length ? top[i].blocks : others, span = barW * n / p.total;
        ctx.fillStyle = POOL_INKS[i < top.length ? i : 5];
        ctx.fillRect(x, 92, span, 22);
        x += span;
      }
      for (let i = 0; i <= top.length; i++) {
        const y = 160 + i * 46, name = i < top.length ? top[i].name : "Others", n = i < top.length ? top[i].blocks : others;
        ctx.fillStyle = POOL_INKS[i < top.length ? i : 5];
        ctx.beginPath(); ctx.arc(40, y - 9, 9, 0, Math.PI * 2); ctx.fill();
        write(ctx, name, 62, y, i < top.length ? INK.green : INK.muted, 26, 700);
        write(ctx, `${group(n)} blocks`, 520, y, INK.muted, 20, 600, "right");
        write(ctx, `${(n / p.total * 100).toFixed(1)}%`, w - 26, y, INK.value, 26, 700, "right");
      }
      write(ctx, `${group(p.total)} blocks · share of blocks found, not of rewards`, 26, h - 56, INK.muted, 17, 500);
    }
    footer(ctx, w, h, "mempool.space · trailing 1 week", status, r.at("pools1w"), now);
  };

  // BLOCK PRODUCTION: the last 24 h against the 144 a day expected, and the last hour against 6.
  const productionPanel = (ctx, r, now) => {
    const w = PANEL_W, h = PANEL_H, p = r.value("pools24h"), s = r.summary, status = r.status("pools24h");
    frame(ctx, w, h, "BLOCK PRODUCTION");
    if (!p) empty(ctx, w, h, status, "blocks found in the last 24 hours");
    else {
      const pace = p.total / 144;
      ctx.fillStyle = INK.dim; ctx.fillRect(26, 92, w - 52, 18);
      ctx.fillStyle = INK.blue; ctx.fillRect(26, 92, (w - 52) * Math.min(1, pace / 1.5), 18);
      ctx.fillStyle = INK.amber; ctx.fillRect(26 + (w - 52) / 1.5 - 2, 86, 4, 30);
      stat(ctx, 26, 150, "Last 24 h", `${group(p.total)} / 144`);
      stat(ctx, 270, 150, "Production pace", `${(pace * 100).toFixed(1)}%`, pace >= 1 ? INK.green : INK.label);
      stat(ctx, 530, 150, "Last hour", s && s.complete ? `${s.lastHour} / 6` : "—");
      const leader = p.pools[0];
      stat(ctx, 26, 240, "Top miner 24 h", leader ? `${leader.name} · ${leader.blocks}` : "—", INK.green, 26);
      if (s && s.complete) {
        stat(ctx, 26, 330, "Fastest of last 144", s.fastest === null ? "—" : `#${group(s.fastestAt)} · ${minutes(s.fastest)}`, INK.value, 24);
        stat(ctx, 400, 330, "Slowest of last 144", `#${group(s.slowestAt)} · ${minutes(s.slowest)}`, INK.value, 24);
      } else write(ctx, "Intervals wait for the last 144 blocks", 26, 352, INK.muted, 18, 600);
      write(ctx, "Expected 6 an hour, 144 a day · last hour by header time", 26, h - 56, INK.muted, 17, 500);
    }
    footer(ctx, w, h, "mempool.space · trailing 24 h", status, r.at("pools24h"), now);
  };

  // HASHRATE & DIFFICULTY · 1Y: two series on their own scales, hashrate in H/s, difficulty as itself.
  const historyPanel = (ctx, r, now) => {
    const w = PANEL_W, h = PANEL_H, d = r.value("hashrate"), status = r.status("hashrate");
    frame(ctx, w, h, "HASHRATE & DIFFICULTY · 1Y");
    if (!d) empty(ctx, w, h, status, "a year of hashrate and difficulty");
    else {
      const x0 = 26, x1 = w - 26, y0 = 140, y1 = h - 92, t0 = d.rates[0][0], t1 = Math.max(d.rates[d.rates.length - 1][0], d.steps[d.steps.length - 1][0]);
      const tx = (t) => x0 + (x1 - x0) * (t - t0) / Math.max(1, t1 - t0);
      const span = (rows, k) => {
        let lo = Infinity, hi = -Infinity;
        for (const row of rows) { if (row[k] < lo) lo = row[k]; if (row[k] > hi) hi = row[k]; }
        return [lo * 0.97, hi * 1.03];
      };
      const [hLo, hHi] = span(d.rates, 1), [dLo, dHi] = span(d.steps, 1);
      ctx.strokeStyle = INK.dim; ctx.lineWidth = 1;
      for (let k = 0; k <= 4; k++) { const y = y0 + (y1 - y0) * k / 4; ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke(); }
      ctx.strokeStyle = INK.green; ctx.lineWidth = 2; ctx.beginPath();
      d.rates.forEach(([t, v], i) => { const x = tx(t), y = y1 - (y1 - y0) * (v - hLo) / (hHi - hLo); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
      ctx.stroke();
      ctx.strokeStyle = INK.amber; ctx.lineWidth = 2.5; ctx.beginPath();
      let last = null;
      for (const [t, v] of d.steps) {
        const x = tx(Math.max(t, t0)), y = y1 - (y1 - y0) * (v - dLo) / (dHi - dLo);
        if (last === null) ctx.moveTo(x, y); else { ctx.lineTo(x, last); ctx.lineTo(x, y); }
        last = y;
      }
      if (last !== null) ctx.lineTo(x1, last);
      ctx.stroke();
      ctx.fillStyle = INK.green; ctx.fillRect(26, 92, 18, 4);
      write(ctx, `Hashrate ${hashrate(d.current)}`, 52, 100, INK.green, 22, 700);
      ctx.fillStyle = INK.amber; ctx.fillRect(400, 92, 18, 4);
      write(ctx, `Difficulty ${diff(d.difficulty)}`, 426, 100, INK.label, 22, 700);
      write(ctx, day(t0 * 1000), x0, y1 + 26, INK.muted, 16, 500);
      write(ctx, day(t1 * 1000), x1, y1 + 26, INK.muted, 16, 500, "right");
    }
    footer(ctx, w, h, "mempool.space · daily hashrate, each retarget", status, r.at("hashrate"), now);
  };

  // The six panels, left to right, with what the board dialog says about each.
  const PANELS = [
    { id: "mempool", title: "Mempool & fees", paint: mempoolPanel, sets: ["mempool", "fees", "projected"],
      note: "mempool.space /api/mempool, /api/v1/fees/precise, /api/v1/fees/mempool-blocks. The backlog now; fee tiers in sat/vB with sub-satoshi precision; total fees in BTC. Clearance assumes about 1 MvB a block." },
    { id: "difficulty", title: "Difficulty", paint: difficultyPanel, sets: ["difficulty"],
      note: "mempool.space /api/v1/difficulty-adjustment. Progress through the current 2016-block epoch and the estimated adjustment; the date is an estimate from recent block times." },
    { id: "window", title: "Last 144 blocks", paint: windowPanel, sets: ["recent", "reward144", "history"],
      note: "mempool.space /api/v1/blocks/:height, paged and chained by parent hash, plus /api/v1/mining/reward-stats/144. A window of 144 heights, not of 24 hours; intervals use miners' header times, which can run backwards." },
    { id: "dominance", title: "Miner dominance", paint: dominancePanel, sets: ["pools1w"],
      note: "mempool.space /api/v1/mining/pools/1w. Each pool's share of the blocks found in the trailing week (blocks attributed to the pool ÷ all blocks). It carries no reward sums, so none are shown." },
    { id: "production", title: "Block production", paint: productionPanel, sets: ["pools24h", "history"],
      note: "mempool.space /api/v1/mining/pools/24h and the last 144 blocks. Expected 144 blocks a day and 6 an hour; pace = blocks in the last 24 h ÷ 144." },
    { id: "history", title: "Hashrate & difficulty", paint: historyPanel, sets: ["hashrate"],
      note: "mempool.space /api/v1/mining/hashrate/1y. Daily average hashrate in hashes per second and difficulty at each retarget, on separate scales." }
  ];

  // A card of the latest-blocks ribbon: the height, the pool that found it and how long ago (by header time).
  const card = (ctx, b, now) => {
    const w = CARD_W, h = CARD_H;
    frame(ctx, w, h, null);
    if (!b) { write(ctx, "—", w / 2, h / 2 + 12, INK.muted, 34, 700, "center"); return; }
    write(ctx, group(b.height), 22, 64, INK.value, 42, 700);
    write(ctx, b.pool, 22, 112, INK.green, 30, 700);
    write(ctx, ago(now - b.time * 1000), 22, 156, INK.label, 26, 600);
    write(ctx, `${group(b.tx)} tx`, w - 22, 156, INK.muted, 20, 600, "right");
  };
  const ribbonLabel = (ctx, status) => {
    frame(ctx, CARD_W, CARD_H, null);
    write(ctx, "LATEST", 22, 74, INK.label, 40, 700);
    write(ctx, "BLOCKS", 22, 122, INK.label, 40, 700);
    write(ctx, status === "LIVE" ? "mempool.space" : `mempool.space · ${status}`, 22, 162, status === "LIVE" ? INK.muted : statusInk(status), 18, 600);
  };

  // A holdings reading from the old sphere's six walls (timechain-data.js), redrawn in the room's look.
  const holdings = (ctx, board) => {
    const w = PANEL_W, h = PANEL_H;
    frame(ctx, w, h, board.title);
    write(ctx, board.asof || board.status, 26, 100, INK.muted, 20, 600);
    if (!board.lines.length) empty(ctx, w, h, board.status === "LIVE DATA PAUSED" ? "PAUSED" : board.status === "API UNAVAILABLE" ? "NO READING" : "LOADING", "Timechain Index holdings and distributions");
    board.lines.slice(0, 6).forEach((line, i) => write(ctx, line, 26, 150 + i * 46, i ? INK.value : INK.green, i ? 26 : 30, 700));
    write(ctx, "Tap for every row and its source", 26, h - 56, INK.muted, 17, 500);
    write(ctx, "Timechain Index", 26, h - 22, INK.muted, 17, 500);
    write(ctx, board.status === "LIVE API" ? "LIVE" : board.status, w - 26, h - 22, board.status === "LIVE API" ? INK.green : INK.label, 17, 700, "right");
  };

  // A canvas of the given size, for a painter to draw.
  const canvas = (w, h) => {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
  };
  BL.timechainCharts = { PANELS, PANEL_W, PANEL_H, CARD_W, CARD_H, INK, card, ribbonLabel, holdings, canvas, freshness, format: { group, btc, rate, minutes, ago, hashrate, diff } };
})();
