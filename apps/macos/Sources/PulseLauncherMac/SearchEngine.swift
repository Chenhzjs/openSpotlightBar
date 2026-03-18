import AppKit
import Foundation

protocol LauncherSearchProvider: Sendable {
    func search(query: String, snapshot: NativeShellSnapshot?) async -> [LauncherResult]
}

actor AppCatalogService {
    private var cachedApps: [InstalledApp] = []

    func installedApps() async -> [InstalledApp] {
        if cachedApps.isEmpty {
            cachedApps = discoverInstalledApps()
        }
        return cachedApps
    }

    private func discoverInstalledApps() -> [InstalledApp] {
        let homeApps = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Applications")

        let searchRoots = [
            URL(fileURLWithPath: "/Applications", isDirectory: true),
            URL(fileURLWithPath: "/System/Applications", isDirectory: true),
            homeApps
        ]

        var seen = Set<String>()
        var apps: [InstalledApp] = []

        for root in searchRoots where FileManager.default.fileExists(atPath: root.path) {
            guard let enumerator = FileManager.default.enumerator(
                at: root,
                includingPropertiesForKeys: [.isDirectoryKey],
                options: [.skipsHiddenFiles, .skipsPackageDescendants]
            ) else {
                continue
            }

            for case let url as URL in enumerator {
                guard url.pathExtension == "app" else {
                    continue
                }

                let id = url.path
                guard seen.insert(id).inserted else {
                    continue
                }

                let name = url.deletingPathExtension().lastPathComponent
                apps.append(InstalledApp(id: id, name: name, url: url))
            }
        }

        return apps.sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
    }
}

struct AppSearchProvider: LauncherSearchProvider {
    let catalog: AppCatalogService

    func search(query: String, snapshot: NativeShellSnapshot?) async -> [LauncherResult] {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            return []
        }

        let apps = await catalog.installedApps()
        let normalizedQuery = trimmed.lowercased()
        let baseWeight = sourceWeight(for: "apps", snapshot: snapshot, fallback: 1.12)

        return apps
            .compactMap { app in
                let resultID = "app:\(app.id)"
                let score = SearchRanker.score(
                    candidate: app.name,
                    query: normalizedQuery,
                    base: baseWeight,
                    usage: snapshot?.usageStat(for: resultID)
                )
                guard score > 0 else {
                    return nil
                }

                return LauncherResult(
                    id: resultID,
                    title: app.name,
                    subtitle: app.url.path,
                    itemType: "app",
                    source: .apps,
                    score: score,
                    actions: [
                        LauncherAction(
                            id: "open:\(app.id)",
                            title: "Open",
                            subtitle: nil,
                            payload: .openApplication(app.url)
                        ),
                        LauncherAction(
                            id: "reveal:\(app.id)",
                            title: "Reveal in Finder",
                            subtitle: nil,
                            payload: .revealInFinder(app.url)
                        )
                    ]
                )
            }
            .sorted { $0.score > $1.score }
            .prefix(maxResults(snapshot: snapshot))
            .map { $0 }
    }
}

struct FileSearchProvider: LauncherSearchProvider {
    let bridge: MacShellBridge

    func search(query: String, snapshot: NativeShellSnapshot?) async -> [LauncherResult] {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.count >= 2 else {
            return []
        }

        do {
            let results = try await bridge.searchFiles(query: trimmed)
            return results.map { item in
                let usage = snapshot?.usageStat(for: item.id)
                let adjustedScore = item.score + SearchRanker.usageBoost(usage)
                return LauncherResult(
                    id: item.id,
                    title: item.title,
                    subtitle: item.subtitle ?? "",
                    itemType: item.type,
                    source: .files,
                    score: adjustedScore,
                    actions: item.actions.map { action in
                        LauncherAction(
                            id: action.id,
                            title: action.title,
                            subtitle: action.description,
                            payload: .bridgeAction(
                                BridgeActionExecution(
                                    action: action,
                                    result: item,
                                    refreshSnapshotAfterAction: false
                                )
                            )
                        )
                    }
                )
            }
        } catch {
            return []
        }
    }
}

struct ClipboardSearchProvider: LauncherSearchProvider {
    func search(query: String, snapshot: NativeShellSnapshot?) async -> [LauncherResult] {
        guard let snapshot else {
            return []
        }

        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            return []
        }

        let normalizedQuery = trimmed.lowercased()
        let baseWeight = sourceWeight(for: "clipboard", snapshot: snapshot, fallback: 0.95)

