import { useEffect, useState } from 'react'
import { MoonIcon, SunIcon } from './Icons'

export type ThemePreference = 'system' | 'light' | 'dark'
type ResolvedTheme = Exclude<ThemePreference, 'system'>

export interface AppearanceToggleProps {
  defaultPreference?: ThemePreference
}

const APPEARANCE_STORAGE_KEY = 'appearance'
const LEGACY_APPEARANCE_STORAGE_KEY = 'komarima-theme'

function isThemePreference(value: string | null): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system'
}

function loadLocalPreference(): ThemePreference | null {
  if (typeof window === 'undefined') return null

  try {
    const stored = window.localStorage.getItem(APPEARANCE_STORAGE_KEY)
    if (isThemePreference(stored)) return stored
    const legacy = window.localStorage.getItem(LEGACY_APPEARANCE_STORAGE_KEY)
    return isThemePreference(legacy) ? legacy : null
  } catch {
    return null
  }
}

function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference !== 'system') return preference
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

export function AppearanceToggle({
  defaultPreference = 'system',
}: AppearanceToggleProps) {
  const [localPreference, setLocalPreference] =
    useState<ThemePreference | null>(loadLocalPreference)
  const preference = localPreference ?? defaultPreference
  const [theme, setTheme] = useState<ResolvedTheme>(() =>
    resolveTheme(preference),
  )

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)')
    const apply = () => {
      const nextTheme = resolveTheme(preference)
      setTheme(nextTheme)
      document.documentElement.dataset.theme = nextTheme
      document.documentElement.dataset.themePreference = preference
    }

    apply()
    media?.addEventListener('change', apply)
    return () => media?.removeEventListener('change', apply)
  }, [preference])

  useEffect(() => {
    if (localPreference === null) return

    try {
      window.localStorage.setItem(APPEARANCE_STORAGE_KEY, localPreference)
      window.localStorage.removeItem(LEGACY_APPEARANCE_STORAGE_KEY)
    } catch {
      // The preference still applies for the current session.
    }
  }, [localPreference])

  const target: ResolvedTheme = theme === 'dark' ? 'light' : 'dark'
  const targetLabel = target === 'dark' ? '深色' : '浅色'

  return (
    <button
      aria-label={`切换${targetLabel}`}
      className="toolbar-button appearance-toggle"
      onClick={() => setLocalPreference(target)}
      title={`切换${targetLabel}`}
      type="button"
    >
      {target === 'dark' ? (
        <MoonIcon className="toolbar-icon" />
      ) : (
        <SunIcon className="toolbar-icon" />
      )}
      <span className="toolbar-label">{targetLabel}</span>
    </button>
  )
}
