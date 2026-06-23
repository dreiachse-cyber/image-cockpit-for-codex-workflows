import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    proxy: {
      "/api": process.env.IMAGE_COCKPIT_API_TARGET ?? "http://127.0.0.1:8787"
    }
  }
});
