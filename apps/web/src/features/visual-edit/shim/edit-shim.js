// Visual-edit shim. Injected into the preview page by the preview engine (see
// PreviewOptions.injectedScript) and run there as plain JS, never bundled.
// Message shapes mirror ../protocol.ts.
//
// In edit mode, clicking an element with `data-content="<path>"` opens an
// editor overlaid on it. The app's own DOM is never edited directly: React
// owns those nodes. The new text goes to the host, which updates the content
// file, and the app re-renders.
;(() => {
  if (window.__makableEditShim) return
  window.__makableEditShim = true

  const HOST = 'makable-host'
  const SHIM = 'makable-shim'
  const ATTR = 'data-makable-edit'
  let enabled = false
  /** @type {{ target: HTMLElement, editor: HTMLElement, original: string, visibility: string } | null} */
  let editing = null

  const style = document.createElement('style')
  style.textContent = `
    html[${ATTR}] [data-content] { cursor: text; }
    html[${ATTR}] [data-content]:hover { outline: 2px dashed #3b82f6; outline-offset: 2px; }
    html[${ATTR}] a { cursor: default; }
    .makable-editor {
      position: absolute; z-index: 2147483647; box-sizing: border-box; margin: 0;
      outline: 2px solid #3b82f6; outline-offset: 2px; border-radius: 2px;
      white-space: pre-wrap; overflow-wrap: anywhere;
    }
  `
  document.head.appendChild(style)

  const post = (msg) => window.parent.postMessage({ source: SHIM, ...msg }, '*')
  const normalize = (text) => text.replace(/\s+/g, ' ').trim()

  /** First non-transparent background up the tree, so the editor hides the text under it. */
  function backgroundOf(el) {
    for (let node = el; node; node = node.parentElement) {
      const bg = getComputedStyle(node).backgroundColor
      if (bg && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)') return bg
    }
    return '#ffffff'
  }

  function setEnabled(value) {
    enabled = value
    document.documentElement.toggleAttribute(ATTR, value)
    if (!value) finish(false)
  }

  function start(target) {
    finish(true)
    const rect = target.getBoundingClientRect()
    const cs = getComputedStyle(target)
    const editor = document.createElement('div')
    editor.className = 'makable-editor'
    editor.contentEditable = 'plaintext-only'
    if (editor.contentEditable !== 'plaintext-only') editor.contentEditable = 'true'
    editor.setAttribute('role', 'textbox')
    editor.setAttribute('aria-label', `Edit ${target.getAttribute('data-content')}`)
    for (const prop of [
      'font', 'letterSpacing', 'textTransform', 'textAlign', 'lineHeight', 'color',
      'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    ]) {
      editor.style[prop] = cs[prop]
    }
    editor.style.background = backgroundOf(target)
    editor.style.left = `${rect.left + window.scrollX}px`
    editor.style.top = `${rect.top + window.scrollY}px`
    editor.style.minWidth = `${Math.max(rect.width, 40)}px`
    editor.style.maxWidth = `${Math.max(rect.width, document.documentElement.clientWidth - rect.left - 8)}px`
    editor.style.minHeight = `${rect.height}px`

    const original = normalize(target.textContent || '')
    editor.textContent = original
    editing = { target, editor, original, visibility: target.style.visibility }
    target.style.visibility = 'hidden'
    document.body.appendChild(editor)

    editor.focus()
    const range = document.createRange()
    range.selectNodeContents(editor)
    const selection = window.getSelection()
    selection.removeAllRanges()
    selection.addRange(range)

    editor.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        finish(true)
      } else if (e.key === 'Escape') {
        e.preventDefault()
        finish(false)
      }
    })
    editor.addEventListener('blur', () => finish(true))
  }

  function finish(save) {
    if (!editing) return
    const { target, editor, original, visibility } = editing
    editing = null
    const value = normalize(editor.textContent || '')
    editor.remove()
    target.style.visibility = visibility
    if (save && value !== original) post({ type: 'edit', path: target.getAttribute('data-content'), value })
  }

  document.addEventListener(
    'click',
    (e) => {
      if (!enabled || !(e.target instanceof Element)) return
      if (editing && editing.editor.contains(e.target)) return
      // In edit mode, clicks edit; they never follow links or trigger app handlers.
      e.preventDefault()
      e.stopPropagation()
      const target = e.target.closest('[data-content]')
      if (target instanceof HTMLElement) start(target)
      else finish(true)
    },
    true,
  )

  window.addEventListener('message', (e) => {
    if (e.source !== window.parent) return
    const msg = e.data
    if (msg && msg.source === HOST && msg.type === 'mode') setEnabled(Boolean(msg.enabled))
  })

  post({ type: 'ready' })
})()
