import { useSyncExternalStore } from 'react'

const pageIsVisible = () =>
  typeof document === 'undefined' || document.visibilityState !== 'hidden'

const subscribeToVisibility = (onStoreChange: () => void) => {
  if (typeof document === 'undefined') return () => undefined
  document.addEventListener('visibilitychange', onStoreChange)
  return () => document.removeEventListener('visibilitychange', onStoreChange)
}

export const usePageVisibility = () =>
  useSyncExternalStore(subscribeToVisibility, pageIsVisible, () => true)
