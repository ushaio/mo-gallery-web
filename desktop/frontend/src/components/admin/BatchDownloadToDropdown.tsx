import { useCallback, useEffect, useRef, useState } from 'react'
import { Download, FolderOpen, Loader2 } from 'lucide-react'
import { LibrarySelectionButton } from '@/components/ui/library'
import { SelectFolder } from '../../../wailsjs/go/main/App'
import { localLibraryApi } from '@/features/library/local/api'
import type { RecentLibrary } from '@/features/library/local/types'
import { t } from '@/lib/i18n'

interface BatchDownloadToDropdownProps {
  language: 'zh' | 'en'
  onDownloadToFolder: (folderPath: string) => void
  onDownloadToLibrary: (library: RecentLibrary) => void
}

/**
 * 悬浮选中栏的「下载至」下拉：固定提供「下载至本地文件夹」（系统目录选择），
 * 下面列出最近本地资源库。选中后由调用方批量下载所有已选照片。
 */
export function BatchDownloadToDropdown({
  language,
  onDownloadToFolder,
  onDownloadToLibrary,
}: BatchDownloadToDropdownProps) {
  const [open, setOpen] = useState(false)
  const [libraries, setLibraries] = useState<RecentLibrary[]>([])
  const [librariesLoading, setLibrariesLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  const loadLibraries = useCallback(async () => {
    if (librariesLoading || loaded) return
    setLibrariesLoading(true)
    try {
      const state = await localLibraryApi.entryState()
      setLibraries(state.recent)
      setLoaded(true)
    } catch {
      // ignore — empty list shown
    } finally {
      setLibrariesLoading(false)
    }
  }, [librariesLoading, loaded])

  useEffect(() => {
    if (open) void loadLibraries()
  }, [open, loadLibraries])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('touchstart', onPointerDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('touchstart', onPointerDown)
    }
  }, [open])

  const handleSelectFolder = async () => {
    setOpen(false)
    let path: string
    try {
      path = await SelectFolder()
    } catch {
      return
    }
    if (path) onDownloadToFolder(path)
  }

  return (
    <div ref={rootRef} className="relative">
      <LibrarySelectionButton
        icon={Download}
        label={language === 'zh' ? '下载至' : 'Download to'}
        title={language === 'zh' ? '下载至' : 'Download to'}
        active={open}
        onClick={() => setOpen((value) => !value)}
      />
      {open && (
        <div
          className="absolute bottom-full right-0 z-50 mb-1.5 w-64 rounded-lg border bg-card py-1 shadow-xl"
          style={{ borderColor: 'var(--border)' }}
        >
          <button
            type="button"
            onClick={() => void handleSelectFolder()}
            className="flex w-full flex-col items-start px-3 py-2 text-left text-xs hover:bg-secondary"
          >
            <span className="flex items-center gap-1.5">
              <FolderOpen size={13} />
              {language === 'zh' ? '下载至本地文件夹' : 'Download to folder'}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {language === 'zh' ? '选择系统目录保存原图' : 'Pick a system folder for the original'}
            </span>
          </button>
          <div className="mx-2 h-px" style={{ backgroundColor: 'var(--border)' }} />
          {librariesLoading ? (
            <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
              <Loader2 size={13} className="animate-spin" />
              {t('admin.loading', language)}
            </div>
          ) : libraries.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              {t('admin.ai_no_local_libraries', language)}
            </div>
          ) : (
            libraries.map((library) => (
              <button
                key={library.path}
                type="button"
                disabled={!library.available}
                onClick={() => {
                  setOpen(false)
                  onDownloadToLibrary(library)
                }}
                className="flex w-full flex-col items-start px-3 py-2 text-left text-xs hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40"
              >
                <span className="truncate">{library.name}</span>
                <span className="truncate text-[10px] text-muted-foreground">
                  {library.available
                    ? library.path
                    : t('admin.ai_library_unavailable', language)}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
