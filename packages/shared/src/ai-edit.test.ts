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

test('a request may name one of the user\'s models', () => {
  const keyId = '6f1c2a9e-3b4d-4e5f-8a7b-9c0d1e2f3a4b'
  expect(aiEditRequestSchema.safeParse({ ...request, model: { keyId, model: 'meta-llama/llama-3.3-70b:free' } }).success).toBe(true)
  expect(aiEditRequestSchema.safeParse({ ...request, model: { keyId, model: 'has space' } }).success).toBe(false)
  expect(aiEditRequestSchema.safeParse({ ...request, model: { keyId: 'nope', model: 'gpt-5' } }).success).toBe(false)
})
