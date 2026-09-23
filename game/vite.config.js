import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    // GitHub Pages can serve a cached HTML page after a new deployment.
    // Keep script URLs available across releases so that page still starts.
    rolldownOptions: {
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
});
