// @vitest-environment node

import { describe, expect, it } from "vitest";
import config from "../vite.config";


describe("production build configuration", () => {
  it("parses imported material JSON instead of expanding object literals", () => {
    expect(config.json?.stringify).toBe(true);
  });
});
