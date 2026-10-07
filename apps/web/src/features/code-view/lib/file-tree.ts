export type TreeNode = { type: 'dir'; name: string; path: string; children: TreeNode[] } | { type: 'file'; name: string; path: string }

/** Repo paths → a folder tree, folders first, each level sorted by name like an editor's explorer. */
export function buildFileTree(paths: string[]): TreeNode[] {
  const root: TreeNode[] = []
  for (const path of paths) {
    const parts = path.split('/')
    let level = root
    for (const [i, name] of parts.entries()) {
      const nodePath = parts.slice(0, i + 1).join('/')
      if (i === parts.length - 1) {
        level.push({ type: 'file', name, path: nodePath })
        break
      }
      let dir = level.find((n): n is Extract<TreeNode, { type: 'dir' }> => n.type === 'dir' && n.name === name)
      if (!dir) {
        dir = { type: 'dir', name, path: nodePath, children: [] }
        level.push(dir)
      }
      level = dir.children
    }
  }
  return sortTree(root)
}

function sortTree(nodes: TreeNode[]): TreeNode[] {
  nodes.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1))
  for (const node of nodes) if (node.type === 'dir') sortTree(node.children)
  return nodes
}

/** The file to open first: the app's entry, else the first file. */
export function defaultFile(paths: string[]): string | null {
  return ['src/App.tsx', 'src/App.jsx', 'index.html', 'src/main.tsx'].find((p) => paths.includes(p)) ?? [...paths].sort()[0] ?? null
}

type FileKind = { language: string; label: string; badge: string; color: string }

const KINDS: Record<string, FileKind> = {
  tsx: { language: 'typescript', label: 'TypeScript JSX', badge: 'TSX', color: '#3b9edd' },
  ts: { language: 'typescript', label: 'TypeScript', badge: 'TS', color: '#3b9edd' },
  jsx: { language: 'javascript', label: 'JavaScript JSX', badge: 'JSX', color: '#e8c547' },
  js: { language: 'javascript', label: 'JavaScript', badge: 'JS', color: '#e8c547' },
  mjs: { language: 'javascript', label: 'JavaScript', badge: 'JS', color: '#e8c547' },
  css: { language: 'css', label: 'CSS', badge: '#', color: '#5ea7e6' },
  html: { language: 'html', label: 'HTML', badge: '<>', color: '#e37933' },
  json: { language: 'json', label: 'JSON', badge: '{}', color: '#cbcb41' },
  md: { language: 'markdown', label: 'Markdown', badge: 'M↓', color: '#519aba' },
  svg: { language: 'xml', label: 'SVG', badge: 'SVG', color: '#ffb13b' },
}
const PLAIN: FileKind = { language: 'plaintext', label: 'Plain Text', badge: '≡', color: '#8a8a8a' }

/** Editor language, status-bar label and explorer badge for a file, by extension. */
export function fileKind(path: string): FileKind {
  const ext = /\.([a-z0-9]+)$/i.exec(path)?.[1].toLowerCase()
  return (ext && KINDS[ext]) || PLAIN
}
