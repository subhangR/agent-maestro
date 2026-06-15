import { defineConfig } from 'vite';

// Isolated dev port (staging UI uses 4568; this POC web view uses 4571).
export default defineConfig({
  server: {
    port: 4571,
    strictPort: true,
  },
});
