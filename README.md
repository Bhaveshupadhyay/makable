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

## Deploying (Cloudflare Pages)

The builder is a static site on Cloudflare Pages. The API ([makable-backend](https://github.com/Bhaveshupadhyay/makable-backend))
runs elsewhere, e.g. `https://api.makable.tech`. The SPA calls it on its own origin (`/api/v1`), because the session
cookies are HttpOnly and scoped to `/api/v1`, so a Pages Function (`functions/api/[[path]].ts`, logic in
`cloudflare/api-proxy.ts`) forwards every `/api/*` request to the API. It passes redirects and `Set-Cookie` back
untouched. Everything else is served as static files, and unknown paths get `index.html` (Pages' SPA fallback).

Cloudflare → Workers & Pages → Create → Pages → connect this repo:

| Setting | Value |
| --- | --- |
| Framework preset | None |
| Build command | `bun install --frozen-lockfile && bun run build` |
| Build output directory | `apps/web/dist` |
| Root directory | (empty: the repo root, where `functions/` is) |

Environment variables (Production, and Preview if you use previews):

| Variable | Value |
| --- | --- |
| `API_ORIGIN` | the API's origin, e.g. `https://api.makable.tech` (no path). Without it `/api/*` answers 500 `api_not_configured`. |
| `BUN_VERSION` | `1.4.2`, the version that writes `bun.lock` (the build image's default is older) |
| `SKIP_DEPENDENCY_INSTALL` | `1`, so Pages doesn't run its own `npm install` (it can't read `workspace:*`); the build command installs with Bun |

Then add your domain (e.g. `makable.tech`) under the project's Custom domains, and on the backend:

- set `APP_URL=https://makable.tech` in its `.env` and restart it (cookies and the sign-in callback use it);
- add `https://makable.tech/api/v1/auth/github/callback` to Supabase → Auth → URL Configuration → Redirect URLs.

If the API's DNS record is also on Cloudflare, keep it **DNS only** (grey cloud): proxied, Cloudflare ends a request
after 100 s, and an AI edit can take longer.

`bun run typecheck` and `bun run test` cover the proxy too (`tsconfig.cloudflare.json`, `cloudflare/*.test.ts`).

