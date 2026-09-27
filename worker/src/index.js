// The Worker in front of Ooga Booga Land: the built page from static assets, GitHub sign-in under
// /auth/*, and the account API under /api/*. Only those two prefixes run this code
// (`run_worker_first` in wrangler.jsonc); every other path is served straight from ../dist.

import { handleApi } from "./api.js";
import { handleAuth } from "./auth.js";
import { purgeExpiredSessions } from "./db.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/auth/")) return handleAuth(request, env, url);
    if (url.pathname.startsWith("/api/")) return handleApi(request, env, url);
    return env.ASSETS.fetch(request);
  },

  // Daily: expired sessions are already refused on read; this keeps the table from growing.
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(purgeExpiredSessions(env.DB));
  },
};
