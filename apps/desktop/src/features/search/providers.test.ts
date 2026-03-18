import { describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS, getBuiltInWorkflows } from "@pulse/core";
import type { ResultItem } from "@pulse/shared-types";

import { createProviders, getDefaultAction, getScopedInput } from "./providers";

function createResult(): ResultItem {
  return {
    id: "snippet:daily",
    title: "Daily standup",
    subtitle: ";standup",
    type: "snippet",
    source: "snippets",
    score: 0.8,
    payload: {},
    actions: [
      {
        id: "expand",
        title: "Expand snippet",
        kind: "expand-snippet",
        shortcut: "Enter"
      },
      {
        id: "copy",
        title: "Copy template",
        kind: "copy-text",
        payload: { text: "hello" }
      }
    ]
  };
}

describe("search provider helpers", () => {
  it("resolves scoped input for provider-prefixed queries", () => {
    expect(getScopedInput("clip deploy notes")).toBe("deploy notes");
    expect(getScopedInput(";standup")).toBe("standup");
  });

  it("resolves the default action from the first result action", () => {
    const result = createResult();

    expect(getDefaultAction(result)).toEqual(result.actions[0]);
    expect(getDefaultAction(undefined)).toBeUndefined();
  });

  it("surfaces slash-command workflows as launcher results", async () => {
    const providers = createProviders({
      async search() {
        return [];
      }
    } as unknown as Parameters<typeof createProviders>[0]);
    const workflowProvider = providers.find((provider) => provider.id === "workflows");

    const results = await workflowProvider!.search("/goo", {
      query: "/goo",
      normalizedQuery: "/goo",
      now: Date.now(),
      scope: "all",
      settings: DEFAULT_SETTINGS,
      usageByItemId: {},
      clipboardItems: [],
      snippets: [],
      workflows: getBuiltInWorkflows()
    });

    expect(results.some((result) => result.title === "Google Search")).toBe(true);
    expect(results[0]?.actions[0]?.kind).toBe("run-workflow");
  });

  it("surfaces keyword workflows as launcher results for direct invocations", async () => {
    const providers = createProviders({
      async search() {
        return [];
      }
    } as unknown as Parameters<typeof createProviders>[0]);
    const workflowProvider = providers.find((provider) => provider.id === "workflows");

    const results = await workflowProvider!.search("jira ENG-123", {
      query: "jira ENG-123",
      normalizedQuery: "jira eng-123",
      now: Date.now(),
      scope: "all",
      settings: DEFAULT_SETTINGS,
      usageByItemId: {},
      clipboardItems: [],
      snippets: [],
      workflows: getBuiltInWorkflows()
    });

    expect(results[0]?.title).toBe("Jira Ticket Keyword");
    expect(results[0]?.payload.triggerType).toBe("keyword");
    expect(results[0]?.actions[0]?.kind).toBe("run-workflow");
  });
});
