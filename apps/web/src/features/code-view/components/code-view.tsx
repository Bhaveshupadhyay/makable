import Editor, { type BeforeMount, type OnMount } from '@monaco-editor/react'
import { ChevronDown, ChevronRight, Files, LoaderCircle, Lock, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useMediaQuery } from '@/shared/hooks/use-media-query'
import { cn } from '@/shared/lib/cn'
import { buildFileTree, defaultFile, fileKind, type TreeNode } from '../lib/file-tree'

type CodeViewProps = {
  /** Repo path → contents. Updates live (e.g. after an AI edit). */
  files: Record<string, string>
  /** Files changed by AI edits, marked like modified files in git. */
  modified?: ReadonlySet<string>
  /** Shown as the Explorer's root folder. */
  projectName: string
}

const NONE: ReadonlySet<string> = new Set()
const MODIFIED = '#e2c08d'
const FONT = 'Menlo, Monaco, "SF Mono", Consolas, "Courier New", monospace'

/**
 * The project's source in a read-only, VS Code-style editor: activity bar, Explorer, tabs,
 * breadcrumb, Monaco (loaded from a CDN on first use) and a status bar. Always dark, like an IDE.
 */
export function CodeView({ files, modified = NONE, projectName }: CodeViewProps) {
  const paths = useMemo(() => Object.keys(files), [files])
  const tree = useMemo(() => buildFileTree(paths), [paths])
  const wide = useMediaQuery('(min-width: 640px)')
  const [explorerOpen, setExplorerOpen] = useState<boolean | null>(null)
  const showExplorer = explorerOpen ?? wide
  const [tabs, setTabs] = useState<string[]>([])
  const [active, setActive] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(NONE)
  const [cursor, setCursor] = useState({ line: 1, column: 1 })

  // Files can disappear (e.g. a template switch), so tabs and the active file are derived.
  const current = active && active in files ? active : (tabs.find((p) => p in files) ?? defaultFile(paths))
  const openTabs = tabs.filter((p) => p in files)
  const shownTabs = current && !openTabs.includes(current) ? [...openTabs, current] : openTabs

  function open(path: string) {
    setTabs(shownTabs.includes(path) ? shownTabs : [...shownTabs, path])
    setActive(path)
  }

  function close(path: string) {
    const index = shownTabs.indexOf(path)
    const rest = shownTabs.filter((p) => p !== path)
    setTabs(rest)
    if (path === current) setActive(rest[Math.min(index, rest.length - 1)] ?? null)
  }

  function toggleDir(path: string) {
    const next = new Set(collapsed)
    if (next.has(path)) next.delete(path)
    else next.add(path)
    setCollapsed(next)
  }

  const onMount: OnMount = (editor) => {
    const update = () => {
      const position = editor.getPosition()
      if (position) setCursor({ line: position.lineNumber, column: position.column })
    }
    editor.onDidChangeCursorPosition(update)
    editor.onDidChangeModel(update)
  }

  const kind = current ? fileKind(current) : null

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#1e1e1e] text-[13px] text-[#cccccc]" style={{ colorScheme: 'dark' }}>
      <div className="flex min-h-0 flex-1">
        {/* Activity bar */}
        <div className="flex w-12 shrink-0 flex-col items-center border-r border-[#2b2b2b] bg-[#333333] py-1">
          <button
            type="button"
            aria-label="Explorer"
            aria-pressed={showExplorer}
            title="Explorer"
            onClick={() => setExplorerOpen(!showExplorer)}
            className={cn(
              'flex h-12 w-12 items-center justify-center border-l-2 text-[#858585] hover:text-white',
              showExplorer ? 'border-white text-white' : 'border-transparent',
            )}
          >
            <Files className="size-6" strokeWidth={1.5} />
          </button>
        </div>

        {showExplorer && (
          <nav aria-label="Explorer" className="flex w-56 shrink-0 flex-col border-r border-[#2b2b2b] bg-[#252526]">
            <div className="flex h-9 shrink-0 items-center px-5 text-[11px] tracking-wide text-[#bbbbbb] uppercase">Explorer</div>
            <div className="flex h-[22px] shrink-0 items-center gap-0.5 px-1 text-[11px] font-bold tracking-wide uppercase">
              <ChevronDown className="size-4" />
              <span className="truncate">{projectName}</span>
            </div>
            <ul role="tree" aria-label="Files" className="min-h-0 flex-1 overflow-y-auto pb-4">
              {tree.map((node) => (
                <TreeItem key={node.path} node={node} depth={0} current={current} collapsed={collapsed} modified={modified} onOpen={open} onToggle={toggleDir} />
              ))}
            </ul>
          </nav>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Tabs */}
          <div role="tablist" aria-label="Open files" className="flex h-9 shrink-0 overflow-x-auto bg-[#252526] [scrollbar-width:none]">
            {shownTabs.map((path) => {
              const selected = path === current
              const tabKind = fileKind(path)
              return (
                <div
                  key={path}
                  role="tab"
                  aria-selected={selected}
                  title={path}
                  className={cn(
                    'group flex shrink-0 cursor-pointer items-center gap-1.5 border-r border-[#252526] pr-1.5 pl-3 select-none',
                    selected ? 'border-t border-t-[#0078d4] bg-[#1e1e1e] text-white' : 'border-t border-t-transparent bg-[#2d2d2d] text-[#969696]',
                  )}
                  onClick={() => open(path)}
                  onAuxClick={(e) => e.button === 1 && close(path)}
                >
                  <Badge kind={tabKind} />
                  <span style={modified.has(path) ? { color: MODIFIED } : undefined}>{path.split('/').pop()}</span>
                  <button
                    type="button"
                    aria-label={`Close ${path}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      close(path)
                    }}
                    className={cn(
                      'ml-1 rounded p-0.5 hover:bg-[#ffffff1f]',
                      selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
                    )}
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              )
            })}
          </div>

          {current && kind ? (
            <>
              {/* Breadcrumb */}
              <div aria-label="Breadcrumb" className="flex h-[22px] shrink-0 items-center gap-0.5 overflow-hidden px-4 text-[12px] whitespace-nowrap text-[#a9a9a9]">
                {current.split('/').map((part, i, all) => (
                  <span key={i} className="flex items-center gap-0.5">
                    {i > 0 && <ChevronRight className="size-3.5 opacity-60" />}
                    {i === all.length - 1 && <Badge kind={kind} />}
                    <span className={i === all.length - 1 ? 'text-[#cccccc]' : undefined}>{part}</span>
                  </span>
                ))}
              </div>
              <div className="min-h-0 flex-1">
                <Editor
                  theme="vs-dark"
                  path={current}
                  language={kind.language}
                  value={files[current]}
                  beforeMount={configureMonaco}
                  onMount={onMount}
                  loading={
                    <span className="flex items-center gap-2 text-xs text-[#858585]">
                      <LoaderCircle className="size-4 animate-spin" /> Loading editor…
                    </span>
                  }
                  options={{
                    readOnly: true,
                    readOnlyMessage: { value: 'Code is read-only here. Ask the AI, or edit text in the preview.' },
                    fontFamily: FONT,
                    fontSize: 13,
                    lineHeight: 20,
                    tabSize: 2,
                    minimap: { enabled: wide },
                    scrollBeyondLastLine: false,
                    smoothScrolling: true,
                    automaticLayout: true,
                    padding: { top: 6 },
                    renderLineHighlight: 'all',
                    bracketPairColorization: { enabled: true },
                    guides: { bracketPairs: true, indentation: true },
                    stickyScroll: { enabled: true },
                  }}
                />
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-[#6e6e6e]">Open a file from the Explorer.</div>
          )}
        </div>
      </div>

      {/* Status bar */}
      <div role="status" className="flex h-[22px] shrink-0 items-center justify-between gap-3 bg-[#007acc] px-2 text-[12px] text-white">
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <Lock className="size-3" /> Read-only
          </span>
          {modified.size > 0 && (
            <span>
              {modified.size} {modified.size === 1 ? 'file' : 'files'} changed by AI
            </span>
          )}
        </span>
        {current && kind && (
          <span className="flex items-center gap-3 whitespace-nowrap">
            <span>
              Ln {cursor.line}, Col {cursor.column}
            </span>
            <span className="hidden sm:inline">Spaces: 2</span>
            <span className="hidden sm:inline">UTF-8</span>
            <span className="hidden sm:inline">LF</span>
            <span>{kind.label}</span>
          </span>
        )}
      </div>
    </div>
  )
}

type TreeItemProps = {
  node: TreeNode
  depth: number
  current: string | null
  collapsed: ReadonlySet<string>
  modified: ReadonlySet<string>
  onOpen: (path: string) => void
  onToggle: (path: string) => void
}

function TreeItem({ node, depth, current, collapsed, modified, onOpen, onToggle }: TreeItemProps) {
  const indent = { paddingLeft: 8 + depth * 12 }
  if (node.type === 'dir') {
    const open = !collapsed.has(node.path)
    const changed = [...modified].some((p) => p.startsWith(`${node.path}/`))
    return (
      <li role="treeitem" aria-expanded={open} aria-selected={false}>
        <button
          type="button"
          onClick={() => onToggle(node.path)}
          style={{ ...indent, color: changed ? MODIFIED : undefined }}
          className="flex h-[22px] w-full items-center gap-0.5 pr-3 text-left hover:bg-[#2a2d2e]"
        >
          {open ? <ChevronDown className="size-4 shrink-0" /> : <ChevronRight className="size-4 shrink-0" />}
          <span className="flex-1 truncate">{node.name}</span>
          {changed && <span className="size-1.5 rounded-full" style={{ background: MODIFIED }} />}
        </button>
        {open && (
          <ul role="group">
            {node.children.map((child) => (
              <TreeItem key={child.path} node={child} depth={depth + 1} current={current} collapsed={collapsed} modified={modified} onOpen={onOpen} onToggle={onToggle} />
            ))}
          </ul>
        )}
      </li>
    )
  }
  const selected = node.path === current
  const changed = modified.has(node.path)
  return (
    <li role="treeitem" aria-selected={selected}>
      <button
        type="button"
        onClick={() => onOpen(node.path)}
        title={node.path}
        style={{ paddingLeft: 8 + depth * 12 + 18, color: changed ? MODIFIED : undefined }}
        className={cn('flex h-[22px] w-full items-center gap-1.5 pr-3 text-left', selected ? 'bg-[#37373d] text-white' : 'hover:bg-[#2a2d2e]')}
      >
        <Badge kind={fileKind(node.path)} />
        <span className="flex-1 truncate">{node.name}</span>
        {changed && (
          <span title="Changed by AI" className="text-[11px] font-semibold">
            M
          </span>
        )}
      </button>
    </li>
  )
}

/** The small coloured file-type mark editors show before a file name. */
function Badge({ kind }: { kind: ReturnType<typeof fileKind> }) {
  return (
    <span aria-hidden className="w-6 shrink-0 text-center font-mono text-[9px] leading-none font-bold" style={{ color: kind.color }}>
      {kind.badge}
    </span>
  )
}

// The preview has no type information, so the TypeScript service would flag every import.
// Highlighting doesn't need it: turn diagnostics off and let it parse JSX.
const configureMonaco: BeforeMount = (monaco) => {
  const ts = monaco.typescript
  if (!ts) return
  for (const defaults of [ts.typescriptDefaults, ts.javascriptDefaults]) {
    defaults.setDiagnosticsOptions({ noSemanticValidation: true, noSyntaxValidation: true })
    defaults.setCompilerOptions({ jsx: ts.JsxEmit.Preserve, target: ts.ScriptTarget.ESNext, allowJs: true, allowNonTsExtensions: true })
  }
}
