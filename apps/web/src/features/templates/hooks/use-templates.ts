import type { TemplateEntry } from '@makable/shared'
import { useQuery } from '@tanstack/react-query'
import { fetchTemplateCatalog, fetchTemplateFiles } from '../api/templates'

const STALE_TIME = 10 * 60 * 1000

/** The published template catalog. */
export function useTemplateCatalog() {
  return useQuery({ queryKey: ['templates', 'catalog'], queryFn: fetchTemplateCatalog, staleTime: STALE_TIME })
}

/** The catalog entry for `id` and its source files. `entry` is undefined while loading or if the ID isn't published. */
export function useTemplate(id: string) {
  const catalog = useTemplateCatalog()
  const entry = catalog.data?.templates.find((t) => t.id === id)
  // Keyed by URL: themes of one React template share the same files.
  const files = useQuery({
    queryKey: ['templates', 'files', entry?.filesUrl],
    queryFn: () => fetchTemplateFiles(entry as TemplateEntry),
    enabled: !!entry,
    staleTime: STALE_TIME,
  })
  return { catalog, entry, files }
}
