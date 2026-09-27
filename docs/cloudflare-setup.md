# Cloudflare setup

The island runs as one Cloudflare Worker, `oogaboogaland`, at https://obl.ruleswithoutrulers.com: the built page from static assets plus GitHub sign-in on D1 (see `docs/auth-and-presence.md`). Everything below is done once; after that a merge to `rock` deploys by itself.

## What exists

| Thing | Name | Set where |
|---|---|---|
| Worker | `oogaboogaland` | `worker/wrangler.jsonc` |
| Custom domain | `obl.ruleswithoutrulers.com` | `routes` in `wrangler.jsonc`, attached on deploy |
| D1 database | `oogaboogaland` | `d1_databases` (`database_id`) |
| Rate limiters | `AUTH_LIMITER` 10 sign-ins a minute per IP; `ROOM_LIMITER` 20 room connections and `VOICE_LIMITER` 120 voice calls a minute per player | `ratelimits` |
| Durable Object | `Room`, one named `island` | `durable_objects`, `migrations` |
| Cron | daily 04:00 UTC, purges expired sessions | `triggers` |
| Vars | `SITE_ORIGIN`, `GITHUB_CLIENT_ID`, `REALTIME_APP_ID` | `vars` |
| Worker secrets | `GITHUB_CLIENT_SECRET`, `REALTIME_SECRET` | `npx wrangler secret put` |
| Realtime SFU app | `oogaboogaland-demo`, its App ID as `vars.REALTIME_APP_ID` | Realtime → Serverless SFU |
| GitHub repo secret | `CLOUDFLARE_API_TOKEN` | repo Settings → Secrets and variables → Actions |
| Workflow | Deploy to Cloudflare | `.github/workflows/deploy-cloudflare.yml` |

## One-time setup

1. **GitHub OAuth Apps** (GitHub → Settings → Developer settings → OAuth Apps), no scopes:
   - production: homepage `https://obl.ruleswithoutrulers.com`, callback `https://obl.ruleswithoutrulers.com/auth/callback`;
   - local: homepage `http://localhost:8787`, callback `http://localhost:8787/auth/callback`.
2. `cd worker && npm ci && npx wrangler login`.
3. `npx wrangler d1 create oogaboogaland`; put its id in `database_id` (wrangler may offer to add a second binding: keep only `DB`).
4. Put the production client id in `vars.GITHUB_CLIENT_ID`; `npx wrangler secret put GITHUB_CLIENT_SECRET`.
5. **Voice.** dash.cloudflare.com → Realtime → Serverless SFU → Create; put the App ID in `vars.REALTIME_APP_ID` and `npx wrangler secret put REALTIME_SECRET` with the App Secret (also `REALTIME_SECRET=` in `.dev.vars` to test voice locally). Without the secret, **Join voice** says voice is unavailable and everything else works.
6. `npm run migrate:remote`, then `npm run deploy`.
7. **Deploy token.** dash.cloudflare.com → My Profile → API Tokens → Create Token → template *Edit Cloudflare Workers*; add *Account → D1 → Edit*; account resources: this account; zone resources: `ruleswithoutrulers.com` only. Save it as the repo secret `CLOUDFLARE_API_TOKEN` (`gh secret set CLOUDFLARE_API_TOKEN --repo rules-without-rulers/oogaboogaland`). If a deploy fails on the custom domain, add *Zone → DNS → Edit* for that zone.
8. On the fork, enable Actions and disable the **Deploy GitHub Pages** workflow (Actions → the workflow → … → Disable). `pages.yml` itself stays as upstream has it.

## Every deploy

`deploy-cloudflare.yml` runs on each push to `rock` and by hand (Actions → Deploy to Cloudflare → Run workflow): unit checks, a fresh jumbotron snapshot, `build:dist`, the Worker's tests, D1 migrations, `wrangler deploy`. It has no cron: once the room exists every deploy drops live sockets, and clients reconnect on their own. By hand from a laptop: `cd worker && npm run deploy`.

## Local development

```sh
cd worker
cp .dev.vars.example .dev.vars   # fill in the local OAuth App's id and secret
npm run migrate:local
npm run dev                      # http://localhost:8787
```

`npm run dev` builds `dist/` and passes `--local-upstream localhost:8787`; without it wrangler reports the production route as the request's origin and the Origin check refuses sign-out. Local D1 lives in `worker/.wrangler/` and never touches production.

## Moving to oogabooga.land

Add the zone to this Cloudflare account, add `{ "pattern": "oogabooga.land", "custom_domain": true }` to `routes`, point a production OAuth App's callback at `https://oogabooga.land/auth/callback`, set `SITE_ORIGIN` and `GITHUB_CLIENT_ID` to match, and deploy. Sessions are per host, so players sign in again on the new domain.
