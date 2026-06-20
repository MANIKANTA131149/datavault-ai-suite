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
        manualChunks: (id) => {
          if (id.includes("@duckdb/duckdb-wasm")) return "duckdb";
          if (id.includes("recharts")) return "charts";
          if (id.includes("xlsx")) return "spreadsheet";
          if (id.includes("jspdf") || id.includes("html2canvas")) return "pdf";
          if (id.includes("node_modules/react/") || id.includes("node_modules/react-dom/") || id.includes("node_modules/react-router-dom/")) return "react-vendor";
        },
      },
    },
  },
}));
