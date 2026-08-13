import { Environment, EventsOn } from '../../wailsjs/runtime/runtime'

export interface UpdateAsset {
  name: string
  downloadUrl: string
  size: number
  digest: string
  platform: string
  arch: string
  installMode: 'installer' | 'reveal'
}

export interface UpdateInfo {
  currentVersion: string
  latestVersion: string
  updateAvailable: boolean
  releaseUrl: string
  publishedAt: string
  notes: string
  asset?: UpdateAsset
}

export interface UpdateDownloadProgress {
  downloaded: number
  total: number
  percent: number
}

export interface UpdateDownloadResult {
  path: string
  name: string
  installMode: 'installer' | 'reveal'
}

interface AppUpdaterAPI {
  CheckForUpdates(currentVersion: string, force: boolean): Promise<UpdateInfo>
  DownloadUpdate(): Promise<UpdateDownloadResult>
  OpenDownloadedUpdate(): Promise<void>
}

function appApi(): AppUpdaterAPI {
  const bridge = (window as unknown as { go?: { main?: { App?: AppUpdaterAPI } } }).go?.main?.App
  if (!bridge) throw new Error('Wails API is not available')
  return bridge
}

export function checkForUpdates(currentVersion: string, force = false) {
  return appApi().CheckForUpdates(currentVersion, force)
}

export async function isDevelopmentBuild() {
  const environment = await Environment()
  return environment.buildType !== 'production'
}

export function downloadUpdate(onProgress: (progress: UpdateDownloadProgress) => void) {
  const unsubscribe = EventsOn('app-update:progress', (progress: UpdateDownloadProgress) => onProgress(progress))
  return appApi().DownloadUpdate().finally(unsubscribe)
}

export function openDownloadedUpdate() {
  return appApi().OpenDownloadedUpdate()
}
