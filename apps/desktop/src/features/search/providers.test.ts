import { describe, expect, it } from "vitest";

import type { ResultItem } from "@pulse/shared-types";

import { getDefaultAction, getScopedInput } from "./providers";

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
});
