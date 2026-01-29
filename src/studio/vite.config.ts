import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import * as path from "path";

const frontendDir = path.resolve(__dirname, "frontend");

export default defineConfig({
  plugins: [react()],
  root: frontendDir,
  build: {
    outDir: path.resolve(frontendDir, "dist"),
    emptyOutDir: true,
  },
  css: {
    postcss: path.resolve(__dirname, "../.."),
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:4747",
        changeOrigin: true,
      },
    },
  },
});
