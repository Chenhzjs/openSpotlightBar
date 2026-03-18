import AppKit
import Combine
import Foundation

@MainActor
final class LauncherViewModel: ObservableObject {
    private enum Layout {
        static let collapsed = CGSize(width: 860, height: 96)
        static let actions = CGSize(width: 860, height: 308)
        static let settings = CGSize(width: 980, height: 620)
    }

    @Published var query = ""
    @Published var results: [LauncherResult] = []
    @Published var mode: LauncherMode = .search
    @Published var selectedIndex = 0
    @Published var selectedActionIndex = 0
    @Published var activeSettingsSection: SettingsSection = .general
    @Published var panelSize = Layout.collapsed
    @Published var focusNonce = 0
    @Published private(set) var bridgeSnapshot: NativeShellSnapshot?
    @Published private(set) var bridgeStatus: NativeShellBridgeStatus

    var hideRequest: (() -> Void)?
    var openSectionRequest: ((SettingsSection) -> Void)?

    private let bridge: MacShellBridge
    private let searchEngine: MacSearchEngine
    private var searchTask: Task<Void, Never>?
    private var bridgeTask: Task<Void, Never>?

    init(searchEngine: MacSearchEngine, bridge: MacShellBridge) {
        self.searchEngine = searchEngine
        self.bridge = bridge
        self.bridgeStatus = bridge.status()
    }

    var selectedResult: LauncherResult? {
        guard results.indices.contains(selectedIndex) else {
            return nil
        }
        return results[selectedIndex]
    }

    func activate() {
        focusNonce += 1
        updatePanelSize()
        refreshBridge(force: bridgeSnapshot == nil)
    }

    func dismissTransientPanels() {
        if mode != .settings {
            mode = .search
        }
    }

    func updateQuery(_ value: String) {
        query = value
        selectedIndex = 0
        selectedActionIndex = 0

        if let command = CommandRouting.parseConfig(value) {
            activeSettingsSection = command.section
            results = []
            mode = .search
            updatePanelSize()
            return
        }

        mode = .search
        performSearch()
    }

    func selectResult(at index: Int) {
        selectedIndex = index
    }

    func selectAction(at index: Int) {
        selectedActionIndex = index
    }

    func openSettings(_ section: SettingsSection) {
        activeSettingsSection = section
        mode = .settings
        updatePanelSize()
    }

    func restoreSettingsHub(section: SettingsSection) {
        activeSettingsSection = section
        selectedActionIndex = 0
        mode = .settings
        updatePanelSize()
    }

    func applyBridgeSnapshot(_ snapshot: NativeShellSnapshot) {
        bridgeSnapshot = snapshot
        bridgeStatus = .ready
        Task {
            await searchEngine.update(snapshot: snapshot)
        }
    }

    func selectSettingsSection(_ section: SettingsSection) {
        activeSettingsSection = section
    }

    func closeSettings() {
        if CommandRouting.parseConfig(query) != nil {
            query = ""
        }
        mode = .search
        results = []
        updatePanelSize()
        focusNonce += 1
    }

    func executePrimarySelection() {
        guard let selectedResult, let action = selectedResult.actions.first else {
            return
        }

        execute(action: action, result: selectedResult)
    }

    func executeSelectedAction() {
        guard
            let selectedResult,
            selectedResult.actions.indices.contains(selectedActionIndex)
        else {
            return
        }

        execute(action: selectedResult.actions[selectedActionIndex], result: selectedResult)
    }

    func handle(keyEvent: NSEvent) -> Bool {
        switch keyEvent.keyCode {
        case 53: // escape
            if mode == .settings {
                closeSettings()
            } else if mode == .actions {
                mode = .search
                updatePanelSize()
            } else {
                hideRequest?()
            }
            return true

        case 48: // tab
            guard mode == .search, let selectedResult, !selectedResult.actions.isEmpty else {
                return false
            }
            mode = .actions
            selectedActionIndex = 0
            updatePanelSize()
            return true

        case 125: // down
            if mode == .settings {
                moveSettingsSelection(delta: 1)
                return true
            }
            if mode == .actions {
                moveActionSelection(delta: 1)
                return true
            }
            if mode == .search && !results.isEmpty {
                moveSelection(delta: 1)
                return true
            }
            return false

        case 126: // up
            if mode == .settings {
                moveSettingsSelection(delta: -1)
                return true
            }
            if mode == .actions {
                moveActionSelection(delta: -1)
                return true
            }
            if mode == .search && !results.isEmpty {
                moveSelection(delta: -1)
                return true
            }
            return false

        case 36: // enter
            if mode == .settings {
                openSelectedSettingsSection()
                return true
            }
            if mode == .actions {
                executeSelectedAction()
                return true
            }
            if CommandRouting.parseConfig(query) != nil {
                openSettings(activeSettingsSection)
                return true
            }
            if !results.isEmpty {
                executePrimarySelection()
                return true
            }
            return false

        default:
            return false
        }
    }

