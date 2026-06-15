import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      // Don't watch the Rust build output — cargo locks files there during
      // compilation, which crashes Vite's FSWatcher with EBUSY on Windows.
      ignored: ["**/src-tauri/**"],
    },
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
          'vendor-xterm': ['xterm', 'xterm-addon-fit'],
          'vendor-markdown': ['react-markdown', 'remark-gfm'],
          'vendor-dnd': ['@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities'],
        },
      },
    },
  },
});

