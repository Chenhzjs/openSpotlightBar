// @ts-check

/** @typedef {import("@osb/plugin-sdk").LauncherPluginModule} LauncherPluginModule */

/** @type {LauncherPluginModule} */
const plugin = {
  async search(context) {
    const raw = context.query.trim();
    const expression = raw.startsWith("=") ? raw.slice(1).trim() : raw;
    if (!expression || !looksLikeExpression(expression)) {
      return [];
    }

    try {
      const normalized = normalizeExpression(expression);
      const value = Function(`"use strict"; return (${normalized});`)();
      if (typeof value !== "number" || Number.isNaN(value)) {
        return [];
      }

      const strValue = String(value);
      /** @type {import("@osb/plugin-sdk").PluginSearchResult[]} */
      const results = [
        {
          id: `calculator:${expression}`,
          title: `${expression} = ${strValue}`,
          subtitle: "Calculator",
          type: /** @type {const} */ ("plugin"),
          score: 1.08,
          payload: { expression, text: strValue },
          actions: [
            {
              id: "copy-result",
              title: "Copy result",
              kind: /** @type {const} */ ("copy-text"),
              shortcut: "Enter",
              payload: { text: strValue }
            }
          ],
          tags: ["calculator"]
        }
      ];

      // For integer results, show hex & binary representations
      if (Number.isInteger(value) && Math.abs(value) < 2 ** 53) {
        const intVal = value | 0; // force 32-bit for hex/bin display
        const hex = "0x" + (intVal >>> 0).toString(16).toUpperCase();
        const bin = "0b" + (intVal >>> 0).toString(2);
        results.push({
          id: `calculator:${expression}:hex`,
          title: `${hex}  (bin: ${bin})`,
          subtitle: "Hex / Binary",
          type: /** @type {const} */ ("plugin"),
          score: 1.07,
          payload: { expression, text: hex },
          actions: [
            {
              id: "copy-hex",
              title: "Copy hex",
              kind: /** @type {const} */ ("copy-text"),
              shortcut: "Enter",
              payload: { text: hex }
            }
          ],
          tags: ["calculator"]
        });
      }

      return results;
    } catch {
      return [];
    }
  }
};

export default plugin;

/** @param {string} expression */
function looksLikeExpression(expression) {
  return /^[0-9+\-*/().%\s&|^~<>x]+$/i.test(expression) && /\d/.test(expression);
}

/** @param {string} expression */
function normalizeExpression(expression) {
  let expr = expression;
  expr = expr.replaceAll("%", "/100");
  return expr;
}
