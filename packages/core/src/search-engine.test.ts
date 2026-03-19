import { describe, expect, it, vi } from "vitest";

import { DEFAULT_SETTINGS } from "./default-settings";
import { SearchEngine } from "./search-engine";
import type { ResultItem, SearchContext, SearchProvider } from "@pulse/shared-types";

function createResult(
  id: string,
  title: string,
  score: number,
  source: ResultItem["source"]
): ResultItem {
  return {
    id,
    title,
    subtitle: title,
    type: "command",
    source,
    score,
    actions: [],
    payload: {}
  };
}

function createContext(overrides: Partial<SearchContext> = {}): SearchContext {
  return {
    query: "ter",
    normalizedQuery: "ter",
    now: Date.now(),
    scope: "all",
    settings: DEFAULT_SETTINGS,
    usageByItemId: {},
    clipboardItems: [],
    snippets: [],
    workflows: [],
    ...overrides
  };
}

describe("SearchEngine", () => {
  it("aggregates provider results and sorts by final score", async () => {
    const providers: SearchProvider[] = [
      {
        id: "apps",
        label: "Apps",
        source: "apps",
        sourceWeight: 1.2,
        async search() {
          return [createResult("app:terminal", "Terminal", 0.8, "apps")];
        }
      },
      {
        id: "files",
        label: "Files",
        source: "files",
        sourceWeight: 0.8,
        async search() {
          return [createResult("file:terminal", "terminal-notes.md", 0.4, "files")];
        }
      }
    ];

    const engine = new SearchEngine(providers, { providerTimeoutMs: 100 });
    const results = await engine.search("term", createContext());

    expect(results).toHaveLength(2);
    expect(results[0]?.id).toBe("app:terminal");
  });

  it("drops timed out providers and logs the failure", async () => {
    const logger = {
      warn: vi.fn()
    };
    const providers: SearchProvider[] = [
      {
        id: "fast",
        label: "Fast",
        source: "apps",
        sourceWeight: 1,
        async search() {
          return [createResult("fast:1", "Fast result", 0.5, "apps")];
        }
      },
      {
        id: "slow",
        label: "Slow",
        source: "plugins",
        sourceWeight: 1,
        timeoutMs: 5,
        async search() {
          await new Promise((resolve) => setTimeout(resolve, 20));
          return [createResult("slow:1", "Slow result", 1, "plugins")];
        }
      }
    ];

    const engine = new SearchEngine(providers, {
      providerTimeoutMs: 20,
      logger
    });

    const results = await engine.search("fast", createContext());

    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe("fast:1");
    expect(logger.warn).toHaveBeenCalledWith(
      "Provider search failed.",
      expect.objectContaining({
        error: expect.stringContaining("timed out")
      })
    );
  });

  it("applies usage-based ordering through ranking", async () => {
    const providers: SearchProvider[] = [
      {
        id: "apps",
        label: "Apps",
        source: "apps",
        sourceWeight: 1.2,
        async search() {
          return [
            createResult("app:terminal", "Terminal", 0.4, "apps"),
            createResult("app:textedit", "TextEdit", 0.5, "apps")
          ];
        }
      }
    ];

    const engine = new SearchEngine(providers, { providerTimeoutMs: 20 });
    const results = await engine.search(
      "te",
      createContext({
        usageByItemId: {
          "app:terminal": {
            itemId: "app:terminal",
            itemType: "app",
            query: "te",
            selectedCount: 8,
            lastSelectedAt: Date.now()
          }
        }
      })
    );

    expect(results[0]?.id).toBe("app:terminal");
  });

  it("prioritizes slash workflows when the query starts with a slash", async () => {
    const providers: SearchProvider[] = [
      {
        id: "apps",
        label: "Apps",
        source: "apps",
        sourceWeight: 1.2,
        async search() {
          return [createResult("app:github", "GitHub Desktop", 3, "apps")];
        }
      },
      {
        id: "workflows",
        label: "Workflows",
        source: "workflows",
        sourceWeight: 1.06,
        async search() {
          return [
            {
              id: "workflow:gh-search",
              title: "GitHub Search",
              subtitle: "Slash workflow",
              type: "workflow",
              source: "workflows",
              score: 0.25,
              actions: [],
              payload: {
                triggerType: "slash-command"
              }
            }
          ];
        }
      }
    ];

    const engine = new SearchEngine(providers, { providerTimeoutMs: 20 });
    const results = await engine.search(
      "/gh",
      createContext({
        query: "/gh",
        normalizedQuery: "/gh"
      })
    );

    expect(results[0]?.id).toBe("workflow:gh-search");
  });
});
