import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import path from 'path'

// Đọc host nếu có chạy trên máy ảo / mobile dev
const host = process.env.TAURI_DEV_HOST;

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [
      tanstackRouter({
        target: 'react',
        autoCodeSplitting: true,
      }),
      react(),
      tailwindcss()
    ],
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "./src"),
      },
    },
    // Khuyến nghị từ Tauri v2 docs
    clearScreen: false,
    server: {
      port: 5173,
      strictPort: true, // Không tự nhảy port làm hỏng Tauri config
      host: host || false,
      hmr: host
        ? {
            protocol: 'ws',
            host,
            port: 5183,
          }
        : undefined,
      proxy: {
        '/api': {
          target: env.VITE_PROXY_TARGET || 'http://localhost:5189',
          changeOrigin: true,
          secure: false,
        },
        '/hubs': {
          target: env.VITE_PROXY_TARGET || 'http://localhost:5189',
          changeOrigin: true,
          secure: false,
          ws: true,
        },
      },
    },
  }
})
