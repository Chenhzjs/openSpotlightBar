import Foundation

enum LauncherMode: Sendable {
    case search
    case actions
    case settings
}

enum LauncherSource: String, Sendable {
    case apps = "Apps"
    case files = "Files"
    case clipboard = "Clipboard"
    case snippets = "Snippets"
    case plugins = "Plugins"
    case web = "Web"
    case system = "System"
}

enum SettingsSection: String, CaseIterable, Identifiable, Sendable {
    case general
    case search
    case clipboard
    case snippets
    case plugins
    case appearance
    case workflow

    var id: String { rawValue }

    static var hubSections: [SettingsSection] {
        [.general, .search, .clipboard, .snippets, .plugins, .appearance, .workflow]
    }

    var title: String {
        title(in: .english)
    }

    func title(in locale: LauncherLocale) -> String {
        switch self {
        case .general:
            return localized("General", "通用", locale)
        case .search:
            return localized("Search", "搜索", locale)
        case .clipboard:
            return localized("Clipboard", "剪贴板", locale)
        case .snippets:
            return localized("Snippets", "片段", locale)
        case .plugins:
            return localized("Plugins", "插件", locale)
        case .appearance:
            return localized("Appearance", "外观", locale)
        case .workflow:
            return localized("Workflow", "工作流", locale)
        }
    }

    var command: String {
        "/config \(rawValue)"
    }

    var summary: String {
        summary(in: .english)
    }

    func summary(in locale: LauncherLocale) -> String {
        switch self {
        case .general:
            return localized("Hotkey, default behaviors, and native launcher shell preferences.", "热键、默认行为和原生启动器壳层偏好。", locale)
        case .search:
            return localized("Provider weighting, file indexing, and usage-aware result ordering.", "Provider 权重、文件索引和基于使用习惯的排序。", locale)
        case .clipboard:
            return localized("Clipboard history visibility, privacy exclusions, and capture retention.", "剪贴板历史可见性、隐私排除和保留策略。", locale)
        case .snippets:
            return localized("Snippet search, variables, and future text expansion hooks.", "片段搜索、变量和后续文本扩展挂钩。", locale)
        case .workflow:
            return localized("Standalone workflow editor and command routing surface.", "独立工作流编辑器和命令路由入口。", locale)
        case .plugins:
            return localized("Plugin host permissions and runtime status bridge.", "插件宿主权限和运行状态桥接。", locale)
        case .appearance:
            return localized("Native macOS presentation and compact density preferences.", "原生 macOS 呈现和紧凑密度偏好。", locale)
        }
    }

    var introTitle: String {
        introTitle(in: .english)
    }

    func introTitle(in locale: LauncherLocale) -> String {
        switch self {
        case .general:
            return localized("General Settings", "通用设置", locale)
        case .search:
            return localized("Search Settings", "搜索设置", locale)
        case .clipboard:
            return localized("Clipboard Settings", "剪贴板设置", locale)
        case .snippets:
            return localized("Snippet Settings", "片段设置", locale)
        case .workflow:
            return localized("Workflow Studio", "工作流工作台", locale)
        case .plugins:
            return localized("Plugin Settings", "插件设置", locale)
        case .appearance:
            return localized("Appearance Settings", "外观设置", locale)
        }
    }

    var introBody: String {
        introBody(in: .english)
    }

