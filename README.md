<p align="center">
  <img src="docs/banner.svg" alt="Open Spotlight Bar" />
</p>

<p align="center">
  <a href="#features">Features</a> ·
  <a href="#getting-started">Getting Started</a> ·
  <a href="#architecture">Architecture</a> ·
  <a href="#built-in-plugins">Built-in Plugins</a> ·
  <a href="#plugin-authoring">Plugin Authoring</a> ·
  <a href="#workflows">Workflows</a> ·
  <a href="#contributing">Contributing</a>
</p>

---

## Why Open Spotlight Bar?

Open Spotlight Bar is an open-source alternative to Alfred, Raycast, and PowerToys Run. Built with **Tauri 2 + React + Rust**, it delivers native performance with a modern web UI — all while keeping your data local by default.

## Features

| Category | Highlights |
|----------|-----------|
| **Search** | Apps, files, clipboard, snippets, web shortcuts — all from one bar |
| **Live File Search** | `dir <query>` for real-time system-wide file search (mdfind / locate / find) |
| **Calculator** | `= 2**10`, `= 0xFF & 0x0F` — arithmetic, bitwise ops, hex/binary display |
| **Clipboard History** | Automatic capture with pin, delete, privacy exclusions |
| **Snippets** | Text expansion with `{{date}}`, `{{time}}`, `{{clipboard}}`, `{{uuid}}` variables |
| **Workflows** | Visual node editor with command & keyword triggers, HTTP requests, JSON transforms, reusable subflows |
| **Plugins** | 8 built-in plugins, Worker-isolated with permission-gated APIs |
| **Plugin Marketplace** | Browse, install & uninstall built-in plugins from Settings |
| **Settings Hub** | Type `config` to open the unified settings surface |
| **Cross-platform** | macOS, Windows, Linux via Tauri |

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Enter` | Execute default action |
| `Tab` | Open action panel |
| `Ctrl + ,` | Open settings |
| `Escape` | Close panel / dismiss launcher |
| `↑ ↓` | Navigate results |

## Getting Started

### Prerequisites

- **Node.js** 20+
- **pnpm** 9+
- **Rust** stable toolchain
- Tauri system dependencies ([guide](https://v2.tauri.app/start/prerequisites/))

### Install & Run

```bash
# Clone the repo
git clone https://github.com/Chenhzjs/openSpotlightBar.git
cd openSpotlightBar

# Install dependencies
pnpm install

# Start the development app
pnpm dev
```

### Other Commands

```bash
pnpm typecheck          # TypeScript checks across all packages
pnpm test               # Run Vitest unit tests
pnpm lint               # ESLint
pnpm format             # Prettier
pnpm verify             # Full CI pipeline (format + lint + typecheck + test + build)

