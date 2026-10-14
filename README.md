# makable

An open-source AI website builder. The MVP turns a developer's GitHub profile into a portfolio site deployed to GitHub Pages.

## Layout

- `apps/web`: builder SPA (React 19, Vite, Tailwind v4, TanStack Query, React Router)
- `packages/shared`: zod schemas shared across the stack (portfolio content)
- `packages/templates/portfolio`: the portfolio site template deployed to users' repos

## Development

Requires [Bun](https://bun.sh).

```sh
bun install
cp apps/web/.env.example apps/web/.env.local   # optional: mock GitHub login
bun run dev
```

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

Cloudflare → Workers & Pages → Create → Import a repository → this repo, then under the Worker's Settings → Build:

| Setting | Value |
| --- | --- |
| Build command | `bun install --frozen-lockfile && bun run build` |
| Deploy command | `npx wrangler deploy` (the `wrangler` pinned in `package.json`) |
| Root directory | `/` (the repo root, where `wrangler.jsonc` is) |

Build variables (Settings → Build → Variables and secrets):

| Variable | Value |
| --- | --- |
| `BUN_VERSION` | `1.4.2`, the version that writes `bun.lock` (the build image's default is older) |
| `SKIP_DEPENDENCY_INSTALL` | `1`, so the build doesn't run its own install first; the build command installs with Bun |

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