    func introBody(in locale: LauncherLocale) -> String {
        switch self {
        case .general:
            return localized("Configure launcher-wide behavior such as hotkeys, presentation defaults, and how the native shell should behave when shown or dismissed.", "配置启动器级别的行为，比如热键、默认呈现方式，以及原生壳层显示和关闭时的行为。", locale)
        case .search:
            return localized("Control how providers participate in ranking, how indexed files surface in results, and how local sources share usage-aware ordering.", "控制各个 provider 如何参与排序、索引文件如何出现在结果里，以及本地数据源如何共享使用习惯排序。", locale)
        case .clipboard:
            return localized("Tune local clipboard retention, privacy exclusions, and the behavior of repeat-copy and paste-hook actions that come through the shared Rust layer.", "调整本地剪贴板保留、隐私排除，以及通过共享 Rust 层执行的再次复制和粘贴挂钩行为。", locale)
        case .snippets:
            return localized("Manage local snippets, variable expansion, and how snippet results surface in search before native global text expansion hooks are added.", "管理本地片段、变量展开，以及在原生全局文本扩展挂钩补齐前，片段结果如何出现在搜索里。", locale)
        case .workflow:
            return localized("Open the dedicated workflow window for composing higher-level actions instead of overloading the launcher bar with editor UI.", "打开独立的工作流窗口来组织更高层级的动作，而不是把编辑器 UI 塞进启动栏。", locale)
        case .plugins:
            return localized("Inspect plugin runtime state, permission grants, and future approval flows once the shared plugin host is bridged into the native host.", "查看插件运行状态、权限授权，以及共享插件宿主桥接进原生壳层后的后续审批流程。", locale)
        case .appearance:
            return localized("Tune density, visual hierarchy, and material treatment in the native SwiftUI shell instead of relying on web styling.", "在原生 SwiftUI 壳层中调整密度、视觉层级和材质处理，而不是依赖 Web 样式。", locale)
        }
    }

    var detailTitle: String {
        detailTitle(in: .english)
    }

    func detailTitle(in locale: LauncherLocale) -> String {
        switch self {
        case .general:
            return localized("Launcher Preferences", "启动器偏好", locale)
        case .search:
            return localized("Search Configuration", "搜索配置", locale)
        case .clipboard:
            return localized("Clipboard Control", "剪贴板控制", locale)
        case .snippets:
            return localized("Snippet Library", "片段库", locale)
        case .workflow:
            return localized("Workflow Studio", "工作流工作台", locale)
        case .plugins:
            return localized("Plugin Control Center", "插件控制中心", locale)
        case .appearance:
            return localized("Appearance Tuning", "外观调校", locale)
        }
    }

    var detailHighlights: [String] {
        detailHighlights(in: .english)
    }

    func detailHighlights(in locale: LauncherLocale) -> [String] {
        switch self {
        case .general:
            [
                localized("Hotkey recorder should live here once the native shortcut capture UI is added.", "原生快捷键录制 UI 补齐后，热键录制器应该放在这里。", locale),
                localized("Show/hide behavior, centering rules, and dismissal policy belong to this window.", "显示/隐藏行为、居中规则和关闭策略都应该归到这个窗口。", locale),
                localized("Keep macOS-native shell preferences separate from cross-platform search logic.", "把 macOS 原生壳层偏好和跨平台搜索逻辑分开。", locale)
            ]
        case .search:
            [
                localized("Bridge the Rust-backed file index, usage ranking, clipboard, and snippets into this host without duplicating business logic in Swift.", "把 Rust 支撑的文件索引、使用排序、剪贴板和片段桥接进这个壳层，而不是在 Swift 里重复业务逻辑。", locale),
                localized("Expose provider weighting and source toggles without leaking platform logic into the UI.", "暴露 provider 权重和数据源开关，但不要把平台逻辑泄露到 UI 里。", locale),
                localized("Keep ranking modular so the macOS shell can reuse the shared search behavior over time.", "保持排序模块化，让 macOS 壳层后续可以持续复用共享搜索行为。", locale)
            ]
        case .clipboard:
            [
                localized("Clipboard history stays local-first and should show privacy exclusions clearly.", "剪贴板历史保持 local-first，并且要清楚展示隐私排除。", locale),
                localized("Pin, delete, and clear actions already route through the shared Rust action layer.", "置顶、删除和清空动作已经通过共享 Rust 动作层执行。", locale),
                localized("Platform-specific watcher improvements remain TODO and should stay behind the bridge boundary.", "平台级 watcher 的加强仍然是 TODO，并且应该放在 bridge 边界之后。", locale)
            ]
        case .snippets:
            [
                localized("Snippets are already persisted locally and searchable through the shared data layer.", "片段已经本地持久化，并能通过共享数据层参与搜索。", locale),
                localized("Variable expansion should stay centralized in the Rust action path so results behave the same across shells.", "变量展开应该继续集中在 Rust 动作路径里，保证各个壳层行为一致。", locale),
                localized("Global text expansion hooks remain future OS integration work and should stay marked as planned.", "全局文本扩展挂钩仍然是后续 OS 集成工作，应该继续明确标注为计划中。", locale)
            ]
        case .workflow:
            [
                localized("Workflow editing stays in its own window to keep the launcher bar minimal.", "工作流编辑继续放在独立窗口里，保持启动栏足够简洁。", locale),
                localized("The current workflow window is a native shell for the upcoming runtime bridge.", "当前的工作流窗口是后续 runtime bridge 的原生壳层基础。", locale),
                localized("Longer term this should reuse local-first persistence and permission checks.", "更长期看，这里应该复用 local-first 持久化和权限校验。", locale)
            ]
        case .plugins:
            [
                localized("Permission grants and disabled-state management should surface here.", "权限授权和禁用状态管理应该在这里展示。", locale),
                localized("Current plugin workers still live in the shared desktop stack.", "当前插件 worker 仍然主要运行在共享 desktop 栈里。", locale),
                localized("Future hardening should tighten the boundary between plugin execution and host capabilities.", "后续加固应该进一步收紧插件执行和宿主能力之间的边界。", locale)
            ]
        case .appearance:
            [
                localized("Color, density, and material tuning should happen in SwiftUI/AppKit.", "颜色、密度和材质调校应该放在 SwiftUI/AppKit 层做。", locale),
                localized("The launcher should stay legible across light and dark desktop content.", "无论桌面背景浅色还是深色，启动器都应该保持可读。", locale),
                localized("Result density and focus treatment can be adjusted here without affecting search behavior.", "这里可以调整结果密度和焦点表现，而不影响搜索逻辑。", locale)
            ]
        }
    }

