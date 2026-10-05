---
name: edit-template
description: Change or add a site template (packages/templates/*), the template catalog, or the Portfolio content schema safely, keeping Vite/static builds, the Sandpack preview, the shared zod schema and visual-edit tagging in sync.
---

# Edit site templates or the content schema

Templates are copied into users' repos and also run inside the builder's Sandpack preview. Every change must work in both.

## Adding a template
- **New look for the React template:** add a `[data-theme="<id>"]` block in `packages/templates/portfolio/src/index.css`. Then add the ID to `templateIds` and a `templateCatalog` entry spreading `REACT_PORTFOLIO` (`packages/shared/src/portfolio.ts`). Add it to the `TemplateId` union in the template's `src/content/types.ts`.
- **New template folder:** create `packages/templates/<dir>/`. Add the catalog entry with `kind`, `dir`, `contentPath` and `thumbnail`, and give the content file the exact header that `renderPortfolioSource` emits for its kind (the tests compare headers).
  - Static: root `index.html`, no `src/main.tsx`.
  - React: entry `src/main.tsx`.
- The picker, the preview and the tests pick the template up from the catalog automatically. Add it to `smoke.mjs` if it's a new kind or layout.

## Visual-edit contract
- Tag every element that shows a text field with `data-content="<path>"`, and show the field's text only. Wrap icons outside the tagged element, because the edit overlay replaces the element's text.
- A new editable text field must also be added to `EDITABLE_PATH` in `apps/web/src/features/visual-edit/lib/apply-content-edit.ts`, plus a test case. Otherwise edits to it are rejected.

## Static template rules (`portfolio-static`)
- Plain files served as-is: no npm deps, no TypeScript, no build step. Content is `content/portfolio.js`.
- Render with DOM APIs and `textContent`, never `innerHTML`. Tag content elements with `data-content`, the same as React.
- Plain CSS only. Tailwind is not loaded for static previews.

## React template rules (`portfolio`)
- **Content** lives only in `src/content/portfolio.ts`. Components receive it via props. Every element that renders a content field gets `data-content="<dot.path>"` (array indices included, e.g. `projects.${i}.name`).
- **Schema changes** touch three places together:
  1. `packages/shared/src/portfolio.ts` (zod, the source of truth)
  2. `packages/templates/portfolio/src/content/types.ts` (hand-written mirror). `apps/web/src/features/preview/lib/template-contract.ts` fails typecheck if they differ.
  3. The builder: `apps/web/src/features/builder/lib/{conversation,github-content}.ts` (first draft, GitHub mapping, and a chat step if the user should provide it), plus their tests.
  4. The static template's `main.js` renderer and its sample `content/portfolio.js`.
  If you rename or remove a field, bump the builder store's persist `version` (`features/builder/store.ts`) and add a `migrate` step for saved conversations.
  Also update the sample in `src/content/portfolio.ts`. If you change its header comment or import, update `renderPortfolioSource` in `packages/shared/src/portfolio-source.ts`; a test enforces the match.
- **Styling.** Tailwind v4 utility classes. Theme values are plain CSS variables in `src/index.css` under `[data-theme="<style>"]`, referenced as `bg-(--bg)`, `text-(--muted)`, `rounded-(--radius)`. Don't add `@theme`, `@apply`, `@utility` or plugins. The preview removes `@import "tailwindcss"` and compiles classes with `@tailwindcss/browser`.
- **Dependencies.** Keep the set tiny (react, react-dom, lucide-react; framer-motion is allowed by the plan). Each one is fetched from a CDN in the preview. Pin it in the template's `package.json` and refresh its `bun.lock`.
- Only `src/**` and `package.json` dependencies reach the preview (`toSandboxSetup` in `apps/web/src/features/preview/engine/sandpack-engine.ts`). Entry must stay `src/main.tsx`.

## Verify
1. Standalone build (React template). It's not a workspace member, so build a copy outside the repo:
   ```sh
   S=<scratchpad>/tpl; rm -rf $S; cp -R packages/templates/portfolio $S
   (cd $S && bun install && bun --bun tsc -b && bun --bun vite build)
   ```
   If dependencies changed, copy `$S/bun.lock` back into the template.
2. `bun run build && bun run test` at the repo root (contract + header tests).
3. `verify-web` skill: the preview must reach "Live preview" with the expected text and theme.
