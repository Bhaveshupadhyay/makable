import { expect, test } from 'bun:test'
import { parseSource, tagHtml, tagJsx, tagSources } from './source-tags'

const HERO = `export function Hero() {
  return (
    <section id="hero">
      <Title>Ada</Title>
      <a className="btn" href="#contact">Contact</a>
      <img src="x.png" />
    </section>
  )
}
`

test('host elements in JSX are tagged with where they start; components are left alone', () => {
  const tagged = tagJsx('src/Hero.tsx', HERO)

  expect(tagged).toContain('<section data-src="src/Hero.tsx:3:4" id="hero">')
  expect(tagged).toContain('<a data-src="src/Hero.tsx:5:6" className="btn"')
  expect(tagged).toContain('<img data-src="src/Hero.tsx:6:6" src="x.png" />')
  expect(tagged).toContain('<Title>Ada</Title>')
})

test('TypeScript in a .tsx file parses, and a file that does not is left as it is', () => {
  const typed = 'type P = { n: number }\nexport const A = (p: P) => <p>{p.n as number}</p>\n'
  expect(tagJsx('src/A.tsx', typed)).toContain('<p data-src="src/A.tsx:2:27">')
  expect(tagJsx('src/B.tsx', 'export const B = () => <div>')).toBe('export const B = () => <div>')
})

test('HTML start tags are tagged, but not inside comments, scripts or the head', () => {
  const html = '<html>\n<head><title>Hi</title></head>\n<body>\n<!-- <p>no</p> -->\n<h1 class="t">Hi</h1>\n<script>const s = "<b>"</script>\n</body>\n</html>\n'

  const tagged = tagHtml('index.html', html)

  expect(tagged).toContain('<h1 data-src="index.html:5:0" class="t">')
  expect(tagged).toContain('<!-- <p>no</p> -->')
  expect(tagged).toContain('const s = "<b>"')
  expect(tagged).toContain('<title>Hi</title>')
})

test('only markup files are tagged, and a tag is read back', () => {
  const files = tagSources({ 'src/a.css': 'a {}', 'src/A.tsx': 'export const A = () => <p>x</p>\n' })
  expect(files['src/a.css']).toBe('a {}')
  expect(files['src/A.tsx']).toContain('data-src="src/A.tsx:1:23"')
  expect(parseSource('src/components/Hero.tsx:12:4')).toEqual({ path: 'src/components/Hero.tsx', line: 12, column: 4 })
  expect(parseSource('nope')).toBeNull()
})
