import type { Page } from '@playwright/test'
import {
  createKomari132Scenario,
  type Komari132ScenarioOptions,
} from '../../preview/komari132Scenario'

export async function mockKomari132(
  page: Page,
  options: Komari132ScenarioOptions = {},
) {
  const scenario = createKomari132Scenario(options)

  for (const path of ['/api/public', '/api/me']) {
    await page.route(`**${path}`, async (route) => {
      const response = scenario.handleRest(route.request().url())
      if (!response) throw new Error(`Unhandled Komari REST path: ${path}`)
      await route.fulfill({ status: response.status, json: response.body })
    })
  }

  await page.route('**/api/rpc2', async (route) => {
    const response = scenario.handleRpc(route.request().postDataJSON())
    await route.fulfill({ status: response.status, json: response.body })
  })

  return scenario
}
