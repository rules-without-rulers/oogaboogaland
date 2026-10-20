// Exercise the actual route modules with a fixture cast, without generating build
// artifacts or importing the Cloudflare host. Only their module boundaries are replaced.
import { readFileSync } from "node:fs";
import { compileFunction } from "node:vm";
import * as cookies from "../src/cookies.js";
import * as crypto from "../src/crypto.js";
import * as db from "../src/db.js";
import { createOwnedCharacterLookup } from "../src/contributor-policy.js";

const load = (name, dependencies, exports) => {
  const url = new URL(`../src/${name}.js`, import.meta.url);
  const source = readFileSync(url, "utf8")
    .replace(/import\s+[\s\S]*?from\s+"[^"]+"(?:\s+with\s*\{[^}]*\})?;/g, "")
    .replace(/export\s+\{[^}]*\}\s+from\s+"[^"]+";/g, "")
    .replace(/export default /g, "const worker = ").replace(/export const /g, "const ");
  return compileFunction(`"use strict";\n${source}\nreturn { ${exports.join(", ")} };`, Object.keys(dependencies), { filename: url.pathname })(...Object.values(dependencies));
};

export const routeFixture = ({ cast = [{ handle: "ooga-dev", github_login: "ooga-dev",
  joined_at: "2026-09-01T00:00:00Z", last_commit_at: "2026-10-01T00:00:00Z" }],
lookup = async () => null, fetcher = async () => { throw new Error("Unexpected network request"); } } = {}) => {
  const access = load("contributor-access", { CAST_ROWS: cast,
    createOwnedCharacterLookup: (rows) => createOwnedCharacterLookup(rows, lookup) }, ["contributorFor"]);
  const http = load("http", { ...cookies, ...db, ...access }, ["json", "text", "redirect", "fromSite", "safeNext",
    "clientIp", "allowed", "sessionToken", "getSessionFromRequest", "getSessionForRemoval"]);
  const auth = load("auth", { ...cookies, ...crypto, ...db, ...http, ...access, fetch: fetcher }, ["handleAuth"]);
  const api = load("api", { ...cookies, ...db, ...http }, ["handleApi"]);
  const donations = load("donations", http, ["handleDonations"]);
  const main = load("index", { ...http, ...db, ...auth, ...api, ...donations }, ["worker"]);
  return { ...http, ...auth, ...api, ...donations, ...main };
};
