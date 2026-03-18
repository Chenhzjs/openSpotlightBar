import { describe, expect, it } from "vitest";

import type { ResultItem, UsageStat } from "@pulse/shared-types";

import { rankResult } from "./ranking";

function createResult(overrides: Partial<ResultItem> = {}): ResultItem {
  return {
    id: "result:terminal",
    title: "Terminal",
    subtitle: "/Applications/Terminal.app",
    type: "app",
    source: "apps",
    score: 0.95,
    actions: [],
    payload: {},
    ...overrides
  };
}

describe("rankResult", () => {
  it("rewards exact matches over loose fuzzy matches", () => {
    const exact = rankResult(createResult({ title: "Terminal" }), "terminal");
    const fuzzy = rankResult(createResult({ title: "iTerm2" }), "terminal");

    expect(exact.score).toBeGreaterThan(fuzzy.score);
    expect(exact.scoreBreakdown.exactBonus).toBeGreaterThan(0);
  });

  it("boosts recent and frequent selections", () => {
    const usage: UsageStat = {
      itemId: "result:terminal",
      itemType: "app",
      query: "term",
      selectedCount: 5,
      lastSelectedAt: 100_000
    };

    const boosted = rankResult(createResult(), "term", usage, 1.2, 101_000);
    const baseline = rankResult(createResult(), "term", undefined, 1.2, 101_000);

    expect(boosted.score).toBeGreaterThan(baseline.score);
    expect(boosted.scoreBreakdown.usageBonus).toBeGreaterThan(0);
    expect(boosted.scoreBreakdown.recencyBonus).toBeGreaterThan(0);
  });

  it("boosts recent file modifications for file results", () => {
    const now = Date.now();
    const recentFile = rankResult(
      createResult({
        id: "file:recent",
        title: "Quarterly Plan.md",
        subtitle: "/Users/demo/Documents/Quarterly Plan.md",
        type: "file",
        source: "files",
        score: 0.82,
        payload: { mtimeMs: now - 60 * 60 * 1000 }
      }),
      "quarterly",
      undefined,
      1,
      now
    );
    const oldFile = rankResult(
      createResult({
        id: "file:old",
        title: "Quarterly Plan.md",
        subtitle: "/Users/demo/Archive/Quarterly Plan.md",
        type: "file",
        source: "files",
        score: 0.82,
        payload: { mtimeMs: now - 90 * 24 * 60 * 60 * 1000 }
      }),
      "quarterly",
      undefined,
      1,
      now
    );

    expect(recentFile.score).toBeGreaterThan(oldFile.score);
    expect(recentFile.scoreBreakdown.recencyBonus).toBeGreaterThan(
      oldFile.scoreBreakdown.recencyBonus
    );
  });
});
