import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Assets are referenced relatively so the same build works from a web root, from a
  // subdirectory, and from the Android WebView, which serves the bundle from its own origin
  // rather than from `/`. Absolute `/assets/...` paths resolve to nothing inside the app.
  base: './',
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'server/**/*.test.ts'],
  },
} as never);
