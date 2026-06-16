import { defineConfig } from 'vite';

export default defineConfig({
  root: 'client',
  server: {
    port: 41021,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:42021',
        changeOrigin: true
      }
    }
  }
});
