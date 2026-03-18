import Foundation

struct ConfigCommand: Equatable {
    let section: SettingsSection
}

enum CommandRouting {
    static func parseConfig(_ query: String) -> ConfigCommand? {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !trimmed.isEmpty else {
            return nil
        }

        let parts = trimmed.split(separator: " ").map(String.init)
        guard let head = parts.first, head == "/config" || head == "/settings" else {
            return nil
        }

        guard parts.count > 1 else {
            return ConfigCommand(section: .general)
        }

        switch parts[1] {
        case "general", "hotkey":
            return ConfigCommand(section: .general)
        case "search":
            return ConfigCommand(section: .search)
        case "clipboard", "history":
            return ConfigCommand(section: .clipboard)
        case "snippet", "snippets":
            return ConfigCommand(section: .snippets)
        case "workflow", "workflows":
            return ConfigCommand(section: .workflow)
        case "plugin", "plugins":
            return ConfigCommand(section: .plugins)
        case "appearance", "theme":
            return ConfigCommand(section: .appearance)
        default:
            return ConfigCommand(section: .general)
        }
    }
}
