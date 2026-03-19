// @ts-check

/** @typedef {import("@osb/plugin-sdk").LauncherPluginModule} LauncherPluginModule */

/** @type {LauncherPluginModule} */
const plugin = {
  async search(context) {
    const raw = context.query.trim();
    const lower = raw.toLowerCase();
    const isTs = lower.startsWith("ts ");
    const isTimestamp = lower.startsWith("timestamp ");
    if (!isTs && !isTimestamp) return [];

    const input = isTs ? raw.slice(3).trim() : raw.slice(10).trim();
    if (!input) return [];

    const results = [];

    // Try parsing as unix timestamp (seconds or milliseconds)
    if (/^\d{1,13}$/.test(input)) {
      const num = parseInt(input, 10);
      const ms = num > 9999999999 ? num : num * 1000;
      const date = new Date(ms);
      if (!isNaN(date.getTime())) {
        const iso = date.toISOString();
        const local = date.toLocaleString();
        results.push({
          id: "ts:to-date",
          title: iso,
          subtitle: `Local: ${local}`,
          type: /** @type {const} */ ("plugin"),
          score: 1.0,
          payload: { text: iso },
          actions: [
            { id: "copy-iso", title: "Copy ISO 8601", kind: /** @type {const} */ ("copy-text"), shortcut: "Enter", payload: { text: iso } },
            { id: "copy-local", title: "Copy local time", kind: /** @type {const} */ ("copy-text"), payload: { text: local } }
          ]
        });
      }
    }

    // Try parsing as date string → unix timestamp
    const parsed = new Date(input);
    if (!isNaN(parsed.getTime())) {
      const seconds = Math.floor(parsed.getTime() / 1000);
      results.push({
        id: "ts:to-unix",
        title: String(seconds),
        subtitle: `Unix timestamp (seconds) for ${parsed.toISOString()}`,
        type: /** @type {const} */ ("plugin"),
        score: results.length > 0 ? 0.99 : 1.0,
        payload: { text: String(seconds) },
        actions: [
          { id: "copy-unix", title: "Copy timestamp", kind: /** @type {const} */ ("copy-text"), shortcut: "Enter", payload: { text: String(seconds) } }
        ]
      });
    }

    return results;
  }
};

export default plugin;
