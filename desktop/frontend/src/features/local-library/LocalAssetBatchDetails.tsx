import { FolderInput, Heart, Layers3, Star, Tags, X } from 'lucide-react'
import type { BatchAssetOrganizationUpdate, LocalCollection, LocalTag } from './types'
import type { LocalLibraryCopy } from './copy'

interface Props {
  selectedCount: number
  tags: LocalTag[]
  collections: LocalCollection[]
  copy: LocalLibraryCopy
  busy: boolean
  canMove: boolean
  onClear: () => void
  onMove: () => void
  onUpdate: (update: Omit<BatchAssetOrganizationUpdate, 'assetIds'>) => void
}

const COLORS = ['', 'red', 'yellow', 'green', 'blue', 'purple']

export function LocalAssetBatchDetails({ selectedCount, tags, collections, copy, busy, canMove, onClear, onMove, onUpdate }: Props) {
  return (
    <aside className="custom-scrollbar hidden h-full w-[292px] shrink-0 overflow-y-auto border-l bg-card xl:block" style={{ borderColor: 'var(--border)' }}>
      <div className="flex items-start gap-3 border-b p-4" style={{ borderColor: 'var(--border)' }}>
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary"><Layers3 size={17} /></span>
        <div className="min-w-0 flex-1"><h2 className="text-sm font-semibold">{copy.batchEdit}</h2><p className="mt-1 text-[10px] text-muted-foreground">{selectedCount} {copy.selectedItems}</p></div>
        <button type="button" title={copy.clearSelection} aria-label={copy.clearSelection} onClick={onClear} className="rounded-md p-1.5 hover:bg-secondary"><X size={14} /></button>
      </div>

      <div className="space-y-5 p-4">
        <button type="button" disabled={busy || !canMove} onClick={onMove} className="flex w-full items-center gap-2 rounded-md border px-3 py-2 text-xs hover:bg-secondary disabled:opacity-50"><FolderInput size={14} />{copy.moveAssetsToFolder}</button>
        <section>
          <div className="mb-2 flex items-center gap-2 text-xs font-medium"><Star size={14} />{copy.rating}</div>
          <div className="flex flex-wrap gap-1.5">{[0, 1, 2, 3, 4, 5].map((value) => <button key={value} type="button" disabled={busy} onClick={() => onUpdate({ rating: value })} className="flex size-8 items-center justify-center rounded-md border text-xs hover:bg-secondary disabled:opacity-50">{value || '?'}</button>)}</div>
        </section>

        <section>
          <div className="mb-2 text-xs font-medium">{copy.color}</div>
          <div className="flex gap-2">{COLORS.map((value) => <button key={value || 'none'} type="button" disabled={busy} aria-label={value || copy.noColor} title={value || copy.noColor} onClick={() => onUpdate({ colorLabel: value })} className="size-7 rounded-full border-2 disabled:opacity-50" style={{ backgroundColor: value || 'transparent', borderColor: 'var(--border)' }} />)}</div>
        </section>

        <section>
          <div className="mb-2 flex items-center gap-2 text-xs font-medium"><Heart size={14} />{copy.favorite}</div>
          <div className="grid grid-cols-2 gap-2"><button type="button" disabled={busy} onClick={() => onUpdate({ isFavorite: true })} className="rounded-md border px-2 py-2 text-[11px] hover:bg-secondary disabled:opacity-50">{copy.markFavorite}</button><button type="button" disabled={busy} onClick={() => onUpdate({ isFavorite: false })} className="rounded-md border px-2 py-2 text-[11px] hover:bg-secondary disabled:opacity-50">{copy.unmarkFavorite}</button></div>
        </section>

        <section>
          <div className="mb-2 flex items-center gap-2 text-xs font-medium"><Tags size={14} />{copy.tags}</div>
          <div className="max-h-52 space-y-1 overflow-y-auto rounded-md border p-2">{tags.length === 0 ? <p className="text-[10px] text-muted-foreground">{copy.noTags}</p> : tags.map((tag) => <div key={tag.id} className="flex items-center gap-2 rounded px-1 py-1"><span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: tag.color || 'var(--muted-foreground)' }} /><span className="min-w-0 flex-1 truncate text-[11px]">{tag.name}</span><button type="button" disabled={busy} onClick={() => onUpdate({ addTagIds: [tag.id] })} className="rounded border px-1.5 py-1 text-[9px] hover:bg-secondary disabled:opacity-50">{copy.add}</button><button type="button" disabled={busy} onClick={() => onUpdate({ removeTagIds: [tag.id] })} className="rounded border px-1.5 py-1 text-[9px] hover:bg-secondary disabled:opacity-50">{copy.remove}</button></div>)}</div>
        </section>

        <section>
          <div className="mb-2 flex items-center gap-2 text-xs font-medium"><Layers3 size={14} />{copy.collections}</div>
          <div className="max-h-52 space-y-1 overflow-y-auto rounded-md border p-2">{collections.length === 0 ? <p className="text-[10px] text-muted-foreground">{copy.noCollections}</p> : collections.map((collection) => <div key={collection.id} className="flex items-center gap-2 rounded px-1 py-1"><span className="min-w-0 flex-1 truncate text-[11px]">{collection.name}</span><button type="button" disabled={busy} onClick={() => onUpdate({ addCollectionIds: [collection.id] })} className="rounded border px-1.5 py-1 text-[9px] hover:bg-secondary disabled:opacity-50">{copy.add}</button><button type="button" disabled={busy} onClick={() => onUpdate({ removeCollectionIds: [collection.id] })} className="rounded border px-1.5 py-1 text-[9px] hover:bg-secondary disabled:opacity-50">{copy.remove}</button></div>)}</div>
        </section>
      </div>
    </aside>
  )
}
