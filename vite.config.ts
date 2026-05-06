import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  build: {
    rollupOptions: {
      input: {
        index: path.resolve(__dirname, "index.html"),
        app: path.resolve(__dirname, "app.html"),
        auth: path.resolve(__dirname, "auth.html"),
        profile: path.resolve(__dirname, "profile.html"),
        settings: path.resolve(__dirname, "settings.html"),
      },
    },
  },
});
