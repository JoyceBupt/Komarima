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
  await expect(
    page.getByRole('heading', { name: '探针', exact: true }),
  ).toBeVisible()
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
  await expect(page.getByText('探针历史')).toBeVisible()
  await page.getByRole('button', { name: '返回探针列表' }).click()
  await expect(page).toHaveURL(/\/$/)
})

test('opens the Komari admin route through a hard navigation', async ({
  page,
}) => {
  await mockKomari132(page)
  await page.setViewportSize({ width: 320, height: 700 })
  await page.goto('/')

  const adminLink = page.getByRole('link', { name: '管理后台' })
  await expect(adminLink).toBeVisible()
  await expect(adminLink).toHaveAttribute('href', '/admin')
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(1)

  const adminRequest = page.waitForRequest(
    (request) =>
      request.isNavigationRequest() &&
      new URL(request.url()).pathname === '/admin',
  )
  await adminLink.click()
  expect(new URL((await adminRequest).url()).pathname).toBe('/admin')
})

test('opens history directly when a probe is selected', async ({ page }) => {
  const mock = await mockKomari132(page)
  await page.goto('/')
  await expect(
    page.getByRole('heading', { name: '探针', exact: true }),
  ).toBeVisible()
  expect(mock.rpcMethods).not.toContain('public:queryMetrics')

  await page.getByRole('button', { name: /Tokyo Edge/ }).click()

  await expect(page).toHaveURL(/\/instance\/node-online\?range=6h/)
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

  const tokyoToggle = pingCard.getByRole('button', {
    name: '东京 NTT，已显示',
  })
  await tokyoToggle.click()
  await expect(
    pingCard.getByRole('button', { name: '东京 NTT，已隐藏' }),
  ).toHaveAttribute('aria-pressed', 'false')
  await expect(pingCard.getByText('1/2 条线路')).toBeVisible()
  await expect(pingCard.locator('.uplot')).toBeVisible()

  await page.goBack()
  await expect(page).toHaveURL(/\/$/)
  await expect(
    page.getByRole('heading', { name: '探针', exact: true }),
  ).toBeVisible()
  await page.goForward()
  await expect(page.getByText('探针历史')).toBeVisible()

  await page.getByRole('button', { name: '24h' }).click()
  await page.getByRole('button', { name: '返回探针列表' }).click()
  await expect(page).toHaveURL(/\/$/)
  await page.goForward()
  await expect(page).toHaveURL(/\/instance\/node-online\?range=24h/)
})

test('refreshes node metadata every minute while visible', async ({ page }) => {
  await page.clock.install({
    time: new Date('2026-08-30T04:00:00Z'),
  })
  const mock = await mockKomari132(page)
  await page.goto('/')
  await expect(
    page.getByRole('heading', { name: '探针', exact: true }),
  ).toBeVisible()
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

  await expect(page.getByRole('alert')).toContainText('加载失败')
})

test('switches and restores the card view with native metadata', async ({
  page,
}) => {
  await mockKomari132(page)
  await page.clock.setFixedTime(new Date('2026-08-30T04:00:00Z'))
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')

  await expect(page.locator('.fleet-summary .sr-only')).toHaveText(
    '1 在线，1 离线，1 暂无上报',
  )
  await page.getByRole('button', { name: '卡片视图' }).click()
  await expect(page.locator('.probe-card')).toHaveCount(3)
  const tokyo = page.getByRole('button', { name: /Tokyo Edge/ })
  await expect(tokyo).toContainText('Public edge')
  await expect(tokyo).toContainText('$8.5/月')
  await expect(tokyo).toContainText('13.4 MB / 1 TB')
  await expect(tokyo).toContainText('合计')
  const cardLayout = await page.locator('.probe-card').evaluateAll((cards) =>
    cards.map((card) => ({
      height: card.getBoundingClientRect().height,
      metricsTop: card
        .querySelector('.probe-card-metrics')
        ?.getBoundingClientRect().top,
      trafficTop: card
        .querySelector('.probe-card-traffic')
        ?.getBoundingClientRect().top,
      footerTop: card
        .querySelector('.probe-card-footer')
        ?.getBoundingClientRect().top,
    })),
  )
  for (const key of [
    'height',
    'metricsTop',
    'trafficTop',
    'footerTop',
  ] as const) {
    const values = cardLayout.map((card) => card[key] ?? Number.NaN)
    expect(values.every(Number.isFinite)).toBe(true)
    expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(1)
  }
  expect(
    await page.evaluate(() => localStorage.getItem('komarima-workspace-view')),
  ).toBe('cards')

  await page.reload()
  await expect(page.getByRole('button', { name: '卡片视图' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(page.locator('.probe-card')).toHaveCount(3)
})

test('keeps mobile card navigation direct and reversible', async ({ page }) => {
  await mockKomari132(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.getByRole('button', { name: '卡片视图' }).click()
  const probeCard = page.getByRole('button', { name: /Tokyo Edge/ })
  await expect(probeCard).toContainText('Public edge')
  await probeCard.click()
  await expect(page).toHaveURL(/\/instance\/node-online\?range=6h/)
  await expect(page.getByText('探针历史')).toBeVisible()
  await expect(page.getByRole('button', { name: '返回探针列表' })).toBeVisible()
  await expect(page.locator('.history-ping-card .uplot')).toBeVisible()
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(1)

  await page.reload()
  await expect(page.locator('.history-ping-card .uplot')).toBeVisible()

  await page.goBack()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.locator('.probe-card')).toHaveCount(3)
  await page.goForward()
  await expect(page).toHaveURL(/\/instance\/node-online\?range=6h/)
  await expect(page.locator('.history-ping-card .uplot')).toBeVisible()
})

test('uses each metric retention while keeping the 7d Ping range', async ({
  page,
}) => {
  const mock = await mockKomari132(page, {
    metricRetentionDays: {
      'cpu.usage': 1,
      'memory.used': 1,
      'disk.used': 1,
      'net.in.rate': 1,
      'net.out.rate': 1,
      'ping.latency_ms': 7,
    },
  })
  await page.goto('/')
  await page.getByRole('button', { name: /Tokyo Edge/ }).click()
  await page.getByRole('button', { name: '7d' }).click()

  await expect(page.getByText('资源24h · Ping7d')).toBeVisible()
  await expect(
    page.locator('.history-chart-card[data-tone="cpu"] .uplot'),
  ).toBeVisible()
  await expect(page.locator('.history-ping-card .uplot')).toBeVisible()

  await expect
    .poll(
      () =>
        mock.rpcRequests.filter(
          (request) =>
            request.method === 'public:queryMetrics' &&
            request.params?.hours === 168,
        ).length,
    )
    .toBe(2)
  const sevenDayQueries = mock.rpcRequests.filter(
    (request) =>
      request.method === 'public:queryMetrics' && request.params?.hours === 168,
  )
  expect(
    sevenDayQueries.every(
      (request) => request.params?.metric_key === 'ping.latency_ms',
    ),
  ).toBe(true)
  expect(
    mock.rpcRequests.some(
      (request) =>
        request.method === 'public:queryMetrics' &&
        request.params?.hours === 24 &&
        Array.isArray(request.params.metric_keys) &&
        request.params.metric_keys.includes('cpu.usage'),
    ),
  ).toBe(true)
})
