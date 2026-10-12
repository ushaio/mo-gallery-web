import type { ReactNode } from 'react'

export interface MediaDialogSelectProps {
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
  ariaLabel: string
}

/** The host owns dropdown appearance and behavior, without coupling shared code to its UI kit. */
export type MediaDialogSelectRenderer = (props: MediaDialogSelectProps) => ReactNode
