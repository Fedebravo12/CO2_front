import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  // Backend al que se reenvía /api en desarrollo. Por defecto, el nginx del
  // docker-compose de CO2_back. El certificado es autofirmado: `secure: false`.
  const backend = loadEnv(mode, process.cwd(), '').VITE_BACKEND_URL || 'https://localhost:8443'

  return {
    plugins: [react()],
    server: {
      port: 5173,
      open: true,
      proxy: {
        '/api': { target: backend, changeOrigin: true, secure: false },
        // Telemetria en vivo: el WebSocket tambien se reenvia al nginx del backend.
        '/ws': { target: backend, changeOrigin: true, secure: false, ws: true },
      },
    },
  }
})
