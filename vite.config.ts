import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: { index: "src/index.ts", jsx: "src/jsx.ts" },
      formats: ["es"],
    },
    rolldownOptions: {
      // Dependencies and peer dependencies are resolved in the user's app, including subpaths
      // such as react/jsx-runtime.
      external: /^(react|react-dom|react-reconciler|its-fine|webr)($|\/)/,
    },
  },
});
