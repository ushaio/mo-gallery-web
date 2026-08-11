import { useState } from 'react'
import { toast } from 'sonner'

import { useAuth } from '@/contexts/AuthContext'
import { t } from '@/lib/i18n'
import { createDefaultImageTransform } from '@/lib/zine/crop-session'
import { recordZineOperation } from '@/lib/zine/operation-log'
import type { ImageSlot, ZineAsset } from '@/lib/zine/types'
import { usePreferences } from '@/store/preferences'
import { useZineStore } from '@/store/zine'

import { PhotoTrayLibrary } from './PhotoTrayLibrary'
import { PhotoTrayCurrent } from './PhotoTrayCurrent'
import { PhotoTrayLocalImport } from './PhotoTrayLocalImport'

type PhotoTrayTab = 'current' | 'library' | 'local'

export function PhotoTray() {
  const { isAuthenticated } = useAuth()
  const { language } = usePreferences()
  const [activeTab, setActiveTab] = useState<PhotoTrayTab>(isAuthenticated ? 'library' : 'local')
  const displayedTab = !isAuthenticated && activeTab === 'library' ? 'local' : activeTab
  const project = useZineStore((state) => state.project)
  const activeSpreadId = useZineStore((state) => state.activeSpreadId)
  const selectedSlotId = useZineStore((state) => state.selectedSlotId)
  const addAsset = useZineStore((state) => state.addAsset)
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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b p-2" style={{ borderColor: 'var(--border)' }}>
        <div className="grid grid-cols-3 rounded-md bg-muted p-0.5 text-[10px]">
          <button
            type="button"
            className={`h-7 min-w-0 truncate rounded px-1 transition ${displayedTab === 'current' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            onClick={() => setActiveTab('current')}
          >
            {t('admin.zine_current', language)}
          </button>
          {isAuthenticated && (
            <button
              type="button"
              className={`h-7 min-w-0 truncate rounded px-1 transition ${displayedTab === 'library' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
              onClick={() => setActiveTab('library')}
            >
              {t('admin.zine_library', language)}
            </button>
          )}
          <button
            type="button"
            className={`h-7 min-w-0 truncate rounded px-1 transition ${displayedTab === 'local' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            onClick={() => setActiveTab('local')}
          >
            {t('admin.zine_local', language)}
          </button>
        </div>

      </div>

      <div className="min-h-0 flex-1 p-3">
          {displayedTab === 'current' ? (
            <PhotoTrayCurrent
              assets={currentAssets}
              spreads={project?.spreads ?? []}
              onPickAsset={onPickAsset}
              onDragAsset={onDragAsset}
            />
          ) : displayedTab === 'library' ? (
            <PhotoTrayLibrary onPickAsset={onPickAsset} onDragAsset={onDragAsset} />
          ) : (
            <PhotoTrayLocalImport onPickAsset={onPickAsset} onDragAsset={onDragAsset} />
          )}
      </div>
    </div>
  )
}
