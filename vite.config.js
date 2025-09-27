import { defineConfig } from 'vite'
import legacy from '@vitejs/plugin-legacy'

export default defineConfig({
  plugins: [
    legacy({
      targets: ['defaults', 'not IE 11']
    })
  ],
  root: 'src',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: 'src/index.html',
        dashboard: 'src/dashboard.html',
        trading: 'src/trading.html',
        portfolio: 'src/portfolio.html',
        market: 'src/market.html',
        settings: 'src/settings.html'
      }
    }
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
          target: 'http://localhost:5001',
          changeOrigin: true
        },
        '/socket.io': {
          target: 'http://localhost:5001',
          changeOrigin: true,
          ws: true
        }
    }
  }
})