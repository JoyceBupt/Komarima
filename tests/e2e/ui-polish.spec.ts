import { expect, test } from '@playwright/test'
import type { Komari132RpcRequest } from '../../preview/komari132Scenario'
import { mockKomari132 } from './mockKomari132'

test('combines metadata search and filters, then restores them after detail', async ({
  page,
}) => {
  await mockKomari132(page)
  await page.goto('/')
  await expect(page.locator('.brand')).toHaveText('Komarima Lab')
  await page.getByRole('textbox', { name: '搜索探针' }).fill('production')
  await page.getByLabel('筛选分组').selectOption({ label: 'Core' })
  await page.getByLabel('筛选状态').selectOption('offline')
  await page.getByLabel('探针排序').selectOption('name')
  await expect(page.locator('.probe-row')).toHaveCount(1)
  await expect(page.locator('.probe-row')).toContainText('Frankfurt Core')
  const filteredUrl = page.url()
  await page.getByRole('button', { name: /Frankfurt Core/ }).click()
  await page.getByRole('tab', { name: '概览' }).click()
  await expect(page.getByRole('region', { name: '探针信息' })).toContainText(
    '最后上报',
  )
  await page.getByRole('button', { name: '返回探针列表' }).click()
  await expect(page).toHaveURL(filteredUrl)
  await expect(page.getByRole('textbox', { name: '搜索探针' })).toHaveValue(
    'production',
  )
  await expect(page.locator('.probe-row')).toHaveCount(1)
  await page.getByRole('button', { name: '重置', exact: true }).click()
  await expect(page.locator('.probe-row')).toHaveCount(3)
  await expect(page).toHaveURL(/\/$/)

  await page.getByLabel('筛选分组').selectOption({ label: '未分组' })
  await expect(page.locator('.probe-row')).toHaveCount(1)
  await expect(page.locator('.probe-row')).toContainText('New Probe')
  await page.reload()
  await expect(page.getByLabel('筛选分组')).toHaveValue('""')
  await page.getByRole('textbox', { name: '搜索探针' }).fill('no-match')
  await expect(page.getByText('无匹配探针')).toBeVisible()
  await page.getByRole('button', { name: '清除筛选' }).click()
  await expect(page.locator('.probe-row')).toHaveCount(3)
  for (const keyword of ['all', 'default']) {
    await page.getByRole('textbox', { name: '搜索探针' }).fill(keyword)
    await expect(page.getByRole('textbox', { name: '搜索探针' })).toHaveValue(
      keyword,
    )
    expect(new URL(page.url()).searchParams.get('q')).toBe(keyword)
    await page.getByRole('button', { name: '清除搜索' }).click()
    await expect(page.locator('.probe-row')).toHaveCount(3)
  }
})

test('sorts values with missing data last and preserves a named Ping source', async ({
  page,
}) => {
  await mockKomari132(page)
  await page.goto('/')
  await page.getByLabel('探针排序').selectOption('cpu')
  await expect(page.locator('.probe-row .probe-copy > strong')).toHaveText([
    'Tokyo Edge',
    'Frankfurt Core',
    'New Probe',
  ])
  const tokyo = page.getByRole('button', { name: /Tokyo Edge/ })
  const ping = tokyo.getByLabel('Ping21ms，Tokyo ICMP', { exact: true })
  await expect(ping).toBeVisible()
  await expect(ping).toContainText('Tokyo ICMP')
  await expect(ping.locator('.metric-track')).toHaveCount(0)
  await page.getByLabel('探针排序').selectOption('name')
  await expect(page.locator('.probe-row .probe-copy > strong')).toHaveText([
    'Frankfurt Core',
    'New Probe',
    'Tokyo Edge',
  ])
  await page.getByLabel('筛选状态').selectOption('missing')
  await expect(page.locator('.probe-row')).toHaveCount(1)
  await expect(page.locator('.probe-row')).toContainText('New Probe')
})

test('retains mobile metrics and modest rounded borders in both views', async ({
  page,
}) => {
  await mockKomari132(page)
  await page.goto('/')
  for (const width of [320, 390, 768, 1024]) {
    await page.setViewportSize({ width, height: 844 })
    await expect(page.locator('.fleet-summary')).toBeVisible()
    const tokyo = page.getByRole('button', { name: /Tokyo Edge/ })
    await expect(
      tokyo.getByText('13.4 MB / 1 TB', { exact: true }),
    ).toBeVisible()
    await expect(tokyo.locator('.probe-mobile-billing')).toBeVisible()
    await expect(tokyo.locator('.probe-mobile-billing')).toContainText(
      '$8.5/月',
    )
    if (width < 900) {
      await expect(tokyo.locator('.probe-mobile-disk')).toBeVisible()
      await expect(tokyo.locator('.probe-mobile-network')).toBeVisible()
    }
    if (width < 768) {
      await expect(tokyo.locator('.probe-mobile-meta')).toContainText(
        '磁盘 50%',
      )
      await expect(tokyo.locator('.probe-mobile-meta')).toContainText(
        '↑1 KB/s ↓2 KB/s',
      )
      await expect(tokyo.locator('.probe-mobile-meta')).toContainText('$8.5/月')
    }
    expect(
      await page.locator('.km-window').evaluate((window) => {
        const style = getComputedStyle(window)
        return (
          Number.parseFloat(style.borderRadius) > 0 &&
          Number.parseFloat(style.borderWidth) > 0
        )
      }),
    ).toBe(true)
    for (const view of ['卡片视图', '列表视图']) {
      await page.getByRole('button', { name: view, exact: true }).click()
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth,
        ),
      ).toBeLessThanOrEqual(1)
    }
  }
})

