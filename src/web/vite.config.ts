import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The UI is served by the API container in production (same origin, strict CSP).
// In development Vite proxies API and upload requests to the API server.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8000",
      "/uploads": "http://localhost:8000",
      "/.well-known": "http://localhost:8000",
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 900,
  },
});
