export type PlatformShell = "macos" | "windows" | "linux" | "unknown";

export function detectPlatformShell(): PlatformShell {
  if (typeof navigator === "undefined") {
    return "unknown";
  }

  const candidate = [navigator.userAgent, navigator.platform]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (candidate.includes("mac")) {
    return "macos";
  }

  if (candidate.includes("win")) {
    return "windows";
  }

  if (candidate.includes("linux") || candidate.includes("x11")) {
    return "linux";
  }

  return "unknown";
}

export function getPlatformGlyph(platform: PlatformShell): string {
  switch (platform) {
    case "windows":
      return "⊞";
    case "linux":
      return "◌";
    case "macos":
      return "⌘";
    default:
      return "•";
  }
}
