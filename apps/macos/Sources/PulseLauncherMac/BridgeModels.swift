import Foundation

enum NativeShellBridgeStatus: Equatable, Sendable {
    case loading
    case ready
    case unavailable(String)
    case degraded(String)

    var title: String {
        title(in: .english)
    }

    func title(in locale: LauncherLocale) -> String {
        switch self {
        case .loading:
            return localized("Connecting shared services", "正在连接共享服务", locale)
        case .ready:
            return localized("Shared services connected", "共享服务已连接", locale)
        case .unavailable:
            return localized("Shared services unavailable", "共享服务不可用", locale)
        case .degraded:
            return localized("Shared services degraded", "共享服务已降级", locale)
        }
    }

    var detail: String {
        detail(in: .english)
    }

    func detail(in locale: LauncherLocale) -> String {
        switch self {
        case .loading:
            return localized("Loading local settings, usage history, clipboard, snippets, and indexed files.", "正在加载本地设置、使用历史、剪贴板、片段和已索引文件。", locale)
        case .ready:
            return localized("The native shell is reading real launcher data from the shared Rust and SQLite layer.", "原生壳层正在读取来自共享 Rust 和 SQLite 层的真实启动器数据。", locale)
        case .unavailable(let reason), .degraded(let reason):
            return reason
        }
    }

    var isConnected: Bool {
        if case .ready = self {
            return true
        }
        return false
    }
}

struct NativeShellSnapshot: Codable, Equatable, Sendable {
    var settings: BridgeLauncherSettings
    var usageStats: [BridgeUsageStat]
    var clipboardItems: [BridgeClipboardItem]
    var snippets: [BridgeSnippetRecord]
    var indexedFileCount: Int
    var plugins: [NativePluginSummary]
    var workflows: [NativeWorkflowSummary]
}

extension NativeShellSnapshot {
    var usageByItemID: [String: BridgeUsageStat] {
        Dictionary(uniqueKeysWithValues: usageStats.map { ($0.itemID, $0) })
    }

    func usageStat(for itemID: String) -> BridgeUsageStat? {
        usageByItemID[itemID]
    }

    func recordingSelection(itemID: String, itemType: String, query: String) -> NativeShellSnapshot {
        var next = self
        if let index = next.usageStats.firstIndex(where: { $0.itemID == itemID }) {
            next.usageStats[index].selectedCount += 1
            next.usageStats[index].query = query
            next.usageStats[index].lastSelectedAt = Int(Date().timeIntervalSince1970 * 1000)
        } else {
            next.usageStats.insert(
                BridgeUsageStat(
                    itemID: itemID,
                    itemType: itemType,
                    query: query,
                    selectedCount: 1,
                    lastSelectedAt: Int(Date().timeIntervalSince1970 * 1000)
                ),
                at: 0
            )
        }

        next.usageStats.sort { left, right in
            if left.selectedCount == right.selectedCount {
                return (left.lastSelectedAt ?? 0) > (right.lastSelectedAt ?? 0)
            }
            return left.selectedCount > right.selectedCount
        }
        return next
    }
}

struct BridgeLauncherSettings: Codable, Equatable, Sendable {
    var hotkey: String
    var theme: String
    var language: String
    var indexPaths: [String]
    var indexExclusions: [String]
    var indexingPaused: Bool
    var search: BridgeSearchSettings
    var clipboard: BridgeClipboardSettings
    var snippets: BridgeSnippetSettings
    var plugins: BridgePluginSettings
    var appearance: BridgeAppearanceSettings
    var webSearch: BridgeWebSearchSettings
}

struct BridgeSearchSettings: Codable, Equatable, Sendable {
    var maxResults: Int
    var sourceWeights: [String: Double]
}

struct BridgeClipboardSettings: Codable, Equatable, Sendable {
    var maxItems: Int
    var pollIntervalMs: Int
    var privateApps: [String]
}

struct BridgeSnippetSettings: Codable, Equatable, Sendable {
    var enabledInSearch: Bool
    var enableExpansionHooks: Bool
}

struct BridgePluginSettings: Codable, Equatable, Sendable {
    var enableHost: Bool
    var timeoutMs: Int
    var promptOnFirstPermission: Bool
    var disabledPluginIds: [String]
    var grantedPermissions: [String: [String]]
}

