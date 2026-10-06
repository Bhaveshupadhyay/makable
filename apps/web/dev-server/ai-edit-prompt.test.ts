import { expect, test } from 'bun:test'
import type { AiEditRequest } from '@makable/shared'
import { buildAiEditPrompt } from './ai-edit-prompt'

const request: AiEditRequest = {
  instruction: 'Remove the skills section',
  target: {
    tag: 'li',
    text: 'TypeScript',
    contentPath: 'skills.0',
    section: { tag: 'section', id: 'skills', heading: 'Skills' },
    selector: 'main > section#skills > ul > li:nth-of-type(1)',
    html: '<li data-content="skills.0">TypeScript</li>',
  },
  template: { id: 'minimal', name: 'Minimal', kind: 'react', version: 1, contentPath: 'src/content/portfolio.ts' },
  fileTree: ['src/App.tsx', 'src/components/Skills.tsx', 'src/content/portfolio.ts'],
  files: [{ path: 'src/components/Skills.tsx', content: 'export function Skills() {}', reason: 'renders section#skills' }],
}

test('the prompt carries the instruction, the clicked element, its section and the files', () => {
  const { system, messages } = buildAiEditPrompt(request)
  expect(system).toContain('data-content')
  expect(messages).toHaveLength(1)
  const prompt = messages[0]!.content
  expect(prompt).toContain('<instruction>\nRemove the skills section\n</instruction>')
  expect(prompt).toContain('- Element: <li> showing "TypeScript"')
  expect(prompt).toContain('- Inside: <section id="skills"> with heading "Skills"')
  expect(prompt).toContain('- Content: skills.0 in src/content/portfolio.ts')
  expect(prompt).toContain('<file path="src/components/Skills.tsx" reason="renders section#skills">')
  expect(prompt).toContain('src/App.tsx\nsrc/components/Skills.tsx')
})

test('the system prompt does not change between requests, so it can be cached', () => {
  const other = buildAiEditPrompt({ ...request, instruction: 'Make it blue', target: null })
  expect(other.system).toBe(buildAiEditPrompt(request).system)
  expect(other.messages[0]!.content).toContain('<selected_element>none')
})
