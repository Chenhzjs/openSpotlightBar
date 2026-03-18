import Foundation
import Testing
@testable import PulseLauncherMac

@MainActor
struct LauncherViewModelTests {
    @Test func restoreSettingsHubReturnsToConfigParentSurface() async throws {
        let bridge = MacShellBridge()
        let searchEngine = MacSearchEngine(catalog: AppCatalogService(), bridge: bridge)
        let viewModel = LauncherViewModel(searchEngine: searchEngine, bridge: bridge)

        viewModel.selectedActionIndex = 2
        viewModel.restoreSettingsHub(section: .plugins)

        #expect(viewModel.mode == .settings)
        #expect(viewModel.activeSettingsSection == .plugins)
        #expect(viewModel.selectedActionIndex == 0)
        #expect(viewModel.panelSize == CGSize(width: 980, height: 620))
    }
}
