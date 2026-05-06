import { defineConfig } from 'vite';
import terser from '@rollup/plugin-terser';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: path.join(__dirname, 'frontend'),
  build: {
    outDir: path.join(__dirname, 'dist'),
    emptyOutDir: true,
    sourcemap: false,  // No source maps in production — protects business logic
    rollupOptions: {
      input: {
        main:  path.join(__dirname, 'frontend/index.html'),
        login: path.join(__dirname, 'frontend/login.html'),
      },
      // Keep CDN libraries external — they load from CDN and are available as window globals
      external: [],
      output: {
        // Hashed filenames for cache-busting
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
      plugins: [
        terser({
          compress: {
            passes: 2,
            drop_console: true,    // Remove all console.log in production
            drop_debugger: true,
            dead_code: true,
          },
          mangle: {
            toplevel: true,        // Mangle top-level variable names
          },
          format: {
            comments: false,       // Strip all comments
          },
        }),
      ],
    },
  },
  // Keep CDN scripts working — they expose globals like XLSX, Chart, Papa
  define: {},
});
