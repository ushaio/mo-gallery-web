// 系统设置 · 站点

import { inputClass, inputStyle, Section, Field } from './shared'
// ─── Tab 1: 站点 ──

export function SiteTab({ config, updateConfig }: {
  config: Record<string, string>
  updateConfig: (key: string, value: string) => void
}) {
  return (
    <div className="space-y-6">
      <Section title="站点信息">
        <Field label="站点标题" description="通过 .env 文件中的 SITE_TITLE 配置">
          <input type="text" value={config.site_title || ''} disabled
            className={`${inputClass} cursor-not-allowed opacity-60`}
            style={inputStyle} />
        </Field>
        <Field label="CDN 域名" description="通过 .env 文件中的 CDN_DOMAIN 配置">
          <input type="text" value={config.cdn_domain || ''} disabled
            className={`${inputClass} cursor-not-allowed opacity-60`}
            style={inputStyle} />
        </Field>
        <Field label="官方内容站地址" description="用于获取官方模板、AI Skills 和参考照片，默认 http://localhost:3001">
          <input type="url" value={config.official_site_url || 'http://localhost:3001'} onChange={event => { localStorage.setItem('mo-gallery-official-site-url', event.target.value); updateConfig('official_site_url', event.target.value) }}
            className={inputClass} style={inputStyle} placeholder="http://localhost:3001" />
        </Field>
      </Section>
    </div>
  )
}
