/**
 * How a device's page fits into `available` pixels of pane: the page's own width (what the site
 * sees as `window.innerWidth`) and the scale it's drawn at. A page wider than the pane is scaled
 * down rather than squeezed, so a laptop still sees a site's desktop layout (sites switch layouts
 * at breakpoints like 1024px, and the pane beside the chat is often narrower). `grow` lets the
 * page take a pane wider than `width`.
 */
export function fitFrame(width: number, available: number, grow = false): { width: number; scale: number } {
  if (available >= width) return { width: grow ? available : width, scale: 1 }
  return { width, scale: available > 0 ? available / width : 1 }
}
