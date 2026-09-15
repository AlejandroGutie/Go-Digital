import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_PATH || '/',
  server: {
    // En Windows, "localhost" a veces solo enlaza IPv6 ([::1]) y el navegador
    // falla al ir por 127.0.0.1. Escuchar en 0.0.0.0 evita ese fallo.
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
  },
});
