import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  root: './web',
  server: {
    port: 5174,
    host: '0.0.0.0',
    proxy: {
      '/api': 'http://localhost:4100',
      '/landing': 'http://localhost:4100',
    },
  },
  base: '/app/',
  build: {
    outDir: 'dist',
  },
});
