// @ts-check

/** @typedef {import("@pulse/plugin-sdk").LauncherPluginModule} LauncherPluginModule */

/** @type {LauncherPluginModule} */
const plugin = {
  async search(context) {
    const raw = context.query.trim();
    const expression = raw.startsWith("=") ? raw.slice(1).trim() : raw;
    if (!expression || !looksLikeExpression(expression)) {
      return [];
    }

    try {
      // TODO: Replace Function() with a dedicated expression parser for stricter hardening.
      const value = Function(
        `"use strict"; return (${normalizeExpression(expression)});`
      )();
      if (typeof value !== "number" || Number.isNaN(value)) {
        return [];
      }

      return [
        {
          id: `calculator:${expression}`,
          title: `${expression} = ${value}`,
          subtitle: "Calculator plugin",
          type: "plugin",
          score: 1.08,
          payload: {
            expression,
            text: String(value)
          },
          actions: [
            {
              id: "copy-result",
              title: "Copy result",
              kind: "copy-text",
              shortcut: "Enter",
              payload: {
                text: String(value)
              }
            }
          ],
          tags: ["calculator"]
        }
      ];
    } catch {
      return [];
    }
  }
};

export default plugin;

/** @param {string} expression */
function looksLikeExpression(expression) {
  return /^[0-9+\-*/().%\s]+$/.test(expression);
}

/** @param {string} expression */
function normalizeExpression(expression) {
  return expression.replaceAll("%", "/100");
}
