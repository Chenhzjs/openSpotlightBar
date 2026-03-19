import { describe, expect, it } from "vitest";

import type { ActionItem, ResultItem } from "@osb/shared-types";

import { resolveActionValue } from "./backend";

function createAction(payload?: Record<string, unknown>): ActionItem {
  return {
    id: "copy-path",
    title: "Copy path",
    kind: "copy-path",
    payload
  };
}

function createResult(payload?: Record<string, unknown>): ResultItem {
  return {
    id: "file:notes",
    title: "notes.md",
    subtitle: "/Users/demo/Documents/notes.md",
    type: "file",
    source: "files",
    score: 0.8,
    actions: [],
    payload: payload ?? {}
  };
}

describe("resolveActionValue", () => {
  it("prefers action payload values over result payload values", () => {
    const action = createAction({ path: "/action/path.md" });
    const result = createResult({ path: "/result/path.md" });

    expect(resolveActionValue(action, result, "path")).toBe("/action/path.md");
  });

  it("falls back to the result payload when the action payload is missing", () => {
    const action = createAction();
    const result = createResult({ path: "/result/path.md" });

    expect(resolveActionValue(action, result, "path")).toBe("/result/path.md");
  });

  it("ignores non-string payload values", () => {
    const action = createAction({ path: 123 });
    const result = createResult({ path: true });

    expect(resolveActionValue(action, result, "path")).toBeUndefined();
  });
});
