import { defineConfig } from 'vite'

export default defineConfig({
  // Relative paths so the same build works at github.io/arzin-lab/ and locally.
  base: './',
  build: { chunkSizeWarningLimit: 2000 }, // three.js + mathjs are big; fine for now
  server: {
    host: true,              // reachable from your iPhone on the same Wi-Fi
    fs: { allow: ['..'] },   // scenes/ lives one level up, at the repo root
  },
})
