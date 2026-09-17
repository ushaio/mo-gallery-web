import type { ComponentProps } from 'react'

export function WechatIcon(props: ComponentProps<'svg'>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M9.05 4C5.16 4 2 6.6 2 9.8c0 1.9 1.13 3.58 2.88 4.66L4.1 17.2l2.92-1.47c.65.14 1.33.22 2.03.22 3.89 0 7.05-2.6 7.05-5.8S12.94 4 9.05 4Z"
        fill="currentColor"
        fillOpacity="0.92"
      />
      <path
        d="M15.72 9.53c-3.46 0-6.28 2.3-6.28 5.13 0 1.54.83 2.91 2.14 3.85l-.51 2.2 2.26-1.13c.75.19 1.55.29 2.39.29 3.47 0 6.28-2.3 6.28-5.13s-2.81-5.21-6.28-5.21Z"
        fill="currentColor"
      />
      <circle cx="6.98" cy="9.48" r="1.02" fill="#fff" />
      <circle cx="11.01" cy="9.48" r="1.02" fill="#fff" />
      <circle cx="13.92" cy="14.54" r="0.92" fill="#fff" />
      <circle cx="17.46" cy="14.54" r="0.92" fill="#fff" />
    </svg>
  )
}
