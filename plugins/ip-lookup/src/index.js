// @ts-check

/** @typedef {import("@osb/plugin-sdk").LauncherPluginModule} LauncherPluginModule */

/** @type {LauncherPluginModule} */
const plugin = {
  async search(context, api) {
    const raw = context.query.trim().toLowerCase();
    if (raw !== "ip" && !raw.startsWith("ip ")) return [];
    const query = raw === "ip" ? "" : raw.slice(3).trim();

    const url = query
      ? `https://ipinfo.io/${encodeURIComponent(query)}/json`
      : "https://ipinfo.io/json";

    /** @type {any} */
    const data = await api.fetchJson(url);
    if (!data || !data.ip) return [];

    const title = data.ip;
    const parts = [data.city, data.region, data.country, data.org].filter(Boolean);
    const subtitle = parts.join(", ") || "IP info";

    return [
      {
        id: `ip:${data.ip}`,
        title,
        subtitle,
        type: /** @type {const} */ ("plugin"),
        score: 1.0,
        payload: { text: data.ip },
        actions: [
          { id: "copy-ip", title: "Copy IP", kind: /** @type {const} */ ("copy-text"), shortcut: "Enter", payload: { text: data.ip } },
          { id: "copy-all", title: "Copy full info", kind: /** @type {const} */ ("copy-text"), payload: { text: `${title}\n${subtitle}` } }
        ]
      }
    ];
  }
};

export default plugin;
