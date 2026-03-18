import AppKit

final class LauncherChildWindow: NSWindow {
    var onEscape: (() -> Void)?

    override func sendEvent(_ event: NSEvent) {
        if event.type == .keyDown, event.keyCode == 53 {
            onEscape?()
            return
        }

        super.sendEvent(event)
    }
}
