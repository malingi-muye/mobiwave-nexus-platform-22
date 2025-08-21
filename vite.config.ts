import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

import path from "node:path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    mode === 'development' &&
    componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // Optimize bundle size
    rollupOptions: {
      output: {
        manualChunks: {
          // Vendor chunks for better caching
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'ui-vendor': ['@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu', '@radix-ui/react-tabs'],
          'query-vendor': ['@tanstack/react-query'],
          'supabase-vendor': ['@supabase/supabase-js'],
          'crypto-vendor': ['crypto-js'],
          'chart-vendor': ['recharts'],
          // Feature-based chunks
          'admin-features': [
            './src/components/admin/AdminDashboard.tsx',
            './src/components/admin/UserManagement.tsx',
            './src/hooks/useCompleteUserManagement.ts'
          ],
          'client-features': [
            './src/components/client/ClientDashboard.tsx'
          ]
        }
      }
    },
    // Enable source maps for production debugging
    sourcemap: mode === 'production' ? 'hidden' : true,
    // Optimize assets
    assetsInlineLimit: 4096,
    // Enable minification
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: mode === 'production', // Remove console.logs in production
        drop_debugger: true
      }
    }
  },
  // Optimize dependencies
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      '@tanstack/react-query',
      '@supabase/supabase-js',
      'crypto-js'
    ]
  }
}));
