// @ts-check

/** @typedef {import("@osb/plugin-sdk").LauncherPluginModule} LauncherPluginModule */

/** @type {LauncherPluginModule} */
const plugin = {
  async search(context, api) {
    const query = extractGitHubQuery(context.query);
    if (!query || query.length < 2) {
      return [];
    }

    const response = await api.fetchJson(
      `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&per_page=5`,
      {
        headers: {
          Accept: "application/vnd.github+json"
        }
      }
    );

    /** @type {{ items?: Array<Record<string, any>> }} */
    const payload = typeof response === "object" && response ? response : {};
    const items = Array.isArray(payload.items) ? payload.items : [];
    return items.map((item) => ({
      id: `github:${item.full_name}`,
      title: item.full_name,
      subtitle: formatSubtitle(item),
      type: "url",
      score: 0.9,
      payload: {
        url: item.html_url,
        fullName: item.full_name
      },
      actions: [
        {
          id: "open-repository",
          title: "Open repository",
          kind: "open-url",
          shortcut: "Enter",
          payload: {
            url: item.html_url
          }
        },
        {
          id: "copy-repository-url",
          title: "Copy repository URL",
          kind: "copy-text",
          payload: {
            text: item.html_url
          }
        }
      ],
      tags: ["github", "network"]
    }));
  }
};

export default plugin;

/** @param {string} rawQuery */
function extractGitHubQuery(rawQuery) {
  const trimmed = rawQuery.trim();
  if (trimmed.toLowerCase().startsWith("gh ")) {
    return trimmed.slice(3).trim();
  }
  return "";
}

/** @param {Record<string, any>} item */
function formatSubtitle(item) {
  const parts = [`${item.stargazers_count ?? 0} stars`];
  if (typeof item.language === "string" && item.language.trim()) {
    parts.push(item.language);
  }
  if (typeof item.description === "string" && item.description.trim()) {
    parts.push(item.description.trim());
  }
  return parts.join(" • ");
}
