import { useEffect, useRef, type KeyboardEvent } from 'react'

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export function useModalFocus<T extends HTMLElement>(
  active: boolean,
  onClose: () => void,
) {
  const containerRef = useRef<T>(null)
  const previousFocus = useRef<HTMLElement | null>(null)
  const closeRef = useRef(onClose)

  useEffect(() => {
    closeRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!active) return
    previousFocus.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    const frame = window.requestAnimationFrame(() => {
      const first =
        containerRef.current?.querySelector<HTMLElement>(focusableSelector)
      first?.focus()
    })

    return () => {
      window.cancelAnimationFrame(frame)
      previousFocus.current?.focus()
    }
  }, [active])

  const onKeyDown = (event: KeyboardEvent<T>) => {
    if (!active) return
    if (event.key === 'Escape') {
      event.preventDefault()
      closeRef.current()
      return
    }
    if (event.key !== 'Tab') return

    const items = Array.from(
      containerRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ??
        [],
    ).filter((item) => !item.hidden && item.offsetParent !== null)
    if (!items.length) return
    const first = items[0]
    const last = items.at(-1)
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last?.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first?.focus()
    }
  }

  return [containerRef, onKeyDown] as const
}
