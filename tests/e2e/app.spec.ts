import { expect, test } from '@playwright/test'
import { mockKomari132 } from './mockKomari132'

test('loads the public workspace without browser errors', async ({ page }) => {
  await mockKomari132(page)
  const browserErrors: string[] = []

  page.on('console', (message) => {
    if (message.type() === 'error') {
      browserErrors.push(message.text())
    }
  })
  page.on('pageerror', (error) => browserErrors.push(error.message))

  await page.goto('/')

  await expect(page).toHaveTitle(/Komari Monitor/)
  await expect(page.locator('#root')).not.toBeEmpty()
  await expect(page.getByRole('main')).toBeVisible()
  await expect(page.getByRole('heading', { name: '全部探针' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Tokyo Edge/ })).toBeVisible()
  expect(browserErrors).toEqual([])
})

test('loads an instance deep link through the SPA fallback', async ({
  page,
}) => {
  await mockKomari132(page)
  const response = await page.goto('/instance/node-online')

  expect(response?.ok()).toBe(true)
  await expect(page.getByRole('main')).toBeVisible()
  await expect(page.getByRole('heading', { name: '全部探针' })).toBeVisible()
})

test('loads history only after the detail action', async ({ page }) => {
  const mock = await mockKomari132(page)
  await page.goto('/instance/node-online')
  await expect(page.getByRole('heading', { name: '全部探针' })).toBeVisible()
  expect(mock.rpcMethods).not.toContain('public:queryMetrics')
  expect(
    (await page.locator('.inspector-pane').boundingBox())?.width,
  ).toBeGreaterThan(300)

  await page.getByRole('link', { name: '详情' }).click()

  await expect(page).toHaveURL(/view=history/)
  await expect(page.getByText('探针历史')).toBeVisible()
  await expect(page.getByRole('button', { name: '1h' })).toBeVisible()
  await expect
    .poll(
      () =>
        mock.rpcMethods.filter((method) => method === 'public:queryMetrics')
          .length,
    )
    .toBe(4)

  const pingCard = page.locator('.history-ping-card')
  await expect(pingCard).toBeVisible()
  await expect(
    pingCard.getByRole('heading', { name: 'Ping 延迟' }),
  ).toBeVisible()
  await expect(pingCard.getByText('东京 NTT', { exact: true })).toBeVisible()
  await expect(pingCard.getByText('新加坡 CMI', { exact: true })).toBeVisible()
  const pingPlot = pingCard.locator('.uplot')
  await expect(pingPlot).toBeVisible()
  await expect(page.locator('.uplot')).toHaveCount(6)
  await pingPlot.evaluate((element) => {
    ;(
      window as typeof window & { __komarimaFirstPlot?: Element }
    ).__komarimaFirstPlot = element
  })
  await page.waitForTimeout(1_200)
  expect(
    await pingPlot.evaluate(
      (element) =>
        element ===
        (window as typeof window & { __komarimaFirstPlot?: Element })
          .__komarimaFirstPlot,
    ),
  ).toBe(true)
})

test('refreshes node metadata every minute while visible', async ({ page }) => {
  await page.clock.install({
    time: new Date('2026-08-30T04:00:00Z'),
  })
  const mock = await mockKomari132(page)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '全部探针' })).toBeVisible()
  expect(
    mock.rpcMethods.filter((method) => method === 'public:getNodesInformation'),
  ).toHaveLength(1)

  await page.clock.fastForward(60_100)

  await expect
    .poll(
      () =>
        mock.rpcMethods.filter(
          (method) => method === 'public:getNodesInformation',
        ).length,
    )
    .toBe(2)
})

test('stops before RPC on an anonymous private site', async ({ page }) => {
  const mock = await mockKomari132(page, { privateSite: true })

  await page.goto('/')

  await expect(page.getByRole('heading', { name: '需要登录' })).toBeVisible()
  await expect(page.getByRole('link', { name: '登录' })).toHaveAttribute(
    'href',
    '/admin',
  )
  expect(mock.rpcMethods).toEqual([])
})

test('bounds recovery when a public RPC remains denied', async ({ page }) => {
  const mock = await mockKomari132(page, { rpcDenied: true })

  await page.goto('/')
  await expect(page.getByRole('heading', { name: '载入失败' })).toBeVisible()
  await page.waitForTimeout(500)

  expect(mock.rpcMethods).toHaveLength(2)
  expect(mock.meRequests).toBeLessThanOrEqual(3)
})

test('drops hidden-node cache when an administrator signs out', async ({
  page,
}) => {
  await page.clock.install({
    time: new Date('2026-08-30T04:00:00Z'),
  })
  const mock = await mockKomari132(page, { authenticated: true })
  await page.goto('/')
  await expect(
    page.getByRole('button', { name: /Hidden Admin Probe/ }),
  ).toBeVisible()

  mock.setAuthenticated(false)
  await page.clock.fastForward(30_100)

  await expect(
    page.getByRole('button', { name: /Hidden Admin Probe/ }),
  ).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Tokyo Edge/ })).toBeVisible()
  expect(mock.meRequests).toBeGreaterThanOrEqual(2)
})

