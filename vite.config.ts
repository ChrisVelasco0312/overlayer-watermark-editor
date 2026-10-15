import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Tauri espera un puerto fijo y predecible.
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
  // Ajustes de build recomendados para Tauri.
  build: {
    target: 'esnext',
    minify: 'esbuild',
    sourcemap: false,
  },
});
