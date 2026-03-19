// @ts-check

/** @typedef {import("@osb/plugin-sdk").LauncherPluginModule} LauncherPluginModule */

/** @type {LauncherPluginModule} */
const plugin = {
  async search(context) {
    const raw = context.query.trim();
    if (!raw.toLowerCase().startsWith("hash ")) return [];
    const input = raw.slice(5);
    if (!input) return [];

    const encoded = new TextEncoder().encode(input);
    const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
    const hashHex = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    return [
      {
        id: `hash:sha256`,
        title: hashHex,
        subtitle: "SHA-256",
        type: /** @type {const} */ ("plugin"),
        score: 1.0,
        payload: { text: hashHex },
        actions: [
          {
            id: "copy",
            title: "Copy hash",
            kind: /** @type {const} */ ("copy-text"),
            shortcut: "Enter",
            payload: { text: hashHex }
          }
        ]
      }
    ];
  }
};

export default plugin;
