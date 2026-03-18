import { describe, expect, it } from "vitest";

import { parseConfigCommand } from "./config-command";

describe("parseConfigCommand", () => {
  it("recognizes bare config commands", () => {
    expect(parseConfigCommand("/config")).toEqual({
      section: "general",
      rawSection: undefined
    });
    expect(parseConfigCommand("/settings")).toEqual({
      section: "general",
      rawSection: undefined
    });
  });

  it("maps known section aliases", () => {
    expect(parseConfigCommand("/config plugins")?.section).toBe("plugins");
    expect(parseConfigCommand("/config workflow")?.section).toBe("workflow");
    expect(parseConfigCommand("/config theme")?.section).toBe("appearance");
  });

  it("falls back to general for unknown sections", () => {
    expect(parseConfigCommand("/config unknown")).toEqual({
      section: "general",
      rawSection: "unknown"
    });
  });
});
