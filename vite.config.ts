import { defineConfig } from "vite";

export default defineConfig({
  clearScreen: false,
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        sketch: "sketch.html"
      }
    }
  },
  server: {
    strictPort: true
  },
  envPrefix: ["VITE_", "TAURI_"]
});
