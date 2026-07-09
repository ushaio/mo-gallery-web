import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { toast } from 'sonner'

import { t } from '@/lib/i18n'
import type { ImageSlot, ZineAsset } from '@/lib/zine/types'
import { usePreferences } from '@/store/preferences'
import { useZineStore } from '@/store/zine'

import { PhotoTrayLibrary } from './PhotoTrayLibrary'
import { PhotoTrayLocalImport } from './PhotoTrayLocalImport'

type PhotoTrayTab = 'library' | 'local'

export function PhotoTray() {
  const { language } = usePreferences()
  const [activeTab, setActiveTab] = useState<PhotoTrayTab>('library')
  const [collapsed, setCollapsed] = useState(false)
  const project = useZineStore((state) => state.project)
  const activeSpreadId = useZineStore((state) => state.activeSpreadId)
  const selectedSlotId = useZineStore((state) => state.selectedSlotId)
  const addAsset = useZineStore((state) => state.addAsset)
  const updateSlot = useZineStore((state) => state.updateSlot)
  const selectSlot = useZineStore((state) => state.selectSlot)

  const activeSpread = project?.spreads.find((spread) => spread.id === activeSpreadId)
  const selectedSlot = activeSpread?.slots.find((slot) => slot.id === selectedSlotId)

  function onPickAsset(asset: ZineAsset) {
    if (!project?.assets.some((item) => item.id === asset.id)) {
      addAsset(asset)
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

    updateSlot(activeSpread.id, target.id, { assetId: asset.id } satisfies Partial<ImageSlot>)
    selectSlot(target.id)
  }

  function onDragAsset(asset: ZineAsset) {
    if (!project?.assets.some((item) => item.id === asset.id)) {
      addAsset(asset)
    }
  }

  return (
    <div className="shrink-0 border-t bg-card" style={{ borderColor: 'var(--border)' }}>
      <div className="flex h-9 items-center gap-3 px-3">
        <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--muted-foreground)' }}>
          {t('admin.zine_assets', language)}
        </span>

        <div className="flex rounded-md bg-muted p-0.5 text-xs">
          <button
            type="button"
            className={`rounded px-2.5 py-0.5 transition ${activeTab === 'library' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            onClick={() => {
              setActiveTab('library')
              setCollapsed(false)
            }}
          >
            {t('admin.zine_library', language)}
          </button>
          <button
            type="button"
            className={`rounded px-2.5 py-0.5 transition ${activeTab === 'local' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            onClick={() => {
              setActiveTab('local')
              setCollapsed(false)
            }}
          >
            {t('admin.zine_local', language)}
          </button>
        </div>

        <p className="ml-auto hidden truncate text-[11px] md:block" style={{ color: 'var(--muted-foreground)' }}>
          {t('admin.zine_tray_hint', language)}
        </p>

        <button
          type="button"
          onClick={() => setCollapsed((value) => !value)}
          className="ml-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition hover:bg-accent"
          style={{ color: 'var(--muted-foreground)' }}
          aria-label={t(collapsed ? 'admin.zine_expand_tray' : 'admin.zine_collapse_tray', language)}
          title={t(collapsed ? 'admin.zine_expand_tray' : 'admin.zine_collapse_tray', language)}
        >
          {collapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {!collapsed && (
        <div className="h-32 px-3 pb-3">
          {activeTab === 'library' ? (
            <PhotoTrayLibrary onPickAsset={onPickAsset} onDragAsset={onDragAsset} />
          ) : (
            <PhotoTrayLocalImport onPickAsset={onPickAsset} onDragAsset={onDragAsset} />
          )}
        </div>
      )}
    </div>
  )
}
