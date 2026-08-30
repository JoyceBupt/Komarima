import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { CheckIcon, PaletteIcon } from './Icons'

export type ThemePreference = 'system' | 'light' | 'dark'

export interface AppearanceMenuProps {
  defaultPreference?: ThemePreference
}

const APPEARANCE_STORAGE_KEY = 'appearance'
const LEGACY_APPEARANCE_STORAGE_KEY = 'komarima-theme'

const themeOptions: ReadonlyArray<{ value: ThemePreference; label: string }> = [
  { value: 'system', label: '自动' },
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
]

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

function resolveTheme(preference: ThemePreference) {
  if (preference !== 'system') return preference
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

function getMenuItems(menu: HTMLDivElement | null) {
  return menu
    ? Array.from(
        menu.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]'),
      )
    : []
}

export function AppearanceMenu({
  defaultPreference = 'system',
}: AppearanceMenuProps) {
  const menuId = `appearance-menu-${useId().replaceAll(':', '')}`
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const initialFocusRef = useRef<'selected' | 'first' | 'last'>('selected')
  const [isOpen, setIsOpen] = useState(false)
  const [localPreference, setLocalPreference] =
    useState<ThemePreference | null>(loadLocalPreference)
  const preference = localPreference ?? defaultPreference

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)')
    const apply = () => {
      document.documentElement.dataset.theme = resolveTheme(preference)
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

  useEffect(() => {
    if (!isOpen) return

    const items = getMenuItems(menuRef.current)
    const focusTarget = initialFocusRef.current
    const target =
      focusTarget === 'first'
        ? items[0]
        : focusTarget === 'last'
          ? items.at(-1)
          : items.find((item) => item.getAttribute('aria-checked') === 'true')

    ;(target ?? items[0])?.focus()
    initialFocusRef.current = 'selected'
  }, [isOpen, preference])

  useEffect(() => {
    if (!isOpen) return

    const closeOnOutsideClick = (event: MouseEvent) => {
      if (
        event.target instanceof Node &&
        !rootRef.current?.contains(event.target)
      ) {
        setIsOpen(false)
        triggerRef.current?.focus()
      }
    }

    document.addEventListener('click', closeOnOutsideClick)
    return () => document.removeEventListener('click', closeOnOutsideClick)
  }, [isOpen])

  const openMenu = (focus: 'selected' | 'first' | 'last') => {
    initialFocusRef.current = focus
    setIsOpen(true)
  }

  const closeMenu = () => {
    setIsOpen(false)
    triggerRef.current?.focus()
  }

  const handleTriggerKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
  ) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      openMenu(event.key === 'ArrowDown' ? 'first' : 'last')
    }
  }

  const handleMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      closeMenu()
      return
    }

    const items = getMenuItems(menuRef.current)
    if (!items.length) return

    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      items[event.key === 'Home' ? 0 : items.length - 1]?.focus()
      return
    }

    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    const activeIndex = items.indexOf(
      document.activeElement as HTMLButtonElement,
    )
    const offset = event.key === 'ArrowDown' ? 1 : -1
    const nextIndex = (activeIndex + offset + items.length) % items.length
    items[nextIndex]?.focus()
  }

  return (
    <div className="toolbar-popover" ref={rootRef}>
      <button
        aria-controls={menuId}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        className="toolbar-button"
        onClick={() => (isOpen ? closeMenu() : openMenu('selected'))}
        onKeyDown={handleTriggerKeyDown}
        ref={triggerRef}
        type="button"
      >
        <PaletteIcon className="toolbar-icon" />
        <span className="toolbar-label">外观</span>
      </button>

      {isOpen ? (
        <div
          aria-label="外观"
          className="popover-menu appearance-menu"
          id={menuId}
          onKeyDown={handleMenuKeyDown}
          ref={menuRef}
          role="menu"
        >
          {themeOptions.map((option) => (
            <button
              aria-checked={preference === option.value}
              className="popover-item"
              key={option.value}
              onClick={() => {
                setLocalPreference(option.value)
                closeMenu()
              }}
              role="menuitemradio"
              tabIndex={preference === option.value ? 0 : -1}
              type="button"
            >
              <span>{option.label}</span>
              {preference === option.value ? (
                <CheckIcon className="popover-check" />
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
