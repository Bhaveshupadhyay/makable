// The browser's working copy of a site: the files at the commit it's based on, with the user's unsaved edits over
// them (`dirty`: path → new contents, or null for a deleted file). Pure helpers, so they're easy to test.

export type Files = Record<string, string>
export type Changes = Record<string, string | null>

/** The site as the user sees it: the base files with the unsaved edits applied. */
export function workingFiles(base: Files, dirty: Changes): Files {
  if (Object.keys(dirty).length === 0) return base
  const files = { ...base }
  for (const [path, content] of Object.entries(dirty)) {
    if (content === null) delete files[path]
    else files[path] = content
  }
  return files
}

/** Records an edit. An edit back to what the base has is no longer an edit. */
export function recordEdit(base: Files, dirty: Changes, path: string, content: string | null): Changes {
  const next = { ...dirty }
  const same = content === null ? !(path in base) : base[path] === content
  if (same) delete next[path]
  else next[path] = content
  return next
}

/** What a save sends: the edited files and the deleted paths. */
export function savePlan(dirty: Changes): { files: Files; deletes: string[] } {
  const files: Files = {}
  const deletes: string[] = []
  for (const [path, content] of Object.entries(dirty)) {
    if (content === null) deletes.push(path)
    else files[path] = content
  }
  return { files, deletes }
}

/** The base after `changes` were committed on top of it. */
export function applyChanges(base: Files, changes: Changes): Files {
  return workingFiles(base, changes)
}

/** The unsaved edits after a save of `sent`: what was saved is gone, unless it was edited again meanwhile. */
export function afterSave(dirty: Changes, sent: Changes): Changes {
  const next: Changes = {}
  for (const [path, content] of Object.entries(dirty)) {
    if (!(path in sent) || sent[path] !== content) next[path] = content
  }
  return next
}
