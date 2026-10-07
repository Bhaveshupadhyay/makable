import { expect, test } from 'bun:test'
import type { AiEditTarget } from '@makable/shared'
import { buildEditRequest, pickFiles, targetLabel } from './build-edit-request'

const files: Record<string, string> = {
  'package.json': '{}',
  'src/App.tsx': 'export function App() { return <main><Hero /><Skills /></main> }',
  'src/components/Hero.tsx': "import { Section } from './Section'\nimport { links } from '../content/portfolio'\nexport function Hero() { return <Section id=\"hero\" className=\"hero\"><a className=\"btn\">Contact me</a></Section> }",
  'src/components/Section.tsx': 'export function Section({ id, children }) { return <section id={id}>{children}</section> }',
  'src/components/Skills.tsx': 'export function Skills() { return <ul className="list">{skills.map((s, i) => <li data-content={`skills.${i}`}>{s}</li>)}</ul> }',
  'src/index.css': '.btn { color: blue }',
  'src/content/portfolio.ts': 'export const portfolio = {}',
}
const template = { id: 'minimal', name: 'Minimal', kind: 'react' as const, version: 1, contentPath: 'src/content/portfolio.ts' }
const target = (over: Partial<AiEditTarget>): AiEditTarget => ({
  tag: 'a', text: '', contentPath: null, section: null, selector: 'a', html: '<a>x</a>', ...over,
})

test('picks the component that matches the selection, plus the stylesheet and content file', () => {
  const picked = pickFiles(files, target({ text: 'Contact me', html: '<a class="btn">Contact me</a>', section: { tag: 'section', id: 'hero', heading: null } }), template.contentPath)
  // The stylesheet ranks too: it defines the selected element's class.
  expect(picked.map((f) => f.path)).toEqual(['src/components/Hero.tsx', 'src/index.css', 'src/components/Section.tsx', 'src/content/portfolio.ts'])
  expect(picked[0].reason).toContain('text "Contact me"')
  // The matched component's local imports come along, but not the content file twice.
  expect(picked[2].reason).toBe('imported by src/components/Hero.tsx')
})

test('content paths find the component that renders them', () => {
  const picked = pickFiles(files, target({ tag: 'li', contentPath: 'skills.1', text: 'Go', html: '<li data-content="skills.1">Go</li>' }), template.contentPath)
  expect(picked[0]).toMatchObject({ path: 'src/components/Skills.tsx', reason: expect.stringContaining('renders skills') })
})

test('falls back to the entry file without a selection or a match', () => {
  expect(pickFiles(files, null, template.contentPath)[0]).toMatchObject({ path: 'src/App.tsx', reason: 'entry file' })
  expect(pickFiles(files, target({ text: 'nowhere' }), template.contentPath)[0].path).toBe('src/App.tsx')
  const staticFiles = { 'index.html': '<main></main>', 'main.js': '', 'styles.css': '', 'content/portfolio.js': '' }
  expect(pickFiles(staticFiles, null, 'content/portfolio.js').map((f) => f.path)).toEqual(['index.html', 'styles.css', 'content/portfolio.js'])
})

test('skips files that are too large or have unsafe paths', () => {
  const big = { ...files, 'src/components/Hero.tsx': 'Contact me'.repeat(10_000), 'src/../x.ts': 'Contact me' }
  expect(pickFiles(big, target({ text: 'Contact me' }), template.contentPath).map((f) => f.path)).not.toContain('src/components/Hero.tsx')
})

test('buildEditRequest validates and lists the file tree', () => {
  const request = buildEditRequest('Make it green', target({ text: 'Contact me' }), template, files)
  expect(request.fileTree).toContain('src/components/Hero.tsx')
  expect(request.template.contentPath).toBe('src/content/portfolio.ts')
  expect(() => buildEditRequest('   ', null, template, files)).toThrow()
})

test('targetLabel names the section, path and short text', () => {
  expect(targetLabel(target({ tag: 'li', contentPath: 'skills.0', text: 'TypeScript', section: { tag: 'section', id: 'skills', heading: 'Skills' } }))).toBe('Skills › skills.0 “TypeScript”')
  expect(targetLabel(target({ tag: 'h1' }))).toBe('<h1>')
})
