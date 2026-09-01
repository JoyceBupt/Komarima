import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import indexHtml from '../../index.html?raw'
import { AppearanceToggle } from './AppearanceToggle'

const mediaListeners = new Set<() => void>()
let systemDark = false

beforeEach(() => {
  systemDark = false
  mediaListeners.clear()
  window.localStorage.clear()
  delete document.documentElement.dataset.theme
  delete document.documentElement.dataset.themePreference
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query === '(prefers-color-scheme: dark)' && systemDark,
      media: query,
      onchange: null,
      addEventListener: (_type: string, listener: () => void) =>
        mediaListeners.add(listener),
      removeEventListener: (_type: string, listener: () => void) =>
        mediaListeners.delete(listener),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('AppearanceToggle', () => {
  it('applies the saved appearance before the application entry', () => {
    const prepaintIndex = indexHtml.indexOf("getItem('appearance')")
    const applicationIndex = indexHtml.indexOf('src="/src/main.tsx"')

    expect(prepaintIndex).toBeGreaterThan(-1)
    expect(prepaintIndex).toBeLessThan(applicationIndex)
    expect(indexHtml).toContain('document.documentElement.dataset.theme')
    expect(indexHtml).toContain("getItem('komarima-theme')")
  })

  it('uses a saved choice before the site default', () => {
    window.localStorage.setItem('appearance', 'light')
    const { rerender } = render(<AppearanceToggle defaultPreference="dark" />)

    expect(document.documentElement.dataset.theme).toBe('light')
    rerender(<AppearanceToggle defaultPreference="system" />)
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('migrates the legacy storage key', () => {
    window.localStorage.setItem('komarima-theme', 'dark')
    render(<AppearanceToggle defaultPreference="light" />)

    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(window.localStorage.getItem('appearance')).toBe('dark')
    expect(window.localStorage.getItem('komarima-theme')).toBeNull()
  })

  it('switches the rendered theme in one click and persists it', async () => {
    const user = userEvent.setup()
    render(<AppearanceToggle defaultPreference="system" />)

    const toggle = screen.getByRole('button', { name: '切换深色' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    await user.click(toggle)

    expect(window.localStorage.getItem('appearance')).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(toggle).toHaveAccessibleName('切换浅色')
  })

  it('follows system changes until the user makes a choice', async () => {
    render(<AppearanceToggle defaultPreference="system" />)
    expect(document.documentElement.dataset.theme).toBe('light')

    systemDark = true
    await act(async () => mediaListeners.forEach((listener) => listener()))
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(screen.getByRole('button')).toHaveAccessibleName('切换浅色')
  })
})
