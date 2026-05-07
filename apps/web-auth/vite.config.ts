import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  base: './', // GitHub Pages 対応
  build: {
    outDir: 'dist',
  },
})
