import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: { '/api': 'http://127.0.0.1:8765' },
  },
  build: {
    // esbuild >=0.26 拒绝把析构降级到 safari14 等旧目标(recharts 触发);锁定单一现代目标绕过。
    target: 'es2022',
  },
  test: { environment: 'jsdom', globals: true, setupFiles: './src/test-setup.ts' },
})
