import { useEffect, useState } from 'react'
import { GetApiConfig } from '../../../wailsjs/go/main/App'

// 桌面端应用身份写死为 "Emulsion"，不再根据站点名称显示。
const APP_TITLE = 'Emulsion'

/**
 * 读取当前站点连接信息。refreshKey 变化时（如连接/断开站点后）重新拉取配置，
 * 保证标题栏的跳转地址与连接状态保持同步。
 */
export function useDesktopSiteIdentity(refreshKey?: unknown) {
  const [siteTitle] = useState(APP_TITLE)
  const [siteUrl, setSiteUrl] = useState('')

  useEffect(() => {
    let cancelled = false
    GetApiConfig().then((apiRes) => {
      if (cancelled) return
      const loginUrl = apiRes?.login_url
      if (typeof loginUrl === 'string' && loginUrl) {
        setSiteUrl(loginUrl.replace(/\/+$/, ''))
      } else {
        setSiteUrl('')
      }
    })
    return () => {
      cancelled = true
    }
  }, [refreshKey])

  return { siteTitle, siteUrl }
}
