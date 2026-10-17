import type { CSSProperties } from 'react'

/**
 * How a device's page fits into `available` pixels of pane: the page's own width (what the site
 * sees as `window.innerWidth`) and the scale it's drawn at. A page wider than the pane is scaled
 * down rather than squeezed, so a laptop still sees a site's desktop layout (sites switch layouts
 * at breakpoints like 1024px, and the pane beside the chat is often narrower). `grow` lets the
 * page take a pane wider than `width`.
 */
export function fitFrame(width: number, available: number, grow = false): { width: number; scale: number } {
  if (available >= width) return { width: grow ? available : width, scale: 1 }
  // A drawn width of whole pixels: a fractional one is rounded when drawn, which can cost the page a
  // pixel of its width (1279 for a 1280 page) and miss a breakpoint.
  return { width, scale: available >= 1 ? Math.floor(available) / width : 1 }
}

/**
 * How to draw a page at `scale`. CSS zoom, normally: the page then renders at the drawn size (its
 * devicePixelRatio drops by `scale`) instead of rendering big and being shrunk, which made WebGL sites
 * lag. Safari (WebKit, which every iOS browser uses) applies an iframe's zoom twice to its visible area,
 * so only part of the page shows; there it's a transform.
 *
 * The height fills the frame's box as drawn. Zoom doesn't scale a percentage height (only lengths), so
 * it stays 100%; a transform shrinks the laid-out box, so that one is laid out 1/scale as tall.
 */
export function frameScaleStyle(scale: number, userAgent: string): CSSProperties {
  if (scale === 1) return { height: '100%' }
  if (isWebKitOnly(userAgent)) return { height: `${100 / scale}%`, transform: `scale(${scale})`, transformOrigin: '0 0' }
  return { height: '100%', zoom: scale }
}

function isWebKitOnly(userAgent: string) {
  return /AppleWebKit\//.test(userAgent) && !/(Chrome|Chromium|Edg|OPR)\//.test(userAgent)
}
