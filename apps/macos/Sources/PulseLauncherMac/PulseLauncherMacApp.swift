import AppKit
import Carbon
import SwiftUI

@main
struct PulseLauncherMacApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

    var body: some Scene {
        Settings {
            EmptyView()
        }
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    private var launcherController: LauncherController?
    private var hotKeyManager: GlobalHotKeyManager?

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)

        let controller = LauncherController()
        let hotKeyManager = GlobalHotKeyManager(
            keyCode: UInt32(kVK_Space),
            modifiers: UInt32(optionKey)
        ) { [weak controller] in
            Task { @MainActor in
                controller?.toggle()
            }
        }

        self.launcherController = controller
        self.hotKeyManager = hotKeyManager

        hotKeyManager.register()
    }

    func applicationWillTerminate(_ notification: Notification) {
        hotKeyManager?.unregister()
    }
}
