import Testing
@testable import PulseLauncherMac

struct BridgeModelsTests {
    @Test func recordingSelectionUpdatesUsageStats() async throws {
        let snapshot = NativeShellSnapshot(
            settings: .init(
                hotkey: "Alt+Space",
                theme: "dark",
                language: "system",
                indexPaths: [],
                search: .init(maxResults: 9, sourceWeights: [:]),
                clipboard: .init(maxItems: 80, pollIntervalMs: 1200, privateApps: []),
                snippets: .init(enabledInSearch: true, enableExpansionHooks: false),
                plugins: .init(
                    enableHost: true,
                    timeoutMs: 1200,
                    promptOnFirstPermission: true,
                    disabledPluginIds: [],
                    grantedPermissions: [:]
                ),
                appearance: .init(denseMode: false, reduceMotion: false),
                webSearch: .init(defaultEngine: "https://www.google.com/search?q={query}", shortcuts: [:])
            ),
            usageStats: [],
            clipboardItems: [],
            snippets: [],
            indexedFileCount: 0,
            plugins: []
        )

        let next = snapshot.recordingSelection(
            itemID: "snippet:test",
            itemType: "snippet",
            query: "test"
        )

        #expect(next.usageStats.count == 1)
        #expect(next.usageStats.first?.itemID == "snippet:test")
        #expect(next.usageStats.first?.selectedCount == 1)
        #expect(next.usageStats.first?.query == "test")
    }
}
