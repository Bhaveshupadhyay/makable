import { expect, test } from 'bun:test'
import type { AiEditTarget, Portfolio } from '@makable/shared'
import { buildContentRequest, describeOp, targetLabel } from './build-content-request'

const portfolio: Portfolio = {
  profile: { name: 'Ada', headline: 'Engineer', bio: '', location: '', avatarUrl: '' },
  links: { github: '', linkedin: '', x: '', website: '', email: '' },
  skills: ['TS'],
  projects: [],
  template: 'minimal',
}
const target: AiEditTarget = { tag: 'li', text: 'TS', contentPath: 'skills.0', section: { tag: 'section', id: 'skills', heading: 'Skills' }, selector: 'li', html: '<li>TS</li>' }

test('the request carries the selection and the portfolio, not source files', () => {
  const request = buildContentRequest('  Remove this ', target, portfolio)
  expect(request).toEqual({ instruction: 'Remove this', selection: { path: 'skills.0', text: 'TS', section: 'Skills' }, portfolio })
  expect(buildContentRequest('Shorter bio', null, portfolio).selection).toBeNull()
})

test('an empty or oversized instruction fails before sending', () => {
  expect(() => buildContentRequest('   ', null, portfolio)).toThrow()
  expect(() => buildContentRequest('x'.repeat(2001), null, portfolio)).toThrow()
})

test('labels', () => {
  expect(targetLabel(target)).toBe('Skills › skills.0 “TS”')
  expect(describeOp({ op: 'move', path: 'skills.0', to: 2 })).toBe('move skills.0 to 2')
  expect(describeOp({ op: 'insert', path: 'skills', value: 'Go' })).toBe('insert into skills: "Go"')
})
