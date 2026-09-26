import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

// The UI is served by the API container in production (same origin, strict CSP).
// In development Vite proxies API and upload requests to the API server.
export default defineConfig(({ mode }) => {
  const api =
    loadEnv(mode, process.cwd(), "").API_URL || "http://localhost:8000";
  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      proxy: {
        "/api": api,
        "/uploads": api,
        "/.well-known": api,
      },
    },
    build: {
      outDir: "dist",
      sourcemap: false,
      assetsInlineLimit: 0,
      chunkSizeWarningLimit: 900,
    },
  };
});
