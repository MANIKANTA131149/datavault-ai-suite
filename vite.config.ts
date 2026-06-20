import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
  build: {
    sourcemap: false,
    rollupOptions: {
      maxParallelFileOps: 2,
      output: {
        // Split heavy, independently-cacheable vendor libs into their own
        // chunks so a page that doesn't use them (e.g. the marketing site)
        // never has to download them, and so a code change to app logic
        // doesn't bust the long-lived vendor cache.
        manualChunks: {
          // ~heaviest deps; each is only needed by a subset of pages.
          duckdb: ["@duckdb/duckdb-wasm"],
          charts: ["recharts"],
          spreadsheet: ["xlsx"],
          pdf: ["jspdf", "html2canvas"],
          "react-vendor": ["react", "react-dom", "react-router-dom"],
        },
      },
    },
  },
}));
