import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import indexHtml from '../../index.html?raw'
import { AppearanceMenu } from './AppearanceMenu'

const mediaListeners = new Set<(event: MediaQueryListEvent) => void>()
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
      addEventListener: (
        _type: string,
        listener: (event: MediaQueryListEvent) => void,
      ) => mediaListeners.add(listener),
      removeEventListener: (
        _type: string,
        listener: (event: MediaQueryListEvent) => void,
      ) => mediaListeners.delete(listener),
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

describe('AppearanceMenu', () => {
  it('applies the saved appearance in head before the application entry', () => {
    const prepaintIndex = indexHtml.indexOf("getItem('appearance')")
    const applicationIndex = indexHtml.indexOf('src="/src/main.tsx"')

    expect(prepaintIndex).toBeGreaterThan(-1)
    expect(prepaintIndex).toBeLessThan(applicationIndex)
    expect(indexHtml).toContain('document.documentElement.dataset.theme')
    expect(indexHtml).toContain("getItem('komarima-theme')")
  })

  it('uses a local preference before the site default and follows prop changes otherwise', () => {
    window.localStorage.setItem('appearance', 'light')
    const { rerender } = render(<AppearanceMenu defaultPreference="dark" />)

    expect(document.documentElement.dataset.theme).toBe('light')
    rerender(<AppearanceMenu defaultPreference="system" />)
    expect(document.documentElement.dataset.theme).toBe('light')

    cleanup()
    window.localStorage.clear()
    const siteDefault = render(<AppearanceMenu defaultPreference="light" />)
    expect(document.documentElement.dataset.theme).toBe('light')
    siteDefault.rerender(<AppearanceMenu defaultPreference="dark" />)
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('migrates the legacy key to appearance', () => {
    window.localStorage.setItem('komarima-theme', 'dark')
    render(<AppearanceMenu defaultPreference="light" />)

    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(window.localStorage.getItem('appearance')).toBe('dark')
    expect(window.localStorage.getItem('komarima-theme')).toBeNull()
  })

  it('focuses the selected item and supports menu navigation and Escape', async () => {
    const user = userEvent.setup()
    render(<AppearanceMenu defaultPreference="light" />)
    const trigger = screen.getByRole('button', { name: '外观' })

    await user.click(trigger)
    const light = screen.getByRole('menuitemradio', { name: '浅色' })
    const dark = screen.getByRole('menuitemradio', { name: '深色' })
    const system = screen.getByRole('menuitemradio', { name: '自动' })
    expect(light).toHaveFocus()

    await user.keyboard('{ArrowDown}')
    expect(dark).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    expect(system).toHaveFocus()
    await user.keyboard('{End}')
    expect(dark).toHaveFocus()
    await user.keyboard('{Home}')
    expect(system).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('opens from arrow keys at each edge', async () => {
    const user = userEvent.setup()
    render(<AppearanceMenu />)
    const trigger = screen.getByRole('button', { name: '外观' })

    trigger.focus()
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('menuitemradio', { name: '自动' })).toHaveFocus()
    await user.keyboard('{Escape}')
    await user.keyboard('{ArrowUp}')
    expect(screen.getByRole('menuitemradio', { name: '深色' })).toHaveFocus()
  })

  it('closes on outside click and restores the trigger focus', async () => {
    const user = userEvent.setup()
    render(
      <>
        <AppearanceMenu />
        <button type="button">外部</button>
      </>,
    )
    const trigger = screen.getByRole('button', { name: '外观' })

    await user.click(trigger)
    await user.click(screen.getByRole('button', { name: '外部' }))

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('stores an explicit selection under appearance', async () => {
    const user = userEvent.setup()
    render(<AppearanceMenu defaultPreference="system" />)

    await user.click(screen.getByRole('button', { name: '外观' }))
    await user.click(screen.getByRole('menuitemradio', { name: '深色' }))

    expect(window.localStorage.getItem('appearance')).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(screen.getByRole('button', { name: '外观' })).toHaveFocus()
  })
})
