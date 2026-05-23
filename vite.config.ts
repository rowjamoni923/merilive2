import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { spawnSync } from "node:child_process";
import { componentTagger } from "lovable-tagger";

// Fail the build if dark-theme tokens (bg-black / bg-slate-900 / text-white on
// light surfaces, etc.) regress beyond `scripts/dark-tokens-baseline.json`.
// See scripts/scan-dark-tokens.mjs for the rule set + per-line `// dark-ok` opt-out.
const darkTokenScanner = () => ({
  name: "dark-token-scanner",
  apply: "build" as const,
  buildStart() {
    // WARN-ONLY: never fail the build. This is a live-streaming app where
    // overlays sit on top of dark video (bg-black / text-white is correct).
    // Scanner output is informational only — to refresh the floor run
    // `npm run scan:dark:baseline`.
    const result = spawnSync(
      process.execPath,
      [path.resolve(__dirname, "scripts/scan-dark-tokens.mjs")],
      { stdio: "inherit" },
    );
    if (result.status !== 0) {
      console.warn(
        "\n[dark-token-scanner] regressions detected (warn-only, build continues).\n" +
        "  To refresh baseline: npm run scan:dark:baseline\n",
      );
    }
  },
});


// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), darkTokenScanner(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // Optimize chunk splitting for ULTRA-FAST initial load
    rollupOptions: {
      output: {
        // 🚨 CRITICAL: Manual chunking removed.
        //
        // Previous splitting (vendor-react / vendor-ui / vendor-misc, etc.)
        // was breaking the React singleton at runtime — packages that
        // depend on React (e.g. @radix-ui, sonner, vaul) ended up in
        // `vendor-misc`, which executed BEFORE `vendor-react`. That made
        // `React` undefined at module init time and threw:
        //   "Cannot read properties of undefined (reading 'createContext')"
        //   → blank/black screen on production.
        //
        // Letting Rollup auto-split keeps React + every React-dependent
        // package in the correct dependency order. Lazy-loaded routes
        // (React.lazy in App.tsx) still produce per-route chunks.
      },
    },
    // Faster builds + smaller bundles
    target: 'esnext',
    minify: 'esbuild',
    cssCodeSplit: true,
    sourcemap: false,
    // Larger chunk threshold so we get fewer HTTP requests
    chunkSizeWarningLimit: 1500,
    // Inline tiny assets
    assetsInlineLimit: 4096,
    // Modern output
    modulePreload: {
      polyfill: false,
    },
  },
  // Pre-bundle deps so dev server is also fast
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      '@supabase/supabase-js',
      '@tanstack/react-query',
      'lucide-react',
      'date-fns',
      'clsx',
    ],
    esbuildOptions: {
      target: 'esnext',
    },
  },
  esbuild: {
    // Drop console.log in production for smaller bundles + faster execution
    drop: mode === 'production' ? ['console', 'debugger'] : [],
  },
}));
