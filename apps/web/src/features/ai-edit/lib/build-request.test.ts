import { expect, test } from 'bun:test'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import type { AiEditTarget } from '@makable/shared'
import { buildAiEditRequest, pickRelevantFiles, targetLabel } from './build-request'

// The local template copies stand in for the published ones.
function readTemplate(name: string): Record<string, string> {
  const root = join(import.meta.dir, '../../../../../../packages/templates', name)
  const files: Record<string, string> = {}
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry)
      if (entry === 'node_modules' || entry === 'dist') continue
      if (statSync(path).isDirectory()) walk(path)
      else if (/\.(tsx?|jsx?|html|css|json)$/.test(entry)) files[relative(root, path)] = readFileSync(path, 'utf8')
    }
  }
  walk(root)
  return files
}

const react = { kind: 'react', contentPath: 'src/content/portfolio.ts' } as const

const skillChip: AiEditTarget = {
  tag: 'li',
  text: 'TypeScript',
  contentPath: 'skills.0',
  section: { tag: 'section', id: 'skills', heading: 'Skills' },
  selector: 'main > section#skills > ul > li',
  html: '<li data-content="skills.0">TypeScript</li>',
}

test('React template: a click in Skills picks the content file, the Skills component and where it is rendered', () => {
  const files = pickRelevantFiles(readTemplate('portfolio'), skillChip, react)
  const paths = files.map((f) => f.path)
  expect(paths[0]).toBe('src/content/portfolio.ts')
  expect(paths[1]).toBe('src/components/Skills.tsx')
  expect(paths).toContain('src/App.tsx')
  expect(files.find((f) => f.path === 'src/App.tsx')?.reason).toContain('renders <Skills>')
})

test('static template: the same click picks main.js', () => {
  const paths = pickRelevantFiles(readTemplate('portfolio-static'), skillChip, { kind: 'static', contentPath: 'content/portfolio.js' }).map((f) => f.path)
  expect(paths[0]).toBe('content/portfolio.js')
  expect(paths).toContain('main.js')
})

test('without a selection, the page layout and styles are sent', () => {
  const paths = pickRelevantFiles(readTemplate('portfolio'), null, react).map((f) => f.path)
  expect(paths).toEqual(['src/content/portfolio.ts', 'src/App.tsx', 'src/index.css'])
})

test('the request carries the instruction, the target and the file tree', () => {
  const files = readTemplate('portfolio')
  const request = buildAiEditRequest({
    instruction: '  remove the skills section ',
    target: skillChip,
    template: { id: 'minimal', name: 'Minimal', kind: 'react', version: 1, contentPath: 'src/content/portfolio.ts' },
    files,
  })
  expect(request.instruction).toBe('remove the skills section')
  expect(request.target?.section?.id).toBe('skills')
  expect(request.fileTree).toContain('src/components/Skills.tsx')
  expect(() => buildAiEditRequest({ ...request, instruction: ' ', files })).toThrow()
})

test('target labels are short', () => {
  expect(targetLabel(skillChip)).toBe('Skills › skills.0 “TypeScript”')
  expect(targetLabel({ ...skillChip, contentPath: null, section: null, text: 'x'.repeat(50) })).toBe('<li>')
})