    var detailStatus: String {
        detailStatus(in: .english)
    }

    func detailStatus(in locale: LauncherLocale) -> String {
        switch self {
        case .general:
            return localized("Current scope: native shell presentation, focus-loss hiding, and hotkey entry point.", "当前范围：原生壳层呈现、失焦隐藏和热键入口。", locale)
        case .search:
            return localized("Current scope: native app search, Rust-backed file search, and usage-aware ordering.", "当前范围：原生应用搜索、Rust 支撑的文件搜索和基于使用习惯的排序。", locale)
        case .clipboard:
            return localized("Current scope: local clipboard history summary plus shared copy, pin, delete, and clear actions.", "当前范围：本地剪贴板历史概览，以及共享的复制、置顶、删除和清空动作。", locale)
        case .snippets:
            return localized("Current scope: local snippet inventory plus shared expand action.", "当前范围：本地片段清单和共享的展开动作。", locale)
        case .workflow:
            return localized("Current scope: dedicated native workflow window scaffold.", "当前范围：独立原生工作流窗口骨架。", locale)
        case .plugins:
            return localized("Current scope: plugin runtime still lives in the shared Tauri desktop path.", "当前范围：插件 runtime 仍然主要运行在共享 Tauri desktop 路径中。", locale)
        case .appearance:
            return localized("Current scope: native material, semantic color, and compact launcher layout.", "当前范围：原生材质、语义色和紧凑的启动器布局。", locale)
        }
    }
}

enum LauncherActionPayload: Equatable, Sendable {
    case openApplication(URL)
    case revealInFinder(URL)
    case openURL(URL)
    case showSettings(SettingsSection)
    case openWorkflowStudio
    case bridgeAction(BridgeActionExecution)
}

struct LauncherAction: Identifiable, Equatable, Sendable {
    let id: String
    let title: String
    let subtitle: String?
    let payload: LauncherActionPayload
}

struct LauncherResult: Identifiable, Equatable, Sendable {
    let id: String
    let title: String
    let subtitle: String
    let itemType: String
    let source: LauncherSource
    let score: Double
    let actions: [LauncherAction]
}

struct InstalledApp: Hashable, Sendable {
    let id: String
    let name: String
    let url: URL
}
