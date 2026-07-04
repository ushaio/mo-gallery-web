import { useState } from 'react'
import { toast } from 'sonner'

import { useZineStore } from '@/store/zine'
import type { ImageSlot, ZineAsset } from '@/lib/zine/types'

import { PhotoTrayLibrary } from './PhotoTrayLibrary'
import { PhotoTrayLocalImport } from './PhotoTrayLocalImport'

type PhotoTrayTab = 'library' | 'local'

export function PhotoTray() {
  const [activeTab, setActiveTab] = useState<PhotoTrayTab>('library')
  const project = useZineStore((state) => state.project)
  const activeSpreadId = useZineStore((state) => state.activeSpreadId)
  const selectedSlotId = useZineStore((state) => state.selectedSlotId)
  const addAsset = useZineStore((state) => state.addAsset)
  const updateSlot = useZineStore((state) => state.updateSlot)

  const activeSpread = project?.spreads.find((spread) => spread.id === activeSpreadId)
  const selectedSlot = activeSpread?.slots.find((slot) => slot.id === selectedSlotId)

  function onPickAsset(asset: ZineAsset) {
    if (!project?.assets.some((item) => item.id === asset.id)) {
      addAsset(asset)
    }

    if (activeSpreadId && selectedSlot?.kind === 'image') {
      updateSlot(activeSpreadId, selectedSlot.id, { assetId: asset.id } satisfies Partial<ImageSlot>)
      return
    }

    toast.error('请先选择一个图片槽')
  }

  function onDragAsset(asset: ZineAsset) {
    if (!project?.assets.some((item) => item.id === asset.id)) {
      addAsset(asset)
    }
  }

  return (
    <div className="border-t bg-card" style={{ borderColor: 'var(--border)' }}>
      <div className="flex items-center justify-between gap-3 border-b px-4 py-2" style={{ borderColor: 'var(--border)' }}>
        <div className="flex rounded-md bg-muted p-1 text-sm">
          <button
            type="button"
            className={`rounded px-3 py-1.5 transition ${activeTab === 'library' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            onClick={() => setActiveTab('library')}
          >
            图库
          </button>
          <button
            type="button"
            className={`rounded px-3 py-1.5 transition ${activeTab === 'local' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            onClick={() => setActiveTab('local')}
          >
            本地文件
          </button>
        </div>
        <p className="text-xs text-muted-foreground">点击缩略图可放入当前图片槽，也可拖拽到画布图片槽</p>
      </div>
      <div className="h-28 overflow-hidden px-4 py-3">
        {activeTab === 'library' ? <PhotoTrayLibrary onPickAsset={onPickAsset} onDragAsset={onDragAsset} /> : <PhotoTrayLocalImport onPickAsset={onPickAsset} onDragAsset={onDragAsset} />}
      </div>
    </div>
  )
}