        return snapshot.clipboardItems
            .compactMap { item in
                let text = item.text ?? item.preview
                guard matchesClipboard(item: item, normalizedQuery: normalizedQuery) else {
                    return nil
                }

                let resultID = "clipboard:\(item.id)"
                let score = SearchRanker.score(
                    candidate: [item.preview, text, item.sourceApp ?? ""].joined(separator: " "),
                    query: normalizedQuery,
                    base: baseWeight + (item.pinned ? 0.16 : 0),
                    usage: snapshot.usageStat(for: resultID)
                )

                return LauncherResult(
                    id: resultID,
                    title: item.preview,
                    subtitle: clipboardSubtitle(item: item),
                    itemType: "clipboard",
                    source: .clipboard,
                    score: score,
                    actions: [
                        bridgeAction(
                            id: "copy:\(item.id)",
                            title: "Copy again",
                            kind: "copy-text",
                            subtitle: nil,
                            payload: ["text": .string(text)],
                            refreshSnapshotAfterAction: false
                        ),
                        bridgeAction(
                            id: "paste:\(item.id)",
                            title: "Paste item",
                            kind: "paste-text",
                            subtitle: "TODO: native paste simulation hooks land in a later phase.",
                            payload: ["text": .string(text)],
                            refreshSnapshotAfterAction: false
                        ),
                        bridgeAction(
                            id: item.pinned ? "unpin:\(item.id)" : "pin:\(item.id)",
                            title: item.pinned ? "Unpin item" : "Pin item",
                            kind: item.pinned ? "unpin-clipboard-item" : "pin-clipboard-item",
                            subtitle: nil,
                            payload: ["itemId": .string(item.id)],
                            refreshSnapshotAfterAction: true
                        ),
                        bridgeAction(
                            id: "delete:\(item.id)",
                            title: "Delete item",
                            kind: "delete-clipboard-item",
                            subtitle: nil,
                            payload: ["itemId": .string(item.id)],
                            refreshSnapshotAfterAction: true
                        )
                    ]
                )
            }
            .sorted { $0.score > $1.score }
            .prefix(maxResults(snapshot: snapshot))
            .map { $0 }
    }
}

struct SnippetSearchProvider: LauncherSearchProvider {
    func search(query: String, snapshot: NativeShellSnapshot?) async -> [LauncherResult] {
        guard let snapshot else {
            return []
        }

        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            return []
        }

        guard snapshot.settings.snippets.enabledInSearch else {
            return []
        }

        let normalizedQuery = trimmed.lowercased()
        let baseWeight = sourceWeight(for: "snippets", snapshot: snapshot, fallback: 1.02)

        return snapshot.snippets
            .filter(\.enabled)
            .compactMap { snippet in
                guard matchesSnippet(snippet: snippet, normalizedQuery: normalizedQuery) else {
                    return nil
                }

                let resultID = "snippet:\(snippet.id)"
                let score = SearchRanker.score(
                    candidate: [snippet.name, snippet.trigger, snippet.content].joined(separator: " "),
                    query: normalizedQuery,
                    base: baseWeight,
                    usage: snapshot.usageStat(for: resultID)
                )

                return LauncherResult(
                    id: resultID,
                    title: snippet.name,
                    subtitle: "\(snippet.trigger) • \(snippet.content.prefix(80))",
                    itemType: "snippet",
                    source: .snippets,
                    score: score,
                    actions: [
                        bridgeAction(
                            id: "expand:\(snippet.id)",
                            title: "Expand snippet",
                            kind: "expand-snippet",
                            subtitle: "Expands variables and copies the result for now.",
                            payload: ["snippetId": .string(snippet.id)],
                            refreshSnapshotAfterAction: false
                        ),
                        bridgeAction(
                            id: "copy-template:\(snippet.id)",
                            title: "Copy template",
                            kind: "copy-text",
                            subtitle: nil,
                            payload: ["text": .string(snippet.content)],
                            refreshSnapshotAfterAction: false
                        ),
                        bridgeAction(
                            id: "paste-template:\(snippet.id)",
                            title: "Paste template",
                            kind: "paste-text",
                            subtitle: "TODO: hook into OS-level insertion when global expansion lands.",
                            payload: ["text": .string(snippet.content)],
                            refreshSnapshotAfterAction: false
                        )
                    ]
                )
            }
            .sorted { $0.score > $1.score }
            .prefix(maxResults(snapshot: snapshot))
            .map { $0 }
    }
}

struct PluginInventorySearchProvider: LauncherSearchProvider {
    func search(query: String, snapshot: NativeShellSnapshot?) async -> [LauncherResult] {
        guard let snapshot, snapshot.settings.plugins.enableHost else {
            return []
        }

        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            return []
        }

