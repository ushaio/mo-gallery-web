import { Copy, FolderInput, X } from 'lucide-react'
import type { LocalLibraryCopy } from '../copy'
import type { LocalLibraryImportMode } from '../types'

export function ImportModeDialog({ copy, busy, onClose, onChoose }: {
  copy: LocalLibraryCopy
  busy: boolean
  onClose: () => void
  onChoose: (mode: LocalLibraryImportMode) => void
}) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-5">
      <button type="button" aria-label={copy.cancelAction} onClick={onClose} className="absolute inset-0 bg-black/60" />
      <div className="relative w-full max-w-lg rounded-xl border bg-popover p-5 shadow-2xl" style={{ borderColor: 'var(--border)' }}>
        <button type="button" aria-label={copy.cancelAction} disabled={busy} onClick={onClose} className="absolute right-3 top-3 rounded-md p-2 hover:bg-secondary disabled:opacity-50">
          <X size={16} />
        </button>
        <div className="pr-8">
          <h2 className="font-sans text-base font-medium">{copy.importModeTitle}</h2>
          <p className="mt-2 text-xs leading-5" style={{ color: 'var(--muted-foreground)' }}>{copy.importModeBody}</p>
        </div>
        <div className="mt-6 grid gap-2 sm:grid-cols-2">
          <button type="button" disabled={busy} onClick={() => onChoose('copy')} className="flex items-start gap-3 rounded-lg border p-4 text-left hover:bg-secondary disabled:opacity-50">
            <Copy size={18} className="mt-0.5 shrink-0" />
            <span><span className="block text-xs font-medium">{copy.copyIntoLibrary}</span><span className="mt-1 block text-[10px] leading-4" style={{ color: 'var(--muted-foreground)' }}>{copy.copyIntoLibraryHint}</span></span>
          </button>
          <button type="button" disabled={busy} onClick={() => onChoose('move')} className="flex items-start gap-3 rounded-lg border p-4 text-left hover:bg-secondary disabled:opacity-50">
            <FolderInput size={18} className="mt-0.5 shrink-0" />
            <span><span className="block text-xs font-medium">{copy.moveIntoLibrary}</span><span className="mt-1 block text-[10px] leading-4" style={{ color: 'var(--muted-foreground)' }}>{copy.moveIntoLibraryHint}</span></span>
          </button>
        </div>
        <p className="mt-4 text-[10px]" style={{ color: 'var(--muted-foreground)' }}>{copy.importModeSettingsHint}</p>
      </div>
    </div>
  )
}