import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' keeps the build portable on GitHub Pages project sites,
// custom domains and local preview without per-repo configuration.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: { chunkSizeWarningLimit: 1600 },
})
