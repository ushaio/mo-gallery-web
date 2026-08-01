import { useEffect, useMemo, useRef, useState } from 'react'
import { FolderPlus, Loader2, Tags, X } from 'lucide-react'
import { SelectDropdown } from '@/components/ui/SelectDropdown'
import type { CollectionGroup, LocalCollection, LocalTag } from './types'
import type { LocalLibraryCopy } from './copy'

type EditorKind = 'tag' | 'collection' | 'group'

type EditorTarget =
  | { kind: 'tag', item?: LocalTag }
  | { kind: 'collection', item?: LocalCollection, parentId?: string }
  | { kind: 'group', item: CollectionGroup }

interface Props {
  target: EditorTarget
  groups: CollectionGroup[]
  copy: LocalLibraryCopy
  busy: boolean
  onClose: () => void
  onSubmit: (value: { name: string, notes: string, parentId?: string, color: string }) => void
}

const TAG_COLORS = ['', 'red', 'yellow', 'green', 'blue', 'purple']

function descendants(groups: CollectionGroup[], id: string) {
  const result = new Set<string>([id])
  let changed = true
  while (changed) {
    changed = false
    for (const group of groups) {
      if (group.parentId && result.has(group.parentId) && !result.has(group.id)) {
        result.add(group.id)
        changed = true
      }
    }
  }
  return result
}

export function OrganizationEditorDialog({ target, groups, copy, busy, onClose, onSubmit }: Props) {
  const item = target.item
  const [name, setName] = useState(item?.name || '')
  const [notes, setNotes] = useState(target.kind === 'collection' ? target.item?.notes || '' : '')
  const [color, setColor] = useState(target.kind === 'tag' ? target.item?.color || '' : '')
  const currentParent = target.kind === 'collection'
    ? target.item?.groupId
    : target.kind === 'group'
      ? target.item?.parentId
      : undefined
  const [parentId, setParentId] = useState(currentParent || (target.kind === 'collection' ? target.parentId : undefined) || '')
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { inputRef.current?.focus() }, [])
  const excluded = useMemo(() => target.kind === 'group' && target.item ? descendants(groups, target.item.id) : new Set<string>(), [groups, target])
  const title = target.kind === 'tag'
    ? (item ? copy.renameTag : copy.newTag)
    : target.kind === 'collection'
      ? (item ? copy.renameCollection : copy.newCollection)
      : copy.renameCollectionGroup
  const icon = target.kind === 'tag' ? <Tags size={17} /> : <FolderPlus size={17} />
  const submit = () => {
    if (!busy && name.trim()) onSubmit({ name: name.trim(), notes: notes.trim(), parentId: parentId || undefined, color })
  }
  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-5">
      <button type="button" aria-label={copy.cancelAction} className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={onClose} />
      <div role="dialog" aria-modal="true" className="relative w-full max-w-sm rounded-xl border bg-background p-5 shadow-2xl">
        <div className="flex items-start gap-3"><span className="flex size-9 items-center justify-center rounded-lg bg-secondary">{icon}</span><h2 className="min-w-0 flex-1 pt-2 text-sm font-semibold">{title}</h2><button type="button" onClick={onClose} disabled={busy} className="rounded-md p-1.5 hover:bg-secondary"><X size={15} /></button></div>
        <form className="mt-5 space-y-4" onSubmit={(event) => { event.preventDefault(); submit() }}>
          <label className="block text-[11px] font-medium">{copy.organizationName}<input ref={inputRef} value={name} onChange={(event) => setName(event.target.value)} disabled={busy} className="mt-2 h-9 w-full rounded-md border bg-input px-3 text-xs outline-none focus:ring-1 focus:ring-ring" /></label>
          {target.kind !== 'tag' && <label className="block text-[11px] font-medium">{copy.collectionParent}<SelectDropdown
            value={parentId}
            options={[
              { value: '', label: copy.collectionRoot },
              ...groups.filter((group) => !excluded.has(group.id)).map((group) => ({ value: group.id, label: group.name })),
            ]}
            onChange={(value) => setParentId(value as string)}
            disabled={busy}
            ariaLabel={copy.collectionParent}
          /></label>}
          {target.kind === 'collection' && <label className="block text-[11px] font-medium">{copy.notes}<textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} disabled={busy} className="mt-2 w-full resize-none rounded-md border bg-input px-3 py-2 text-xs" /></label>}
          {target.kind === 'tag' && <div><span className="text-[11px] font-medium">{copy.tagColor}</span><div className="mt-2 flex gap-2">{TAG_COLORS.map((value) => <button key={value || 'none'} type="button" aria-label={value || copy.noColor} onClick={() => setColor(value)} className="size-6 rounded-full border-2" style={{ backgroundColor: value || 'transparent', borderColor: color === value ? 'var(--foreground)' : 'var(--border)' }} />)}</div></div>}
          <div className="flex justify-end gap-2 pt-1"><button type="button" onClick={onClose} disabled={busy} className="rounded-md border px-3 py-2 text-xs hover:bg-secondary">{copy.cancelAction}</button><button type="submit" disabled={busy || !name.trim()} className="flex min-w-20 items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-xs text-primary-foreground disabled:opacity-50">{busy && <Loader2 size={13} className="animate-spin" />}{copy.save}</button></div>
        </form>
      </div>
    </div>
  )
}

export type { EditorTarget as OrganizationEditorTarget }
