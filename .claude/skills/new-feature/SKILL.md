---
name: new-feature
description: Add a new product feature to the makable builder SPA (apps/web) using the repo's feature-based folder conventions. Use when starting any new screen or capability, e.g. editor workspace, chat, visual-edit, publish.
---

# Add a feature to apps/web

`CLAUDE.md` and `docs/implementation-plan.md` are the maintainer's private notes: gitignored and only present on their machine. Use them when they exist. In a fresh checkout, skip the steps that mention them and work from the tracked code, the feature `index.ts` files and the other skills.

1. **Scope it.** Confirm the scope with the user. If `docs/implementation-plan.md` exists, find the feature there (sections §A–§C, roadmap §8). Build only what was asked. The user reviews one feature at a time. The product is chat-first: anything that collects input from the user is a step in the builder's reducer (`features/builder/lib/conversation.ts`), not a form.
2. **Create the folder** `apps/web/src/features/<kebab-name>/` with only the subfolders you need:
   - `api/`: network calls. Control plane: `apiFetch` from `@/shared/lib/api-client`. Record any new endpoint in `CLAUDE.md` (if present) under "Control-plane API", and in the PR description.
   - `hooks/`: TanStack Query hooks (`queryKey` arrays start with the feature name).
   - `components/`, `pages/`, plus `store.ts` (Zustand), `types.ts`, `lib/` or `engine/` as needed.
   - `index.ts`: export only what `app/` or other features need.
3. **Imports.** Relative inside the feature. `@/shared/...` for primitives. Other features only via `@/features/<name>` (their `index.ts`). `shared/` must never import a feature. Types shared with the Worker or agent belong in `packages/shared`.
4. **UI.** Reuse `shared/ui` (Button, Input, Textarea, Label, Field). New primitives go in `shared/ui` in the same shadcn new-york style (`cn`, `data-slot`, cva for variants). Icons: lucide-react v1 (no brand icons).
5. **Route.** Wire the page in `apps/web/src/app/router.tsx` under the `RequireAuth` → `AppLayout` branch. To attach to the preview iframe, compose in the page (see `features/builder/components/builder-preview.tsx`): `usePreviewEngine` gives `iframeRef`, and `PreviewPane` has `actions` and `banner` slots. If it pulls in a heavy dependency, lazy-load it through `app/lazy-pages.tsx` and wrap it in `<Suspense>`.
6. **Tests.** Put pure logic in `lib/` with a colocated `*.test.ts` (`bun:test`, relative imports). These are excluded from the app's `tsc` and run by `bun run test`.
7. **Verify.** `bun run build && bun run lint && bun run test` from the repo root, then the `verify-web` skill (extend the smoke script with the new flow).
8. **Document.** If `CLAUDE.md` exists, update its feature table and any contracts. Never `git add -f` it. Then stop and summarize for the user, and propose the next feature.
