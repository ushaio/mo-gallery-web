import type { ReactElement } from 'react'
import {
  FolderInput, FolderPen, FolderPlus, FolderSearch2, Info, Trash2,
} from 'lucide-react'

import {
  ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuLabel, ContextMenuSeparator, ContextMenuTrigger,
} from '@/components/ui/ContextMenu'
import type { LocalLibraryCopy } from '../copy'
import type { FolderTarget } from './workbench-shared'

export function FolderContextTarget({ target, copy, children, onCreate, onOpenInFileManager, onRename, onMove, onProperties, onDelete }: {
  target: FolderTarget
  copy: LocalLibraryCopy
  children: ReactElement
  onCreate: (target: FolderTarget) => void
  onOpenInFileManager: (target: FolderTarget) => void
  onRename: (target: FolderTarget) => void
  onMove: (target: FolderTarget) => void
  onProperties: (target: FolderTarget) => void
  onDelete: (target: FolderTarget) => void
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuLabel className="max-w-56 truncate">{target.name}</ContextMenuLabel>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => onOpenInFileManager(target)}><FolderSearch2 size={14} />{copy.openInFileManager}</ContextMenuItem>
        <ContextMenuItem onSelect={() => onCreate(target)}><FolderPlus size={14} />{copy.newFolder}</ContextMenuItem>
        {!target.isRoot ? <>
          <ContextMenuItem onSelect={() => onRename(target)}><FolderPen size={14} />{copy.renameFolder}</ContextMenuItem>
          <ContextMenuItem onSelect={() => onMove(target)}><FolderInput size={14} />{copy.moveFolder}</ContextMenuItem>
        </> : null}
        <ContextMenuItem onSelect={() => onProperties(target)}><Info size={14} />{copy.folderProperties}</ContextMenuItem>
        {!target.isRoot ? (
          <><ContextMenuSeparator /><ContextMenuItem variant="destructive" onSelect={() => onDelete(target)}><Trash2 size={14} />{copy.deleteFolder}</ContextMenuItem></>
        ) : null}
      </ContextMenuContent>
    </ContextMenu>
  )
}

export function StatButton({ active, value, label, onClick }: { active: boolean; value: number; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className="flex flex-col items-center gap-0.5 rounded-md px-1 py-1.5 transition hover:bg-secondary"
      style={{ color: 'var(--muted-foreground)' }}
    >
      <span className="font-medium" style={{ color: active ? 'var(--primary)' : 'var(--foreground)' }}>{value.toLocaleString()}</span>
      <span className="truncate max-w-full">{label}</span>
    </button>
  )
}
