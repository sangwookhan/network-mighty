import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: { input: { main: resolve(__dirname, 'index.html'), dev: resolve(__dirname, 'dev.html'), cards: resolve(__dirname, 'cards.html'), boardDemo: resolve(__dirname, 'board-demo.html'), sounds: resolve(__dirname, 'sounds.html') } },
  },
});
