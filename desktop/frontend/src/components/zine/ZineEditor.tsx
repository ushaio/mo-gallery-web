import { PageStrip } from './PageStrip'
import { PhotoTray } from './PhotoTray'
import { SpreadCanvas } from './SpreadCanvas'
import { ZineToolbar } from './ZineToolbar'

import { useZineStore } from '@/store/zine'

export function ZineEditor() {
  const project = useZineStore((state) => state.project)
  const activeSpreadId = useZineStore((state) => state.activeSpreadId)
  const selectedSlotId = useZineStore((state) => state.selectedSlotId)
  const saving = useZineStore((state) => state.saving)
  const dirty = useZineStore((state) => state.dirty)
  const setActiveSpread = useZineStore((state) => state.setActiveSpread)
  const selectSlot = useZineStore((state) => state.selectSlot)
  const addSpread = useZineStore((state) => state.addSpread)
  const removeSpread = useZineStore((state) => state.removeSpread)
  const rename = useZineStore((state) => state.rename)
  const undo = useZineStore((state) => state.undo)
  const redo = useZineStore((state) => state.redo)

  if (!project) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Zine project not loaded</div>
  }

  const activeSpread = project.spreads.find((spread) => spread.id === activeSpreadId) ?? project.spreads[0]

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border bg-background" style={{ borderColor: 'var(--border)' }}>
      <ZineToolbar
        project={project}
        saving={saving}
        dirty={dirty}
        onRename={rename}
        onUndo={undo}
        onRedo={redo}
        onAddSpread={() => addSpread()}
        onAddTemplate={addSpread}
      />
      <div className="flex min-h-0 flex-1">
        <SpreadCanvas project={project} activeSpread={activeSpread} selectedSlotId={selectedSlotId} onSelectSlot={selectSlot} />
        <PageStrip project={project} activeSpreadId={activeSpread?.id ?? null} onSetActiveSpread={setActiveSpread} onRemoveSpread={removeSpread} />
      </div>
      <PhotoTray />
    </div>
  )
}
