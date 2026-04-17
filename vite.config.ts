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
  },
  build: {
    // Optimize chunk splitting for ULTRA-FAST initial load
    rollupOptions: {
      output: {
        // Function-based chunking — automatically groups by directory
        manualChunks(id) {
          // Node modules — split vendor libs by category
          if (id.includes('node_modules')) {
            if (id.includes('react-dom') || id.includes('react-router') || id.includes('/react/')) {
              return 'vendor-react';
            }
            if (id.includes('@radix-ui') || id.includes('cmdk') || id.includes('vaul') || id.includes('sonner')) {
              return 'vendor-ui';
            }
            if (id.includes('@tanstack')) {
              return 'vendor-query';
            }
            if (id.includes('@supabase')) {
              return 'vendor-supabase';
            }
            if (id.includes('@capacitor')) {
              return 'vendor-capacitor';
            }
            if (id.includes('agora') || id.includes('livekit')) {
              return 'vendor-rtc';
            }
            if (id.includes('svga') || id.includes('lottie') || id.includes('howler')) {
              return 'vendor-media';
            }
            if (id.includes('lucide-react')) {
              return 'vendor-icons';
            }
            if (id.includes('date-fns') || id.includes('zod') || id.includes('clsx') || id.includes('class-variance')) {
              return 'vendor-utils';
            }
            // All other deps
            return 'vendor-misc';
          }

          // App code — let pages chunk PER-ROUTE for parallel lazy loading
          // Only group small SHARED component subtrees (not pages themselves)
          if (id.includes('/components/admin/') &&
              !id.includes('AdminLayout') &&
              !id.includes('AdminAccessGuard') &&
              !id.includes('AdminRouteGuard')) {
            return 'admin-shared';
          }
          if (id.includes('/components/agency/')) {
            return 'agency-shared';
          }
          if (id.includes('/components/live/') || id.includes('/components/party/')) {
            return 'live-shared';
          }
          if (id.includes('/components/games/')) {
            return 'games-shared';
          }
        },
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
