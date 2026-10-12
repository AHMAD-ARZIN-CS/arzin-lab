import { defineConfig } from "vite";

// Port 5180 so it never collides with the workspace UI (5173).
export default defineConfig({
  server: { host: "127.0.0.1", port: 5180, strictPort: true },
});
