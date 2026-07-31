import { useMemo, useState } from 'react'
import type { DragEvent, ReactNode } from 'react'
import { Check, ChevronDown, ChevronRight, FolderHeart, FolderPlus, Pencil, Plus, Tags, Trash2 } from 'lucide-react'
import type { CollectionGroup, LocalCollection, LocalTag } from './types'
import type { LocalLibraryCopy } from './copy'
import type { OrganizationEditorTarget } from './OrganizationEditorDialog'

interface DeleteTarget { kind: 'tag' | 'collection' | 'group'; id: string; name: string; nonEmpty?: boolean }
interface Props {
  copy: LocalLibraryCopy
  tags: LocalTag[]
  groups: CollectionGroup[]
  collections: LocalCollection[]
  selectedTagIds: string[]
  selectedCollectionIds: string[]
  onSelectTags: (ids: string[]) => void
  onSelectCollections: (ids: string[]) => void
  onEdit: (target: OrganizationEditorTarget) => void
  onDelete: (target: DeleteTarget) => void
  onDropAssets: (assetIds: string[], target: { kind: 'tag' | 'collection'; id: string }) => void
}

function SmallAction({ label, onClick, children }: { label: string, onClick: () => void, children: ReactNode }) {
  return <button type="button" aria-label={label} title={label} onClick={(event) => { event.stopPropagation(); onClick() }} className="rounded p-1 opacity-0 transition group-hover:opacity-100 hover:bg-secondary">{children}</button>
}

