'use client'

import * as React from 'react'
import { CustomInput } from '@/components/ui/CustomInput'
import { CustomMultiSelect, type MultiSelectOption } from '@/components/ui/CustomMultiSelect'
import { CustomSelect, type SelectOption } from '@/components/ui/CustomSelect'

type SiteInputProps = Omit<React.ComponentPropsWithoutRef<typeof CustomInput>, 'uiVariant'>
type SiteSelectProps = Omit<React.ComponentPropsWithoutRef<typeof CustomSelect>, 'uiVariant'>
type SiteMultiSelectProps = Omit<React.ComponentPropsWithoutRef<typeof CustomMultiSelect>, 'uiVariant'>

export type { SelectOption, MultiSelectOption }

export function SiteInput({ variant = 'search', ...props }: SiteInputProps) {
  return <CustomInput uiVariant="site" variant={variant} {...props} />
}

export function SiteSelect(props: SiteSelectProps) {
  return <CustomSelect uiVariant="site" {...props} />
}

export function SiteMultiSelect(props: SiteMultiSelectProps) {
  return <CustomMultiSelect uiVariant="site" {...props} />
}