struct BridgeAppearanceSettings: Codable, Equatable, Sendable {
    var denseMode: Bool
    var reduceMotion: Bool
}

struct BridgeWebSearchSettings: Codable, Equatable, Sendable {
    var defaultEngine: String
    var shortcuts: [String: String]
}

struct BridgeUsageStat: Codable, Equatable, Sendable {
    var itemID: String
    var itemType: String
    var query: String?
    var selectedCount: Int
    var lastSelectedAt: Int?

    private enum CodingKeys: String, CodingKey {
        case itemID = "itemId"
        case itemType
        case query
        case selectedCount
        case lastSelectedAt
    }
}

struct BridgeClipboardItem: Codable, Equatable, Identifiable, Sendable {
    let id: String
    let contentType: String
    let text: String?
    let preview: String
    let pinned: Bool
    let createdAt: Int
    let sourceApp: String?
    let metadata: [String: JSONValue]?
}

struct BridgeSnippetRecord: Codable, Equatable, Identifiable, Sendable {
    let id: String
    let name: String
    let trigger: String
    let content: String
    let enabled: Bool
    let scope: String?
    let appRestriction: String?
    let createdAt: Int
    let updatedAt: Int
}

struct NativePluginSummary: Codable, Equatable, Identifiable, Sendable {
    let id: String
    let name: String
    let version: String
    let description: String?
    let permissions: [String]
    let validationErrors: [String]
}

struct NativeWorkflowSummary: Codable, Equatable, Identifiable, Sendable {
    let id: String
    let name: String
    let description: String?
    let triggerType: String
    let triggerLabel: String
    let enabled: Bool
    let builtIn: Bool
    let reusable: Bool
}

struct BridgeActionResponse: Codable, Equatable, Sendable {
    let ok: Bool
    let message: String?
}

struct BridgeActionItem: Codable, Equatable, Identifiable, Sendable {
    let id: String
    let title: String
    let kind: String
    let shortcut: String?
    let description: String?
    let requires: [String]?
    let payload: [String: JSONValue]?
}

struct BridgeResultItem: Codable, Equatable, Identifiable, Sendable {
    let id: String
    let title: String
    let subtitle: String?
    let type: String
    let source: String
    let icon: String?
    let score: Double
    let pluginID: String?
    let tags: [String]?
    let actions: [BridgeActionItem]
    let payload: [String: JSONValue]

    private enum CodingKeys: String, CodingKey {
        case id
        case title
        case subtitle
        case type
        case source
        case icon
        case score
        case pluginID = "pluginId"
        case tags
        case actions
        case payload
    }
}

struct BridgeActionExecution: Equatable, Sendable {
    let action: BridgeActionItem
    let result: BridgeResultItem?
    let refreshSnapshotAfterAction: Bool
}

enum JSONValue: Codable, Equatable, Sendable {
    case string(String)
    case number(Double)
    case bool(Bool)
    case object([String: JSONValue])
    case array([JSONValue])
    case null

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()

        if container.decodeNil() {
            self = .null
        } else if let value = try? container.decode(Bool.self) {
            self = .bool(value)
        } else if let value = try? container.decode(Double.self) {
            self = .number(value)
        } else if let value = try? container.decode(String.self) {
            self = .string(value)
        } else if let value = try? container.decode([String: JSONValue].self) {
            self = .object(value)
        } else if let value = try? container.decode([JSONValue].self) {
            self = .array(value)
        } else {
            throw DecodingError.dataCorruptedError(
                in: container,
                debugDescription: "Unsupported JSON value."
            )
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()

        switch self {
        case .string(let value):
            try container.encode(value)
        case .number(let value):
            try container.encode(value)
        case .bool(let value):
            try container.encode(value)
        case .object(let value):
            try container.encode(value)
        case .array(let value):
            try container.encode(value)
        case .null:
            try container.encodeNil()
        }
    }

    var stringValue: String? {
        switch self {
        case .string(let value):
            value
        case .number(let value):
            String(value)
        case .bool(let value):
            value ? "true" : "false"
        default:
            nil
        }
    }

    var intValue: Int? {
        switch self {
        case .number(let value):
            Int(value)
        case .string(let value):
            Int(value)
        default:
            nil
        }
    }
}
