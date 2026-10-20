// The rally's HUD: the garage board, the in-race strip, countdown and notices, results, pause, and
// the minimap and speed lines drawn on the overlay. `setBoost(k, full, tier)` colours the drift bar
// by tier, `setPips` lights the ten banana pips, the item box shows the item's pixel icon, and
// `mirror()` picks the mirrored bests for the garage rows.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const $ = (id) => document.getElementById(id);
  const SUFFIX = ["st", "nd", "rd", "th", "th", "th", "th", "th"];
  const MAP_SIZE = 132, MAP_PAD = 10;
  const MAP_POINT = { x: 0, y: 0 };
  const SPEED_LINES = 26;
  const formatTime = (ms) => {
    const total = Math.max(0, Math.floor(ms));
    const m = Math.floor(total / 60000), s = Math.floor(total / 1000) % 60, h = Math.floor(total / 10) % 100;
    return `${m}:${String(s).padStart(2, "0")}.${String(h).padStart(2, "0")}`;
  };
  const medalFor = (targets, ms) => {
    if (!ms) return null;
    if (ms <= targets.gold) return "gold";
    if (ms <= targets.silver) return "silver";
    if (ms <= targets.bronze) return "bronze";
    return null;
  };
  // `mirror()` says whether the garage is showing the mirrored tracks, whose bests live under "<id>-m".
  const create = ({ tracks, mounts, roster, best, onPick, mirror = () => false }) => {
    const el = {
      race: $("race"), garage: $("garage"), racers: $("garage-racers"), mounts: $("garage-mounts"), tracks: $("garage-tracks"), help: $("garage-help"),
      strip: $("race-strip"), rank: $("race-rank"), rankSuffix: $("race-rank-suffix"), field: $("race-field"), lap: $("race-lap"), laps: $("race-laps"), time: $("race-time"),
      item: $("race-item"), itemName: $("race-item-name"), boost: $("race-boost-fill"), pips: $("race-pips"), speed: $("race-speed"), mirror: $("garage-mirror"),
      center: $("race-center"), notice: $("race-notice"), itemBtn: $("item-btn"), results: $("race-results"), podium: $("race-podium"), summary: $("race-summary"), pause: $("race-pause"), garageBtn: $("race-garage-btn"), mute: $("race-mute"),
      cupNote: $("race-cup-note"), standingsHead: $("race-standings-head"), standings: $("race-standings"), next: $("race-next"), garageCup: $("garage-cup"),
      hudLeft: document.querySelector(".race-hud-left"), pickOoga: $("garage-pick-ooga"), joyLook: $("joy-look")
    };
    const listeners = [];
    const on = (target, type, fn) => {
      target.addEventListener(type, fn);
      listeners.push(() => target.removeEventListener(type, fn));
    };
    for (const node of [el.rank, el.lap, el.time, el.speed, el.center, el.notice, el.itemName]) if (!node.firstChild) node.append("");
    const selection = { racer: roster[0]?.name || null, mount: "kart", track: tracks[0].id };
    for (const button of el.race.querySelectorAll('[data-action="race-start"], [data-action="cup-start"], [data-action="race-again"]')) button.disabled = !roster.length;
    const buttons = { racer: new Map(), mount: new Map(), track: new Map() };
    const mark = (kind) => {
      for (const [key, b] of buttons[kind]) b.setAttribute("aria-pressed", String(key === selection[kind]));
    };
    const pick = (kind, key) => {
      selection[kind] = key;
      mark(kind);
      if (onPick) onPick(kind, key);
    };
    // A signed-in visitor with an Ooga races it, as they drive only it on the island: their row stands alone
    // in the Ooga column (moved last, so it keeps no divider) and the help stops offering a pick. `null`
    // brings every row back in roster order. Only a change of name touches the list.
    let lockedTo;
    const lockRacer = (name) => {
      if (name === lockedTo) return;
      lockedTo = name;
      for (const [key, b] of buttons.racer) {
        b.parentElement.hidden = !!name && key !== name;
        el.racers.append(b.parentElement);
      }
      el.pickOoga.hidden = !!name;
      if (!name) return;
      el.racers.append(buttons.racer.get(name).parentElement);
      selection.racer = name;
      mark("racer");
    };
    const row = (kind, key, build) => {
      const li = document.createElement("li");
      const b = document.createElement("button");
      b.type = "button";
      b.dataset[kind] = key;
      build(b);
      on(b, "click", () => {
        b.blur();
        pick(kind, key);
      });
      li.append(b);
      buttons[kind].set(key, b);
      return li;
    };
    const bars = (values) => {
      const wrap = document.createElement("span");
      wrap.className = "garage-stat";
      wrap.title = `speed ${values[0]} · pace ${values[1]} · grip ${values[2]}`;
      for (const v of values) {
        for (let i = 0; i < 5; i++) {
          const bar = document.createElement("i");
          if (i < v) bar.className = "on";
          wrap.append(bar);
        }
        const gap = document.createElement("i");
        gap.style.width = "3px";
        gap.style.background = "transparent";
        wrap.append(gap);
      }
      return wrap;
    };
    const trackRows = new Map();
    const buildGarage = (stateOf) => {
      el.racers.replaceChildren(...roster.map((c) => row("racer", c.name, (b) => {
        const name = document.createElement("span");
        name.className = "garage-name";
        name.textContent = c.display;
        const state = document.createElement("span");
        state.className = "roster-state";
        state.dataset.state = stateOf(c.name);
        state.textContent = BL.hud.STATE_LABELS[state.dataset.state];
        b.append(name, state);
      })));
      el.mounts.replaceChildren(...mounts.map((m) => row("mount", m.id, (b) => {
        const name = document.createElement("span");
        name.className = "garage-name";
        name.textContent = m.name;
        b.append(name, bars(m.bars));
      })));
      el.tracks.replaceChildren(...tracks.map((t) => row("track", t.id, (b) => {
        const name = document.createElement("span");
        name.className = "garage-name";
        name.textContent = t.name;
        const medal = document.createElement("span");
        medal.className = "garage-medal";
        const note = document.createElement("span");
        note.className = "garage-note";
        b.append(name, medal, note);
        trackRows.set(t.id, { medal, note });
      })));
      refreshTracks();
      mark("racer");
      mark("mount");
      mark("track");
    };
    const refreshTracks = () => {
      for (const t of tracks) {
        const r = trackRows.get(t.id), b = best()[mirror() ? `${t.id}-m` : t.id];
        const medal = b ? (b.medal || medalFor(t.targets, b.race)) : null;
        r.medal.dataset.medal = medal || "";
        r.medal.textContent = medal ? medal.toUpperCase() : "NEW";
        r.note.textContent = b ? `best ${formatTime(b.race)} · lap ${formatTime(b.lap)} · ${t.laps} laps` : `${t.laps} laps · gold under ${formatTime(t.targets.gold)}`;
      }
    };
    // On touch the minimap sits under the left readout, clear of the stick; mapTop is measured when the strip shows.
    let mapTop = 0;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const measure = () => {
      mapTop = el.strip.hidden ? 0 : el.hudLeft.getBoundingClientRect().bottom + 10;
    };
    on(window, "resize", measure);
    const show = (section) => {
      el.garage.hidden = section !== "garage";
      el.strip.hidden = section !== "race";
      if (section === "race") measure();
      el.results.hidden = section !== "results";
      el.pause.hidden = section !== "pause";
      el.itemBtn.hidden = section !== "race";
      el.garageBtn.hidden = section === "garage";
      if (section !== "race") {
        el.center.hidden = true;
        el.notice.hidden = true;
      }
    };
    let lastRank = -1, lastLap = -1, lastItem = "", lastSpeed = -1, lastBoost = -1, lastTime = -1, lastTier = -1, lastPips = -1;
    const pipNodes = [...el.pips.children];
    const setRank = (rank, field) => {
      if (rank === lastRank) return;
      lastRank = rank;
      el.rank.firstChild.data = String(rank);
      el.rankSuffix.textContent = SUFFIX[rank - 1] || "th";
      el.field.textContent = `/${field}`;
    };
    const setLap = (lap, laps) => {
      if (lap === lastLap) return;
      lastLap = lap;
      el.lap.firstChild.data = String(Math.min(lap, laps));
      el.laps.textContent = `/${laps}`;
    };
    const setTime = (ms) => {
      const tenth = Math.floor(ms / 10);
      if (tenth === lastTime) return;
      lastTime = tenth;
      el.time.firstChild.data = formatTime(ms);
    };
    const setItem = (item, meterFull) => {
      const key = item || (meterFull ? "meter" : "");
      if (key === lastItem) return;
      lastItem = key;
      el.item.dataset.item = item || (meterFull ? "turbo" : "");
      el.itemName.firstChild.data = item ? { rock: "Rock", peel: "Peel", turbo: "Turbo", shout: "Shout" }[item] : meterFull ? "Turbo" : " ";
      el.itemBtn.textContent = item === "peel" ? "Drop" : item === "shout" ? "Shout" : item === "turbo" || meterFull ? "Boost" : "Throw";
    };
    // The drift bar takes the tier's colour as the sparks do; the banana pips fill one at a time.
    const setBoost = (k, full, tier = 0) => {
      const pct = Math.round(k * 100);
      if (pct !== lastBoost) {
        lastBoost = pct;
        el.boost.style.width = `${pct}%`;
        el.boost.classList.toggle("full", !!full);
      }
      if (tier !== lastTier) {
        lastTier = tier;
        el.boost.dataset.tier = String(tier);
      }
    };
    const setPips = (n, full) => {
      const key = n + (full ? 100 : 0);
      if (key === lastPips) return;
      lastPips = key;
      for (let i = 0; i < pipNodes.length; i++) pipNodes[i].dataset.on = i < n ? (full ? "full" : "yes") : "no";
    };
    const setSpeed = (v) => {
      const n = Math.round(v);
      if (n === lastSpeed) return;
      lastSpeed = n;
      el.speed.firstChild.data = String(n);
    };
    let centerTimer = 0, noticeTimer = 0;
    const center = (text, ms = 900) => {
      el.center.firstChild.data = text;
      el.center.hidden = !text;
      window.clearTimeout(centerTimer);
      if (text && ms > 0) centerTimer = window.setTimeout(() => {
        el.center.hidden = true;
      }, ms);
    };
    const notice = (text, ms = 1600) => {
      el.notice.firstChild.data = text;
      el.notice.hidden = !text;
      window.clearTimeout(noticeTimer);
      if (text && ms > 0) noticeTimer = window.setTimeout(() => {
        el.notice.hidden = true;
      }, ms);
    };
    const podiumRow = (r, right) => {
      const li = document.createElement("li");
      if (r.you) li.className = "you";
      const name = document.createElement("span");
      name.textContent = BL.characters.displayOf(r.name) + (r.you ? " (you)" : "");
      const value = document.createElement("span");
      value.textContent = right;
      li.append(name, value);
      return li;
    };
    // Centres a row in a box that scrolls; a box that does not scroll keeps its place.
    const reveal = (box, row) => {
      const top = row.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop;
      box.scrollTop = top - (box.clientHeight - row.offsetHeight) / 2;
    };
    // rows: this race; standings: cup points so far; next: label for the next-race button, or null.
    const results = (rows, summary, { note = "", standings = null, next = null } = {}) => {
      el.podium.replaceChildren(...rows.map((r) => podiumRow(r, r.finished ? `${r.estimated ? "≈ " : ""}${formatTime(r.time)}` : "DNF")));
      el.cupNote.textContent = note;
      el.cupNote.hidden = !note;
      el.standingsHead.hidden = el.standings.hidden = !standings;
      if (standings) el.standings.replaceChildren(...standings.map((r) => podiumRow(r, `${r.points} pts`)));
      el.next.hidden = !next;
      if (next) el.next.textContent = next;
      el.summary.textContent = summary;
      refreshTracks();
      show("results");
      // The tables can be longer than the card, so each opens at the visitor's row, and so does the card.
      const you = el.podium.querySelector(".you");
      reveal(el.podium, you);
      if (standings) reveal(el.standings, el.standings.querySelector(".you"));
      reveal(el.results, you);
    };
    const setCup = (cup) => {
      el.garageCup.hidden = !cup;
      if (cup) {
        el.garageCup.dataset.medal = cup.medal;
        el.garageCup.textContent = `${cup.medal.toUpperCase()} CUP · ${cup.points} pts`;
      }
    };
    // The track's outline is fixed between track builds, so the Path2D is kept and only remade when its
    // key changes (the map's points, size or origin); stroking the same vertices rasterizes identically.
    let mapPath = null, mapKeyPts = null, mapKeySize = 0, mapKeyX0 = 0, mapKeyY0 = 0;
    const minimap = (ctx, track, list, player, w, h) => {
      const size = Math.min(coarse ? 100 : MAP_SIZE, w * 0.28), x0 = MAP_PAD + 8, y0 = coarse ? mapTop : h - size - 30, pts = track.mapPts;
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = "rgba(10,10,11,0.55)";
      ctx.fillRect(x0 - 8, y0 - 8, size + 16, size + 16);
      ctx.strokeStyle = "rgba(243,239,228,0.85)";
      ctx.lineWidth = 3;
      ctx.lineJoin = "round";
      if (pts !== mapKeyPts || size !== mapKeySize || x0 !== mapKeyX0 || y0 !== mapKeyY0) {
        mapKeyPts = pts;
        mapKeySize = size;
        mapKeyX0 = x0;
        mapKeyY0 = y0;
        mapPath = new Path2D();
        for (let i = 0; i < pts.length; i += 2) {
          const px = x0 + pts[i] * size, py = y0 + pts[i + 1] * size;
          if (i === 0) mapPath.moveTo(px, py);
          else mapPath.lineTo(px, py);
        }
        mapPath.closePath();
      }
      ctx.stroke(mapPath);
      for (let i = 0; i < list.length; i++) {
        const r = list[i];
        track.mapPoint(r.x, r.z, MAP_POINT);
        const px = x0 + MAP_POINT.x * size, py = y0 + MAP_POINT.y * size;
        ctx.beginPath();
        ctx.arc(px, py, r === player ? 4.5 : 3, 0, Math.PI * 2);
        ctx.fillStyle = r === player ? "#f5c542" : r.finished ? "#9aa0a6" : "#e04a3a";
        ctx.fill();
        if (r === player) {
          ctx.strokeStyle = "#f5c542";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(px, py, 7, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      ctx.restore();
    };
    const speedLines = (ctx, k, w, h, elapsed) => {
      if (k <= 0) return;
      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,0.8)";
      ctx.lineCap = "round";
      const cx = w / 2, cy = h / 2, radius = Math.hypot(w, h) * 0.5;
      const frame = Math.floor(elapsed * 24);
      for (let i = 0; i < SPEED_LINES; i++) {
        const jitter = ((i * 7919 + frame * 104729) % 1000) / 1000;
        const a = i / SPEED_LINES * Math.PI * 2 + jitter * 0.12;
        const inner = radius * (0.5 + jitter * 0.3);
        ctx.globalAlpha = Math.min(0.6, k * 0.6) * (0.4 + jitter * 0.6);
        ctx.lineWidth = 1.5 + jitter * 3;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
        ctx.lineTo(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius);
        ctx.stroke();
      }
      ctx.restore();
    };
    const dispose = () => {
      window.clearTimeout(centerTimer);
      window.clearTimeout(noticeTimer);
      for (const off of listeners) off();
      el.racers.replaceChildren();
      el.mounts.replaceChildren();
      el.tracks.replaceChildren();
      el.podium.replaceChildren();
      el.standings.replaceChildren();
      show(null);
      el.garageBtn.hidden = true;
      buttons.racer.clear();
      buttons.mount.clear();
      buttons.track.clear();
      trackRows.clear();
    };
    return { el, selection, buildGarage, lockRacer, refreshTracks, show, setRank, setLap, setTime, setItem, setBoost, setPips, setSpeed, center, notice, results, setCup, minimap, speedLines, formatTime, medalFor, dispose };
  };
  BL.raceHud = { create, formatTime, medalFor };
})();
