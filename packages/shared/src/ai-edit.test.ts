import { expect, test } from 'bun:test'
import { type AiEditRequest, aiCreateRequestSchema, aiEditRequestSchema } from './ai-edit'

const request: AiEditRequest = {
  projectId: '6f1d3c2a-5b4e-4f7a-9c8d-1e2f3a4b5c6d',
  baseCommit: 'a'.repeat(40),
  instruction: 'Make the contact button green',
  target: {
    tag: 'a',
    text: 'Contact',
    source: { path: 'src/components/Hero.tsx', line: 5, column: 6 },
    section: { tag: 'section', id: 'hero', heading: 'Ada' },
    selector: 'main > section#hero > a',
    html: '<a class="bg-blue-600">Contact</a>',
  },
}

test('requests are validated: unsafe paths, bad commits and oversized fields are rejected', () => {
  expect(aiEditRequestSchema.safeParse(request).success).toBe(true)
  expect(aiEditRequestSchema.safeParse({ ...request, instruction: '   ' }).success).toBe(false)
  expect(aiEditRequestSchema.safeParse({ ...request, baseCommit: 'main' }).success).toBe(false)
  const badPath = { ...request, target: { ...request.target!, source: { path: '../secrets', line: 1, column: 0 } } }
  expect(aiEditRequestSchema.safeParse(badPath).success).toBe(false)
  const bigHtml = { ...request, target: { ...request.target!, html: 'x'.repeat(5000) } }
  expect(aiEditRequestSchema.safeParse(bigHtml).success).toBe(false)
})

test('a picture must be a PNG, JPEG or WebP data URL', () => {
  expect(aiEditRequestSchema.safeParse({ ...request, screenshot: 'data:image/png;base64,iVBORw0KGgo=' }).success).toBe(true)
  expect(aiEditRequestSchema.safeParse({ ...request, screenshot: 'https://example.com/a.png' }).success).toBe(false)
  expect(aiEditRequestSchema.safeParse({ ...request, screenshot: 'data:image/svg+xml;base64,PHN2Zz4=' }).success).toBe(false)
})

test("a request may name one of the user's models", () => {
  const keyId = '6f1c2a9e-3b4d-4e5f-8a7b-9c0d1e2f3a4b'
  expect(aiEditRequestSchema.safeParse({ ...request, model: { keyId, model: 'meta-llama/llama-3.3-70b:free' } }).success).toBe(true)
  expect(aiEditRequestSchema.safeParse({ ...request, model: { keyId, model: 'has space' } }).success).toBe(false)
})

test('a creation needs a prompt', () => {
  expect(aiCreateRequestSchema.safeParse({ projectId: request.projectId, prompt: 'A bakery site' }).success).toBe(true)
  expect(aiCreateRequestSchema.safeParse({ projectId: request.projectId, prompt: ' ' }).success).toBe(false)
})
