import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Geliştirmede API isteklerini yerel sunucuya (npm run dev) yönlendirir
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://localhost:3000', '/files': 'http://localhost:3000' } },
  build: { outDir: 'dist', chunkSizeWarningLimit: 1500 },
});
