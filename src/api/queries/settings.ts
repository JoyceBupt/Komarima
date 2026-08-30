import type { BootstrapResult } from '../client'

export type ThemeAppearance = 'system' | 'light' | 'dark'

export interface ThemeRuntimeSettings {
  appearance: ThemeAppearance
  offlinePosition: 'keep' | 'last'
  refreshIntervalMs: number
  staleAfterMs: number
}

export const DEFAULT_REFRESH_INTERVAL_SECONDS = 10
export const MIN_REFRESH_INTERVAL_SECONDS = 5
export const MAX_REFRESH_INTERVAL_SECONDS = 300
export const MIN_STALE_AFTER_SECONDS = 10
export const MAX_STALE_AFTER_SECONDS = 86_400

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value))

const finiteNumberSetting = (
  settings: Record<string, unknown>,
  key: string,
) => {
  const value = settings[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

const appearanceSetting = (
  settings: Record<string, unknown>,
): ThemeAppearance => {
  const value = settings.defaultAppearance
  return value === 'light' || value === 'dark' || value === 'system'
    ? value
    : 'system'
}

const offlinePositionSetting = (settings: Record<string, unknown>) =>
  settings.offlinePosition === 'last' ? 'last' : 'keep'

export const normalizeThemeRuntimeSettings = (
  raw: unknown,
): ThemeRuntimeSettings => {
  const settings =
    typeof raw === 'object' && raw !== null && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {}

  const requestedRefresh = finiteNumberSetting(
    settings,
    'refreshIntervalSeconds',
  )
  const refreshSeconds = clamp(
    requestedRefresh ?? DEFAULT_REFRESH_INTERVAL_SECONDS,
    MIN_REFRESH_INTERVAL_SECONDS,
    MAX_REFRESH_INTERVAL_SECONDS,
  )

  const defaultStaleSeconds = Math.max(30, refreshSeconds * 3)
  const requestedStale = finiteNumberSetting(settings, 'staleAfterSeconds')
  const staleSeconds = clamp(
    requestedStale ?? defaultStaleSeconds,
    Math.max(MIN_STALE_AFTER_SECONDS, refreshSeconds),
    MAX_STALE_AFTER_SECONDS,
  )

  return {
    appearance: appearanceSetting(settings),
    offlinePosition: offlinePositionSetting(settings),
    refreshIntervalMs: Math.round(refreshSeconds * 1_000),
    staleAfterMs: Math.round(staleSeconds * 1_000),
  }
}

export const settingsFromBootstrap = (
  bootstrap: BootstrapResult | undefined,
): ThemeRuntimeSettings =>
  normalizeThemeRuntimeSettings(bootstrap?.publicInfo.theme_settings)
