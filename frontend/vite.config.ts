import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Servido en la raíz del dominio (Cloudflare Pages). En dev, el proxy de abajo
  // redirige /api al backend FastAPI; en producción /api son ficheros estáticos
  // generados por copy-data.mjs (prebuild).
  base: "/",
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
});
