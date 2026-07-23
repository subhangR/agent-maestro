import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const isBrowserDev = process.env.VITE_APP_MODE === "browser";
const apiProxyTarget = process.env.MAESTRO_DEV_API_PROXY || "http://127.0.0.1:4569";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    // Allow reaching the dev server over the tailnet by its *.ts.net hostname.
    allowedHosts: [".ts.net"],
    watch: {
      // Don't watch the Rust build output — cargo locks files there during
      // compilation, which crashes Vite's FSWatcher with EBUSY on Windows.
      ignored: ["**/src-tauri/**"],
    },
    // Browser split-origin dev: proxy API/WS/PTY to the Node server so the SPA
    // stays same-origin (avoids CORP/CORS pitfalls when Vite is on :4570).
    ...(isBrowserDev
      ? {
          proxy: {
            "/api": { target: apiProxyTarget, changeOrigin: true },
            "/health": { target: apiProxyTarget, changeOrigin: true },
            "/ws-status": { target: apiProxyTarget, changeOrigin: true },
            "/ws": { target: apiProxyTarget, ws: true, changeOrigin: true },
            "/pty": { target: apiProxyTarget, ws: true, changeOrigin: true },
          },
        }
      : {}),
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target: "es2021",
    sourcemap: Boolean(process.env.TAURI_DEBUG),
    minify: process.env.TAURI_DEBUG ? false : "esbuild",
    reportCompressedSize: false,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-monaco': ['monaco-editor', '@monaco-editor/react'],
          'vendor-excalidraw': ['@excalidraw/excalidraw'],
          'vendor-mermaid': ['mermaid'],
          'vendor-recharts': ['recharts'],
          'vendor-xterm': ['@xterm/xterm', '@xterm/addon-fit'],
          'vendor-markdown': ['react-markdown', 'remark-gfm'],
          'vendor-dnd': ['@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities'],
        },
      },
    },
  },
});
