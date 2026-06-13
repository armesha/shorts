import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    host: true, // listen on IPv4+IPv6 / all interfaces (Windows/macOS/Linux)
    // Proxy to Fastify via 127.0.0.1 (avoids IPv6 "localhost" → ::1 mismatch on Windows).
    proxy: {
      "/api": "http://127.0.0.1:8080",
      "/files": "http://127.0.0.1:8080",
      "/audio": "http://127.0.0.1:8080",
    },
  },
});
