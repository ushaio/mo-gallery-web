import { Check, ImageOff } from 'lucide-react'

import { t } from '@/lib/i18n'
import type { Spread, ZineAsset } from '@/lib/zine/types'
import { usePreferences } from '@/store/preferences'

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
      <div className="flex h-full min-w-0 flex-1 flex-col">
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
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <div className="mb-2 flex items-center gap-1 text-[10px]" style={{ color: 'var(--muted-foreground)' }}>
        <Check size={12} className="text-emerald-600" aria-hidden="true" />
        {t('admin.zine_asset_used', language)}
      </div>
      <div className="custom-scrollbar flex min-h-0 min-w-0 flex-1 content-start items-start gap-2 overflow-y-auto pb-1 flex-wrap">
        {assets.map((asset) => (
          <div key={asset.id} className="min-w-0 shrink-0" style={{ width: 'calc(50% - 4px)', aspectRatio: '1 / 1' }}>
            <TrayThumb
              asset={asset}
              used={usedAssetIds.has(asset.id)}
            usedLabel={t('admin.zine_asset_used', language)}
            sourceLabel={t(asset.origin === 'cloud-library' ? 'admin.zine_source_cloud' : asset.origin === 'local-library' ? 'admin.zine_source_local_library' : 'admin.zine_source_local_file', language)}
              onPick={() => onPickAsset(asset)}
              onDragAsset={() => onDragAsset(asset)}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
