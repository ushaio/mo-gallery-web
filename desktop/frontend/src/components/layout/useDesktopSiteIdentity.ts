import { useEffect, useState } from 'react'
import { GetApiConfig, GetSettings } from '../../../wailsjs/go/main/App'

export function useDesktopSiteIdentity() {
  const [siteTitle, setSiteTitle] = useState('MO Gallery')
  const [siteUrl, setSiteUrl] = useState('')

  useEffect(() => {
    let cancelled = false
    Promise.allSettled([GetSettings(), GetApiConfig()]).then(([settingsRes, apiRes]) => {
      if (cancelled) return
      if (settingsRes.status === 'fulfilled' && settingsRes.value?.site_title) {
        setSiteTitle(settingsRes.value.site_title)
      }
      const loginUrl = apiRes.status === 'fulfilled' ? apiRes.value?.login_url : ''
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
