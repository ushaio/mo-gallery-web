// 官方站地址暂时固定，避免 Wails 启动阶段依赖前端环境变量或配置桥接。
// 后续切换部署环境时只需要修改这一处。
export const DESIGN_SERVER_URL = 'http://localhost:3001'
const OFFICIAL_SITE_URL_KEY = 'mo-gallery-official-site-url'

export function getDesignServerUrl(): string {
  const configured = typeof localStorage === 'undefined' ? '' : localStorage.getItem(OFFICIAL_SITE_URL_KEY)?.trim()
  return (configured || DESIGN_SERVER_URL).replace(/\/+$/, '')
}
