import { useMemo } from 'react'
import { tagSources } from '../lib/source-tags'
import type { Files } from '../lib/working-copy'

// Tagged files by path and contents: typing changes one file, so only that one is parsed again.
const cache = new Map<string, string>()
const MAX_CACHED = 400

function tagged(path: string, code: string): string {
  const key = `${path}\0${code}`
  const hit = cache.get(key)
  if (hit !== undefined) return hit
  const value = tagSources({ [path]: code })[path]
  if (cache.size >= MAX_CACHED) cache.delete(cache.keys().next().value!)
  cache.set(key, value)
  return value
}

/** The site's files as the preview runs them: tagged with `data-src`. */
export function useTaggedFiles(files: Files): Files {
  return useMemo(() => Object.fromEntries(Object.entries(files).map(([path, code]) => [path, tagged(path, code)])), [files])
}
