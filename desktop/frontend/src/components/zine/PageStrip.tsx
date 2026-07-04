import type { ZineProject } from '@/lib/zine/types'

import { PageThumb } from './PageThumb'

interface PageStripProps {
  project: ZineProject
  activeSpreadId: string | null
  onSetActiveSpread: (spreadId: string) => void
  onRemoveSpread: (spreadId: string) => void
}

export function PageStrip({ project, activeSpreadId, onSetActiveSpread, onRemoveSpread }: PageStripProps) {
  const canDelete = project.spreads.length > 1

  return (
    <aside className="w-44 shrink-0 overflow-y-auto border-l bg-card p-4" style={{ borderColor: 'var(--border)' }}>
      <div className="mb-3 text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--muted-foreground)' }}>
        Spreads
      </div>
      <div className="space-y-3">
        {project.spreads.map((spread, index) => {
          const active = spread.id === activeSpreadId
          return (
            <div key={spread.id} className="group rounded-lg border p-2 transition" style={{ borderColor: active ? 'var(--primary)' : 'var(--border)', backgroundColor: active ? 'var(--accent)' : 'transparent' }}>
              <button type="button" className="block w-full text-left" onClick={() => onSetActiveSpread(spread.id)}>
                <PageThumb project={project} spread={spread} />
                <span className="mt-2 block text-xs font-medium">Spread {index + 1}</span>
              </button>
              {canDelete && (
                <button type="button" className="mt-2 text-xs text-destructive opacity-75 hover:opacity-100" onClick={() => onRemoveSpread(spread.id)}>
                  Delete
                </button>
              )}
            </div>
          )
        })}
      </div>
    </aside>
  )
}
