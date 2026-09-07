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
// mkcert installs a local certificate authority and downloads a binary from GitHub, so it must
// only ever run for a real `yarn dev` session. Three things resolve this config and none of them
// wants it:
//
//   vite build    - `command === "build"`
//   vite preview  - also "serve"; Playwright serves the production build over plain HTTP
//   vitest        - also "serve", which is what broke CI: `yarn test` tried to download mkcert
//                   and failed on a GitHub 504
//
// CI is excluded outright as a backstop, since no CI job should be installing a CA.
const isDevServer = (command: string, isPreview?: boolean) =>
  command === "serve" && !isPreview && !process.env.VITEST && !process.env.CI;

export default defineConfig(({ command, isPreview }) => ({
  plugins: [
    react(),
    tailwindcss(),
    // Trusted certs for glific.test, so https://glific.test:5173 is accepted by Phoenix
    // check_origin (*.glific.test).
    isDevServer(command, isPreview) &&
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
    // Vitest's default include also matches e2e/*.spec.ts; those are Playwright's.
    exclude: ["e2e/**", "node_modules/**", "dist/**"],
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.ts",
    css: false,
  },
}));
