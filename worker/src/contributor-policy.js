// Shared by the merge-time character generator and the Worker's sign-in fallback.
// Oogatron is the authority; never infer an identity from a display name or email.
import "../../src/js/contributor-identities.js";
export const STATS_URL = "https://oogatron.wickedsmartbitcoin.workers.dev/v2/stats";
export const MAX_CHARACTERS = 128;
export const LOGIN = /^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$/i;
// Oogatron currently includes AI author aliases as ordinary logins. Keep exact
// exclusions here (not substring guesses: a human may have "bot" in their name).
export const EXCLUDED = new Set(["claude", "codex", "copilot", "github-actions", "dependabot", "renovate"]);
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const time = (value) => typeof value === "string" && ISO.test(value) ? Date.parse(value) : NaN;

export const contributorRows = (stats, now = Date.now()) => {
  const generated = time(stats?.meta?.generated_at);
  if (stats?.meta?.schema_version !== 3 || stats.meta.org?.toLowerCase() !== "oogaboogax"
    || !Number.isFinite(generated) || generated > now + 60000 || now - generated > 86400000
    || !Array.isArray(stats.contributors) || stats.contributors.length > 4096) throw new Error("Invalid or stale Oogatron contributor snapshot");
  stats = globalThis.BL.contributorIdentities.normalizeStats(stats, now);
  const rows = new Map();
  for (const row of stats.contributors) {
    if (!row || typeof row.login !== "string" || !LOGIN.test(row.login) || row.login.includes("--")) continue;
    if (!Number.isSafeInteger(row.counts?.commits) || row.counts.commits < 1) continue;
    const handle = row.login.toLowerCase();
    if (EXCLUDED.has(handle) || row.is_bot === true || row.isBot === true
      || row.type !== undefined && row.type !== "User") continue;
    const first = time(row.first_seen_at), last = time(row.last_seen_at);
    if (!Number.isFinite(first) || !Number.isFinite(last) || first <= 0 || first > last || last > now) continue;
    const joined = Math.floor(first / 1000), lastCommit = Math.floor(last / 1000);
    const previous = rows.get(handle);
    if (previous) {
      previous.joined = Math.min(previous.joined, joined);
      previous.lastCommit = Math.max(previous.lastCommit, lastCommit);
    } else rows.set(handle, { handle, joined, lastCommit });
  }
  return [...rows.values()].sort((a, b) => a.handle < b.handle ? -1 : a.handle > b.handle ? 1 : 0);
};

export const readContributorSnapshot = async (fetcher = fetch) => {
  const response = await fetcher(STATS_URL, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(4000) });
  if (!response.ok) throw new Error(`Oogatron returned ${response.status}`);
  // Bound the body while reading it, not after allocating an arbitrarily large response.
  const reader = response.body.getReader(), chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2 * 1024 * 1024) throw new Error("Oogatron snapshot is too large");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(bytes));
};

// One bounded cache per Worker isolate; refresh only on a signed-in request.
// Failed refreshes retain verified rows only until their snapshot is 24 hours old.
// Unknown logins still fail closed; bundled owners never need this lookup.
export const createContributorLookup = (fetcher = fetch, clock = Date.now) => {
  let rows = new Map(), until = 0, expires = 0, pending = null;
  return async (login) => {
    if (typeof login !== "string" || !LOGIN.test(login)) return null;
    if (clock() >= until && !pending) pending = (async () => {
      try {
        const snapshot = await readContributorSnapshot(fetcher);
        rows = new Map(contributorRows(snapshot, clock()).map((row) => [row.handle, row]));
        expires = time(snapshot.meta.generated_at) + 86400000;
        until = clock() + 60000;
      } catch {
        if (clock() >= expires) rows.clear();
        until = clock() + 15000;
      } finally { pending = null; }
    })();
    if (pending) await pending;
    return clock() < expires ? rows.get(login.toLowerCase()) || null : null;
  };
};

// The generated cast owns its handles, including aliases. A GitHub account with an
// alias's spelling cannot obtain a temporary character under somebody else's name.
export const createOwnedCharacterLookup = (cast, lookup = createContributorLookup()) => {
  const owners = new Map(), handles = new Set();
  for (const row of cast) {
    handles.add(row.handle.toLowerCase());
    owners.set(String(row.github_login || row.handle).toLowerCase(), {
      handle: row.handle, joined: Math.floor(Date.parse(row.joined_at) / 1000),
      lastCommit: Math.floor(Date.parse(row.last_commit_at) / 1000),
    });
  }
  return async (login) => {
    if (typeof login !== "string" || !LOGIN.test(login) || login.includes("--")) return null;
    const key = login.toLowerCase(), own = owners.get(key);
    if (own) return own;
    if (handles.has(key)) return null;
    return lookup(login);
  };
};
