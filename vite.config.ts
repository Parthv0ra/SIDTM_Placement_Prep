import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import basicSsl from "@vitejs/plugin-basic-ssl";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    plugins: [
      basicSsl(),
    ],
    server: {
      https: true,
    },
    ssr: {
      external: ["pdf-parse", "pdf-parse/lib/pdf-parse.js"],
    },
    build: {
      rollupOptions: {
        external: ["pdf-parse", "pdf-parse/lib/pdf-parse.js"],
      },
    },
  },
});
