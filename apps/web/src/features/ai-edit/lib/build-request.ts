import {
  type AiEditFile,
  type AiEditRequest,
  type AiEditTarget,
  aiEditRequestSchema,
  MAX_FILE_CHARS,
  MAX_FILES,
  SAFE_REPO_PATH,
  type TemplateEntry,
  type TemplateKind,
} from '@makable/shared'

// Turns "what the user asked + what they clicked" into a request with the source files the
// change most likely touches. File picking is a plain text search over the template: it's
// free, and it gives the model a head start; the agent can still read anything in the tree.

type Files = Record<string, string>

const SOURCE = /\.(tsx?|jsx?|html|css)$/
const IGNORED = /(^|\/)__makable\/|\.d\.ts$|(^|\/)vite\.config\./
/** Files that shape the whole page, for requests without a selection. */
const LAYOUT: Record<TemplateKind, string[]> = {
  react: ['src/App.tsx', 'src/index.css'],
  static: ['index.html', 'main.js', 'styles.css'],
}

type Clue = { pattern: RegExp; score: number; reason: string }

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1)

/** Text patterns that point at the source of the selected element. */
function cluesFor(target: AiEditTarget): Clue[] {
  const clues: Clue[] = []
  // `skills.2` → `skills`: the content key, and by convention the component that renders it.
  const key = target.contentPath?.split('.')[0]
  if (key && /^\w+$/.test(key)) {
    clues.push({ pattern: new RegExp(`data-content[^\\n]*\\b${key}\\b`), score: 3, reason: `tags ${key} content` })
    clues.push({ pattern: new RegExp(`<${capitalize(key)}\\b`), score: 2, reason: `renders <${capitalize(key)}>` })
  }
  const id = target.section?.id
  if (id) {
    const quoted = `["'\`]${escape(id)}["'\`]`
    clues.push({ pattern: new RegExp(quoted), score: 3, reason: `defines #${id}` })
    clues.push({ pattern: new RegExp(`[#.]${escape(id)}\\b`), score: 1, reason: `styles #${id}` })
    if (/^[a-z]\w*$/i.test(id)) {
      clues.push({ pattern: new RegExp(`<${capitalize(id)}\\b`), score: 2, reason: `renders <${capitalize(id)}>` })
    }
  }
  const heading = target.section?.heading
  if (heading) {
    clues.push({ pattern: new RegExp(`["'\`>]\\s*${escape(heading)}\\s*["'\`<]`, 'i'), score: 2, reason: `has the "${heading}" heading` })
  }
  return clues
}

/** The content file, plus the source files most likely to need the change. */
export function pickRelevantFiles(
  files: Files,
  target: AiEditTarget | null,
  { contentPath, kind }: Pick<TemplateEntry, 'contentPath' | 'kind'>,
): AiEditFile[] {
  const fits = (path: string) => files[path] !== undefined && files[path].length <= MAX_FILE_CHARS
  const picked: AiEditFile[] = fits(contentPath)
    ? [{ path: contentPath, content: files[contentPath], reason: 'the content file: all copy lives here' }]
    : []

  if (!target) {
    for (const path of LAYOUT[kind]) {
      if (fits(path)) picked.push({ path, content: files[path], reason: path.endsWith('css') ? 'page styles' : 'page layout' })
    }
    return picked.slice(0, MAX_FILES)
  }

  const clues = cluesFor(target)
  const ranked = Object.keys(files)
    .filter((path) => path !== contentPath && SOURCE.test(path) && !IGNORED.test(path) && fits(path))
    .map((path) => {
      const matched = clues.filter((clue) => clue.pattern.test(files[path]))
      return { path, score: matched.reduce((sum, clue) => sum + clue.score, 0), reasons: [...new Set(matched.map((c) => c.reason))] }
    })
    .filter((file) => file.score > 0)
    // Highest score first; ties keep a stable, readable order.
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))

  for (const { path, reasons } of ranked.slice(0, MAX_FILES - picked.length)) {
    picked.push({ path, content: files[path], reason: reasons.join(', ').slice(0, 200) })
  }
  return picked
}

type BuildOptions = {
  instruction: string
  target: AiEditTarget | null
  template: Pick<TemplateEntry, 'id' | 'name' | 'kind' | 'version' | 'contentPath'>
  /** The project as the preview runs it (template files + generated content file). */
  files: Files
}

/** The request body for `POST /api/ai/edit`. Validated here too, so oversized input fails before sending. */
export function buildAiEditRequest({ instruction, target, template, files }: BuildOptions): AiEditRequest {
  const { id, name, kind, version, contentPath } = template
  return aiEditRequestSchema.parse({
    instruction,
    target,
    template: { id, name, kind, version, contentPath },
    fileTree: Object.keys(files).filter((path) => SAFE_REPO_PATH.test(path) && !IGNORED.test(path)).sort().slice(0, 500),
    files: pickRelevantFiles(files, target, template),
  })
}

/** Short label for a selection, e.g. `Skills › skills.0 “TypeScript”`. */
export function targetLabel(target: AiEditTarget): string {
  const section = target.section && (target.section.heading || target.section.id || target.section.tag)
  const element = target.contentPath ?? `<${target.tag}>`
  const text = target.text && target.text.length <= 40 ? ` “${target.text}”` : ''
  return [section, element].filter(Boolean).join(' › ') + text
}
