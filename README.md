# openSpotlishtBar

An open and extensible launcher inspired by Alfred. Quickly search for files and apps, manage clipboard history, insert reusable snippets, and trigger custom workflows without lifting your fingers off the keyboard.

## Features

- **Universal search** – Use `find <keywords>` to search Spotlight (macOS) or fall back to a fast filesystem scan. Double‑click any result to open it immediately.
- **Terminal shortcut** – Type `terminal` to launch your preferred terminal emulator.
- **Clipboard history** – `clip list` shows the last 40 clipboard entries, `clip copy <index>` pastes them back, and `clip clear` wipes the history.
- **Snippets** – Store reusable responses with `snip add <key> <text>` and expand them with `snip expand <key>`. Snippets are saved to `~/Library/Application Support/openSpotlightBar/snippets.json` (or `~/.openSpotlightBar/snippets.json` on other platforms).
- **Workflows** – Chain powerful commands with `workflow <keyword> [args…]`. The definitions live in `~/Library/Application Support/openSpotlightBar/workflows.json`. Edit the JSON to add new automations, then run `workflow reload`.
- **Help overlay** – Type `help` any time to see every available command, a short description, and usage examples.
- **Quick summon** – On macOS press `Ctrl + Option + Space` to bring the bar forward from anywhere; click outside or hit `Esc` to dismiss it instantly.
- **Settings access** – On macOS tap the gear icon in the bar’s top-left corner. On Windows/Linux, right-click the tray icon and choose **Settings…** (or Quit).

## Build

### Build Qt6
```bash
git submodule --init
cd qt5
git checkout v6.10.0
./init-repository --module-subset=qtbase
./configure -prefix ./build
cmake --build .
cmake --install .
```

### Build project
```bash
./setup.sh
```
