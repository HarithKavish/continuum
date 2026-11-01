import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { viteStaticCopy } from 'vite-plugin-static-copy';

// Cesium loads its web workers, textures and widget CSS at runtime from CESIUM_BASE_URL.
// They are copied verbatim into the build rather than bundled.
const cesiumBuild = 'node_modules/cesium/Build/Cesium';
const cesiumBaseUrl = 'cesium';

export default defineConfig({
  base: '/',
  define: {
    CESIUM_BASE_URL: JSON.stringify(`/${cesiumBaseUrl}/`),
  },
  plugins: [
    react(),
    viteStaticCopy({
      targets: ['Workers', 'ThirdParty', 'Assets', 'Widgets'].map((dir) => ({
        src: `${cesiumBuild}/${dir}`,
        dest: cesiumBaseUrl,
        // Drop node_modules/cesium/Build/Cesium so files land at cesium/<dir>/...
        rename: { stripBase: 4 },
      })),
    }),
  ],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 6000,
    // Cesium's map alone is ~18 MB; production is published without maps.
    sourcemap: false,
  },
  server: { port: 5173 },
  preview: { port: 4173 },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