    private func performSearch() {
        searchTask?.cancel()

        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            results = []
            updatePanelSize()
            return
        }

        searchTask = Task { [weak self] in
            guard let self else { return }
            let nextResults = await searchEngine.search(query: trimmed)
            guard !Task.isCancelled else {
                return
            }
            await MainActor.run {
                self.results = nextResults
                self.selectedIndex = 0
                self.updatePanelSize()
            }
        }
    }

    private func moveSelection(delta: Int) {
        guard !results.isEmpty else { return }
        selectedIndex = (selectedIndex + delta + results.count) % results.count
    }

    private func moveActionSelection(delta: Int) {
        guard let selectedResult, !selectedResult.actions.isEmpty else { return }
        selectedActionIndex = (
            selectedActionIndex + delta + selectedResult.actions.count
        ) % selectedResult.actions.count
    }

    private func moveSettingsSelection(delta: Int) {
        let sections = SettingsSection.hubSections
        guard
            let currentIndex = sections.firstIndex(of: activeSettingsSection)
        else {
            activeSettingsSection = sections.first ?? .general
            return
        }

        let nextIndex = (currentIndex + delta + sections.count) % sections.count
        activeSettingsSection = sections[nextIndex]
    }

    private func openSelectedSettingsSection() {
        openSectionRequest?(activeSettingsSection)
    }

    private func execute(action: LauncherAction, result: LauncherResult?) {
        switch action.payload {
        case .openApplication(let url):
            NSWorkspace.shared.openApplication(at: url, configuration: .init())
            recordSelection(for: result)
            hideRequest?()

        case .revealInFinder(let url):
            NSWorkspace.shared.activateFileViewerSelecting([url])
            recordSelection(for: result)
            hideRequest?()

        case .openURL(let url):
            NSWorkspace.shared.open(url)
            recordSelection(for: result)
            hideRequest?()

        case .showSettings(let section):
            openSettings(section)

        case .openWorkflowStudio:
            openSectionRequest?(.workflow)

        case .bridgeAction(let execution):
            Task { [weak self] in
                await self?.performBridgeAction(execution, result: result)
            }
        }
    }

    private func performBridgeAction(_ execution: BridgeActionExecution, result: LauncherResult?) async {
        do {
            let response = try await bridge.perform(action: execution.action, result: execution.result)
            guard response.ok else {
                bridgeStatus = .degraded(response.message ?? "Bridge action failed.")
                return
            }

            recordSelection(for: result)

            if execution.refreshSnapshotAfterAction {
                await refreshBridgeNow()
            }

            if shouldHideAfterBridgeAction(kind: execution.action.kind) {
                hideRequest?()
            }
        } catch {
            bridgeStatus = .degraded(error.localizedDescription)
        }
    }

    private func refreshBridge(force: Bool) {
        guard force || bridgeSnapshot == nil || mode == .settings else {
            return
        }

        bridgeTask?.cancel()
        bridgeTask = Task { [weak self] in
            await self?.refreshBridgeNow()
        }
    }

    private func refreshBridgeNow() async {
        bridgeStatus = .loading

        do {
            let snapshot = try await bridge.bootstrap()
            guard !Task.isCancelled else {
                return
            }

            bridgeSnapshot = snapshot
            bridgeStatus = .ready
            await searchEngine.update(snapshot: snapshot)

            if !query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                performSearch()
            }
        } catch {
            bridgeStatus = .unavailable(error.localizedDescription)
            bridgeSnapshot = nil
            await searchEngine.update(snapshot: nil)
        }
    }

    private func recordSelection(for result: LauncherResult?) {
        guard let result else {
            return
        }

        if let snapshot = bridgeSnapshot {
            let nextSnapshot = snapshot.recordingSelection(
                itemID: result.id,
                itemType: result.itemType,
                query: query
            )
            bridgeSnapshot = nextSnapshot
            Task {
                await searchEngine.update(snapshot: nextSnapshot)
            }
        }

        Task {
            try? await bridge.recordSelection(
                itemID: result.id,
                itemType: result.itemType,
                query: query
            )
        }
    }

    private func shouldHideAfterBridgeAction(kind: String) -> Bool {
        switch kind {
        case "open-path", "open-url", "search-web", "launch-app", "reveal-in-folder", "open-in-terminal":
            true
        default:
            false
        }
    }

    private func updatePanelSize() {
        switch mode {
        case .settings:
            panelSize = Layout.settings
        case .actions:
            panelSize = Layout.actions
        case .search:
            let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
            if trimmed.isEmpty {
                panelSize = Layout.collapsed
            } else {
                let rowCount = max(1, min(results.count, 7))
                panelSize = CGSize(
                    width: Layout.collapsed.width,
                    height: Layout.collapsed.height + CGFloat(rowCount) * 74
                )
            }
        }
    }
}
