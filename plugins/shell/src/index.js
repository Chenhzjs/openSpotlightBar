// @ts-check

/** @typedef {import("@osb/plugin-sdk").LauncherPluginModule} LauncherPluginModule */

/** @type {LauncherPluginModule} */
const plugin = {
  async search(context) {
    const command = extractCommand(context.query);
    if (!command) {
      return [];
    }

    return [
      {
        id: `shell:${command}`,
        title: "Run shell command",
        subtitle: command,
        type: "command",
        score: 0.94,
        payload: {
          command
        },
        actions: [
          {
            id: "run-command",
            title: "Run command",
            kind: "run-plugin-action",
            shortcut: "Enter",
            requires: ["shell.exec"],
            payload: {
              command
            }
          },
          {
            id: "copy-command",
            title: "Copy command",
            kind: "copy-text",
            payload: {
              text: command
            }
          }
        ],
        tags: ["shell", "permission"]
      }
    ];
  },
  async runAction(actionId, payload, _context, api) {
    if (actionId !== "run-command") {
      return { ok: false, message: `Unsupported plugin action ${actionId}.` };
    }

    const command = String(payload.command ?? "").trim();
    if (!command) {
      return { ok: false, message: "Command is missing." };
    }

    const result = await api.execShell(command);
    const message =
      result.stdout.trim() ||
      result.stderr.trim() ||
      `Command finished with exit code ${result.exitCode}.`;

    return {
      ok: result.exitCode === 0,
      message: message.slice(0, 240)
    };
  }
};

export default plugin;

/** @param {string} rawQuery */
function extractCommand(rawQuery) {
  const trimmed = rawQuery.trim();
  if (trimmed.startsWith(">")) {
    return trimmed.slice(1).trim();
  }
  if (trimmed.toLowerCase().startsWith("shell ")) {
    return trimmed.slice(6).trim();
  }
  return "";
}
