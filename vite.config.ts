import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { imagetools } from "vite-imagetools";
import { visualizer } from "rollup-plugin-visualizer";

// Auto-convert all bundled raster images (PNG/JPG/JPEG) to WebP @ q=78 with
// a max width of 1600px. Keeps every existing `import x from './foo.png'`
// working transparently — Vite serves the generated .webp instead. To opt
// out (e.g. need true PNG transparency or original size), append
// `?format=png&w=original` or `?no-imagetools` to the import.
const autoWebpDirectives = (url: URL) => {
  const params = new URLSearchParams();
  if (url.searchParams.has("no-imagetools")) return params;
  const pathname = url.pathname.toLowerCase();
  if (!/\.(png|jpe?g)$/.test(pathname)) return params;
  if (!url.searchParams.has("format")) params.set("format", "webp");
  if (!url.searchParams.has("quality")) params.set("quality", "78");
  if (!url.searchParams.has("w") && !url.searchParams.has("width")) {
    params.set("w", "1600");
    params.set("withoutEnlargement", "true");
  }
  return params;
};

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    imagetools({ defaultDirectives: autoWebpDirectives }),
    mode === "development" && componentTagger(),
  ].filter(Boolean),
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
