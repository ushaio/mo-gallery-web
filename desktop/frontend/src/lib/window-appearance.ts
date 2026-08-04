export type WindowStyle = 'native' | 'integrated'

export interface WindowAppearance {
  activeStyle: WindowStyle
  configuredStyle: WindowStyle
}

interface WindowAppearanceAPI {
  GetWindowAppearance(): Promise<WindowAppearance>
  UpdateWindowStyle(style: WindowStyle): Promise<WindowAppearance>
  RestartApplication(): Promise<void>
}

function appApi(): WindowAppearanceAPI {
  const bridge = (window as unknown as { go?: { main?: { App?: WindowAppearanceAPI } } }).go?.main?.App
  if (!bridge) throw new Error('Wails API is not available')
  return bridge
}

export function getWindowAppearance() {
  return appApi().GetWindowAppearance()
}

export function updateWindowStyle(style: WindowStyle) {
  return appApi().UpdateWindowStyle(style)
}

export function restartApplication() {
  return appApi().RestartApplication()
}
