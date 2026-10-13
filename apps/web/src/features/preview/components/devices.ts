import { Monitor, Smartphone, Tablet, type LucideIcon } from 'lucide-react'

export type Device = 'desktop' | 'tablet' | 'mobile'

/**
 * `width` is the page width each device previews at, in CSS pixels. Desktop grows with the pane
 * past it (`grow`); a pane narrower than `width` shows the page scaled down (`fitFrame`).
 */
export const DEVICES: Record<Device, { label: string; icon: LucideIcon; width: number; grow?: boolean }> = {
  desktop: { label: 'Desktop', icon: Monitor, width: 1280, grow: true },
  tablet: { label: 'Tablet', icon: Tablet, width: 768 },
  mobile: { label: 'Mobile', icon: Smartphone, width: 390 },
}