test('clears private data when a session expires', async ({ page }) => {
  await page.clock.install({
    time: new Date('2026-08-30T04:00:00Z'),
  })
  const mock = await mockKomari132(page, {
    authenticated: true,
    privateSite: true,
  })
  await page.goto('/')
  await expect(page.getByRole('button', { name: /Tokyo Edge/ })).toBeVisible()

  mock.setAuthenticated(false)
  mock.setRpcDenied(true)
  await page.clock.fastForward(10_100)

  await expect(page.getByRole('heading', { name: '需要登录' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Tokyo Edge/ })).toHaveCount(0)
})

test('ignores default-on Ping tasks not assigned to the probe', async ({
  page,
}) => {
  const mock = await mockKomari132(page, { unassignedDefaultPing: true })
  await page.goto('/instance/node-online')
  await page.getByRole('link', { name: '详情' }).click()
  await expect(page.getByText('探针历史')).toBeVisible()

  await expect
    .poll(
      () =>
        mock.rpcMethods.filter((method) => method === 'public:queryMetrics')
          .length,
    )
    .toBe(2)
  await expect(page.locator('.history-ping-card')).toHaveCount(0)
})

test('reports Ping task failures as history errors', async ({ page }) => {
  await mockKomari132(page, { failPingTasks: true })
  await page.goto('/instance/node-online')
  await page.getByRole('link', { name: '详情' }).click()

  await expect(page.getByRole('alert')).toContainText('加载失败')
})

test('restores filtering and sorting from the URL', async ({ page }) => {
  await mockKomari132(page)

  await page.goto('/?q=Frankfurt&connection=offline')
  await expect(
    page.getByRole('button', { name: /Frankfurt Core/ }),
  ).toBeVisible()
  await expect(page.locator('.probe-row')).toHaveCount(1)

  await page.reload()
  await expect(
    page.getByRole('button', { name: /Frankfurt Core/ }),
  ).toBeVisible()
  await page.getByRole('button', { name: '按CPU降序排列' }).click()
  await expect(page).toHaveURL(/sort=cpu/)
  await expect(page).toHaveURL(/dir=desc/)
})

test('traps and restores focus for the mobile inspector', async ({ page }) => {
  await mockKomari132(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  const probeRow = page.getByRole('button', { name: /Tokyo Edge/ })

  await probeRow.click()
  const inspector = page.getByRole('dialog', { name: '探针检查器' })
  await expect(inspector).toBeVisible()
  await page.keyboard.press('Tab')
  expect(
    await inspector.evaluate((element) =>
      element.contains(document.activeElement),
    ),
  ).toBe(true)

  await page.keyboard.press('Escape')
  await expect(inspector).toHaveCount(0)
  await expect(probeRow).toBeFocused()

  await probeRow.click()
  await page.getByRole('link', { name: '详情' }).click()
  await expect(page).toHaveURL(/view=history/)
  await expect(inspector).toHaveCount(0)
  await expect(page.getByText('探针历史')).toBeVisible()
  await expect(page.getByRole('button', { name: '返回探针' })).toBeFocused()
  await expect(page.locator('.history-ping-card .uplot')).toBeVisible()
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(1)

  await page.reload()
  await expect(inspector).toHaveCount(0)
  await expect(page.locator('.history-ping-card .uplot')).toBeVisible()

  await page.goBack()
  await expect(page).not.toHaveURL(/view=history/)
  await page.getByRole('button', { name: '切换检查器' }).click()
  await expect(inspector).toBeVisible()

  await page.goForward()
  await expect(page).toHaveURL(/view=history/)
  await expect(inspector).toHaveCount(0)
  await expect(page.locator('.history-ping-card .uplot')).toBeVisible()
})

test('keeps a 500-probe workspace bounded', async ({ page }) => {
  const mock = await mockKomari132(page, { nodeCount: 500 })
  await page.setViewportSize({ width: 1440, height: 900 })

  const loadStartedAt = Date.now()
  await page.goto('/')
  await expect(page.getByText('500 在线')).toBeVisible()
  expect(Date.now() - loadStartedAt).toBeLessThan(3_000)

  const renderedRows = await page.locator('.probe-row').count()
  expect(renderedRows).toBeLessThanOrEqual(40)
  expect(
    mock.rpcMethods.filter((method) => method === 'common:getNodesLatestStatus')
      .length,
  ).toBe(1)

  const firstProbe = page.getByRole('button', { name: /Probe 0000/ })
  await firstProbe.focus()
  await page.keyboard.press('End')
  await expect(page.getByRole('button', { name: /Probe 0499/ })).toBeFocused()
  await expect(
    page.getByRole('button', { name: /Probe 0499/ }),
  ).toHaveAccessibleName(/第500项，共500项/)

  await page.getByRole('button', { name: '搜索' }).click()
  const filterStartedAt = Date.now()
  await page.getByRole('searchbox', { name: '搜索探针' }).fill('Probe 0499')
  await expect(page.getByRole('button', { name: /Probe 0499/ })).toBeVisible()
  expect(Date.now() - filterStartedAt).toBeLessThan(250)
  await expect(page.locator('.probe-row')).toHaveCount(1)
})
