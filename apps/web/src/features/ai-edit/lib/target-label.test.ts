import { expect, test } from 'bun:test'
import { targetLabel } from './target-label'

test('a selection is labelled by its section, tag and short text', () => {
  const target = { tag: 'li', text: 'Croissant', source: null, section: { tag: 'section', id: 'menu', heading: 'Menu' }, selector: 'li', html: '<li>' }

  expect(targetLabel(target)).toBe('Menu › <li> “Croissant”')
  expect(targetLabel({ ...target, section: null, text: 'x'.repeat(41) })).toBe('<li>')
})
