import base44 from "@base44/vite-plugin"
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    base44({
      // Support for legacy code that imports the base44 SDK with @/integrations, @/entities, etc.
      // can be removed if the code has been updated to use the new SDK imports from @base44/sdk
      legacySDKImports: process.env.BASE44_LEGACY_SDK_IMPORTS === 'true',
      hmrNotifier: true,
      navigationNotifier: true,
      analyticsTracker: true,
      visualEditAgent: true
    }),
    react(),
  ],
  // one React copy, and pre-bundle libraries used by lazy pages so the preview
  // never re-bundles React mid-session (which caused "resolveDispatcher().useState")
  resolve: { dedupe: ['react', 'react-dom'] },
  optimizeDeps: {
    include: [
      'react', 'react-dom', 'react-dom/client', 'react/jsx-runtime', 'react/jsx-dev-runtime',
      'react-router-dom', '@tanstack/react-query', 'lucide-react', 'recharts', 'jspdf',
    ],
  },
  // transpile newer syntax so older iPhones (Safari 14+) can run the app
  build: { target: ['es2019', 'safari14'] },
});