import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// React PDF Renderer requires polyfills for browser environments
// but TanStack router has some issues with stream polyfills in SSR.
// We'll rely on client-side rendering for the PDF to avoid SSR polyfill hell.
export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    build: {
      rollupOptions: {
        // Prevent rollup from failing if it can't find node built-ins
        // since react-pdf natively handles browsers
      },
    },
  },
});
