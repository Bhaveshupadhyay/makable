import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

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

type ThemeState = {
  choice: ThemeChoice
  /** What's on screen: the choice, or the system's for `system`. */
  theme: Theme
  setChoice: (choice: ThemeChoice) => void
}

const systemDark = () => typeof window !== 'undefined' && window.matchMedia(DARK_QUERY).matches

export const useThemeStore = create<ThemeState>()(
  persist<ThemeState, [], [], Pick<ThemeState, 'choice'>>(
    (set) => ({
      choice: 'system',
      theme: resolveTheme('system', systemDark()),
      setChoice: (choice) => set({ choice, theme: resolveTheme(choice, systemDark()) }),
    }),
    {
      name: THEME_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: ({ choice }) => ({ choice }),
      // Here rather than in onRehydrateStorage: the first hydration runs inside `create`, before `useThemeStore` exists.
      merge: (saved, current) => {
        const choice = parseChoice((saved as Partial<ThemeState> | undefined)?.choice)
        return { ...current, choice, theme: resolveTheme(choice, systemDark()) }
      },
    },
  ),
)

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
  apply(useThemeStore.getState().theme)
  useThemeStore.subscribe(({ theme }, before) => theme !== before.theme && switchTo(theme))
  window.matchMedia(DARK_QUERY).addEventListener('change', (e) => {
    const { choice } = useThemeStore.getState()
    useThemeStore.setState({ theme: resolveTheme(choice, e.matches) })
  })
  window.addEventListener('storage', (e) => {
    if (e.key === THEME_STORAGE_KEY) void useThemeStore.persist.rehydrate()
  })
}
