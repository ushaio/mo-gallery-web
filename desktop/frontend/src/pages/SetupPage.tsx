import { useMemo, useState, type FormEvent } from 'react'
import { ArrowLeft, ArrowRight, Database, Eye, EyeOff, HardDrive, KeyRound, Loader2, Server, UserRound } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { CompleteSetup } from '../../wailsjs/go/main/App'
import { usePreferences } from '@/store/preferences'

export interface SetupState {
  completed: boolean
  database: {
    host: string
    port: number
    user: string
    password?: string
    password_configured?: boolean
    dbname: string
    sslmode: string
  }
  api: {
    base_url: string
    login_url: string
    jwt_secret: string
    jwt_configured?: boolean
    remember_login: boolean
    saved_username?: string
    password_configured?: boolean
  }
}

interface Props {
  initialState: SetupState
  onComplete: (state: SetupState) => void
}

const fallbackState: SetupState = {
  completed: false,
  database: { host: 'localhost', port: 5432, user: 'postgres', password: '', password_configured: false, dbname: 'mo_gallery', sslmode: 'disable' },
  api: { base_url: '', login_url: '', jwt_secret: '', jwt_configured: false, remember_login: false, saved_username: '', password_configured: false },
}

interface SecretInputProps {
  label: string
  value: string
  onChange: (value: string) => void
  language: 'zh' | 'en'
  placeholder?: string
  disabled?: boolean
}

function SecretInput({ label, value, onChange, language, placeholder, disabled }: SecretInputProps) {
  const [visible, setVisible] = useState(false)
  const visibilityLabel = language === 'zh' ? (visible ? '隐藏' : '显示') : visible ? 'Hide' : 'Show'

  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</span>
      <span className="relative block">
        <input type={visible ? 'text' : 'password'} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} disabled={disabled}
          className="w-full rounded-lg border border-border bg-card px-3 py-2.5 pr-10 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-60 [&::-ms-clear]:hidden [&::-ms-reveal]:hidden" />
        <button type="button" onClick={() => setVisible((current) => !current)} disabled={disabled} aria-label={visibilityLabel}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50">
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </span>
    </label>
  )
}

