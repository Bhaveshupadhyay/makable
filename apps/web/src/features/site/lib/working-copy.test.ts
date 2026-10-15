import { expect, test } from 'bun:test'
import { afterSave, recordEdit, savePlan, workingFiles } from './working-copy'

const base = { 'src/App.tsx': 'app', 'src/index.css': 'css' }

test('edits sit over the base, and an edit back to the base is dropped', () => {
  let dirty = recordEdit(base, {}, 'src/App.tsx', 'app 2')
  dirty = recordEdit(base, dirty, 'src/index.css', null)
  dirty = recordEdit(base, dirty, 'src/New.tsx', 'new')

  expect(workingFiles(base, dirty)).toEqual({ 'src/App.tsx': 'app 2', 'src/New.tsx': 'new' })
  expect(savePlan(dirty)).toEqual({ files: { 'src/App.tsx': 'app 2', 'src/New.tsx': 'new' }, deletes: ['src/index.css'] })
  expect(recordEdit(base, dirty, 'src/App.tsx', 'app')).not.toHaveProperty('src/App.tsx')
})

test('a save clears what it sent, but not what was edited again meanwhile', () => {
  const sent = { 'src/App.tsx': 'app 2', 'src/index.css': null }
  const dirty = { 'src/App.tsx': 'app 3', 'src/index.css': null, 'src/New.tsx': 'new' }

  expect(afterSave(dirty, sent)).toEqual({ 'src/App.tsx': 'app 3', 'src/New.tsx': 'new' })
})
