// @ts-check

/** @typedef {import("@osb/plugin-sdk").LauncherPluginModule} LauncherPluginModule */

/** @type {LauncherPluginModule} */
const plugin = {
  async search(context) {
    const raw = context.query.trim();
    const lower = raw.toLowerCase();

    /** @type {{ prefix: string, mode: string }|null} */
    let match = null;
    for (const [prefix, mode] of PREFIXES) {
      if (lower.startsWith(prefix)) {
        match = { prefix, mode };
        break;
      }
    }
    if (!match) return [];

    const input = raw.slice(match.prefix.length).trim();
    if (!input) return [];

    return CODECS.filter((c) => match.mode === "all" || c.mode === match.mode).flatMap(
      (c) => {
        /** @type {import("@osb/plugin-sdk").PluginSearchResult[]} */
        const out = [];
        try {
          const encoded = c.encode(input);
          if (encoded !== input) {
            out.push(makeResult(`${c.id}:enc`, encoded, c.encodeLabel, 1.0));
          }
        } catch {
          /* skip */
        }
        try {
          const decoded = c.decode(input);
          if (decoded !== input) {
            out.push(makeResult(`${c.id}:dec`, decoded, c.decodeLabel, 0.99));
          }
        } catch {
          /* skip */
        }
        return out;
      }
    );
  }
};

export default plugin;

const HTML_MAP = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const HTML_REVERSE = Object.fromEntries(Object.entries(HTML_MAP).map(([k, v]) => [v, k]));

/** @param {string} s */
function htmlEncode(s) {
  return s.replace(
    /[&<>"']/g,
    (ch) => HTML_MAP[/** @type {keyof HTML_MAP} */ (ch)] ?? ch
  );
}

/** @param {string} s */
function htmlDecode(s) {
  return s.replace(/&(?:amp|lt|gt|quot|#39|#x27);/g, (ent) => HTML_REVERSE[ent] ?? ent);
}

/**
 * @param {string} id
 * @param {string} text
 * @param {string} subtitle
 * @param {number} score
 * @returns {import("@osb/plugin-sdk").PluginSearchResult}
 */
function makeResult(id, text, subtitle, score) {
  return {
    id: `enc:${id}`,
    title: text.length > 120 ? text.slice(0, 117) + "..." : text,
    subtitle,
    type: /** @type {const} */ ("plugin"),
    score,
    payload: { text },
    actions: [
      {
        id: `copy-${id}`,
        title: "Copy",
        kind: /** @type {const} */ ("copy-text"),
        shortcut: "Enter",
        payload: { text }
      }
    ]
  };
}

/** @type {[string, string][]} */
const PREFIXES = [
  ["b64 ", "base64"],
  ["url ", "url"],
  ["html ", "html"],
  ["hex ", "hex"],
  ["encode ", "all"]
];

const CODECS = [
  {
    id: "b64",
    mode: "base64",
    encodeLabel: "Base64 Encode",
    decodeLabel: "Base64 Decode",
    encode: (/** @type {string} */ s) => btoa(unescape(encodeURIComponent(s))),
    decode: (/** @type {string} */ s) => decodeURIComponent(escape(atob(s)))
  },
  {
    id: "url",
    mode: "url",
    encodeLabel: "URL Encode",
    decodeLabel: "URL Decode",
    encode: (/** @type {string} */ s) => encodeURIComponent(s),
    decode: (/** @type {string} */ s) => decodeURIComponent(s)
  },
  {
    id: "html",
    mode: "html",
    encodeLabel: "HTML Entity Encode",
    decodeLabel: "HTML Entity Decode",
    encode: (/** @type {string} */ s) => htmlEncode(s),
    decode: (/** @type {string} */ s) => htmlDecode(s)
  },
  {
    id: "hex",
    mode: "hex",
    encodeLabel: "Hex Encode",
    decodeLabel: "Hex Decode",
    encode: (/** @type {string} */ s) =>
      Array.from(new TextEncoder().encode(s))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(""),
    decode: (/** @type {string} */ s) => {
      const clean = s.replace(/\s+/g, "");
      if (!/^[0-9a-fA-F]+$/.test(clean) || clean.length % 2 !== 0)
        throw new Error("invalid hex");
      const bytes = new Uint8Array(clean.length / 2);
      for (let i = 0; i < clean.length; i += 2)
        bytes[i / 2] = parseInt(clean.slice(i, i + 2), 16);
      return new TextDecoder().decode(bytes);
    }
  }
];
