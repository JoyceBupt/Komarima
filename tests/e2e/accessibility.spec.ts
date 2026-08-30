import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { mockKomari132 } from './mockKomari132'

const themes = ['light', 'dark'] as const

async function expectNoSeriousViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze()
  const blocking = results.violations.filter(
    (violation) =>
      violation.impact === 'serious' || violation.impact === 'critical',
  )
  expect(blocking).toEqual([])
}

for (const theme of themes) {
  test(`has no serious ${theme} workspace violations`, async ({ page }) => {
    await mockKomari132(page)
    await page.clock.setFixedTime(new Date('2026-08-30T04:00:00Z'))
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')
    await expect(page.getByRole('heading', { name: '全部探针' })).toBeVisible()

    await expectNoSeriousViolations(page)
  })

  test(`has no serious ${theme} history violations`, async ({ page }) => {
    await mockKomari132(page)
    await page.clock.setFixedTime(new Date('2026-08-30T04:00:00Z'))
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/instance/node-online')
    await page.getByRole('link', { name: '详情' }).click()
    await expect(page.getByText('探针历史')).toBeVisible()
    await expect(page.locator('.history-chart-loading')).toHaveCount(0)

    await expectNoSeriousViolations(page)
  })
}

test('has no serious mobile inspector violations', async ({ page }) => {
  await mockKomari132(page)
  await page.clock.setFixedTime(new Date('2026-08-30T04:00:00Z'))
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.getByRole('button', { name: /Tokyo Edge/ }).click()
  await expect(page.getByRole('dialog', { name: '探针检查器' })).toBeVisible()

  await expectNoSeriousViolations(page)
})

test('has no serious private gate violations', async ({ page }) => {
  await mockKomari132(page, { privateSite: true })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '需要登录' })).toBeVisible()

  await expectNoSeriousViolations(page)
})
