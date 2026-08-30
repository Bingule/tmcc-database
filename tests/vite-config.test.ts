// @vitest-environment node

import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import config from "../vite.config";


describe("production build configuration", () => {
  it("parses imported material JSON instead of expanding object literals", () => {
    expect(config.json?.stringify).toBe(true);
  });

  it("changes the HTML representation when the Rate Performance release is deployed", async () => {
    const html = await readFile("index.html", "utf8");
    expect(html).toContain('<meta name="tmcc-build" content="rate-performance-tools-v1" />');
  });
});
