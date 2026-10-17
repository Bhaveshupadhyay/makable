# makable

An open-source AI website builder. Describe a site and makable builds it as React + Tailwind code in a repo on your
GitHub; change it by chatting, clicking text in the preview or editing the code, then publish it to GitHub Pages,
Vercel, Cloudflare Pages or Netlify.

## Layout

- `apps/web`: builder SPA (React 19, Vite, Tailwind v4, TanStack Query, React Router)
- `packages/shared`: the AI request contract shared with makable-backend (zod schemas and types)

## Development

Requires [Bun](https://bun.sh).

```sh
bun install
cp apps/web/.env.example apps/web/.env.local   # optional
bun run dev
```

Building sites needs [makable-backend](https://github.com/Bhaveshupadhyay/makable-backend) running on port 8787 (the dev
server proxies `/api` to it) and a GitHub sign-in: each site is a repo on the user's GitHub.

## Deploying (Cloudflare Workers)

The builder is a Cloudflare Worker with static assets (`wrangler.jsonc`). The API
([makable-backend](https://github.com/Bhaveshupadhyay/makable-backend)) runs elsewhere, e.g. `https://api.makable.tech`.
The SPA calls it on its own origin (`/api/v1`), because the session cookies are HttpOnly and scoped to `/api/v1`, so
the Worker (`cloudflare/worker.ts`, logic in `cloudflare/api-proxy.ts`) forwards every `/api/*` request to the API
(`run_worker_first`). It passes redirects and `Set-Cookie` back untouched. Everything else is served from
`apps/web/dist` without running the Worker, and paths with no file get `index.html` (`single-page-application`).

`wrangler.jsonc` sets the Worker's name, `API_ORIGIN` (only https is accepted; plain http only for `localhost`) and the
`enable_request_signal` flag, which lets Stop in the AI box abort the request to the API so the backend stops the model
call. The `name` must match the Worker's name in the dashboard.

### Deploys run from GitHub Actions

`.github/workflows/ci-cd.yml` checks every pull request and push to `main` (lint, typecheck, tests, build). Merging to
`main` doesn't deploy. To deploy `main`, push a commit whose message has `[deploy]`:

```sh
git switch main && git pull
git commit --allow-empty -m "Deploy [deploy]" && git push
```

or run the workflow by hand (Actions → CI/CD → Run workflow on `main`, or `gh workflow run ci-cd.yml --ref main`).
The deploy job builds the SPA and runs `wrangler deploy` (the version pinned in `package.json`).

Once, on Cloudflare:

1. Create the Worker if it doesn't exist (Workers & Pages → Create), named as in `wrangler.jsonc` (`makable`). If it's
   connected to this repo (Settings → Build → Git repository), **disconnect** it, or Cloudflare deploys every push to
   `main` itself.
2. My Profile → API Tokens → Create Token → template **Edit Cloudflare Workers**, limited to your account (and the
   zone of your custom domain). Copy the token.
3. Copy your Account ID (Workers & Pages overview, right side).

Once, on GitHub: Repo → Settings → Environments → new environment **`production`** (add required reviewers to approve
each deploy), with the secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.

To deploy from your machine instead: `bun run build && bun --bun wrangler deploy`.

Then add your domain (e.g. `makable.tech`) under the Worker's Settings → Domains & Routes → Custom domain, and on the backend:

- set `APP_URL=https://makable.tech` in its `.env` and restart it (cookies and the sign-in callback use it);
- add `https://makable.tech/api/v1/auth/github/callback` to Supabase → Auth → URL Configuration → Redirect URLs.

If the API's DNS record is also on Cloudflare, keep it **DNS only** (grey cloud). Proxied, Cloudflare ends a request
that waits more than 125 s for the origin (524; only Enterprise zones can raise it), and an AI edit can take up to
~180 s (two model calls of up to 90 s). The trade-off: DNS only publishes the server's IP and skips Cloudflare's
proxy protections (WAF, DDoS mitigation, caching) for the API; the API then relies on the server's own Nginx, TLS
and firewall.

`bun run typecheck` and `bun run test` cover the Worker too (`tsconfig.cloudflare.json`, `cloudflare/*.test.ts`).

