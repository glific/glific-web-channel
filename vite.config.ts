/// <reference types="vitest/config" />
import path from "node:path";
import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import mkcert from "vite-plugin-mkcert";

// ESM-safe __dirname
const dirname = path.dirname(fileURLToPath(import.meta.url));

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    tailwindcss(),
    // Dev-only: mkcert installs a local CA and generates trusted certs for glific.test.
    // Origin https://glific.test:5173 is accepted by Phoenix check_origin (*.glific.test).
    // Skipped for `vite build` / CI so Vercel deploys don't need mkcert or a certs/ dir.
    command === "serve" &&
      mkcert({
        hosts: ["glific.test"],
        savePath: path.resolve(dirname, "certs"),
      }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(dirname, "./src"),
    },
  },
  server: {
    host: "glific.test",
    allowedHosts: ["glific.test"],
    // Proxy to the Glific backend's HTTPS endpoint on :4001 (mkcert self-signed, so
    // secure:false lets Node accept it). Same-origin from the app's perspective.
    proxy: {
      "/api": {
        target: "https://localhost:4001",
        changeOrigin: true,
        secure: false,
      },
      "/web_socket": {
        target: "wss://localhost:4001",
        ws: true,
        changeOrigin: true,
        secure: false,
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.ts",
    css: false,
  },
}));
