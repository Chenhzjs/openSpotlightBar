// @ts-check

/** @typedef {import("@osb/plugin-sdk").LauncherPluginModule} LauncherPluginModule */

/** @type {LauncherPluginModule} */
const plugin = {
  async search(context) {
    const raw = context.query.trim();
    const isHash = raw.startsWith("#");
    const isColor = raw.toLowerCase().startsWith("color ");
    if (!isHash && !isColor) return [];

    const input = isHash ? raw : raw.slice(6).trim();
    if (!input) return [];

    const results = [];
    const rgb = parseColor(input);
    if (!rgb) return [];

    const hex = rgbToHex(rgb);
    const hsl = rgbToHsl(rgb);
    const rgbStr = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
    const hslStr = `hsl(${hsl[0]}, ${hsl[1]}%, ${hsl[2]}%)`;

    results.push(
      makeResult("hex", hex, `HEX: ${hex}`, rgbStr),
      makeResult("rgb", rgbStr, `RGB: ${rgbStr}`, hex),
      makeResult("hsl", hslStr, `HSL: ${hslStr}`, hex)
    );
    return results;
  }
};

export default plugin;

/** @param {string} input @returns {number[] | null} */
function parseColor(input) {
  const hexMatch = input.match(/^#?([0-9a-f]{3,8})$/i);
  if (hexMatch) {
    let h = hexMatch[1];
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    if (h.length >= 6)
      return [
        parseInt(h.slice(0, 2), 16),
        parseInt(h.slice(2, 4), 16),
        parseInt(h.slice(4, 6), 16)
      ];
  }
  const rgbMatch = input.match(
    /^rgb\s*\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i
  );
  if (rgbMatch) return [+rgbMatch[1], +rgbMatch[2], +rgbMatch[3]];
  const hslMatch = input.match(
    /^hsl\s*\(\s*(\d{1,3})\s*,\s*(\d{1,3})%?\s*,\s*(\d{1,3})%?\s*\)$/i
  );
  if (hslMatch) return hslToRgb(+hslMatch[1], +hslMatch[2], +hslMatch[3]);
  return null;
}

/** @param {number[]} rgb */
function rgbToHex(rgb) {
  return "#" + rgb.map((c) => c.toString(16).padStart(2, "0")).join("");
}

/** @param {number[]} rgb @returns {number[]} */
function rgbToHsl(rgb) {
  const r = rgb[0] / 255,
    g = rgb[1] / 255,
    b = rgb[2] / 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, Math.round(l * 100)];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

/** @param {number} h @param {number} s @param {number} l @returns {number[]} */
function hslToRgb(h, s, l) {
  h /= 360;
  s /= 100;
  l /= 100;
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const hue2rgb = (
    /** @type {number} */ p,
    /** @type {number} */ q,
    /** @type {number} */ t
  ) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, h) * 255),
    Math.round(hue2rgb(p, q, h - 1 / 3) * 255)
  ];
}

/** @param {string} id @param {string} text @param {string} title @param {string} subtitle */
function makeResult(id, text, title, subtitle) {
  return {
    id: `color:${id}`,
    title,
    subtitle,
    type: /** @type {const} */ ("plugin"),
    score: 1.0,
    payload: { text },
    actions: [
      {
        id: `copy-${id}`,
        title: `Copy ${text}`,
        kind: /** @type {const} */ ("copy-text"),
        shortcut: "Enter",
        payload: { text }
      }
    ]
  };
}
