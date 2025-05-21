import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:4000', // Express 서버 주소
        changeOrigin: true,
        secure: false,
      },
      '/socket.io': {
        target: 'ws://localhost:4000',
        ws: true,
      },
    },
  },
})
