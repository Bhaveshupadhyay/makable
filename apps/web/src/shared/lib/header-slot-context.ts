import { createContext } from 'react'

/** The element in the app header that pages can render actions into (see `shared/ui/header-slot`). */
export type HeaderSlot = { target: HTMLElement | null; setTarget: (element: HTMLElement | null) => void }

export const HeaderSlotContext = createContext<HeaderSlot | null>(null)
