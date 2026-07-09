import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

// /__zine/* 由 Go 侧 AssetServer Handler 提供（中文字体、远程图片代理）。
// wails dev 下请求先经 Vite，而 Vite 的 SPA 兜底对任意未知路径都返回
// 200 + index.html，Wails 只在收到 404/405 时才回退到 Go Handler——
// 因此必须在 Vite 里显式 404，否则 PDF 导出拿到 HTML 当图片解码而失败
function zineGoRoutes(): Plugin {
  return {
    name: 'zine-go-routes-404',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.startsWith('/__zine/')) {
          res.statusCode = 404
          res.end('handled by wails asset handler')
          return
        }
        next()
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), zineGoRoutes()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
    // 共享编辑器包（workspace 源码直出）导入 react —— 强制解析到
    // 应用自身的 react，避免打进两份实例导致 hooks 失效
    dedupe: ['react', 'react-dom'],
  },
  // avif-worker.ts 导入 @jsquash/avif（WASM 模块含动态导入），
  // Vite 默认 worker.format=iife 不支持代码分割，必须用 es 格式
  worker: {
    format: 'es',
  },
  // @jsquash/avif 的 Emscripten 胶水靠 import.meta.url 相对定位 .wasm；
  // dev 预打包会把模块挪进 .vite/deps 导致该路径 404、被 SPA 兜底顶成
  // index.html，WebAssembly.instantiate 报 "expected magic word" 错误。
  // 排除后以原始 ESM 从 node_modules 直出（生产构建不受影响）
  optimizeDeps: {
    exclude: ['@jsquash/avif'],
  },
  build: {
    outDir: 'dist',
  },
  server: {
    // Wails 开发模式下，前端由 Go 代理
    // 单独开发前端时使用此端口
    port: 5173,
  },
})
