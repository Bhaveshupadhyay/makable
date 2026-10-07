import { expect, test } from 'bun:test'
import { aiFileEditsResponseSchema, applyFileEdits } from './ai-edit-files'

const files = {
  'src/Hero.tsx': 'export function Hero() {\n  return (\n    <a className="bg-blue-600">Contact</a>\n  )\n}\n',
  'src/index.css': 'a { color: red; }\na { color: red; }\n',
}

test('replaces an exact, unique match', () => {
  const result = applyFileEdits(files, [{ path: 'src/Hero.tsx', search: 'bg-blue-600', replace: 'bg-emerald-600' }])
  expect(result).toEqual({ ok: true, files: { ...files, 'src/Hero.tsx': files['src/Hero.tsx'].replace('blue', 'emerald') }, changed: ['src/Hero.tsx'] })
  // The input is never mutated.
  expect(files['src/Hero.tsx']).toContain('bg-blue-600')
})

test('falls back to a line match that ignores indentation', () => {
  const result = applyFileEdits(files, [{ path: 'src/Hero.tsx', search: '\t<a className="bg-blue-600">Contact</a>\n', replace: '    <a className="bg-blue-600">Hire me</a>' }])
  expect(result.ok && result.files['src/Hero.tsx']).toBe('export function Hero() {\n  return (\n    <a className="bg-blue-600">Hire me</a>\n  )\n}\n')
  const indented = applyFileEdits(files, [{ path: 'src/Hero.tsx', search: 'return (\n<a className="bg-blue-600">Contact</a>', replace: 'return (\n    <b />' }])
  expect(indented.ok && indented.files['src/Hero.tsx']).toContain('return (\n    <b />\n  )')
})

test('rejects missing, ambiguous and unknown-file edits, all or nothing', () => {
  expect(applyFileEdits(files, [{ path: 'src/Hero.tsx', search: 'nope', replace: 'x' }])).toMatchObject({ ok: false, error: expect.stringContaining('not found') })
  expect(applyFileEdits(files, [{ path: 'src/index.css', search: 'a { color: red; }', replace: 'x' }])).toMatchObject({ ok: false, error: expect.stringContaining('more than once') })
  expect(applyFileEdits(files, [{ path: 'src/App.tsx', search: 'a', replace: 'b' }])).toMatchObject({ ok: false, error: expect.stringContaining("wasn't sent") })
  expect(applyFileEdits(files, [{ path: '__proto__', search: 'a', replace: 'b' }]).ok).toBe(false)
  const second = applyFileEdits(files, [
    { path: 'src/Hero.tsx', search: 'Contact', replace: 'Hi' },
    { path: 'src/Hero.tsx', search: 'Contact', replace: 'Again' },
  ])
  expect(second).toMatchObject({ ok: false, error: expect.stringContaining('edit 2') })
})

test('later edits see earlier ones, and no-op edits are not reported as changes', () => {
  const result = applyFileEdits(files, [
    { path: 'src/Hero.tsx', search: 'Contact', replace: 'Hire me' },
    { path: 'src/Hero.tsx', search: 'Hire me', replace: 'Say hi' },
  ])
  expect(result.ok && result.files['src/Hero.tsx']).toContain('>Say hi<')
  expect(applyFileEdits(files, [{ path: 'src/Hero.tsx', search: 'Contact', replace: 'Contact' }])).toMatchObject({ ok: true, changed: [] })
})

test('the model answer is edits or an escalation', () => {
  expect(aiFileEditsResponseSchema.safeParse({ summary: 'Done', edits: [] }).success).toBe(true)
  expect(aiFileEditsResponseSchema.safeParse({ escalate: 'Needs a new page' }).success).toBe(true)
  expect(aiFileEditsResponseSchema.safeParse({ summary: 'Done', edits: [{ path: '../x', search: 'a', replace: 'b' }] }).success).toBe(false)
  expect(aiFileEditsResponseSchema.safeParse({ ops: [] }).success).toBe(false)
})
