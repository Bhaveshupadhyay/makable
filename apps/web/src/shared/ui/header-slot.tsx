import { type ReactNode, useContext, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { HeaderSlotContext } from '@/shared/lib/header-slot-context'

// Lets a page put actions in the app header without the layout knowing about the page. The
// layout renders `HeaderSlot` in the header; a page renders `HeaderActions` anywhere in its tree.

export function HeaderSlotProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<HTMLElement | null>(null)
  const value = useMemo(() => ({ target, setTarget }), [target])
  return <HeaderSlotContext value={value}>{children}</HeaderSlotContext>
}

export function HeaderSlot({ className }: { className?: string }) {
  const slot = useContext(HeaderSlotContext)
  return <div ref={slot?.setTarget} className={className} />
}

export function HeaderActions({ children }: { children: ReactNode }) {
  const slot = useContext(HeaderSlotContext)
  return slot?.target ? createPortal(children, slot.target) : null
}
