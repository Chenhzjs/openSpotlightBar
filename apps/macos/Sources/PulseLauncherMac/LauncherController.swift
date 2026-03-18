import AppKit
import Combine
import SwiftUI

@MainActor
final class LauncherController: NSObject, NSWindowDelegate {
    private let bridge = MacShellBridge()
    let viewModel: LauncherViewModel

    private let panel: LauncherPanel
    private let settingsController = SettingsDetailWindowController()
    private let workflowController = WorkflowStudioController()
    private var eventMonitor: Any?
    private var sizeObserver: AnyCancellable?

    override init() {
        let searchEngine = MacSearchEngine(catalog: AppCatalogService(), bridge: bridge)
        self.viewModel = LauncherViewModel(searchEngine: searchEngine, bridge: bridge)
        self.panel = LauncherPanel(
            contentRect: NSRect(x: 0, y: 0, width: 860, height: 96),
            styleMask: [.borderless],
            backing: .buffered,
            defer: false
        )

        super.init()

        let hostingView = NSHostingView(
            rootView: LauncherRootView(viewModel: viewModel)
        )
        hostingView.translatesAutoresizingMaskIntoConstraints = false
        hostingView.wantsLayer = true
        hostingView.layer?.backgroundColor = NSColor.clear.cgColor

        let contentView = NSView()
        contentView.wantsLayer = true
        contentView.layer?.backgroundColor = NSColor.clear.cgColor
        contentView.addSubview(hostingView)

        NSLayoutConstraint.activate([
            hostingView.leadingAnchor.constraint(equalTo: contentView.leadingAnchor),
            hostingView.trailingAnchor.constraint(equalTo: contentView.trailingAnchor),
            hostingView.topAnchor.constraint(equalTo: contentView.topAnchor),
            hostingView.bottomAnchor.constraint(equalTo: contentView.bottomAnchor)
        ])

        panel.contentView = contentView
        panel.delegate = self
        panel.isReleasedWhenClosed = false
        panel.backgroundColor = .clear
        panel.isOpaque = false
        panel.hasShadow = true
        panel.level = .statusBar
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .transient]
        panel.hidesOnDeactivate = true

        sizeObserver = viewModel.$panelSize
            .receive(on: RunLoop.main)
            .sink { [weak self] size in
                self?.resize(to: size)
            }

        eventMonitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
            guard let self, self.panel.isVisible else {
                return event
            }

            return self.viewModel.handle(keyEvent: event) ? nil : event
        }

        viewModel.hideRequest = { [weak self] in
            self?.hide()
        }
        viewModel.openSectionRequest = { [weak self] section in
            self?.showSectionWindow(for: section)
        }
        settingsController.returnToLauncher = { [weak self] section in
            self?.showSettingsHub(section: section)
        }
        settingsController.snapshotDidChange = { [weak self] snapshot in
            self?.viewModel.applyBridgeSnapshot(snapshot)
        }
        workflowController.returnToLauncher = { [weak self] in
            self?.showSettingsHub(section: .workflow)
        }
    }

    func toggle() {
        if panel.isVisible {
            hide()
        } else {
            show()
        }
    }

    func show() {
        presentLauncher()
    }

    func hide() {
        panel.orderOut(nil)
        viewModel.dismissTransientPanels()
    }

    func windowDidResignKey(_ notification: Notification) {
        hide()
    }

    private func resize(to size: CGSize) {
        let frame = panelFrame(for: size)

        NSAnimationContext.runAnimationGroup { context in
            context.duration = 0.16
            context.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
            panel.animator().setFrame(frame, display: true)
        }
    }

    private func positionPanel(size: CGSize) {
        panel.setFrame(panelFrame(for: size), display: true)
    }

    private func showSectionWindow(for section: SettingsSection) {
        hide()
        if section == .workflow {
            workflowController.show(
                snapshot: viewModel.bridgeSnapshot,
                bridgeStatus: viewModel.bridgeStatus
            )
        } else {
            settingsController.show(
                section: section,
                snapshot: viewModel.bridgeSnapshot,
                bridgeStatus: viewModel.bridgeStatus
            )
        }
    }

    private func showSettingsHub(section: SettingsSection) {
        viewModel.restoreSettingsHub(section: section)
        presentLauncher()
    }

    private func presentLauncher() {
        positionPanel(size: viewModel.panelSize)
        NSApp.activate(ignoringOtherApps: true)
        panel.orderFrontRegardless()
        panel.makeKey()
        viewModel.activate()
    }

    private func panelFrame(for size: CGSize) -> NSRect {
        guard let screen = panel.screen ?? NSScreen.main else {
            return NSRect(origin: .zero, size: size)
        }

        let frame = screen.visibleFrame
        let centeredY = frame.midY - size.height / 2
        let upwardShift = min(max(size.height - 96, 0) * 0.52, 176)
        let targetY = min(
            centeredY + upwardShift,
            frame.maxY - size.height - 72
        )

        return NSRect(
            x: frame.midX - size.width / 2,
            y: max(frame.minY + 48, targetY),
            width: size.width,
            height: size.height
        )
    }
}

final class LauncherPanel: NSPanel {
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { true }
}
