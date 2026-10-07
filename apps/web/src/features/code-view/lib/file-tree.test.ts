import { expect, test } from 'bun:test'
import { buildFileTree, defaultFile, fileKind } from './file-tree'

test('builds a sorted tree, folders first', () => {
  const tree = buildFileTree(['src/main.tsx', 'package.json', 'src/components/Hero.tsx', 'index.html', 'src/App.tsx'])
  expect(tree.map((n) => n.name)).toEqual(['src', 'index.html', 'package.json'])
  const src = tree[0]
  expect(src.type === 'dir' && src.children.map((n) => `${n.type}:${n.path}`)).toEqual([
    'dir:src/components',
    'file:src/App.tsx',
    'file:src/main.tsx',
  ])
})

test('opens the entry file first', () => {
  expect(defaultFile(['src/main.tsx', 'src/App.tsx'])).toBe('src/App.tsx')
  expect(defaultFile(['styles.css', 'index.html'])).toBe('index.html')
  expect(defaultFile(['b.txt', 'a.txt'])).toBe('a.txt')
  expect(defaultFile([])).toBeNull()
})

test('maps extensions to editor languages', () => {
  expect(fileKind('src/App.tsx')).toMatchObject({ language: 'typescript', badge: 'TSX' })
  expect(fileKind('styles.CSS').language).toBe('css')
  expect(fileKind('LICENSE').language).toBe('plaintext')
})
