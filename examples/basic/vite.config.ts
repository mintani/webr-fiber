import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const source = (path: string): string =>
  fileURLToPath(new URL(`../../src/${path}`, import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // The example runs the library source of this repository. An app outside the repository
    // installs the `webr-fiber` package instead and needs no alias.
    alias: [
      { find: /^webr-fiber\/jsx$/, replacement: source("jsx.ts") },
      { find: /^webr-fiber$/, replacement: source("index.ts") },
    ],
  },
  // webR starts its own worker from its package files, which pre-bundling would break.
  optimizeDeps: { exclude: ["webr"] },
});
