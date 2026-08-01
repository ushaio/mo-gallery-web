import { useMemo, useState } from 'react'
import type { DragEvent, ReactElement, ReactNode } from 'react'
import { Check, ChevronDown, ChevronRight, Folder, FolderHeart, Pencil, Plus, Tags, Trash2 } from 'lucide-react'

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/ContextMenu'

import type { LocalLibraryCopy } from './copy'
import type { OrganizationEditorTarget } from './OrganizationEditorDialog'
import type { CollectionGroup, LocalCollection, LocalTag } from './types'

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

function SectionContextTarget({ label, actionLabel, onAction, children }: {
  label: string
  actionLabel: string
  onAction: () => void
  children: ReactElement
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuLabel className="max-w-56 truncate">{label}</ContextMenuLabel>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={onAction}><Plus size={14} />{actionLabel}</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

function OrganizationContextTarget({ label, editLabel, deleteLabel, onEdit, onDelete, createLabel, onCreate, children }: {
  label: string
  editLabel: string
  deleteLabel: string
  onEdit: () => void
  onDelete: () => void
  createLabel?: string
  onCreate?: () => void
  children: ReactElement
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuLabel className="max-w-56 truncate">{label}</ContextMenuLabel>
        <ContextMenuSeparator />
        {createLabel && onCreate ? <ContextMenuItem onSelect={onCreate}><Plus size={14} />{createLabel}</ContextMenuItem> : null}
        <ContextMenuItem onSelect={onEdit}><Pencil size={14} />{editLabel}</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" onSelect={onDelete}><Trash2 size={14} />{deleteLabel}</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

export function OrganizationNavigation({ copy, tags, groups, collections, selectedTagIds, selectedCollectionIds, onSelectTags, onSelectCollections, onEdit, onDelete, onDropAssets }: Props) {
  const [collectionsOpen, setCollectionsOpen] = useState(true)
  const [tagsOpen, setTagsOpen] = useState(true)
  // 进入本地资源库时文件夹默认不展开（初始为空集合）
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set())
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
    {(collectionsByGroup.get(parentId) || []).map((collection) => (
      <OrganizationContextTarget
        key={collection.id}
        label={collection.name}
        editLabel={copy.renameCollection}
        deleteLabel={copy.deleteCollection}
        onEdit={() => onEdit({ kind: 'collection', item: collection })}
        onDelete={() => onDelete({ kind: 'collection', id: collection.id, name: collection.name })}
      >
        <button
          type="button"
          onClick={() => selectCollection(collection.id)}
          {...dropHandlers({ kind: 'collection', id: collection.id })}
          data-local-library-logical-target
          className="mb-0.5 flex w-full items-center gap-2 rounded-md py-1.5 pr-2 text-left text-xs hover:bg-secondary"
          style={{
            paddingLeft: `${10 + Math.min(5, depth) * 12}px`,
            backgroundColor: selectedCollectionIds.includes(collection.id) ? 'var(--accent)' : undefined,
          }}
        >
          <FolderHeart size={14} className="shrink-0" />
          <span className="min-w-0 flex-1 truncate">{collection.name}</span>
          <span className="text-[9px] text-muted-foreground">{collection.assetCount}</span>
        </button>
      </OrganizationContextTarget>
    ))}
    {(byParent.get(parentId) || []).map((group) => {
      const expanded = expandedGroups.has(group.id)
      const nonEmpty = (byParent.get(group.id)?.length || 0) + (collectionsByGroup.get(group.id)?.length || 0) > 0
      return (
        <div key={group.id}>
          <OrganizationContextTarget
            label={group.name}
            createLabel={copy.newCollection}
            editLabel={copy.renameCollectionGroup}
            deleteLabel={copy.deleteCollectionGroup}
            onCreate={() => onEdit({ kind: 'collection', parentId: group.id })}
            onEdit={() => onEdit({ kind: 'group', item: group })}
            onDelete={() => onDelete({ kind: 'group', id: group.id, name: group.name, nonEmpty })}
          >
            <button
              type="button"
              onClick={() => setExpandedGroups((current) => {
                const next = new Set(current)
                if (expanded) next.delete(group.id)
                else next.add(group.id)
                return next
              })}
              className="mb-0.5 flex w-full items-center gap-1 rounded-md py-1.5 pr-2 text-left text-xs hover:bg-secondary"
              style={{ paddingLeft: `${7 + Math.min(5, depth) * 12}px` }}
            >
              {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              <Folder size={14} className="shrink-0" />
              <span className="min-w-0 flex-1 truncate font-medium">{group.name}</span>
            </button>
          </OrganizationContextTarget>
          {expanded && renderCollections(group.id, depth + 1)}
        </div>
      )
    })}
  </>

  return (
    <>
      <div className="mb-2 mt-5 flex items-center gap-1">
        <SectionContextTarget label={copy.collections} actionLabel={copy.newCollection} onAction={() => onEdit({ kind: 'collection' })}>
          <button type="button" onClick={() => setCollectionsOpen((open) => !open)} className="flex min-w-0 flex-1 items-center gap-1 px-2 text-left text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
            {collectionsOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            {copy.collections}
          </button>
        </SectionContextTarget>
        <button type="button" title={copy.newCollection} aria-label={copy.newCollection} onClick={() => onEdit({ kind: 'collection' })} className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground">
          <Plus size={13} />
        </button>
      </div>
      {collectionsOpen && (
        <div>
          {collections.length > 0 || groups.length > 0
            ? renderCollections()
            : <p className="px-2 py-1.5 text-[11px] text-muted-foreground">{copy.noCollections}</p>}
        </div>
      )}

      <div className="mb-2 mt-5 flex items-center gap-1">
        <SectionContextTarget label={copy.tags} actionLabel={copy.newTag} onAction={() => onEdit({ kind: 'tag' })}>
          <button type="button" onClick={() => setTagsOpen((open) => !open)} className="flex min-w-0 flex-1 items-center gap-1 px-2 text-left text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
            {tagsOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            {copy.tags}
          </button>
        </SectionContextTarget>
        <button type="button" title={copy.newTag} aria-label={copy.newTag} onClick={() => onEdit({ kind: 'tag' })} className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground">
          <Plus size={13} />
        </button>
      </div>
      {tagsOpen && (
        <div>
          {tags.length > 0 ? tags.map((tag) => (
            <OrganizationContextTarget
              key={tag.id}
              label={tag.name}
              editLabel={copy.renameTag}
              deleteLabel={copy.deleteTag}
              onEdit={() => onEdit({ kind: 'tag', item: tag })}
              onDelete={() => onDelete({ kind: 'tag', id: tag.id, name: tag.name })}
            >
              <button
                type="button"
                onClick={() => selectTag(tag.id)}
                {...dropHandlers({ kind: 'tag', id: tag.id })}
                data-local-library-logical-target
                className="mb-0.5 flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs hover:bg-secondary"
                style={{ backgroundColor: selectedTagIds.includes(tag.id) ? 'var(--accent)' : undefined }}
              >
                {selectedTagIds.includes(tag.id)
                  ? <Check size={14} className="shrink-0" />
                  : <Tags size={14} className="shrink-0" style={{ color: tag.color || undefined }} />}
                <span className="min-w-0 flex-1 truncate">{tag.name}</span>
                <span className="text-[9px] text-muted-foreground">{tag.assetCount}</span>
              </button>
            </OrganizationContextTarget>
          )) : <p className="px-2 py-1.5 text-[11px] text-muted-foreground">{copy.noTags}</p>}
        </div>
      )}
    </>
  )
}

export type { DeleteTarget as OrganizationDeleteTarget }
