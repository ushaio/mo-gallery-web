import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import './index.css'

// ---------------------------------------------------------------
// 桌面运行时就绪门控
//
// Wails 通过注入到入口 HTML 的脚本把 window.go / window.runtime 挂到全局。
// 开发资产服务器只对 /、以 / 结尾或 /index.html 的文档响应执行注入，
// 因此桌面端使用 hash 路由，确保刷新任意页面时仍请求应用入口。
// 这里仍在挂载 React 前等待绑定完成，覆盖运行时脚本与应用 bundle 的正常时序差。
// ---------------------------------------------------------------

function isWailsRuntimeReady(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!(window as unknown as { go?: { main?: { App?: unknown } } }).go?.main?.App
  )
}

function waitForWailsRuntime(timeoutMs = 15000): Promise<boolean> {
  return new Promise((resolve) => {
    const start = Date.now()
    const check = () => {
      if (isWailsRuntimeReady()) return resolve(true)
      if (Date.now() - start >= timeoutMs) return resolve(false)
      setTimeout(check, 50)
    }
    check()
  })
}

function legacyRouteEntryUrl(): string | null {
  const { pathname, search, hash } = window.location
  if (hash || pathname === '/' || pathname.endsWith('/index.html')) return null
  return `/#${pathname}${search}`
}

function reloadDesktopEntry() {
  const entryUrl = legacyRouteEntryUrl()
  if (entryUrl) {
    window.location.replace(entryUrl)
    return
  }
  window.location.reload()
}

// 桌面端不应暴露浏览器的整页刷新快捷键（原生右键菜单已由 main.go 的
// EnableDefaultContextMenu: false 禁用，这里再兜住 F5 / Ctrl+R）
window.addEventListener('keydown', (event) => {
  if (
    event.key === 'F5' ||
    ((event.ctrlKey || event.metaKey) && (event.key === 'r' || event.key === 'R'))
  ) {
    event.preventDefault()
  }
})

const root = ReactDOM.createRoot(document.getElementById('root')!)

function renderLoading() {
  root.render(
    <div
      style={{
        height: '100vh',
        width: '100vw',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'var(--background)',
        color: 'var(--muted-foreground)',
      }}
    >
      <span style={{ fontSize: 13 }}>Loading…</span>
    </div>,
  )
}

function renderRuntimeError() {
  root.render(
    <div
      style={{
        height: '100vh',
        width: '100vw',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'var(--background)',
        color: 'var(--foreground)',
      }}
    >
      <div style={{ fontSize: 15, fontWeight: 600 }}>桌面运行时连接失败</div>
      <div style={{ fontSize: 13, maxWidth: 420, textAlign: 'center', color: 'var(--muted-foreground)' }}>
        Wails 运行时（window.go）未注入。请返回应用入口重新建立桌面连接。
      </div>
      <button
        type="button"
        onClick={reloadDesktopEntry}
        style={{
          padding: '8px 20px',
          borderRadius: 8,
          border: 'none',
          cursor: 'pointer',
          fontSize: 13,
          backgroundColor: 'var(--primary)',
          color: 'var(--primary-foreground)',
        }}
      >
        重新加载
      </button>
    </div>,
  )
}

async function bootstrap() {
  renderLoading()

  const entryUrl = legacyRouteEntryUrl()
  if (entryUrl) {
    window.location.replace(entryUrl)
    return
  }

  const ready = await waitForWailsRuntime()
  if (!ready) {
    console.error('[bootstrap] Wails 运行时未在限定时间内注入（window.go 缺失）')
    renderRuntimeError()
    return
  }

  root.render(
    <React.StrictMode>
      <HashRouter>
        <App />
      </HashRouter>
    </React.StrictMode>,
  )
}

void bootstrap()
