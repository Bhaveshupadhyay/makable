import { Monitor, Smartphone, Tablet, type LucideIcon } from 'lucide-react'

export type Device = 'desktop' | 'tablet' | 'mobile'

export const DEVICES: Record<Device, { label: string; icon: LucideIcon; width: string }> = {
  desktop: { label: 'Desktop', icon: Monitor, width: '100%' },
  tablet: { label: 'Tablet', icon: Tablet, width: '768px' },
  mobile: { label: 'Mobile', icon: Smartphone, width: '390px' },
}
