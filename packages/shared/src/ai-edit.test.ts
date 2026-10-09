import { expect, test } from 'bun:test'
import { type AiEditRequest, aiEditRequestSchema } from './ai-edit'

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
  history: [{ instruction: 'Make the skills bold', target: 'Skills › skills.0 “TypeScript”', reply: 'Made the skills bold.' }],
}

test('requests are validated: unsafe paths and oversized fields are rejected', () => {
  expect(aiEditRequestSchema.safeParse(request).success).toBe(true)
  expect(aiEditRequestSchema.safeParse({ ...request, instruction: '   ' }).success).toBe(false)
  const badPath = { ...request, files: [{ ...request.files[0], path: '../secrets' }] }
  expect(aiEditRequestSchema.safeParse(badPath).success).toBe(false)
  const bigHtml = { ...request, target: { ...request.target, html: 'x'.repeat(5000) } }
  expect(aiEditRequestSchema.safeParse(bigHtml).success).toBe(false)
  const longHistory = { ...request, history: Array.from({ length: 11 }, () => request.history[0]) }
  expect(aiEditRequestSchema.safeParse(longHistory).success).toBe(false)
})
