import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  base: "/creator/",
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "dist-creator",
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(rootDir, "creator.html"),
    },
  },
});
