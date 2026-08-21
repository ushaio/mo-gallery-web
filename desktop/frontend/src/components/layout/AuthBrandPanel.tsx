import { Database, HardDrive, Sparkles } from 'lucide-react'
import { t } from '@/lib/i18n'

const BRAND_POINTS = {
  zh: [
    { icon: Database, text: '云端图库索引与同步' },
    { icon: HardDrive, text: '本地原图资源库，离线可用' },
    { icon: Sparkles, text: 'AI 助手工作台' },
  ],
  en: [
    { icon: Database, text: 'Cloud gallery indexes and sync' },
    { icon: HardDrive, text: 'Local library, fully offline' },
    { icon: Sparkles, text: 'AI assistant workspace' },
  ],
}

interface AuthBrandPanelProps {
  language: 'zh' | 'en'
}

export function AuthBrandPanel({ language }: AuthBrandPanelProps) {
  return (
    <aside className="relative hidden w-[46%] shrink-0 flex-col justify-between overflow-hidden bg-[#0d0d10] p-10 text-white lg:flex">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'radial-gradient(60% 45% at 85% 8%, rgba(212,175,55,0.22), transparent 70%), radial-gradient(50% 40% at 8% 92%, rgba(212,175,55,0.10), transparent 70%), radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px)',
          backgroundSize: '100% 100%, 100% 100%, 26px 26px',
        }}
      />

      <div className="relative flex items-center gap-3">
        <img
          src="/logo.png"
          alt=""
          aria-hidden="true"
          className="h-10 w-10 rounded-xl bg-white object-contain p-0.5"
        />
        <div>
          <p className="font-serif text-lg font-medium tracking-wide">MO Gallery</p>
          <p className="text-[10px] uppercase tracking-[0.3em] text-white/40">Desktop</p>
        </div>
      </div>

      <div className="relative max-w-md">
        <p className="mb-5 font-serif text-3xl font-light leading-snug tracking-tight text-white/90">
          {t('admin.brand_tagline', language)}
        </p>
        <ul className="space-y-3.5 text-sm text-white/55">
          {BRAND_POINTS[language].map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-3">
              <Icon className="h-4 w-4 shrink-0 text-[#d4af37]" />
              {text}
            </li>
          ))}
        </ul>
      </div>

      <p className="relative text-[10px] uppercase tracking-[0.3em] text-white/30">
        MO Gallery Desktop
      </p>
    </aside>
  )
}
