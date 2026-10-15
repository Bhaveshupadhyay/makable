// Visual-edit shim. Injected into the preview page by the preview engine (see
// PreviewOptions.injectedScript) and run there as plain JS, never bundled.
// Message shapes mirror ../protocol.ts.
//
// The preview's copy of the site is tagged: every element written in the code has
// `data-src="<path>:<line>:<column>"` (see tagSources in the site feature).
//
// Modes (set by the host):
// - `text`: clicking an element whose content is only text opens an editor overlaid
//   on it. The app's own DOM is never edited directly: React owns those nodes. The
//   new text goes to the host with the element's `data-src`; the host changes the
//   source there, and the app re-renders.
// - `select`: clicking any element selects it for an AI edit. The shim sends the
//   host a description of it (see describe()) and its position, and keeps the
//   position current on scroll, resize and layout changes, so the host can anchor
//   its prompt box to it. Overlays mark the hovered and selected elements without
//   touching the app's DOM.
// While locked (an AI request is pending), clicks and Escape do nothing and nothing
// is hovered, but the selection stays and its position keeps updating.
;(() => {
  if (window.__makableEditShim) return
  window.__makableEditShim = true

  const HOST = 'makable-host'
  const SHIM = 'makable-shim'
  const SRC = 'data-src'
  const SELECT_ATTR = 'data-makable-select'
  const TEXT_ATTR = 'data-makable-text'
  // Loaded only when a picture of the selection is asked for (models that read images).
  const SCREENSHOT_LIB = 'https://cdn.jsdelivr.net/npm/modern-screenshot@4.6.8/+esm'
  /** @type {'off' | 'text' | 'select'} */
  let mode = 'off'
  let locked = false
  /** @type {Element | null} */
  let selected = null
  /** @type {{ target: HTMLElement, editor: HTMLElement, original: string, visibility: string } | null} */
  let editing = null

  const style = document.createElement('style')
  style.textContent = `
    html[${SELECT_ATTR}], html[${SELECT_ATTR}] * { cursor: crosshair !important; }
    html[${TEXT_ATTR}] a { cursor: default; }
    .makable-box {
      position: fixed; z-index: 2147483646; pointer-events: none; box-sizing: border-box;
      border: 2px dashed #8b5cf6; border-radius: 3px; display: none;
    }
    .makable-box[data-selected] { border-style: solid; background: rgba(139, 92, 246, 0.08); }
    .makable-box[data-text] { border-color: #3b82f6; }
    .makable-box span {
      position: absolute; left: -2px; bottom: 100%; padding: 1px 6px; border-radius: 3px 3px 0 0;
      background: #8b5cf6; color: #fff; font: 600 11px/16px ui-sans-serif, system-ui, sans-serif; white-space: nowrap;
    }
    .makable-box[data-text] span { display: none; }
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

  function setMode(value) {
    mode = value === 'text' || value === 'select' ? value : 'off'
    document.documentElement.toggleAttribute(TEXT_ATTR, mode === 'text')
    document.documentElement.toggleAttribute(SELECT_ATTR, mode === 'select')
    hoverBox.show(null)
    if (mode !== 'text') finish(false)
    if (mode !== 'select') select(null, false)
  }

  // --- overlays ----------------------------------------------------------

  /** An overlay box that follows an element. */
  function makeBox(kind) {
    const box = document.createElement('div')
    box.className = 'makable-box'
    let el = null
    box.appendChild(document.createElement('span'))
    const place = () => {
      if (!el || !el.isConnected) return (box.style.display = 'none')
      const r = el.getBoundingClientRect()
      Object.assign(box.style, { display: 'block', left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` })
    }
    return {
      show(target, as = kind) {
        el = target
        box.toggleAttribute('data-selected', as === 'selected')
        box.toggleAttribute('data-text', as === 'text')
        if (target) {
          if (!box.isConnected) document.body.appendChild(box)
          box.firstChild.textContent = label(target)
        }
        place()
      },
      place,
    }
  }
  const hoverBox = makeBox('hover')
  const selectedBox = makeBox('selected')

  /** The selected element's box in this window's viewport, or null when it's gone. */
  function rectOf(el) {
    if (!el || !el.isConnected) return null
    const r = el.getBoundingClientRect()
    return { x: r.left, y: r.top, width: r.width, height: r.height }
  }
  let lastRect = ''
  function postRect() {
    const rect = rectOf(selected)
    const key = JSON.stringify(rect)
    if (key === lastRect) return
    lastRect = key
    post({ type: 'rect', rect })
  }
  let frame = 0
  const reposition = () => {
    if (frame) return
    frame = requestAnimationFrame(() => {
      frame = 0
      hoverBox.place()
      selectedBox.place()
      if (selected) postRect()
    })
  }
  window.addEventListener('scroll', reposition, true)
  window.addEventListener('resize', reposition)
  // Edits re-render the page and can move the selection without a scroll.
  const resizeObserver = new ResizeObserver(reposition)
  new MutationObserver(reposition).observe(document.body, { childList: true, subtree: true, characterData: true })

  // --- describing elements -----------------------------------------------

  const LANDMARK = 'section, header, footer, nav, aside'
  const clip = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text)

  function sectionOf(el) {
    const landmark = el.closest(LANDMARK) || el.closest('[id]:not(#root):not(body):not(html)')
    if (!landmark) return null
    const heading = landmark.querySelector('h1, h2, h3')
    return {
      tag: landmark.tagName.toLowerCase(),
      id: landmark.id ? clip(landmark.id, 100) : null,
      heading: heading ? clip(normalize(heading.textContent || ''), 120) : null,
    }
  }

  /** Where the element is written in the code, from the nearest `data-src`. */
  function sourceOf(el) {
    const value = el.closest(`[${SRC}]`)?.getAttribute(SRC)
    const match = value && /^(.+):(\d+):(\d+)$/.exec(value)
    return match ? { path: match[1].slice(0, 300), line: Number(match[2]), column: Number(match[3]) } : null
  }

  function label(el) {
    const section = sectionOf(el)
    const name = section ? section.heading || section.id || section.tag : null
    return [name, el.tagName.toLowerCase()].filter(Boolean).join(' › ')
  }

  /** `main > section#menu > ul > li:nth-of-type(3)`: enough to find the element in the source. */
  function selectorOf(el) {
    const parts = []
    for (let node = el; node && node !== document.body && parts.length < 8; node = node.parentElement) {
      let part = node.tagName.toLowerCase()
      if (node.id) {
        parts.unshift(`${part}#${node.id}`)
        break
      }
      const siblings = node.parentElement ? [...node.parentElement.children].filter((c) => c.tagName === node.tagName) : []
      if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(node) + 1})`
      parts.unshift(part)
    }
    return clip(parts.join(' > '), 500)
  }

  /** The element's HTML as the site's code has it: without the preview's tags. */
  function htmlOf(el) {
    const copy = el.cloneNode(true)
    copy.removeAttribute(SRC)
    copy.querySelectorAll(`[${SRC}]`).forEach((node) => node.removeAttribute(SRC))
    return clip(copy.outerHTML, 4000)
  }

  /** What the AI needs to know about the clicked element. Mirrors aiEditTargetSchema in @makable/shared. */
  function describe(el) {
    return {
      tag: el.tagName.toLowerCase().slice(0, 32),
      text: clip(normalize(el.textContent || ''), 300),
      source: sourceOf(el),
      section: sectionOf(el),
      selector: selectorOf(el),
      html: htmlOf(el),
    }
  }

  // --- select mode -------------------------------------------------------

  function select(el, notify = true) {
    if (selected) resizeObserver.unobserve(selected)
    selected = el
    if (el) resizeObserver.observe(el)
    selectedBox.show(el)
    lastRect = JSON.stringify(rectOf(el))
    if (notify) post({ type: 'select', target: el ? describe(el) : null, rect: rectOf(el) })
  }

  // --- text mode ---------------------------------------------------------

  /** The element to edit for a click on `el`: one written in the code whose content is only text. */
  function editableOf(el) {
    const target = el.closest(`[${SRC}]`)
    if (!(target instanceof HTMLElement) || !target.firstChild) return null
    const onlyText = [...target.childNodes].every((node) => node.nodeType === Node.TEXT_NODE || node.nodeType === Node.COMMENT_NODE)
    return onlyText && normalize(target.textContent || '') ? target : null
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
    editor.setAttribute('aria-label', 'Edit text')
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
    hoverBox.show(null)
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
    if (save && value && value !== original) post({ type: 'edit', src: target.getAttribute(SRC), oldText: original, value })
  }

  // --- pictures ----------------------------------------------------------

  let screenshotLib = null
  // A native import at run time: the preview's bundler would otherwise try to bundle the URL.
  const importUrl = new Function('url', 'return import(url)')

  async function capture(id) {
    let dataUrl = null
    try {
      if (selected && selected.isConnected) {
        screenshotLib ??= importUrl(SCREENSHOT_LIB)
        const { domToJpeg } = await screenshotLib
        const r = selected.getBoundingClientRect()
        // Big enough to read, small enough to send: the longer side at most 1024 px.
        const scale = Math.min(1, 1024 / Math.max(r.width, r.height, 1))
        dataUrl = await domToJpeg(selected, { scale, quality: 0.8, backgroundColor: backgroundOf(selected) })
      }
    } catch {
      dataUrl = null
    }
    post({ type: 'capture', id, dataUrl })
  }

  // --- events ------------------------------------------------------------

  document.addEventListener('mouseover', (e) => {
    if (locked || !(e.target instanceof Element)) return
    if (mode === 'select') hoverBox.show(e.target === document.body || e.target === document.documentElement ? null : e.target, 'hover')
    else if (mode === 'text' && !editing) hoverBox.show(editableOf(e.target), 'text')
  })
  // Leaving the frame (e.g. onto the host's prompt box) fires mouseout with no related target.
  document.addEventListener('mouseout', (e) => {
    if (!e.relatedTarget) hoverBox.show(null)
  })
  document.addEventListener('keydown', (e) => {
    if (mode === 'select' && !locked && e.key === 'Escape' && selected) select(null)
  })

  document.addEventListener(
    'click',
    (e) => {
      if (mode === 'off' || !(e.target instanceof Element)) return
      if (editing && editing.editor.contains(e.target)) return
      // In edit modes, clicks edit or select; they never follow links or trigger app handlers.
      e.preventDefault()
      e.stopPropagation()
      if (locked) return
      if (mode === 'select') {
        const target = e.target === document.body || e.target === document.documentElement ? null : e.target
        return select(target === selected ? null : target)
      }
      const target = editableOf(e.target)
      if (target) start(target)
      else finish(true)
    },
    true,
  )

  window.addEventListener('message', (e) => {
    if (e.source !== window.parent) return
    const msg = e.data
    if (!msg || msg.source !== HOST) return
    if (msg.type === 'mode') setMode(msg.mode)
    if (msg.type === 'clear-selection') select(null, false)
    if (msg.type === 'capture' && typeof msg.id === 'string') void capture(msg.id)
    if (msg.type === 'lock') {
      locked = msg.locked === true
      if (locked) hoverBox.show(null)
    }
  })

  post({ type: 'ready' })
})()
