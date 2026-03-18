import Foundation

enum LauncherLocale: Sendable {
    case english
    case chineseSimplified
}

enum LauncherLanguagePreference: String, CaseIterable, Identifiable, Sendable {
    case system = "system"
    case englishUS = "en-US"
    case chineseSimplified = "zh-CN"

    var id: String { rawValue }

    static func from(rawValue: String?) -> LauncherLanguagePreference {
        switch rawValue?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
        case "zh-cn", "zh":
            .chineseSimplified
        case "en-us", "en":
            .englishUS
        default:
            .system
        }
    }

    var resolvedLocale: LauncherLocale {
        switch self {
        case .system:
            let preferred = Locale.preferredLanguages.first?.lowercased() ?? "en"
            return preferred.hasPrefix("zh") ? .chineseSimplified : .english
        case .englishUS:
            return .english
        case .chineseSimplified:
            return .chineseSimplified
        }
    }

    func label(in locale: LauncherLocale) -> String {
        switch self {
        case .system:
            return localized("Follow System", "跟随系统", locale)
        case .englishUS:
            return localized("English", "英文", locale)
        case .chineseSimplified:
            return localized("Simplified Chinese", "简体中文", locale)
        }
    }
}

func resolveLauncherLocale(settings: BridgeLauncherSettings?) -> LauncherLocale {
    LauncherLanguagePreference.from(rawValue: settings?.language).resolvedLocale
}

func localized(_ english: String, _ chinese: String, _ locale: LauncherLocale) -> String {
    switch locale {
    case .english:
        return english
    case .chineseSimplified:
        return chinese
    }
}

func localizedTheme(_ theme: String, locale: LauncherLocale) -> String {
    switch theme.lowercased() {
    case "light":
        return localized("Light", "浅色", locale)
    case "dark":
        return localized("Dark", "深色", locale)
    default:
        return localized("System", "跟随系统", locale)
    }
}

func localizedLanguageName(_ rawValue: String?, locale: LauncherLocale) -> String {
    LauncherLanguagePreference.from(rawValue: rawValue).label(in: locale)
}

func localizedActionTitle(_ title: String, locale: LauncherLocale) -> String {
    switch title.lowercased() {
    case "open":
        return localized("Open", "打开", locale)
    case "reveal in finder", "reveal in folder":
        return localized("Reveal in Finder", "在访达中显示", locale)
    case "copy path":
        return localized("Copy path", "复制路径", locale)
    case "open in terminal":
        return localized("Open in terminal", "在终端中打开", locale)
    case "search on web", "open search":
        return localized("Search on web", "在网页中搜索", locale)
    case "copy again":
        return localized("Copy again", "再次复制", locale)
    case "paste item":
        return localized("Paste item", "粘贴条目", locale)
    case "pin item":
        return localized("Pin item", "置顶条目", locale)
    case "unpin item":
        return localized("Unpin item", "取消置顶", locale)
    case "delete item":
        return localized("Delete item", "删除条目", locale)
    case "clear clipboard history":
        return localized("Clear clipboard history", "清空剪贴板历史", locale)
    case "expand snippet":
        return localized("Expand snippet", "展开片段", locale)
    case "copy template":
        return localized("Copy template", "复制模板", locale)
    case "paste template":
        return localized("Paste template", "粘贴模板", locale)
    case "open plugins settings":
        return localized("Open Plugins settings", "打开插件设置", locale)
    case "copy plugin id":
        return localized("Copy plugin id", "复制插件 ID", locale)
    default:
        return title
    }
}

extension LauncherSource {
    func label(in locale: LauncherLocale) -> String {
        switch self {
        case .apps:
            return localized("Apps", "应用", locale)
        case .files:
            return localized("Files", "文件", locale)
        case .clipboard:
            return localized("Clipboard", "剪贴板", locale)
        case .snippets:
            return localized("Snippets", "片段", locale)
        case .plugins:
            return localized("Plugins", "插件", locale)
        case .web:
            return localized("Web", "网页", locale)
        case .system:
            return localized("System", "系统", locale)
        }
    }
}