        let normalizedQuery = trimmed.lowercased()
        let baseWeight = sourceWeight(for: "plugins", snapshot: snapshot, fallback: 0.9)

        return snapshot.plugins
            .compactMap { plugin in
                let haystack = [
                    plugin.name,
                    plugin.id,
                    plugin.description ?? "",
                    plugin.permissions.joined(separator: " ")
                ].joined(separator: " ")

                let score = SearchRanker.score(
                    candidate: haystack,
                    query: normalizedQuery,
                    base: baseWeight,
                    usage: snapshot.usageStat(for: "plugin:\(plugin.id)")
                )
                guard score > 0 else {
                    return nil
                }

                let status = plugin.validationErrors.isEmpty ? "Ready to inspect" : "Needs attention"
                return LauncherResult(
                    id: "plugin:\(plugin.id)",
                    title: plugin.name,
                    subtitle: "\(status) • \(plugin.permissions.joined(separator: ", "))",
                    itemType: "plugin",
                    source: .plugins,
                    score: score,
                    actions: [
                        LauncherAction(
                            id: "show-plugin-settings:\(plugin.id)",
                            title: "Open Plugins settings",
                            subtitle: nil,
                            payload: .showSettings(.plugins)
                        ),
                        bridgeAction(
                            id: "copy-plugin-id:\(plugin.id)",
                            title: "Copy plugin id",
                            kind: "copy-text",
                            subtitle: nil,
                            payload: ["text": .string(plugin.id)],
                            refreshSnapshotAfterAction: false
                        )
                    ]
                )
            }
            .sorted { $0.score > $1.score }
            .prefix(maxResults(snapshot: snapshot))
            .map { $0 }
    }
}

struct WebSearchProvider: LauncherSearchProvider {
    func search(query: String, snapshot: NativeShellSnapshot?) async -> [LauncherResult] {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            return []
        }

        let shortcutTemplate = webShortcut(for: trimmed, snapshot: snapshot)
        let actualQuery = shortcutQuery(trimmed: trimmed, usingShortcut: shortcutTemplate != nil)
        guard !actualQuery.isEmpty else {
            return []
        }

        let template = shortcutTemplate ?? snapshot?.settings.webSearch.defaultEngine
            ?? "https://www.google.com/search?q={query}"
        let encoded = actualQuery.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed)
            ?? actualQuery
        let url = URL(string: template.replacingOccurrences(of: "{query}", with: encoded))!
        let title = shortcutTemplate == nil
            ? "Search the web for \(actualQuery)"
            : "Search shortcut: \(actualQuery)"

        return [
            LauncherResult(
                id: "web:\(url.absoluteString)",
                title: title,
                subtitle: url.absoluteString,
                itemType: "url",
                source: .web,
                score: SearchRanker.score(
                    candidate: actualQuery,
                    query: trimmed.lowercased(),
                    base: sourceWeight(for: "web", snapshot: snapshot, fallback: 0.72),
                    usage: snapshot?.usageStat(for: "web:\(url.absoluteString)")
                ),
                actions: [
                    LauncherAction(
                        id: "open-web:\(url.absoluteString)",
                        title: "Open search",
                        subtitle: nil,
                        payload: .openURL(url)
                    )
                ]
            )
        ]
    }
}

struct SearchRanker {
    static func score(
        candidate: String,
        query: String,
        base: Double,
        usage: BridgeUsageStat? = nil
    ) -> Double {
        let normalizedCandidate = candidate.lowercased()
        let normalizedQuery = query.lowercased()

        guard !normalizedQuery.isEmpty else {
            return 0
        }

        if normalizedCandidate == normalizedQuery {
            return base + 1.6 + usageBoost(usage)
        }

        var score = base
        if normalizedCandidate.hasPrefix(normalizedQuery) {
            score += 0.6
        }

        if normalizedCandidate.contains(normalizedQuery) {
            score += 0.32
        }

        var searchStart = normalizedCandidate.startIndex
        var contiguousMatches = 0

        for character in normalizedQuery {
            guard let index = normalizedCandidate[searchStart...].firstIndex(of: character) else {
                return 0
            }

            contiguousMatches = index == searchStart ? contiguousMatches + 1 : 1
            score += 0.08 + min(Double(contiguousMatches) * 0.03, 0.18)
            searchStart = normalizedCandidate.index(after: index)
        }

        return score + usageBoost(usage)
    }

