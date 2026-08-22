// 系统设置 · 站点（与 Web 端一致：site_title 和 cdn_domain 只读）

import { inputClass, inputStyle, Section, Field } from './shared'
// ─── Tab 1: 站点（与 Web 端一致：site_title 和 cdn_domain 只读） ──

export function SiteTab({ config }: {
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
      </Section>
    </div>
  )
}
