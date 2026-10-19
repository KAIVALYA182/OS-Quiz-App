import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// In development, requests to /api are forwarded to the Express backend, so the
// browser only ever talks to one origin (no CORS setup needed).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        "/api": env.VITE_DEV_API_TARGET || "http://localhost:5000",
      },
    },
  };
});
