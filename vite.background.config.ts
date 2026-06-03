import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    lib: {
      entry: 'src/background/index.ts',
      name: 'BackgroundWorker',
      formats: ['es'],
      fileName: () => 'background.js',
    },
  },
});
