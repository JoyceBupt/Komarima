import { describe, expect, it } from 'vitest'
import {
  normalizeThemeRuntimeSettings,
  settingsFromBootstrap,
} from './settings'
import type { BootstrapResult } from '../client'

describe('theme runtime settings', () => {
  it('uses safe defaults for absent or malformed public settings', () => {
    expect(normalizeThemeRuntimeSettings(undefined)).toEqual({
      appearance: 'system',
      offlinePosition: 'keep',
      refreshIntervalMs: 10_000,
      staleAfterMs: 30_000,
    })
    expect(
      normalizeThemeRuntimeSettings({
        defaultAppearance: 'sepia',
        refreshIntervalSeconds: '1',
        staleAfterSeconds: null,
      }),
    ).toEqual({
      appearance: 'system',
      offlinePosition: 'keep',
      refreshIntervalMs: 10_000,
      staleAfterMs: 30_000,
    })
  })

  it('clamps polling and never marks cached data stale before the next poll', () => {
    expect(
      normalizeThemeRuntimeSettings({
        defaultAppearance: 'dark',
        refreshIntervalSeconds: 60,
        staleAfterSeconds: 20,
      }),
    ).toEqual({
      appearance: 'dark',
      offlinePosition: 'keep',
      refreshIntervalMs: 60_000,
      staleAfterMs: 60_000,
    })

    expect(
      normalizeThemeRuntimeSettings({
        refreshIntervalSeconds: 1_000,
        staleAfterSeconds: 100_000,
      }),
    ).toMatchObject({
      refreshIntervalMs: 300_000,
      staleAfterMs: 86_400_000,
    })
  })

  it('reads the active theme settings from bootstrap data', () => {
    const bootstrap = {
      publicInfo: {
        theme_settings: {
          defaultAppearance: 'light',
          refreshIntervalSeconds: 15,
          staleAfterSeconds: 45,
          offlinePosition: 'last',
        },
      },
    } as unknown as BootstrapResult

    expect(settingsFromBootstrap(bootstrap)).toEqual({
      appearance: 'light',
      offlinePosition: 'last',
      refreshIntervalMs: 15_000,
      staleAfterMs: 45_000,
    })
  })
})
