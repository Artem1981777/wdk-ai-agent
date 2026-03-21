import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      include: ['buffer', 'crypto', 'stream', 'util'],
      globals: { Buffer: true, global: true }
    })
  ],
  server: {
    host: '127.0.0.1',
    port: 5173,
    allowedHosts: [
      'all',
      '.serveousercontent.com',
      '.serveo.net',
      '0a9252f93af2a755-67-220-80-242.serveousercontent.com'
    ]
  }
})
