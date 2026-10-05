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