    static func usageBoost(_ usage: BridgeUsageStat?) -> Double {
        guard let usage else {
            return 0
        }

        let usageCountBoost = min(log(Double(max(usage.selectedCount, 1)) + 1) * 0.18, 0.68)

        guard let lastSelectedAt = usage.lastSelectedAt else {
            return usageCountBoost
        }

        let ageHours = max(Date().timeIntervalSince1970 * 1000 - Double(lastSelectedAt), 0) / 3_600_000
        let recencyBoost = max(0.22 - ageHours / 240, 0)
        return usageCountBoost + recencyBoost
    }
}

actor MacSearchEngine {
    private let providers: [any LauncherSearchProvider]
    private var snapshot: NativeShellSnapshot?

    init(catalog: AppCatalogService, bridge: MacShellBridge) {
        self.providers = [
            AppSearchProvider(catalog: catalog),
            FileSearchProvider(bridge: bridge),
            ClipboardSearchProvider(),
            SnippetSearchProvider(),
            PluginInventorySearchProvider(),
            WebSearchProvider()
        ]
    }

    func update(snapshot: NativeShellSnapshot?) {
        self.snapshot = snapshot
    }

    func search(query: String) async -> [LauncherResult] {
        let snapshot = self.snapshot
        var merged: [LauncherResult] = []

        for provider in providers {
            let results = await provider.search(query: query, snapshot: snapshot)
            merged.append(contentsOf: results)
        }

        return dedupe(results: merged)
            .sorted { $0.score > $1.score }
            .prefix(maxResults(snapshot: snapshot))
            .map { $0 }
    }

    private func dedupe(results: [LauncherResult]) -> [LauncherResult] {
        var byID: [String: LauncherResult] = [:]

        for result in results {
            if let existing = byID[result.id], existing.score >= result.score {
                continue
            }
            byID[result.id] = result
        }

        return Array(byID.values)
    }
}

private func bridgeAction(
    id: String,
    title: String,
    kind: String,
    subtitle: String?,
    payload: [String: JSONValue],
    refreshSnapshotAfterAction: Bool
) -> LauncherAction {
    LauncherAction(
        id: id,
        title: title,
        subtitle: subtitle,
        payload: .bridgeAction(
            BridgeActionExecution(
                action: BridgeActionItem(
                    id: id,
                    title: title,
                    kind: kind,
                    shortcut: nil,
                    description: subtitle,
                    requires: nil,
                    payload: payload
                ),
                result: nil,
                refreshSnapshotAfterAction: refreshSnapshotAfterAction
            )
        )
    )
}

private func clipboardSubtitle(item: BridgeClipboardItem) -> String {
    [
        item.pinned ? "Pinned" : nil,
        item.sourceApp,
        formatRelativeTime(item.createdAt)
    ]
        .compactMap { $0 }
        .joined(separator: " • ")
}

private func formatRelativeTime(_ timestampMs: Int) -> String {
    let deltaMs = max(Int(Date().timeIntervalSince1970 * 1000) - timestampMs, 0)
    let deltaMinutes = max(deltaMs / 60_000, 0)

    if deltaMinutes < 1 {
        return "just now"
    }
    if deltaMinutes < 60 {
        return "\(deltaMinutes)m ago"
    }

    let deltaHours = deltaMinutes / 60
    if deltaHours < 24 {
        return "\(deltaHours)h ago"
    }

    return "\(deltaHours / 24)d ago"
}

private func matchesClipboard(item: BridgeClipboardItem, normalizedQuery: String) -> Bool {
    let fields = [
        item.preview,
        item.text ?? "",
        item.sourceApp ?? ""
    ]

    return fields.joined(separator: " ").lowercased().contains(normalizedQuery)
}

private func matchesSnippet(snippet: BridgeSnippetRecord, normalizedQuery: String) -> Bool {
    [snippet.name, snippet.trigger, snippet.content]
        .joined(separator: " ")
        .lowercased()
        .contains(normalizedQuery)
}

private func webShortcut(for query: String, snapshot: NativeShellSnapshot?) -> String? {
    let tokens = query.split(separator: " ").map(String.init)
    guard let alias = tokens.first else {
        return nil
    }
    return snapshot?.settings.webSearch.shortcuts[alias]
}

private func shortcutQuery(trimmed: String, usingShortcut: Bool) -> String {
    guard usingShortcut else {
        return trimmed
    }

    let tokens = trimmed.split(separator: " ").map(String.init)
    return tokens.dropFirst().joined(separator: " ")
}

private func sourceWeight(for source: String, snapshot: NativeShellSnapshot?, fallback: Double) -> Double {
    snapshot?.settings.search.sourceWeights[source] ?? fallback
}

private func maxResults(snapshot: NativeShellSnapshot?) -> Int {
    max(snapshot?.settings.search.maxResults ?? 8, 5)
}
