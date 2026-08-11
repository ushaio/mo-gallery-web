import { Check, ImageOff } from 'lucide-react'

import { t } from '@/lib/i18n'
import type { Spread, ZineAsset } from '@/lib/zine/types'
import { usePreferences } from '@/store/preferences'

import { PhotoTrayLocalImport } from './PhotoTrayLocalImport'
import { TrayThumb } from './TrayThumb'

interface PhotoTrayCurrentProps {
  assets: ZineAsset[]
  spreads: Spread[]
  onPickAsset: (asset: ZineAsset) => void
  onDragAsset: (asset: ZineAsset) => void
}

export function getUsedZineAssetIds(spreads: Spread[] | undefined) {
  const usedAssetIds = new Set<string>()

  for (const spread of spreads ?? []) {
    for (const slot of spread.slots) {
      if (slot.kind === 'image' && slot.assetId) {
        usedAssetIds.add(slot.assetId)
      }
    }
  }

  return usedAssetIds
}

export function PhotoTrayCurrent({ assets, spreads, onPickAsset, onDragAsset }: PhotoTrayCurrentProps) {
  const { language } = usePreferences()
  const usedAssetIds = getUsedZineAssetIds(spreads)

  if (assets.length === 0) {
    return (
      <div className="flex h-full min-w-0 flex-1 flex-col gap-3">
        <PhotoTrayLocalImport onPickAsset={onPickAsset} onDragAsset={onDragAsset} controlsOnly />
        <div
          className="flex min-h-0 min-w-0 flex-1 items-center justify-center gap-2 rounded-lg border border-dashed text-xs"
          style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}
        >
          <ImageOff size={14} />
          {t('admin.zine_current_empty', language)}
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col gap-3">
      <PhotoTrayLocalImport onPickAsset={onPickAsset} onDragAsset={onDragAsset} controlsOnly />
      <div className="flex items-center gap-1 text-[10px]" style={{ color: 'var(--muted-foreground)' }}>
        <Check size={12} className="text-emerald-600" aria-hidden="true" />
        {t('admin.zine_asset_used', language)}
      </div>
      <div className="custom-scrollbar grid min-h-0 min-w-0 flex-1 grid-cols-2 content-start gap-2 overflow-y-auto pb-1">
        {assets.map((asset) => (
          <TrayThumb
            key={asset.id}
            asset={asset}
            used={usedAssetIds.has(asset.id)}
            usedLabel={t('admin.zine_asset_used', language)}
            onPick={() => onPickAsset(asset)}
            onDragAsset={() => onDragAsset(asset)}
          />
        ))}
      </div>
    </div>
  )
}