export function OrganizationNavigation({ copy, tags, groups, collections, selectedTagIds, selectedCollectionIds, onSelectTags, onSelectCollections, onEdit, onDelete, onDropAssets }: Props) {
  const [collectionsOpen, setCollectionsOpen] = useState(true)
  const [tagsOpen, setTagsOpen] = useState(true)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set(groups.map((group) => group.id)))
  const byParent = useMemo(() => {
    const map = new Map<string, CollectionGroup[]>()
    for (const group of groups) {
      const key = group.parentId || ''
      map.set(key, [...(map.get(key) || []), group])
    }
    return map
  }, [groups])
  const collectionsByGroup = useMemo(() => {
    const map = new Map<string, LocalCollection[]>()
    for (const collection of collections) {
      const key = collection.groupId || ''
      map.set(key, [...(map.get(key) || []), collection])
    }
    return map
  }, [collections])
  const selectCollection = (id: string) => onSelectCollections(selectedCollectionIds.includes(id) ? [] : [id])
  const selectTag = (id: string) => onSelectTags(selectedTagIds.includes(id) ? [] : [id])
  const dropHandlers = (target: { kind: 'tag' | 'collection'; id: string }) => ({
    onDragOver: (event: DragEvent) => {
      if (!event.dataTransfer.types.includes('application/x-mo-gallery-asset-ids')) return
      event.preventDefault()
      event.dataTransfer.dropEffect = 'link'
    },
    onDrop: (event: DragEvent) => {
      const raw = event.dataTransfer.getData('application/x-mo-gallery-asset-ids')
      if (!raw) return
      event.preventDefault()
      event.stopPropagation()
      try {
        const ids = JSON.parse(raw) as unknown
        if (Array.isArray(ids) && ids.every((id): id is string => typeof id === 'string')) onDropAssets(ids, target)
      } catch { /* ignore malformed drag payload */ }
    },
  })
  const renderCollections = (parentId = '', depth = 0): ReactNode => <>
    {(collectionsByGroup.get(parentId) || []).map((collection) => <div key={collection.id} className="group flex items-center" style={{ paddingLeft: 8 + depth * 12 }}><button type="button" onClick={() => selectCollection(collection.id)} {...dropHandlers({ kind: 'collection', id: collection.id })} data-local-library-logical-target className="flex min-w-0 flex-1 items-center gap-2 rounded px-1 py-1.5 text-left text-[11px] hover:bg-secondary" style={selectedCollectionIds.includes(collection.id) ? { backgroundColor: 'var(--secondary)' } : undefined}><FolderHeart size={13} className="shrink-0" /><span className="min-w-0 flex-1 truncate">{collection.name}</span><span className="text-[9px] text-muted-foreground">{collection.assetCount}</span></button><SmallAction label={copy.renameCollection} onClick={() => onEdit({ kind: 'collection', item: collection })}><Pencil size={11} /></SmallAction><SmallAction label={copy.deleteCollection} onClick={() => onDelete({ kind: 'collection', id: collection.id, name: collection.name })}><Trash2 size={11} /></SmallAction></div>)}
    {(byParent.get(parentId) || []).map((group) => {
      const expanded = expandedGroups.has(group.id)
      const nonEmpty = (byParent.get(group.id)?.length || 0) + (collectionsByGroup.get(group.id)?.length || 0) > 0
      return <div key={group.id}><div className="group flex items-center" style={{ paddingLeft: 5 + depth * 12 }}><button type="button" onClick={() => setExpandedGroups((current) => { const next = new Set(current); if (expanded) next.delete(group.id); else next.add(group.id); return next })} className="flex min-w-0 flex-1 items-center gap-1 rounded py-1.5 text-left text-[11px] hover:bg-secondary">{expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}<span className="min-w-0 flex-1 truncate font-medium">{group.name}</span></button><SmallAction label={copy.newCollection} onClick={() => onEdit({ kind: 'collection', parentId: group.id })}><Plus size={11} /></SmallAction><SmallAction label={copy.renameCollectionGroup} onClick={() => onEdit({ kind: 'group', item: group })}><Pencil size={11} /></SmallAction><SmallAction label={copy.deleteCollectionGroup} onClick={() => onDelete({ kind: 'group', id: group.id, name: group.name, nonEmpty })}><Trash2 size={11} /></SmallAction></div>{expanded && renderCollections(group.id, depth + 1)}</div>
    })}
  </>
  return <div className="mt-3 border-t pt-3" style={{ borderColor: 'var(--border)' }}>
    <div className="flex items-center gap-1 px-1"><button type="button" onClick={() => setCollectionsOpen(!collectionsOpen)} className="flex min-w-0 flex-1 items-center gap-1 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{collectionsOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}{copy.collections}</button><button type="button" title={copy.newCollection} onClick={() => onEdit({ kind: 'collection' })} className="rounded p-1 hover:bg-secondary"><Plus size={12} /></button><button type="button" title={copy.newCollectionGroup} onClick={() => onEdit({ kind: 'group' })} className="rounded p-1 hover:bg-secondary"><FolderPlus size={12} /></button></div>
    {collectionsOpen && <div className="mt-1">{renderCollections()}</div>}
    <div className="mt-3 flex items-center gap-1 px-1"><button type="button" onClick={() => setTagsOpen(!tagsOpen)} className="flex min-w-0 flex-1 items-center gap-1 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{tagsOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}{copy.tags}</button><button type="button" title={copy.newTag} onClick={() => onEdit({ kind: 'tag' })} className="rounded p-1 hover:bg-secondary"><Plus size={12} /></button></div>
    {tagsOpen && <div className="mt-1 space-y-0.5">{tags.map((tag) => <div key={tag.id} className="group flex items-center pl-2"><button type="button" onClick={() => selectTag(tag.id)} {...dropHandlers({ kind: 'tag', id: tag.id })} data-local-library-logical-target className="flex min-w-0 flex-1 items-center gap-2 rounded px-1 py-1.5 text-left text-[11px] hover:bg-secondary" style={selectedTagIds.includes(tag.id) ? { backgroundColor: 'var(--secondary)' } : undefined}>{selectedTagIds.includes(tag.id) ? <Check size={12} /> : <Tags size={12} style={{ color: tag.color || undefined }} />}<span className="min-w-0 flex-1 truncate">{tag.name}</span><span className="text-[9px] text-muted-foreground">{tag.assetCount}</span></button><SmallAction label={copy.renameTag} onClick={() => onEdit({ kind: 'tag', item: tag })}><Pencil size={11} /></SmallAction><SmallAction label={copy.deleteTag} onClick={() => onDelete({ kind: 'tag', id: tag.id, name: tag.name })}><Trash2 size={11} /></SmallAction></div>)}</div>}
  </div>
}

export type { DeleteTarget as OrganizationDeleteTarget }