test('shows node configuration, billing and traffic reset in the overview', async ({
  page,
}) => {
  await mockKomari132(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/instance/node-online?range=7d')
  await page.getByRole('tab', { name: '概览' }).click()
  const info = page.getByRole('region', { name: '探针信息' })
  await expect(info).toBeVisible()
  for (const value of [
    'Debian 13',
    'amd64',
    '4 核',
    '8 GB',
    '100 GB',
    '$8.5/月',
    '每月1日重置',
    'Public edge',
  ]) {
    await expect(info.getByText(value, { exact: true })).toBeVisible()
  }
  await expect(
    page.getByRole('button', { name: '7d', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(1)
})

for (const [key, label, remaining] of [
  ['cpu.usage', '资源', 3],
  ['net.in.rate', '网络', 4],
] as const) {
  test(`keeps independent charts when ${label} fails and retries that section`, async ({
    page,
  }) => {
    const mock = await mockKomari132(page)
    let failing = true
    await page.route('**/api/rpc2', async (route) => {
      const request = route.request().postDataJSON() as Komari132RpcRequest
      const response = mock.handleRpc(request)
      const keys = request.params?.metric_keys
      const fail =
        failing &&
        request.method === 'public:queryMetrics' &&
        Array.isArray(keys) &&
        keys.includes(key)
      await route.fulfill({
        status: response.status,
        json: fail
          ? {
              jsonrpc: '2.0',
              id: request.id,
              error: { code: -32051, message: 'Unavailable' },
            }
          : response.body,
      })
    })
    await page.goto('/instance/node-online')
    await expect(page.getByRole('alert')).toContainText(label + ' · 加载失败')
    await expect(page.locator('.uplot')).toHaveCount(remaining)
    await expect(page.locator('.history-ping-card .uplot')).toBeVisible()
    const before = mock.rpcRequests.filter(
      (request) => request.method === 'public:queryMetrics',
    ).length
    failing = false
    await page
      .getByRole('button', { name: '重试' + label, exact: true })
      .click()
    await expect(page.getByRole('alert')).toHaveCount(0)
    await expect(page.locator('.uplot')).toHaveCount(6)
    expect(
      mock.rpcRequests.filter(
        (request) => request.method === 'public:queryMetrics',
      ),
    ).toHaveLength(before + 1)
  })
}

test('keeps available Ping lines when one task fails', async ({ page }) => {
  const mock = await mockKomari132(page)
  await page.route('**/api/rpc2', async (route) => {
    const request = route.request().postDataJSON() as Komari132RpcRequest
    const response = mock.handleRpc(request)
    const tags = request.params?.tags as Record<string, string> | undefined
    const fail =
      request.method === 'public:queryMetrics' && tags?.task_id === '8'
    await route.fulfill({
      status: response.status,
      json: fail
        ? {
            jsonrpc: '2.0',
            id: request.id,
            error: { code: -32051, message: 'Unavailable' },
          }
        : response.body,
    })
  })
  await page.goto('/instance/node-online')
  await expect(page.getByRole('alert')).toContainText('Ping · 部分失败')
  await expect(page.locator('.uplot')).toHaveCount(6)
  await expect(
    page.getByRole('button', { name: '新加坡 CMI，已显示' }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: '东京 NTT，已显示' }),
  ).toHaveCount(0)
})

test('revokes loaded detail data when the private session expires', async ({
  page,
}) => {
  await page.clock.install({ time: new Date('2026-08-30T04:00:00Z') })
  const mock = await mockKomari132(page, {
    authenticated: true,
    privateSite: true,
  })
  await page.goto('/instance/node-online')
  await expect(page.locator('.uplot')).toHaveCount(6)
  mock.setAuthenticated(false)
  mock.setRpcDenied(true)
  await page.clock.fastForward(10_100)
  await expect(page.getByRole('heading', { name: '需要登录' })).toBeVisible()
  await expect(page.locator('.uplot')).toHaveCount(0)
  await expect(page.getByText('Tokyo Edge', { exact: true })).toHaveCount(0)
  await expect(page.locator('.gate-mark')).toHaveCount(0)
  await expect(page.locator('.gate-static-mark')).toBeVisible()
})
