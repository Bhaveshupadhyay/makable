import { templateCatalogSchema, type TemplateCatalog, type TemplateEntry } from '@makable/shared'
import { parseTemplateFiles, type TemplateFiles } from '../lib/template-files'

// Templates are published from their own repo to GitHub Pages (public, CORS-enabled).
const CATALOG_URL =
  import.meta.env.VITE_TEMPLATE_CATALOG_URL || 'https://bhaveshupadhyay.github.io/makable-templates/catalog.json'

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`)
  return res.json()
}

export async function fetchTemplateCatalog(): Promise<TemplateCatalog> {
  return templateCatalogSchema.parse(await getJson(CATALOG_URL))
}

/** The template's text files; binary assets are referenced from its hosted demo. */
export async function fetchTemplateFiles(template: Pick<TemplateEntry, 'filesUrl' | 'demoUrl'>): Promise<TemplateFiles> {
  // The demo URL may carry a query (`?theme=minimal`); assets live in its folder.
  return parseTemplateFiles(await getJson(template.filesUrl), new URL('./', template.demoUrl).href)
}
