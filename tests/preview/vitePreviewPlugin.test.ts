import { describe, expect, it } from 'vitest'
import { createKomari132Scenario } from '../../preview/komari132Scenario'
import {
  createPreviewRequestHandler,
  parsePreviewPreset,
  vitePreviewPlugin,
} from '../../preview/vitePreviewPlugin'

const now = () => new Date('2026-08-30T04:00:00Z')

function scenarioHandler() {
  return createPreviewRequestHandler(
    createKomari132Scenario({ preset: 'public', now }),
  )
}

describe('preview request handler', () => {
  it.each(['/api/public', '/api/me'])(
    'handles GET %s and ignores unsupported methods',
    async (path) => {
      const handle = scenarioHandler()

      await expect(
        handle({ method: 'GET', url: `${path}?preview=1` }),
      ).resolves.toMatchObject({ status: 200 })
      await expect(
        handle({ method: 'POST', url: path, body: '{}' }),
      ).resolves.toBeNull()
    },
  )

  it('handles valid RPC requests and preserves unknown-method errors', async () => {
    const handle = scenarioHandler()
    const known = await handle({
      method: 'POST',
      url: '/api/rpc2',
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 7,
        method: 'public:getNodesInformation',
      }),
    })
    const unknown = await handle({
      method: 'POST',
      url: '/api/rpc2',
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 8,
        method: 'public:missing',
      }),
    })

    expect(known).toMatchObject({
      status: 200,
      body: { jsonrpc: '2.0', id: 7 },
    })
    expect(unknown).toEqual({
      status: 200,
      body: {
        jsonrpc: '2.0',
        id: 8,
        error: { code: -32601, message: 'Method not found' },
      },
    })
  })

  it('returns 400 for malformed or invalid RPC JSON', async () => {
    const handle = scenarioHandler()

    await expect(
      handle({ method: 'POST', url: '/api/rpc2', body: '{' }),
    ).resolves.toMatchObject({ status: 400 })
    await expect(
      handle({ method: 'POST', url: '/api/rpc2', body: '{}' }),
    ).resolves.toMatchObject({ status: 400 })
    await expect(
      handle({
        method: 'POST',
        url: '/api/rpc2',
        body: JSON.stringify({ id: 1, method: 'public:getNodesInformation' }),
      }),
    ).resolves.toMatchObject({ status: 400 })
    await expect(
      handle({
        method: 'POST',
        url: '/api/rpc2',
        body: '{"jsonrpc":"2.0","id":1e999,"method":"public:getNodesInformation"}',
      }),
    ).resolves.toMatchObject({ status: 400 })
  })

  it('rejects oversized RPC bodies', async () => {
    const body = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'public:getNodesInformation',
      params: { padding: 'x'.repeat(64 * 1024) },
    })

    await expect(
      scenarioHandler()({ method: 'POST', url: '/api/rpc2', body }),
    ).resolves.toMatchObject({ status: 413 })
  })

  it('passes unknown paths through', async () => {
    await expect(
      scenarioHandler()({ method: 'GET', url: '/api/unknown' }),
    ).resolves.toBeNull()
  })
})

describe('preview mode isolation', () => {
  it('enables the plugin only for the ui-preview dev server', () => {
    const apply = vitePreviewPlugin({ preset: 'public', now }).apply
    expect(apply).toBeTypeOf('function')
    if (typeof apply !== 'function') throw new Error('Expected apply hook')

    expect(apply({}, { command: 'serve', mode: 'ui-preview' })).toBeTruthy()
    expect(apply({}, { command: 'serve', mode: 'test' })).toBeFalsy()
    expect(apply({}, { command: 'build', mode: 'production' })).toBeFalsy()
  })

  it('defaults to public and rejects unsupported presets', () => {
    expect(parsePreviewPreset()).toBe('public')
    expect(parsePreviewPreset('private')).toBe('private')
    expect(parsePreviewPreset('scale-500')).toBe('scale-500')
    expect(() => parsePreviewPreset('invalid')).toThrow(
      /KOMARIMA_PREVIEW_SCENARIO/,
    )
  })
})