export function SetupPage({ initialState, onComplete }: Props) {
  const navigate = useNavigate()
  const { language } = usePreferences()
  const zh = language === 'zh'
  const [step, setStep] = useState(0)
  const [database, setDatabase] = useState({ ...fallbackState.database, ...initialState.database })
  const [api, setApi] = useState({ ...fallbackState.api, ...initialState.api, password: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const copy = useMemo(() => zh ? {
    eyebrow: '首次启动', title: '欢迎使用 MO Gallery', body: '花一分钟配置连接信息。数据库和云端登录都可以稍后在设置中修改。',
    database: '配置数据库', databaseBody: '用于云端内容索引。没有数据库也可以直接使用离线资源库。', login: '配置连接', loginBody: '填写服务地址和 JWT Secret，完成后会进入登录页。', next: '下一步', back: '上一步',
    finish: '保存并继续登录', finishOffline: '保存设置', skip: '跳过，使用离线功能', optional: '可选', required: '必填',
    host: '主机', port: '端口', user: '用户名', password: '密码', dbname: '数据库名', sslmode: 'SSL 模式',
    server: '服务地址', jwt: 'JWT Secret',
    saved: '正在保存...', saveError: '保存失败，请重试', secretSaved: '已保存，留空则继续沿用',
  } : {
    eyebrow: 'FIRST RUN', title: 'Welcome to MO Gallery', body: 'Take a minute to configure your connections. You can change them later in Settings.',
    database: 'Configure database', databaseBody: 'Used for cloud content indexes. You can still use the offline library without one.', login: 'Configure connection', loginBody: 'Add the server URL and JWT Secret. You will continue to the login page after saving.', next: 'Continue', back: 'Back',
    finish: 'Save and continue to login', finishOffline: 'Save settings', skip: 'Skip and use offline', optional: 'Optional', required: 'Required',
    host: 'Host', port: 'Port', user: 'User', password: 'Password', dbname: 'Database name', sslmode: 'SSL mode',
    server: 'Server URL', jwt: 'JWT Secret',
    saved: 'Saving...', saveError: 'Could not save setup. Try again.', secretSaved: 'Saved. Leave blank to keep the current value.',
  }, [zh])

  const save = async (offlineOnly = false) => {
    setSaving(true)
    setError('')
    try {
      await CompleteSetup({ database, api, offline_only: offlineOnly })
      onComplete({
        completed: true,
        database: {
          host: database.host,
          port: database.port,
          user: database.user,
          password: '',
          password_configured: database.password_configured || Boolean(database.password),
          dbname: database.dbname,
          sslmode: database.sslmode,
        },
        api: {
          base_url: api.base_url,
          login_url: api.login_url,
          jwt_secret: '',
          jwt_configured: api.jwt_configured || Boolean(api.jwt_secret.trim()),
          remember_login: api.remember_login,
          saved_username: api.saved_username,
          password_configured: api.password_configured || Boolean(api.password),
        },
      })
      navigate(offlineOnly ? '/library?source=local' : '/login', { replace: true })
    } catch {
      setError(copy.saveError)
    } finally {
      setSaving(false)
    }
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (step === 0) setStep(1)
    else void save()
  }

  const field = (label: string, value: string | number, onChange: (value: string) => void, options?: { type?: string; required?: boolean; placeholder?: string }) => (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</span>
      <input type={options?.type || 'text'} value={value} required={options?.required} placeholder={options?.placeholder} onChange={(event) => onChange(event.target.value)} disabled={saving}
        className="w-full rounded-lg border border-border bg-card px-3 py-2.5 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-60" />
    </label>
  )

  return (
    <div className="flex h-full w-full items-center justify-center overflow-y-auto bg-background px-6 py-10 text-foreground">
      <div className="w-full max-w-2xl animate-fade-up">
        <div className="mb-8 flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground"><span className="font-serif text-xl font-bold">M</span></div>
          <div><p className="text-[10px] font-medium uppercase tracking-[0.25em] text-muted-foreground">{copy.eyebrow}</p><h1 className="mt-1 font-serif text-3xl font-light">{copy.title}</h1><p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{copy.body}</p></div>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-2" aria-label={zh ? '引导步骤' : 'Setup steps'}>
          {[{ icon: Database, title: copy.database }, { icon: KeyRound, title: copy.login }].map(({ icon: Icon, title }, index) => (
            <div key={title} className={`flex items-center gap-3 rounded-lg border px-4 py-3 ${step === index ? 'border-primary bg-primary/5' : 'border-border bg-card'}`}>
              <Icon className="h-4 w-4" /><span className="text-xs font-medium">{index + 1}. {title}</span>
            </div>
          ))}
        </div>

        <form onSubmit={submit} className="rounded-xl border border-border bg-card p-6 shadow-sm">
          {step === 0 ? <>
            <div className="mb-5 flex items-start gap-3"><Server className="mt-0.5 h-5 w-5 text-primary" /><div><h2 className="font-sans text-base font-semibold">{copy.database}</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">{copy.databaseBody}</p></div></div>
            <div className="grid gap-4 sm:grid-cols-2">
              {field(copy.host, database.host, (value) => setDatabase((current) => ({ ...current, host: value })), { required: true })}
              {field(copy.port, database.port, (value) => setDatabase((current) => ({ ...current, port: Number(value) || 0 })), { type: 'number', required: true })}
              {field(copy.user, database.user, (value) => setDatabase((current) => ({ ...current, user: value })), { required: true })}
              <SecretInput label={copy.password} value={database.password || ''} onChange={(value) => setDatabase((current) => ({ ...current, password: value }))} language={language} placeholder={database.password_configured ? copy.secretSaved : undefined} disabled={saving} />
              {field(copy.dbname, database.dbname, (value) => setDatabase((current) => ({ ...current, dbname: value })), { required: true })}
              {field(copy.sslmode, database.sslmode, (value) => setDatabase((current) => ({ ...current, sslmode: value })), { placeholder: 'disable' })}
            </div>
          </> : <>
            <div className="mb-5 flex items-start gap-3"><UserRound className="mt-0.5 h-5 w-5 text-primary" /><div><h2 className="font-sans text-base font-semibold">{copy.login}</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">{copy.loginBody}</p></div></div>
            <div className="space-y-4">
              {field(copy.server, api.base_url, (value) => setApi((current) => ({ ...current, base_url: value, login_url: value })), { placeholder: 'https://gallery.example.com' })}
              <SecretInput label={copy.jwt} value={api.jwt_secret} onChange={(value) => setApi((current) => ({ ...current, jwt_secret: value }))} language={language} placeholder={api.jwt_configured ? copy.secretSaved : undefined} disabled={saving} />
            </div>
          </>}

          {error && <p role="alert" className="mt-4 text-xs text-destructive">{error}</p>}
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <button type="button" onClick={() => void save(true)} disabled={saving} className="flex items-center gap-2 text-xs text-muted-foreground transition hover:text-foreground disabled:opacity-50"><HardDrive className="h-4 w-4" />{copy.skip}</button>
            <div className="flex items-center gap-2">
              {step > 0 && <button type="button" onClick={() => setStep(0)} disabled={saving} className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs hover:bg-secondary disabled:opacity-50"><ArrowLeft className="h-3.5 w-3.5" />{copy.back}</button>}
              <button type="submit" disabled={saving} className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60">{saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : step === 0 ? <ArrowRight className="h-3.5 w-3.5" /> : null}{saving ? copy.saved : step === 0 ? copy.next : copy.finish}</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
