import { useState } from 'react'
import { Cloud, HardDrive } from 'lucide-react'
import { toast } from 'sonner'

import { useAuth } from '@/contexts/AuthContext'
import { t } from '@/lib/i18n'
import { createDefaultImageTransform } from '@/lib/zine/crop-session'
import { recordZineOperation } from '@/lib/zine/operation-log'
import type { ImageSlot, ZineAsset } from '@/lib/zine/types'
import { usePreferences } from '@/store/preferences'
import { useZineStore } from '@/store/zine'

import { PhotoTrayCurrent } from './PhotoTrayCurrent'
import { PhotoTrayLocalImport } from './PhotoTrayLocalImport'
import { PhotoLibraryDialog } from './PhotoLibraryDialog'

type ImportSource = 'cloud' | 'local-library' | null

export function PhotoTray() {
  const { isAuthenticated } = useAuth()
  const { language } = usePreferences()
  const [importSource, setImportSource] = useState<ImportSource>(null)
  const project = useZineStore((state) => state.project)
  const activeSpreadId = useZineStore((state) => state.activeSpreadId)
  const selectedSlotId = useZineStore((state) => state.selectedSlotId)
  const addAsset = useZineStore((state) => state.addAsset)
  const moveAsset = useZineStore((state) => state.moveAsset)
  const updateSlot = useZineStore((state) => state.updateSlot)
  const selectSlot = useZineStore((state) => state.selectSlot)

  const activeSpread = project?.spreads.find((spread) => spread.id === activeSpreadId)
  const selectedSlot = activeSpread?.slots.find((slot) => slot.id === selectedSlotId)
  const currentAssets = project?.assets ?? []

  function onPickAsset(asset: ZineAsset) {
    const assetAlreadyInProject = Boolean(project?.assets.some((item) => item.id === asset.id))
    recordZineOperation('asset_pick_received', {
      projectId: project?.id,
      spreadId: activeSpread?.id,
      selectedSlotId,
      selectedAssetId: selectedSlot?.kind === 'image' ? selectedSlot.assetId : null,
      nextAssetId: asset.id,
      assetSource: asset.source,
      assetAlreadyInProject,
    }, { flush: true })

    if (!assetAlreadyInProject) {
      addAsset(asset)
      recordZineOperation('asset_added_to_project', {
        projectId: project?.id,
        assetId: asset.id,
      }, { flush: true })
    }

    if (!activeSpread) return

    // 优先填入选中的图片框；否则按阅读顺序找第一个空图片框
    let target: ImageSlot | undefined = selectedSlot?.kind === 'image' ? selectedSlot : undefined
    if (!target) {
      target = activeSpread.slots
        .filter((slot): slot is ImageSlot => slot.kind === 'image' && !slot.assetId)
        .sort((a, b) => (a.page === b.page ? a.y - b.y || a.x - b.x : a.page === 'left' ? -1 : 1))[0]
    }

    if (!target) {
      toast.info(t('admin.zine_select_slot_first', language))
      return
    }

    recordZineOperation('asset_replace_requested', {
      projectId: project?.id,
      spreadId: activeSpread.id,
      slotId: target.id,
      previousAssetId: target.assetId,
      nextAssetId: asset.id,
      assetSource: asset.source,
      assetAlreadyInProject,
      slotSize: { width: target.w, height: target.h },
      imageTransform: target.imageTransform,
    }, { flush: true })

    updateSlot(activeSpread.id, target.id, {
      assetId: asset.id,
      ...(target.assetId !== asset.id ? { imageTransform: createDefaultImageTransform() } : {}),
    } satisfies Partial<ImageSlot>)
    selectSlot(target.id)

    const committed = useZineStore.getState()
    const committedSlot = committed.project?.spreads
      .find((spread) => spread.id === activeSpread.id)?.slots
      .find((slot) => slot.id === target.id)
    recordZineOperation('asset_replace_committed', {
      projectId: committed.project?.id,
      spreadId: activeSpread.id,
      slotId: target.id,
      assetId: committedSlot?.kind === 'image' ? committedSlot.assetId : null,
      undoDepth: committed.undoStack.length,
    }, { flush: true })
  }

  function onDragAsset(asset: ZineAsset) {
    if (!project?.assets.some((item) => item.id === asset.id)) {
      addAsset(asset)
    }
  }

  function importAsset(asset: ZineAsset) {
    if (project?.assets.some((item) => item.id === asset.id)) return
    addAsset(asset)
    recordZineOperation('asset_added_to_project', {
      projectId: project?.id,
      assetId: asset.id,
      assetSource: asset.source,
      importOnly: true,
    }, { flush: true })
  }

  function importAssets(assets: ZineAsset[]) {
    assets.forEach(importAsset)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 p-3">
        <PhotoTrayCurrent
          assets={currentAssets}
          spreads={project?.spreads ?? []}
          onPickAsset={onPickAsset}
          onDragAsset={onDragAsset}
          onMoveAsset={moveAsset}
        />
      </div>
      <div className="flex shrink-0 flex-col gap-1.5 border-t p-2" style={{ borderColor: 'var(--border)' }}>
        <PhotoTrayLocalImport onPickAsset={importAsset} onDragAsset={onDragAsset} controlsOnly />
        <button
          type="button"
          disabled={!isAuthenticated}
          onClick={() => setImportSource(importSource === 'cloud' ? null : 'cloud')}
          className={`flex w-full items-center justify-start gap-2 rounded-md border px-3 py-2 text-xs font-medium transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50 ${importSource === 'cloud' ? 'bg-accent text-accent-foreground' : ''}`}
          style={{ borderColor: 'var(--border)' }}
        >
          <Cloud size={13} className="shrink-0" />
          <span>{t('admin.zine_import_cloud', language)}</span>
        </button>
        <button
          type="button"
          onClick={() => setImportSource(importSource === 'local-library' ? null : 'local-library')}
          className={`flex w-full items-center justify-start gap-2 rounded-md border px-3 py-2 text-xs font-medium transition hover:bg-accent ${importSource === 'local-library' ? 'bg-accent text-accent-foreground' : ''}`}
          style={{ borderColor: 'var(--border)' }}
        >
          <HardDrive size={13} className="shrink-0" />
          <span>{t('admin.zine_import_local_library', language)}</span>
        </button>
      </div>
      <PhotoLibraryDialog source={importSource} existingAssets={currentAssets} onClose={() => setImportSource(null)} onImportAssets={importAssets} />
    </div>
  )
}
