import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { useMediaQuery } from '@/shared/hooks/use-media-query'

export type ThemeChoice = 'light' | 'dark' | 'system'
export type Theme = 'light' | 'dark'

/** Also read by the script in `index.html` that sets the theme before the first paint: keep the two in step. */
export const THEME_STORAGE_KEY = 'makable:theme'
const DARK_QUERY = '(prefers-color-scheme: dark)'

export function resolveTheme(choice: ThemeChoice, systemDark: boolean): Theme {
  if (choice === 'system') return systemDark ? 'dark' : 'light'
  return choice
}

/** A saved choice, or `system` for anything else (nothing saved, an old or hand-edited value). */
export function parseChoice(value: unknown): ThemeChoice {
  return value === 'light' || value === 'dark' ? value : 'system'
}

// Only the choice is stored. The theme on screen also depends on the system's setting, which is read when needed and
// never written: a tab writing it could put back its old choice over a newer one another tab just saved.
type ThemeState = {
  choice: ThemeChoice
  setChoice: (choice: ThemeChoice) => void
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      choice: 'system',
      setChoice: (choice) => set({ choice }),
    }),
    {
      name: THEME_STORAGE_KEY,
      version: 1,
      // A write can fail (storage full or blocked); the choice still applies to this page.
      storage: createJSONStorage(() => {
        const storage = localStorage
        return {
          getItem: (name) => storage.getItem(name),
          setItem: (name, value) => {
            try {
              storage.setItem(name, value)
            } catch {
              // Not saved: only this page has the choice.
            }
          },
          removeItem: (name) => storage.removeItem(name),
        }
      }),
      partialize: ({ choice }) => ({ choice }),
      merge: (saved, current) => ({ ...current, choice: parseChoice((saved as Partial<ThemeState> | undefined)?.choice) }),
    },
  ),
)

const systemDark = () => window.matchMedia(DARK_QUERY).matches

/** The theme on screen: the choice, or the system's for `system`. */
export function useTheme(): Theme {
  const choice = useThemeStore((s) => s.choice)
  return resolveTheme(choice, useMediaQuery(DARK_QUERY))
}

function apply(theme: Theme) {
  const root = document.documentElement
  root.classList.toggle('dark', theme === 'dark')
  // Scrollbars, form controls and the default canvas follow.
  root.style.colorScheme = theme
}

/** Switches at once: otherwise everything with a colour transition fades to the new theme at its own pace. */
function switchTo(theme: Theme) {
  const pause = document.createElement('style')
  pause.textContent = '*, *::before, *::after { transition: none !important }'
  document.head.append(pause)
  apply(theme)
  void getComputedStyle(document.body).color
  requestAnimationFrame(() => pause.remove())
}

/** Keeps `<html>` in step with the choice, the system's setting (for `system`) and other tabs. Call once at start. */
export function initTheme() {
  const current = () => resolveTheme(useThemeStore.getState().choice, systemDark())
  let shown = current()
  apply(shown)
  const update = () => {
    const theme = current()
    if (theme === shown) return
    shown = theme
    switchTo(theme)
  }
  useThemeStore.subscribe(update)
  window.matchMedia(DARK_QUERY).addEventListener('change', update)
  window.addEventListener('storage', (e) => {
    if (e.key === THEME_STORAGE_KEY) void useThemeStore.persist.rehydrate()
  })
}
