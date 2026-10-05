// Compile-time check that the template's content type matches the shared schema.
// If this file fails to typecheck, update packages/templates/portfolio/src/content/types.ts.
import type { Portfolio } from '@makable/shared'
import type { Portfolio as TemplatePortfolio } from '@templates/portfolio/src/content/types'

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false

export const templateMatchesSchema: Equal<Portfolio, TemplatePortfolio> = true
