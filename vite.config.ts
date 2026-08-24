import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

declare const process: { env: Record<string, string | undefined> };

export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? "/",
  plugins: [react()],
  json: {
    stringify: true
  },
  server: {
    allowedHosts: ["tmcc.database", "tmcc.local", "tmccdb.org", "www.tmccdb.org"]
  },
  test: {
    environment: "jsdom",
    globals: true
  }
});
