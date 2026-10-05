import { expect, test } from 'bun:test'
import { parseTemplateFiles } from './template-files'

const BASE = 'https://example.github.io/t/dopefolio/1/demo/'

test('keeps text files and drops the binary map', () => {
  const files = parseTemplateFiles({ 'index.html': '<h1>Hi</h1>', 'content/portfolio.js': 'export const portfolio = {}', binary: {} }, BASE)
  expect(files).toEqual({ 'index.html': '<h1>Hi</h1>', 'content/portfolio.js': 'export const portfolio = {}' })
})

test('points references to binary files at the hosted demo', () => {
  const files = parseTemplateFiles(
    {
      'index.html': '<img src="./assets/png/me.png"><img src=\'assets/png/me.png\'><a href="./about.html">x</a>',
      'css/style.css': '.hero { background: url(../assets/png/me.png) } .x { background: url("/assets/png/me.png") }',
      'main.js': "img.src = './assets/jpeg/mock.jpeg'; const other = './assets/jpeg/missing.jpeg'",
      binary: { 'assets/png/me.png': 'iVBOR', 'assets/jpeg/mock.jpeg': '/9j/' },
    },
    BASE,
  )
  const me = `${BASE}assets/png/me.png`
  expect(files['index.html']).toBe(`<img src="${me}"><img src='${me}'><a href="./about.html">x</a>`)
  expect(files['css/style.css']).toBe(`.hero { background: url(${me}) } .x { background: url("${me}") }`)
  expect(files['main.js']).toBe(`img.src = '${BASE}assets/jpeg/mock.jpeg'; const other = './assets/jpeg/missing.jpeg'`)
})

test('ignores quoted text that is not a valid URL path', () => {
  const css = '.bar { width: "100%"; content: "%E0%A4%A"; } .bg { background: url(img/a.png) }'
  expect(parseTemplateFiles({ 'style.css': css, binary: { 'img/a.png': '' } }, BASE)['style.css']).toBe(
    `.bar { width: "100%"; content: "%E0%A4%A"; } .bg { background: url(${BASE}img/a.png) }`,
  )
})

test('leaves absolute and data URLs alone', () => {
  const html = '<img src="https://cdn.example/a.png"><img src="data:image/png;base64,AA"><a href="#top">t</a>'
  expect(parseTemplateFiles({ 'index.html': html, binary: { 'a.png': '' } }, BASE)['index.html']).toBe(html)
})

test('rejects unsafe paths and non-text files', () => {
  expect(() => parseTemplateFiles({ '../escape.js': '' }, BASE)).toThrow('Unsafe template path')
  expect(() => parseTemplateFiles({ '/abs.js': '' }, BASE)).toThrow('Unsafe template path')
  expect(() => parseTemplateFiles({ 'index.html': 42 }, BASE)).toThrow('not text')
  expect(() => parseTemplateFiles(['index.html'], BASE)).toThrow('JSON object')
})
