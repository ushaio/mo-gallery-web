'use client'

import * as React from 'react'
import { CustomInput } from '@/components/ui/CustomInput'
import { CustomMultiSelect, type MultiSelectOption } from '@/components/ui/CustomMultiSelect'
import { CustomSelect, type SelectOption } from '@/components/ui/CustomSelect'

type CustomInputProps = React.ComponentPropsWithoutRef<typeof CustomInput>
type AdminSelectProps = Omit<React.ComponentPropsWithoutRef<typeof CustomSelect>, 'uiVariant'>
type AdminMultiSelectProps = React.ComponentPropsWithoutRef<typeof CustomMultiSelect>

export type { SelectOption, MultiSelectOption }

export function AdminInput({ variant = 'config', ...props }: CustomInputProps) {
  return <CustomInput variant={variant} {...props} />
}

export function AdminSelect(props: AdminSelectProps) {
  return <CustomSelect uiVariant="admin" {...props} />
}

export function AdminMultiSelect({ uiVariant = 'admin', ...props }: AdminMultiSelectProps) {
  return <CustomMultiSelect uiVariant={uiVariant} {...props} />
}