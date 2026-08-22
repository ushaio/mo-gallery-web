import { useEffect, useState } from 'react'
import { GetApiConfig } from '../../../wailsjs/go/main/App'

// 桌面端应用身份写死为 "Emulsion"，不再根据站点名称显示。
const APP_TITLE = 'Emulsion'

export function useDesktopSiteIdentity() {
  const [siteTitle] = useState(APP_TITLE)
  const [siteUrl, setSiteUrl] = useState('')

  useEffect(() => {
    let cancelled = false
    GetApiConfig().then((apiRes) => {
      if (cancelled) return
      const loginUrl = apiRes?.login_url
      if (typeof loginUrl === 'string' && loginUrl) {
        setSiteUrl(loginUrl.replace(/\/+$/, ''))
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  return { siteTitle, siteUrl }
}
