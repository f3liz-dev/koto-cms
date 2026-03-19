import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";
import preact from "@preact/preset-vite";

export default defineConfig({
  root: "web",
  plugins: [preact()],
  resolve: {
    alias: {
      vitepress: fileURLToPath(new URL("./web/preview/mock-vitepress.js", import.meta.url)),
    },
  },
  build: {
    outDir: "../public",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3000",
      "/auth": "http://localhost:3000",
      "/miauth": "http://localhost:3000",
      "/health": "http://localhost:3000",
    },
  },
});
