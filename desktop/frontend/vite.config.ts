import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  // avif-worker.ts 导入 @jsquash/avif（WASM 模块含动态导入），
  // Vite 默认 worker.format=iife 不支持代码分割，必须用 es 格式
  worker: {
    format: 'es',
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
