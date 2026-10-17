import { expect, test } from 'bun:test'
import { patchText } from './text-patch'

const HERO = `export function Hero({ name }: { name: string }) {
  return (
    <section>
      <h1>{name}</h1>
      <p className="lead">
        Fresh bread every morning
      </p>
      <a href="#x">Order <b>now</b></a>
    </section>
  )
}
`

test('plain JSX text is replaced in place, keeping its indentation', () => {
  const patched = patchText('src/Hero.tsx', HERO, 5, 6, 'Fresh bread every morning', 'Warm bread all day')

  expect(patched).toEqual({ ok: true, code: HERO.replace('Fresh bread every morning', 'Warm bread all day') })
})

test('text with JSX characters goes in as a string', () => {
  const patched = patchText('src/Hero.tsx', HERO, 5, 6, 'Fresh bread every morning', 'Open {daily} <3')

  expect(patched.ok && patched.code).toContain('{"Open {daily} <3"}')
})

test('text from code, mixed content or a stale place is refused', () => {
  expect(patchText('src/Hero.tsx', HERO, 4, 6, 'Ada', 'Bo')).toMatchObject({ ok: false, error: expect.stringContaining('comes from the code') })
  expect(patchText('src/Hero.tsx', HERO, 8, 6, 'Order now', 'Buy')).toMatchObject({ ok: false })
  expect(patchText('src/Hero.tsx', HERO, 5, 6, 'Something else', 'x')).toMatchObject({ ok: false, error: expect.stringContaining('changed') })
  expect(patchText('src/Hero.tsx', HERO, 2, 0, 'x', 'y')).toMatchObject({ ok: false })
})

test('HTML text is replaced and escaped', () => {
  const html = '<main>\n  <h1 class="t">Ada &amp; Co</h1>\n  <p>Hi <b>there</b></p>\n</main>\n'

  expect(patchText('index.html', html, 2, 2, 'Ada & Co', 'Bo <3')).toEqual({
    ok: true,
    code: html.replace('Ada &amp; Co', 'Bo &lt;3'),
  })
  expect(patchText('index.html', html, 3, 2, 'Hi there', 'x')).toMatchObject({ ok: false })
})
