import { toast } from 'sonner'

import type { AssetPage, LibrarySnapshot } from '../types'
import type { LocalLibraryCopy } from '../copy'

export const EMPTY_PAGE: AssetPage = {
  items: [], nextCursor: undefined, total: 0, isComplete: false,
  scan: { state: 'idle', current: 0 },
}

export const FOLDER_DRAG_TYPE = 'application/x-mo-gallery-folder-path'
export const SIDEBAR_COLORS = ['red', 'yellow', 'green', 'blue', 'purple'] as const

export interface FolderTarget {
  relativePath: string
  name: string
  isRoot: boolean
}

export function scanLabel(snapshot: LibrarySnapshot, copy: LocalLibraryCopy) {
  if (snapshot.state === 'suspended' || snapshot.scan.state === 'suspended') return copy.librarySuspended
  if (snapshot.state === 'repair_required') return copy.libraryIdentityMismatch
  switch (snapshot.scan.state) {
    case 'running': return copy.scanning
    case 'paused': return copy.scanPaused
    case 'failed':
      return snapshot.scan.error ? `${copy.scanFailed}: ${snapshot.rootPath} - ${snapshot.scan.error}` : `${copy.scanFailed}: ${snapshot.rootPath}`
    default: return copy.scanDone
  }
}

export function runResultsMessage<T extends { status: string; error?: string }>(results: T[], success: string, partial: string) {
  const failed = results.filter((item) => item.status === 'failed')
  if (failed.length === 0) toast.success(success)
  else toast.error(`${partial} (${failed.length}/${results.length})`, { description: failed[0]?.error })
}
