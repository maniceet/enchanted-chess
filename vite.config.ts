import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Assets are referenced relatively so the same build works from a web root, from a
  // subdirectory, and from the Android WebView, which serves the bundle from its own origin
  // rather than from `/`. Absolute `/assets/...` paths resolve to nothing inside the app.
  base: './',
  build: {
    /* Pinned rather than left to the default, which changes between Vite majors and would
     * silently move the floor under a shipped Android app. The bundle runs in whatever Android
     * System WebView the device has, which updates through Play independently of the OS — so
     * the real floor is the WebView, not `minSdkVersion`. Chrome 87 is generous: any device
     * still receiving WebView updates is far past it, and the cost here is a few kB of
     * transpilation rather than a white screen on somebody's phone. */
    target: 'chrome87',
  },
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'server/**/*.test.ts'],
  },
} as never);
