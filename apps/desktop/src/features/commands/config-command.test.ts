import { describe, expect, it } from "vitest";

import { parseConfigCommand } from "./config-command";

describe("parseConfigCommand", () => {
  it("recognizes bare config commands", () => {
    expect(parseConfigCommand("/config")).toEqual({
      section: "overview",
      rawSection: undefined
    });
    expect(parseConfigCommand("/settings")).toEqual({
      section: "overview",
      rawSection: undefined
    });
  });

  it("maps known section aliases", () => {
    expect(parseConfigCommand("/config plugins")?.section).toBe("plugins");
    expect(parseConfigCommand("/config workflow")?.section).toBe("workflow");
    expect(parseConfigCommand("/config theme")?.section).toBe("appearance");
  });

  it("falls back to overview for unknown sections", () => {
    expect(parseConfigCommand("/config unknown")).toEqual({
      section: "overview",
      rawSection: "unknown"
    });
  });
});
