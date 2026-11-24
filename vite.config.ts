import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: "src/index.ts",
      formats: ["es"],
      fileName: "index",
    },
    rolldownOptions: {
      // Peer dependencies come from the user's app, including subpaths such as react/jsx-runtime.
      external: [/^react($|\/)/, /^react-dom($|\/)/, /^webr($|\/)/],
    },
  },
});
