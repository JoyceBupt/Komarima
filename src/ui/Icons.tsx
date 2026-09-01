import type { SVGProps } from 'react'

type IconProps = Omit<SVGProps<SVGSVGElement>, 'children'>

function IconFrame({ className, ...props }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      focusable="false"
      viewBox="0 0 24 24"
      {...props}
    />
  )
}

export function ListIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path
        d="M8 6h12M8 12h12M8 18h12"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
      <circle cx="4" cy="6" fill="currentColor" r="1.2" />
      <circle cx="4" cy="12" fill="currentColor" r="1.2" />
      <circle cx="4" cy="18" fill="currentColor" r="1.2" />
    </IconFrame>
  )
}

export function GridIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <rect
        height="7"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.7"
        width="7"
        x="3"
        y="3"
      />
      <rect
        height="7"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.7"
        width="7"
        x="14"
        y="3"
      />
      <rect
        height="7"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.7"
        width="7"
        x="3"
        y="14"
      />
      <rect
        height="7"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.7"
        width="7"
        x="14"
        y="14"
      />
    </IconFrame>
  )
}

export function MoonIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path
        d="M19.5 15.2A8 8 0 0 1 8.8 4.5 8.2 8.2 0 1 0 19.5 15.2Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </IconFrame>
  )
}

export function SunIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <circle cx="12" cy="12" r="3.6" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.7"
      />
    </IconFrame>
  )
}

export function SettingsIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path
        d="M4 7h5m4 0h7M4 12h9m4 0h3M4 17h2m4 0h10"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.7"
      />
      <circle cx="11" cy="7" r="2" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="15" cy="12" r="2" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="8" cy="17" r="2" stroke="currentColor" strokeWidth="1.7" />
    </IconFrame>
  )
}

export function ChevronLeftIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path
        d="m15 6-6 6 6 6"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </IconFrame>
  )
}
