import type { SVGProps } from 'react'

interface LivePhotoIconProps extends SVGProps<SVGSVGElement> {
  size?: number | string
}

export function LivePhotoIcon({ size = 24, ...props }: LivePhotoIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      width={size}
      height={size}
      {...props}
    >
      <desc>Live Photo Streamline Icon: https://streamlinehq.com</desc>
      <path d="M11 12a1 1 0 1 0 2 0 1 1 0 1 0 -2 0" />
      <path d="M7 12a5 5 0 1 0 10 0 5 5 0 1 0 -10 0" />
      <path d="m15.9 20.11 0 0.01" />
      <path d="m19.04 17.61 0 0.01" />
      <path d="m20.77 14 0 0.01" />
      <path d="m20.77 10 0 0.01" />
      <path d="m19.04 6.39 0 0.01" />
      <path d="m15.9 3.89 0 0.01" />
      <path d="m12 3 0 0.01" />
      <path d="m8.1 3.89 0 0.01" />
      <path d="m4.96 6.39 0 0.01" />
      <path d="m3.23 10 0 0.01" />
      <path d="m3.23 14 0 0.01" />
      <path d="m4.96 17.61 0 0.01" />
      <path d="m8.1 20.11 0 0.01" />
      <path d="m12 21 0 0.01" />
    </svg>
  )
}
