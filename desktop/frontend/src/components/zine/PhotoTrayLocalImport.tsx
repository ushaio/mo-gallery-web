import { useRef, useState } from 'react'
import { FolderOpen, ImagePlus, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { t } from '@/lib/i18n'
import { saveZineAssetBlob } from '@/lib/zine/project'
import type { ZineAsset } from '@/lib/zine/types'
import { usePreferences } from '@/store/preferences'
import { useZineStore } from '@/store/zine'

import { TrayThumb } from './TrayThumb'

interface PhotoTrayLocalImportProps {
  onPickAsset: (asset: ZineAsset) => void
  onDragAsset: (asset: ZineAsset) => void
}

function createLocalAssetId() {
  return crypto.randomUUID?.() ?? `local_${Date.now()}_${Math.random().toString(36).slice(2)}`
}

function getImageSize(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const image = new Image()
    image.onload = () => resolve({ width: image.naturalWidth || 0, height: image.naturalHeight || 0 })
    image.onerror = () => resolve({ width: 0, height: 0 })
    image.src = src
  })
}

const EMPTY_ZINE_ASSETS: ZineAsset[] = []

export function selectZineProjectAssets(project: { assets: ZineAsset[] } | null | undefined) {
  return project?.assets ?? EMPTY_ZINE_ASSETS
}

export function PhotoTrayLocalImport({ onPickAsset, onDragAsset }: PhotoTrayLocalImportProps) {
  const { language } = usePreferences()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [importing, setImporting] = useState(false)
  const projectAssets = useZineStore((state) => selectZineProjectAssets(state.project))
  const assets = projectAssets.filter((asset) => asset.source === 'local')
  const addAsset = useZineStore((state) => state.addAsset)

  async function importFiles(files: FileList | null) {
    if (!files?.length) return

    setImporting(true)
    try {
      for (const file of Array.from(files)) {
        const id = createLocalAssetId()
        const blobId = id
        const previewUrl = URL.createObjectURL(file)
        const { width, height } = await getImageSize(previewUrl)
        const asset: ZineAsset = {
          id,
          source: 'local',
          blobId,
          fileName: file.name,
          width,
          height,
          previewUrl,
          fullUrl: previewUrl,
          createdAt: Date.now(),
        }

        await saveZineAssetBlob(blobId, file)
        addAsset(asset)
      }
    } catch {
      toast.error(t('admin.zine_import_failed', language))
    } finally {
      setImporting(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="flex h-full min-w-0 gap-3">
      <div className="flex h-full shrink-0 flex-col items-start justify-center gap-1.5">
        <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={(event) => void importFiles(event.target.files)} />
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium transition hover:bg-accent disabled:cursor-wait disabled:opacity-60"
          style={{ borderColor: 'var(--border)' }}
          onClick={() => inputRef.current?.click()}
          disabled={importing}
        >
          {importing ? <Loader2 size={13} className="animate-spin" /> : <FolderOpen size={13} />}
          {importing ? t('admin.zine_importing', language) : t('admin.zine_import_local', language)}
        </button>
        <span className="px-0.5 text-[10px]" style={{ color: 'var(--muted-foreground)' }}>
          {t('admin.zine_local_hint', language)}
        </span>
      </div>

      {assets.length === 0 ? (
        <div
          className="flex h-full min-w-0 flex-1 items-center justify-center gap-2 rounded-lg border border-dashed text-xs"
          style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}
        >
          <ImagePlus size={14} />
          {t('admin.zine_local_empty', language)}
        </div>
      ) : (
        <div className="custom-scrollbar flex h-full min-w-0 flex-1 gap-2 overflow-x-auto pb-1">
          {assets.map((asset) => (
            <TrayThumb key={asset.id} asset={asset} onPick={() => onPickAsset(asset)} onDragAsset={() => onDragAsset(asset)} />
          ))}
        </div>
      )}
    </div>
  )
}
