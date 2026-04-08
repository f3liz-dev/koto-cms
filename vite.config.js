import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

export default defineConfig({
  root: "web",
  plugins: [preact()],
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
