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

export function MenuIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path
        d="M4 7h16M4 12h16M4 17h16"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
    </IconFrame>
  )
}

export function PanelIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <rect
        height="14"
        rx="2.5"
        stroke="currentColor"
        strokeWidth="1.7"
        width="17"
        x="3.5"
        y="5"
      />
      <path d="M14.5 5v14" stroke="currentColor" strokeWidth="1.7" />
    </IconFrame>
  )
}

export function SearchIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <circle
        cx="10.8"
        cy="10.8"
        r="6.3"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="m15.5 15.5 4 4"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
    </IconFrame>
  )
}

export function FilterIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path
        d="M4.5 5.5h15l-5.8 6.6v5.5l-3.4 1.7v-7.2L4.5 5.5Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    </IconFrame>
  )
}

export function PaletteIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path
        d="M12 3.5c-5 0-8.5 3.3-8.5 7.7 0 4 3.2 7.3 7.2 7.3h1.1c1.1 0 1.7-.7 1.7-1.5 0-.7-.5-1.1-.5-1.8 0-.9.7-1.6 1.7-1.6H17c2.2 0 3.5-1.5 3.5-3.6 0-3.7-3.6-6.5-8.5-6.5Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
      <circle cx="7.5" cy="10" fill="currentColor" r="1" />
      <circle cx="10" cy="7" fill="currentColor" r="1" />
      <circle cx="14" cy="7" fill="currentColor" r="1" />
      <circle cx="17" cy="10" fill="currentColor" r="1" />
    </IconFrame>
  )
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path
        d="m9 6 6 6-6 6"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </IconFrame>
  )
}

export function CloseIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path
        d="m6 6 12 12M18 6 6 18"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
    </IconFrame>
  )
}

export function CheckIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path
        d="m5 12.5 4.2 4.2L19 7"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.9"
      />
    </IconFrame>
  )
}
