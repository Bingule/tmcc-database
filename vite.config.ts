import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

declare const process: { env: Record<string, string | undefined> };

export function formatBuildDate(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Budapest",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? "/",
  define: {
    __TMCC_BUILD_DATE__: JSON.stringify(formatBuildDate(new Date()))
  },
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