pnpm release:macos      # Production build for macOS
pnpm release:windows    # Production build for Windows
pnpm release:linux      # Production build for Linux
```

## Architecture

```
open-spotlight-bar/
├── apps/
│   └── desktop/                 # React + Tailwind UI, Tauri shell
│       └── src-tauri/           # Rust backend: commands, SQLite, file index, plugins
├── packages/
│   ├── core/                    # Query parsing, ranking, search engine, workflow runtime
│   ├── shared-types/            # Domain models shared across frontend & backend
│   └── plugin-sdk/              # Plugin contracts & host API surface
├── plugins/                     # Built-in plugins (calculator, base64, color-picker, hash, etc.)
├── scripts/                     # Build & release helpers
└── docs/                        # Architecture, roadmap, release notes
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop shell | [Tauri 2](https://v2.tauri.app/) |
| Frontend | React 19, TypeScript, Tailwind CSS, Vite |
| Backend | Rust, SQLite (via rusqlite), reqwest, tokio |
| Monorepo | pnpm workspaces |
| Testing | Vitest, ESLint, Prettier |

### Search Pipeline

Results flow through a provider-based pipeline where each provider (Apps, Files, Clipboard, Snippets, Plugins, Workflows, Web, System) returns a unified `ResultItem`. Ranking combines:

- Fuzzy score + prefix/exact match bonuses
- Per-source weight configuration
- File recency and usage history boost
- Timeout-protected fan-out across all providers

## Built-in Plugins

| Plugin | Trigger | Description |
|--------|---------|-------------|
| Calculator | `= 1+2`, `= 2**10` | Arithmetic, exponentiation, bitwise ops (`&`, `\|`, `^`, `>>`, `<<`), hex/binary display |
| Encode / Decode | `b64`, `url`, `html`, `hex`, `encode` | Base64, URL encoding, HTML entities, hex encode/decode |
| Color Picker | `color #ff6600`, `color rgb(255,0,0)` | HEX / RGB / HSL color format conversion |
| Hash | `hash hello` | SHA-256 hash computation |
| Timestamp | `ts 1700000000`, `timestamp 2024-01-01` | Unix timestamp ↔ date conversion |
| IP Lookup | `ip` | Public IP, geolocation, and ISP info |
| GitHub Search | `ghrepo tauri` | Search GitHub repositories |
| Shell Command | `shell ls -la` | Run shell commands (prefers iTerm2 on macOS) |

## Plugin Authoring

Plugins live in `{app_data_dir}/plugins/{plugin-id}/` or the local `./plugins/` directory.

```
my-plugin/
├── manifest.json
└── src/
    └── index.js
```

**manifest.json**

```json
{
  "id": "com.example.demo",
  "name": "Demo Plugin",
  "version": "0.1.0",
  "entry": "src/index.js",
  "commands": [{ "name": "demo", "title": "Demo command" }],
  "permissions": []
}
```

**src/index.js**

```js
const plugin = {
  async search(context) {
    if (!context.query.startsWith("demo ")) return [];
    return [{
      id: "demo:hello",
      title: "Hello from plugin",
      type: "plugin",
      actions: [{
        id: "copy",
        title: "Copy text",
        kind: "copy-text",
        payload: { text: "hello" }
      }]
    }];
  }
};
export default plugin;
```

### Permission Model

Plugins request capabilities explicitly in their manifest:

`network` · `filesystem.read` · `filesystem.write` · `clipboard.read` · `clipboard.write` · `shell.exec` · `notifications`

Missing permissions surface as approval requests in Settings → Plugins.

### Plugin Marketplace

Built-in plugins ship with the repository under `plugins/`. From **Settings → Marketplace** you can:

- Browse available built-in plugins
- Search by name, description, or tags
- One-click install (local file copy)
- Uninstall with directory cleanup

## Workflows

Workflows are a visual, node-based automation system triggered from the launcher.

### Trigger Types

| Type | Example |
|------|---------|
| Command | `google open spotlight bar` or `/google open spotlight bar` |
| Keyword | `g open spotlight bar`, `weather Shanghai` |
| Manual | Run from the workflow editor |

### Built-in Workflows

`google` · `jira` · `clip-clean` · `echo` · `json-pretty` · `url-encode` · `reindex-now` · `ghrepo` · `gh-search` · `weather` · `http-get`

Keyword triggers: `g`, `jira`, `gh`, `weather`

### Node Types

- **Input**: Query, Clipboard, Static Value
- **Transform**: Template, Regex Replace, Conditional Branch, JSON Parse/Extract
- **Action**: HTTP Request, Invoke Workflow, Open URL, Copy to Clipboard, Run Shell, Open File
- **Output**: Return Text, Show Launcher Results, Emit Toast

### Reference Syntax

```
{{args.query}}                        # Trigger argument
{{context.clipboard}}                 # Launcher context
{{nodes.parse.default.user.name}}     # Previous node output
{{item.full_name}}                    # Item mapping in result lists
```

## Platform Status

| Platform | Status |
|----------|--------|
| **macOS** | Tauri shell — demo-ready |
| **Windows** | Tauri shell — demo-ready |
| **Linux** | Tauri shell — demo-ready |

## Contributing

1. Fork the repo and create a feature branch
2. Run `pnpm verify` to ensure everything passes
3. Open a pull request

See [docs/architecture.md](docs/architecture.md) for deeper technical context and [docs/roadmap.md](docs/roadmap.md) for planned work.

## License

This project is open source. See the repository for license details.



