import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@pulse/shared-types": path.resolve(rootDir, "packages/shared-types/src/index.ts"),
      "@pulse/core": path.resolve(rootDir, "packages/core/src/index.ts"),
      "@pulse/plugin-sdk": path.resolve(rootDir, "packages/plugin-sdk/src/index.ts"),
      "@pulse/plugin-calculator": path.resolve(
        rootDir,
        "plugins/calculator/src/index.js"
      ),
      "@pulse/plugin-github": path.resolve(rootDir, "plugins/github/src/index.js"),
      "@pulse/plugin-shell": path.resolve(rootDir, "plugins/shell/src/index.js")
    }
  },
  test: {
    environment: "node",
    include: ["packages/**/*.test.ts", "apps/**/*.test.ts"],
    exclude: ["**/node_modules/**", "qt5/**", "local/**", "window/**", "cmd/**"],
    passWithNoTests: false,
    reporters: ["default"]
  }
});
