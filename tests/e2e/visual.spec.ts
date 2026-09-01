import { expect, test, type Page } from '@playwright/test'
import { mockKomari132 } from './mockKomari132'

type Theme = 'light' | 'dark'

const themes: Theme[] = ['light', 'dark']
const viewports = [
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'compact-1024', width: 1024, height: 768 },
  { name: 'desktop-1440', width: 1440, height: 900 },
] as const

async function applyTheme(page: Page, theme: Theme) {
  await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
  await page.evaluate((selectedTheme) => {
    document.documentElement.dataset.theme = selectedTheme
    document.documentElement.style.colorScheme = selectedTheme
  }, theme)
  await page.evaluate(async () => {
    await document.fonts.ready
  })
}

async function captureWorkspace(page: Page, name: string) {
  await expect(page.getByRole('main')).toBeVisible()

  const horizontalOverflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  )
  expect(horizontalOverflow).toBeLessThanOrEqual(1)

  await expect(page).toHaveScreenshot(`${name}.png`, {
    fullPage: true,
    animations: 'disabled',
    maxDiffPixelRatio: 0.01,
  })
}

for (const viewport of viewports) {
  for (const theme of themes) {
    test(`captures ${theme} at ${viewport.width}px`, async ({ page }) => {
      await mockKomari132(page)
      await page.clock.setFixedTime(new Date('2026-08-30T04:00:00Z'))
      await page.setViewportSize(viewport)
      await page.goto('/')
      await applyTheme(page, theme)
      await expect(
        page.getByRole('heading', { name: '探针', exact: true }),
      ).toBeVisible()
      await captureWorkspace(page, `${theme}-${viewport.name}`)
    })
  }
}

for (const viewport of [viewports[0], viewports[2]]) {
  for (const theme of themes) {
    test(`captures ${theme} cards at ${viewport.width}px`, async ({ page }) => {
      await mockKomari132(page)
      await page.clock.setFixedTime(new Date('2026-08-30T04:00:00Z'))
      await page.setViewportSize(viewport)
      await page.goto('/')
      await applyTheme(page, theme)
      await page.getByRole('button', { name: '卡片视图' }).click()
      await expect(page.locator('.probe-card')).toHaveCount(3)
      await captureWorkspace(page, `${theme}-cards-${viewport.name}`)
    })
  }
}

for (const theme of themes) {
  test(`captures ${theme} history at 1440px`, async ({ page }) => {
    await mockKomari132(page)
    await page.clock.setFixedTime(new Date('2026-08-30T04:00:00Z'))
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/instance/node-online')
    await applyTheme(page, theme)
    await expect(page.getByText('探针历史')).toBeVisible()
    await expect(page.locator('.history-chart-loading')).toHaveCount(0)
    await expect(page.locator('.uplot').first()).toBeVisible()
    await captureWorkspace(page, `${theme}-history-1440`)
  })
}
