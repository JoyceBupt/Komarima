import type { Page } from '@playwright/test'
import latestStatusResponse from '../fixtures/komari-1.3.2/latest-status-rpc.json' with { type: 'json' }
import meGuest from '../fixtures/komari-1.3.2/me-guest.json' with { type: 'json' }
import metricDefinitionsResponse from '../fixtures/komari-1.3.2/metric-definitions-rpc.json' with { type: 'json' }
import metricQueryResponse from '../fixtures/komari-1.3.2/metric-query-rpc.json' with { type: 'json' }
import nodesResponse from '../fixtures/komari-1.3.2/nodes-rpc.json' with { type: 'json' }
import publicInfo from '../fixtures/komari-1.3.2/public-info.json' with { type: 'json' }
import privateSitePublic from '../fixtures/komari-1.3.2/private-site-public.json' with { type: 'json' }

interface RpcRequest {
  id: string | number
  method: string
  params?: Record<string, unknown>
}

function requestedMetricKeys(params: Record<string, unknown> | undefined) {
  if (!params) return []
  const values = [
    params.metric_key,
    ...(Array.isArray(params.metric_keys) ? params.metric_keys : []),
    ...(Array.isArray(params.metrics) ? params.metrics : []),
  ]
  return values.filter((value): value is string => typeof value === 'string')
}

export async function mockKomari132(
  page: Page,
  options: {
    privateSite?: boolean
    nodeCount?: number
    authenticated?: boolean
    rpcDenied?: boolean
    unassignedDefaultPing?: boolean
    failPingTasks?: boolean
  } = {},
) {
  const rpcMethods: string[] = []
  let authenticated = Boolean(options.authenticated)
  let rpcDenied = Boolean(options.rpcDenied)
  let meRequests = 0
  const publicNodes = options.nodeCount
    ? Array.from({ length: options.nodeCount }, (_, index) => ({
        ...nodesResponse.result[0],
        uuid: `node-${String(index).padStart(4, '0')}`,
        name: `Probe ${String(index).padStart(4, '0')}`,
        group: `Group ${index % 10}`,
        region: `Region ${index % 20}`,
        weight: index,
      }))
    : nodesResponse.result
  const hiddenNode = {
    ...nodesResponse.result[0],
    uuid: 'node-hidden',
    name: 'Hidden Admin Probe',
    hidden: true,
    weight: 99,
  }
  const resultNodes = () =>
    authenticated ? [...publicNodes, hiddenNode] : publicNodes
  const baseStatus = latestStatusResponse.result['node-online']
  const publicStatuses = options.nodeCount
    ? Object.fromEntries(
        publicNodes.map((node, index) => [
          node.uuid,
          {
            ...baseStatus,
            client: node.uuid,
            cpu: index % 100,
            online: true,
            ping: {},
          },
        ]),
      )
    : latestStatusResponse.result
  const resultStatuses = () =>
    authenticated
      ? {
          ...publicStatuses,
          'node-hidden': { ...baseStatus, client: 'node-hidden' },
        }
      : publicStatuses
  const pingTasks = [
    {
      id: 8,
      weight: 1,
      name: 'Tokyo ICMP',
      clients: options.unassignedDefaultPing ? [] : ['node-online'],
      default_on: true,
      type: 'icmp',
      interval: 60,
    },
  ]
  await page.route('**/api/public', async (route) => {
    await route.fulfill({
      json: options.privateSite ? privateSitePublic : publicInfo,
    })
  })
  await page.route('**/api/me', async (route) => {
    meRequests += 1
    await route.fulfill({
      json: authenticated
        ? { username: 'owner', uuid: 'admin-1', logged_in: true }
        : meGuest,
    })
  })
  await page.route('**/api/rpc2', async (route) => {
    const request = route.request().postDataJSON() as RpcRequest
    rpcMethods.push(request.method)
    if (rpcDenied) {
      await route.fulfill({
        json: {
          jsonrpc: '2.0',
          id: request.id,
          error: { code: -32041, message: 'Permission denied' },
        },
      })
      return
    }
    let result: unknown

    switch (request.method) {
      case 'public:getNodesInformation':
        result = resultNodes()
        break
      case 'common:getNodesLatestStatus':
        result = resultStatuses()
        break
      case 'public:listMetricDefinitions':
        result = metricDefinitionsResponse.result
        break
      case 'public:getPublicPingTasks':
        if (options.failPingTasks) {
          await route.fulfill({
            json: {
              jsonrpc: '2.0',
              id: request.id,
              error: { code: -32051, message: 'Unavailable' },
            },
          })
          return
        }
        result = pingTasks
        break
      case 'public:queryMetrics': {
        const keys = new Set(requestedMetricKeys(request.params))
        result = {
          ...metricQueryResponse.result,
          series: metricQueryResponse.result.series.filter((series) =>
            keys.has(series.metric_key),
          ),
        }
        break
      }
      default:
        await route.fulfill({
          json: {
            jsonrpc: '2.0',
            id: request.id,
            error: { code: -32601, message: 'Method not found' },
          },
        })
        return
    }

    await route.fulfill({
      json: { jsonrpc: '2.0', id: request.id, result },
    })
  })

  return {
    rpcMethods,
    setAuthenticated(value: boolean) {
      authenticated = value
    },
    setRpcDenied(value: boolean) {
      rpcDenied = value
    },
    get meRequests() {
      return meRequests
    },
  }
}
