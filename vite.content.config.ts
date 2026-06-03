import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    lib: {
      entry: 'src/content/index.tsx',
      name: 'ContentScript',
      formats: ['iife'],
      fileName: () => 'content.js',
    },
    rollupOptions: {
      output: {
        extend: true,
        assetFileNames: (assetInfo) => {
          if (assetInfo.name === 'index.css' || assetInfo.name === 'style.css' || assetInfo.name?.endsWith('.css')) {
            return 'content.css';
          }
          return '[name].[ext]';
        },
      },
    },
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
});
