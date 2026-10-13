import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: { outDir: "dist/client" },
  server: {
    host: "127.0.0.1",
    port: 1430,
    strictPort: true,
    watch: { ignored: ["**/src-tauri/target/**", "**/.radefy-demo/**"] },
    allowedHosts: ["terminal.local"],
    proxy: { "/api": "http://127.0.0.1:1431" },
  },
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
  },
});
