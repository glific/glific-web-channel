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
export default defineConfig({
  // mkcert() is apply:'serve' — it provisions a browser-trusted cert for the dev
  // server (host glific.test) and is skipped entirely during `vite build`, so the
  // production image never needs committed .pem files.
  plugins: [mkcert({ hosts: ["glific.test"] }), react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(dirname, "./src"),
    },
  },
  server: {
    // Serve on glific.test over HTTPS using the same mkcert cert the backend/glific-frontend
    // use (already trusted by the browser). This makes the browser's page Origin
    // https://glific.test:5173 — which the backend's Phoenix check_origin trusts (it allows
    // *.glific.test). Serving on localhost got the WS rejected ("Could not check origin"),
    // and no proxy Origin-rewrite worked reliably in Vite 8 — a trusted page origin is the fix.
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
});
