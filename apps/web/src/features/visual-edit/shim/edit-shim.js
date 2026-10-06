// Visual-edit shim. Injected into the preview page by the preview engine (see
// PreviewOptions.injectedScript) and run there as plain JS, never bundled.
// Message shapes mirror ../protocol.ts.
//
// Modes (set by the host):
// - `text`: clicking an element with `data-content="<path>"` opens an editor
//   overlaid on it. The app's own DOM is never edited directly: React owns
//   those nodes. The new text goes to the host, which updates the content
//   file, and the app re-renders.
// - `select`: clicking any element selects it for an AI edit. The shim sends
//   the host a description of it (see describe()) and its position, and keeps
//   the position current on scroll, resize and layout changes, so the host can
//   anchor its prompt box to it. Overlays mark the hovered and selected
//   elements without touching the app's DOM.
;(() => {
  if (window.__makableEditShim) return
  window.__makableEditShim = true

  const HOST = 'makable-host'
  const SHIM = 'makable-shim'
  const ATTR = 'data-makable-edit'
  const SELECT_ATTR = 'data-makable-select'
  /** @type {'off' | 'text' | 'select'} */
  let mode = 'off'
  /** @type {Element | null} */
  let selected = null
  /** @type {{ target: HTMLElement, editor: HTMLElement, original: string, visibility: string } | null} */
  let editing = null

  const style = document.createElement('style')
  style.textContent = `
    html[${ATTR}] [data-content] { cursor: text; }
    html[${ATTR}] [data-content]:hover { outline: 2px dashed #3b82f6; outline-offset: 2px; }
    html[${ATTR}] a { cursor: default; }
    html[${SELECT_ATTR}], html[${SELECT_ATTR}] * { cursor: crosshair !important; }
    .makable-box {
      position: fixed; z-index: 2147483646; pointer-events: none; box-sizing: border-box;
      border: 2px dashed #8b5cf6; border-radius: 3px; display: none;
    }
    .makable-box[data-selected] { border-style: solid; background: rgba(139, 92, 246, 0.08); }
    .makable-box span {
      position: absolute; left: -2px; bottom: 100%; padding: 1px 6px; border-radius: 3px 3px 0 0;
      background: #8b5cf6; color: #fff; font: 600 11px/16px ui-sans-serif, system-ui, sans-serif; white-space: nowrap;
    }
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
    document.documentElement.toggleAttribute(ATTR, mode === 'text')
    document.documentElement.toggleAttribute(SELECT_ATTR, mode === 'select')
    if (mode !== 'text') finish(false)
    if (mode !== 'select') {
      hoverBox.show(null)
      select(null, false)
    }
  }

  // --- select mode -------------------------------------------------------

  /** An overlay box that follows an element. */
  function makeBox(isSelected) {
    const box = document.createElement('div')
    box.className = 'makable-box'
    box.toggleAttribute('data-selected', isSelected)
    box.appendChild(document.createElement('span'))
    let el = null
    const place = () => {
      if (!el || !el.isConnected) return (box.style.display = 'none')
      const r = el.getBoundingClientRect()
      Object.assign(box.style, { display: 'block', left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` })
    }
    return {
      show(target) {
        el = target
        if (target) {
          if (!box.isConnected) document.body.appendChild(box)
          box.firstChild.textContent = label(target)
        }
        place()
      },
      place,
    }
  }
  const hoverBox = makeBox(false)
  const selectedBox = makeBox(true)
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
  // Content edits re-render the page and can move the selection without a scroll.
  const resizeObserver = new ResizeObserver(reposition)
  new MutationObserver(reposition).observe(document.body, { childList: true, subtree: true, characterData: true })

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

  function label(el) {
    const section = sectionOf(el)
    const name = section ? section.heading || section.id || section.tag : null
    const path = el.closest('[data-content]')?.getAttribute('data-content')
    return [name, path || el.tagName.toLowerCase()].filter(Boolean).join(' › ')
  }

  /** `main > section#skills > ul > li:nth-of-type(3)`: enough to find the element in the source. */
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

  /** What the AI needs to know about the clicked element. Mirrors aiEditTargetSchema in @makable/shared. */
  function describe(el) {
    return {
      tag: el.tagName.toLowerCase().slice(0, 32),
      text: clip(normalize(el.textContent || ''), 300),
      contentPath: el.closest('[data-content]')?.getAttribute('data-content')?.slice(0, 100) ?? null,
      section: sectionOf(el),
      selector: selectorOf(el),
      html: clip(el.outerHTML, 4000),
    }
  }

  function select(el, notify = true) {
    if (selected) resizeObserver.unobserve(selected)
    selected = el
    if (el) resizeObserver.observe(el)
    selectedBox.show(el)
    lastRect = JSON.stringify(rectOf(el))
    if (notify) post({ type: 'select', target: el ? describe(el) : null, rect: rectOf(el) })
  }

  document.addEventListener('mouseover', (e) => {
    if (mode !== 'select' || !(e.target instanceof Element)) return
    hoverBox.show(e.target === document.body || e.target === document.documentElement ? null : e.target)
  })
  // Leaving the frame (e.g. onto the host's prompt box) fires mouseout with no related target.
  document.addEventListener('mouseout', (e) => {
    if (!e.relatedTarget) hoverBox.show(null)
  })
  document.addEventListener('keydown', (e) => {
    if (mode === 'select' && e.key === 'Escape' && selected) select(null)
  })

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
      if (mode === 'off' || !(e.target instanceof Element)) return
      if (editing && editing.editor.contains(e.target)) return
      // In edit modes, clicks edit or select; they never follow links or trigger app handlers.
      e.preventDefault()
      e.stopPropagation()
      if (mode === 'select') {
        const target = e.target === document.body || e.target === document.documentElement ? null : e.target
        return select(target === selected ? null : target)
      }
      const target = e.target.closest('[data-content]')
      if (target instanceof HTMLElement) start(target)
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
  })

  post({ type: 'ready' })
})()
