import AppKit
import SwiftUI

@MainActor
final class SettingsDetailWindowController: NSObject, NSWindowDelegate {
    private let bridge: MacShellBridge
    private let state = SettingsDetailState()
    private let window: LauncherChildWindow
    var returnToLauncher: ((SettingsSection) -> Void)?
    var snapshotDidChange: ((NativeShellSnapshot) -> Void)?

    init(bridge: MacShellBridge = MacShellBridge()) {
        self.bridge = bridge
        self.window = LauncherChildWindow(
            contentRect: NSRect(x: 0, y: 0, width: 940, height: 600),
            styleMask: [.titled, .closable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )

        super.init()

        let hostingView = NSHostingView(
            rootView: SettingsDetailWindowView(
                state: state,
                onSaveLanguage: saveLanguageSelection,
                onSaveSettings: saveCurrentSettings
            )
        )
        hostingView.translatesAutoresizingMaskIntoConstraints = false

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

        window.contentView = contentView
        window.delegate = self
        window.titleVisibility = .hidden
        window.titlebarAppearsTransparent = true
        window.isReleasedWhenClosed = false
        window.tabbingMode = .disallowed
        window.setFrameAutosaveName("PulseLauncherSettingsDetail")
        window.onEscape = { [weak self] in
            self?.window.performClose(nil)
        }
    }

    func show(
        section: SettingsSection,
        snapshot: NativeShellSnapshot?,
        bridgeStatus: NativeShellBridgeStatus
    ) {
        state.section = section
        state.snapshot = snapshot
        state.workingSettings = snapshot?.settings
        state.selectedLanguage = LauncherLanguagePreference.from(rawValue: snapshot?.settings.language)
        state.languageSaveMessage = nil
        state.languageSaveError = nil
        state.settingsSaveMessage = nil
        state.settingsSaveError = nil
        state.bridgeStatus = bridgeStatus
        window.title = section.detailTitle(in: resolveLauncherLocale(settings: snapshot?.settings))

        if let screen = NSScreen.main {
            let visible = screen.visibleFrame
            let origin = NSPoint(
                x: visible.midX - window.frame.width / 2,
                y: visible.midY - window.frame.height / 2
            )
            window.setFrameOrigin(origin)
        }

        NSApp.activate(ignoringOtherApps: true)
        window.makeKeyAndOrderFront(nil)
    }

    func windowWillClose(_ notification: Notification) {
        let section = state.section
        DispatchQueue.main.async { [weak self] in
            self?.returnToLauncher?(section)
        }
    }

    private func saveLanguageSelection() {
        let preference = state.selectedLanguage

        Task { [weak self] in
            guard let self else { return }

            await MainActor.run {
                self.state.isSavingLanguage = true
                self.state.languageSaveError = nil
                self.state.languageSaveMessage = nil
            }

            do {
                let snapshot = try await self.bridge.updateLanguage(preference.rawValue)
                let locale = resolveLauncherLocale(settings: snapshot.settings)

                await MainActor.run {
                    self.state.snapshot = snapshot
                    self.state.selectedLanguage = LauncherLanguagePreference.from(
                        rawValue: snapshot.settings.language
                    )
                    self.state.bridgeStatus = .ready
                    self.state.languageSaveMessage = localized(
                        "Language updated for the native shell.",
                        "原生壳层语言已更新。",
                        locale
                    )
                    self.state.isSavingLanguage = false
                    self.window.title = self.state.section.detailTitle(in: locale)
                    self.snapshotDidChange?(snapshot)
                }
            } catch {
                let locale = preference.resolvedLocale
                await MainActor.run {
                    self.state.bridgeStatus = .degraded(error.localizedDescription)
                    self.state.languageSaveError = localized(
                        "Unable to save language preference right now.",
                        "当前无法保存语言偏好。",
                        locale
                    )
                    self.state.isSavingLanguage = false
                }
            }
        }
    }

    private func saveCurrentSettings() {
        guard let settings = state.workingSettings else {
            return
        }

        Task { [weak self] in
            guard let self else { return }

            await MainActor.run {
                self.state.isSavingSettings = true
                self.state.settingsSaveError = nil
                self.state.settingsSaveMessage = nil
            }

            do {
                let snapshot = try await self.bridge.updateSettings(settings)
                let locale = resolveLauncherLocale(settings: snapshot.settings)

                await MainActor.run {
                    self.state.snapshot = snapshot
                    self.state.workingSettings = snapshot.settings
                    self.state.selectedLanguage = LauncherLanguagePreference.from(
                        rawValue: snapshot.settings.language
                    )
                    self.state.bridgeStatus = .ready
                    self.state.settingsSaveMessage = localized(
                        "Shared settings updated for the native shell.",
                        "原生壳层已更新共享设置。",
                        locale
                    )
                    self.state.isSavingSettings = false
                    self.snapshotDidChange?(snapshot)
                }
            } catch {
                let locale = resolveLauncherLocale(settings: self.state.workingSettings)
                await MainActor.run {
                    self.state.bridgeStatus = .degraded(error.localizedDescription)
                    self.state.settingsSaveError = localized(
                        "Unable to save settings right now.",
                        "当前无法保存设置。",
                        locale
                    )
                    self.state.isSavingSettings = false
                }
            }
        }
    }
}

@MainActor
private final class SettingsDetailState: ObservableObject {
    @Published var section: SettingsSection = .general
    @Published var snapshot: NativeShellSnapshot?
    @Published var workingSettings: BridgeLauncherSettings?
    @Published var bridgeStatus: NativeShellBridgeStatus = .loading
    @Published var selectedLanguage: LauncherLanguagePreference = .system
    @Published var isSavingLanguage = false
    @Published var isSavingSettings = false
    @Published var languageSaveMessage: String?
    @Published var languageSaveError: String?
    @Published var settingsSaveMessage: String?
    @Published var settingsSaveError: String?
}

private struct SettingsDetailWindowView: View {
    @ObservedObject var state: SettingsDetailState
    let onSaveLanguage: () -> Void
    let onSaveSettings: () -> Void

    private var locale: LauncherLocale {
        if state.isSavingLanguage {
            return state.selectedLanguage.resolvedLocale
        }
        return resolveLauncherLocale(settings: state.snapshot?.settings)
    }

    var body: some View {
        HStack(spacing: 22) {
            VStack(alignment: .leading, spacing: 16) {
                Text(state.section.detailTitle(in: locale))
                    .font(.system(size: 30, weight: .bold))
                    .foregroundStyle(Color(nsColor: .labelColor))

                Text(state.section.summary(in: locale))
                    .font(.system(size: 15))
                    .foregroundStyle(Color(nsColor: .secondaryLabelColor))

                VStack(spacing: 12) {
                    metaRow(title: localized("Command", "命令", locale), value: state.section.command)
                    metaRow(
                        title: localized("Bridge status", "桥接状态", locale),
                        value: state.bridgeStatus.title(in: locale)
                    )
                    metaRow(
                        title: localized("Current scope", "当前范围", locale),
                        value: state.section.detailStatus(in: locale)
                    )
                }

                Spacer()
            }
            .frame(width: 280, alignment: .topLeading)

            VStack(alignment: .leading, spacing: 16) {
                card {
                    VStack(alignment: .leading, spacing: 10) {
                        Text(localized("Overview", "概览", locale))
                            .font(.system(size: 18, weight: .semibold))
                            .foregroundStyle(Color(nsColor: .labelColor))
                        Text(state.section.introBody(in: locale))
                            .font(.system(size: 15))
                            .foregroundStyle(Color(nsColor: .labelColor))
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }

                if state.section == .general {
                    languageCard
                }

                if state.section != .general && state.section != .workflow {
                    editableSettingsCard
                }

                card {
                    VStack(alignment: .leading, spacing: 12) {
                        Text(localized("Live status", "实时状态", locale))
                            .font(.system(size: 18, weight: .semibold))
                            .foregroundStyle(Color(nsColor: .labelColor))

                        Text(state.bridgeStatus.detail(in: locale))
                            .font(.system(size: 14))
                            .foregroundStyle(Color(nsColor: .secondaryLabelColor))
                            .fixedSize(horizontal: false, vertical: true)

                        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                            ForEach(detailMetrics, id: \.title) { metric in
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(metric.title.uppercased())
                                        .font(.system(size: 11, weight: .semibold))
                                        .foregroundStyle(Color(nsColor: .tertiaryLabelColor))
                                    Text(metric.value)
                                        .font(.system(size: 15, weight: .semibold))
                                        .foregroundStyle(Color(nsColor: .labelColor))
                                    Text(metric.note)
                                        .font(.system(size: 12))
                                        .foregroundStyle(Color(nsColor: .secondaryLabelColor))
                                        .fixedSize(horizontal: false, vertical: true)
                                }
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(14)
                                .background(
                                    RoundedRectangle(cornerRadius: 18, style: .continuous)
                                        .fill(Color(nsColor: .controlBackgroundColor).opacity(0.62))
                                )
                            }
                        }
                    }
                }

                card {
                    VStack(alignment: .leading, spacing: 12) {
                        Text(localized("Next bridge work", "下一步桥接工作", locale))
                            .font(.system(size: 18, weight: .semibold))
                            .foregroundStyle(Color(nsColor: .labelColor))

                        ForEach(Array(state.section.detailHighlights(in: locale).enumerated()), id: \.offset) { _, item in
                            HStack(alignment: .top, spacing: 10) {
                                Circle()
                                    .fill(Color(nsColor: .controlAccentColor).opacity(0.9))
                                    .frame(width: 8, height: 8)
                                    .padding(.top, 5)
                                Text(item)
                                    .font(.system(size: 14))
                                    .foregroundStyle(Color(nsColor: .labelColor))
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                        }
                    }
                }

                Spacer()
            }
            .frame(maxWidth: .infinity, alignment: .topLeading)
        }
        .padding(28)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(
            ZStack {
                Rectangle()
                    .fill(.regularMaterial)
                Rectangle()
                    .fill(Color(nsColor: .windowBackgroundColor).opacity(0.16))
            }
        )
    }

    private var detailMetrics: [DetailMetric] {
        let snapshot = state.snapshot

        switch state.section {
        case .general:
            return [
                DetailMetric(
                    title: localized("Hotkey", "热键", locale),
                    value: snapshot?.settings.hotkey ?? "Alt+Space",
                    note: localized("Shared launcher hotkey configuration.", "共享启动器热键配置。", locale)
                ),
                DetailMetric(
                    title: localized("Theme mode", "主题模式", locale),
                    value: localizedTheme(snapshot?.settings.theme ?? "system", locale: locale),
                    note: localized("Current shared appearance preference.", "当前共享外观偏好。", locale)
                ),
                DetailMetric(
                    title: localized("Language", "语言", locale),
                    value: localizedLanguageName(snapshot?.settings.language, locale: locale),
                    note: localized("Controls the native shell language for key launcher and config surfaces.", "控制原生壳层在启动器和配置界面的主要语言。", locale)
                ),
                DetailMetric(
                    title: localized("Launch behavior", "启动行为", locale),
                    value: localized("Centered bar", "居中 Bar", locale),
                    note: localized("The native shell centers when collapsed and shifts upward as surfaces expand.", "折叠时原生壳层居中显示，展开结果面板后会向上移动。", locale)
                ),
                DetailMetric(
                    title: localized("Dismissal", "关闭方式", locale),
                    value: localized("Focus-loss hide", "失焦隐藏", locale),
                    note: localized("Outside clicks and focus changes dismiss the launcher.", "点击外部或窗口失焦时关闭启动器。", locale)
                )
            ]

        case .search:
            return [
                DetailMetric(
                    title: localized("Indexed files", "已索引文件", locale),
                    value: "\(snapshot?.indexedFileCount ?? 0)",
                    note: localized("Lightweight filename and path entries from the shared SQLite index.", "来自共享 SQLite 索引的轻量文件名和路径条目。", locale)
                ),
                DetailMetric(
                    title: localized("Result limit", "结果上限", locale),
                    value: "\(snapshot?.settings.search.maxResults ?? 0)",
                    note: localized("Shared max-results setting for ranked output.", "共享排序输出的最大结果数。", locale)
                ),
                DetailMetric(
                    title: localized("Index roots", "索引根目录", locale),
                    value: "\(snapshot?.settings.indexPaths.count ?? 0)",
                    note: localized("Configured directories for filename and path indexing.", "配置为文件名和路径索引的目录。", locale)
                ),
                DetailMetric(
                    title: localized("Usage boost", "使用加权", locale),
                    value: (snapshot?.usageStats.isEmpty == false)
                        ? localized("Active", "已启用", locale)
                        : localized("Collecting", "采集中", locale),
                    note: localized("Historical selections are boosting result order in the native shell.", "历史选择正在提升原生壳层里的结果排序。", locale)
                )
            ]

        case .clipboard:
            return [
                DetailMetric(
                    title: localized("Stored clips", "已存片段", locale),
                    value: "\(snapshot?.clipboardItems.count ?? 0)",
                    note: localized("Local clipboard entries currently visible to search.", "当前可参与搜索的本地剪贴板条目。", locale)
                ),
                DetailMetric(
                    title: localized("Pinned clips", "置顶条目", locale),
                    value: "\(snapshot?.clipboardItems.filter(\.pinned).count ?? 0)",
                    note: localized("Pinned clipboard items remain at the top of history.", "置顶的剪贴板项目会保留在历史顶部。", locale)
                ),
                DetailMetric(
                    title: localized("Retention limit", "保留上限", locale),
                    value: "\(snapshot?.settings.clipboard.maxItems ?? 0)",
                    note: localized("Maximum number of local clipboard items to keep.", "本地保留的剪贴板项目上限。", locale)
                ),
                DetailMetric(
                    title: localized("Private apps", "隐私应用", locale),
                    value: "\(snapshot?.settings.clipboard.privateApps.count ?? 0)",
                    note: localized("Privacy exclusion scaffolding for sensitive applications.", "为敏感应用准备的隐私排除配置。", locale)
                )
            ]

        case .snippets:
            return [
                DetailMetric(
                    title: localized("Saved snippets", "已保存片段", locale),
                    value: "\(snapshot?.snippets.count ?? 0)",
                    note: localized("Locally stored snippets available to search and actions.", "本地保存的片段，可参与搜索和动作执行。", locale)
                ),
                DetailMetric(
                    title: localized("Search visibility", "搜索可见性", locale),
                    value: snapshot?.settings.snippets.enabledInSearch == true
                        ? localized("Enabled", "开启", locale)
                        : localized("Disabled", "关闭", locale),
                    note: localized("Controls whether snippets surface in launcher results.", "控制片段是否出现在启动器搜索结果中。", locale)
                ),
                DetailMetric(
                    title: localized("Expansion hooks", "扩展挂钩", locale),
                    value: snapshot?.settings.snippets.enableExpansionHooks == true
                        ? localized("Planned", "计划中", locale)
                        : localized("Off", "关闭", locale),
                    note: localized("Native global text expansion is still roadmap work.", "原生全局文本扩展仍然在路线图里。", locale)
                ),
                DetailMetric(
                    title: localized("Variable support", "变量支持", locale),
                    value: localized("Date, time, clipboard, UUID", "日期、时间、剪贴板、UUID", locale),
                    note: localized("Current expansion variables already run through the shared Rust action layer.", "当前变量展开已经通过共享 Rust 动作层执行。", locale)
                )
            ]

        case .plugins:
            return [
                DetailMetric(
                    title: localized("Discovered", "已发现", locale),
                    value: "\(snapshot?.plugins.count ?? 0)",
                    note: localized("Plugin manifests discovered for the shared host.", "为共享宿主发现的插件清单。", locale)
                ),
                DetailMetric(
                    title: localized("Disabled", "已禁用", locale),
                    value: "\(snapshot?.settings.plugins.disabledPluginIds.count ?? 0)",
                    note: localized("Plugins currently disabled by shared settings.", "当前被共享设置禁用的插件。", locale)
                ),
                DetailMetric(
                    title: localized("Timeout", "超时", locale),
                    value: "\(snapshot?.settings.plugins.timeoutMs ?? 0) ms",
                    note: localized("Shared timeout applied around plugin work.", "插件工作所应用的共享超时设置。", locale)
                ),
                DetailMetric(
                    title: localized("Granted perms", "已授权权限", locale),
                    value: "\(grantedPermissionCount)",
                    note: localized("Explicitly granted plugin permissions stored locally.", "显式授权并本地存储的插件权限。", locale)
                )
            ]

        case .appearance:
            return [
                DetailMetric(
                    title: localized("Density", "密度", locale),
                    value: snapshot?.settings.appearance.denseMode == true
                        ? localized("Compact", "紧凑", locale)
                        : localized("Comfortable", "舒适", locale),
                    note: localized("Shared appearance setting carried into the native shell.", "共享外观设置已经带入原生壳层。", locale)
                ),
                DetailMetric(
                    title: localized("Motion", "动效", locale),
                    value: snapshot?.settings.appearance.reduceMotion == true
                        ? localized("Reduced", "减少", locale)
                        : localized("Standard", "标准", locale),
                    note: localized("Whether to reduce motion across launcher transitions.", "是否减少启动器切换时的动效。", locale)
                ),
                DetailMetric(
                    title: localized("Rendering", "渲染", locale),
                    value: "SwiftUI + AppKit",
                    note: localized("Native shell presentation instead of CSS-based glass simulation.", "使用原生壳层呈现，而不是基于 CSS 的玻璃模拟。", locale)
                ),
                DetailMetric(
                    title: localized("Typography", "排版", locale),
                    value: localized("Semantic system fonts", "系统语义字体", locale),
                    note: localized("Legibility stays tied to macOS semantic color and type behavior.", "可读性继续依赖 macOS 的语义色和字体行为。", locale)
                )
            ]

        case .workflow:
            return [
                DetailMetric(
                    title: localized("Surface", "界面形态", locale),
                    value: localized("Dedicated window", "独立窗口", locale),
                    note: localized("Workflow authoring stays separate from the launcher bar.", "工作流编辑继续与启动栏分离。", locale)
                ),
                DetailMetric(
                    title: localized("Runtime", "运行时", locale),
                    value: localized("Planned", "计划中", locale),
                    note: localized("Execution graph and node runtime remain future bridge work.", "执行图和节点 runtime 仍然是后续 bridge 工作。", locale)
                ),
                DetailMetric(
                    title: localized("Shared assets", "共享资源", locale),
                    value: locale == .chineseSimplified
                        ? "\(snapshot?.snippets.count ?? 0) 个片段 • \(snapshot?.plugins.count ?? 0) 个插件"
                        : "\(snapshot?.snippets.count ?? 0) snippets • \(snapshot?.plugins.count ?? 0) plugins",
                    note: localized("Workflow will eventually compose existing local-first capabilities.", "工作流后续会组合现有的 local-first 能力。", locale)
                ),
                DetailMetric(
                    title: localized("Storage", "存储", locale),
                    value: localized("Local-first", "本地优先", locale),
                    note: localized("Future workflow definitions should remain local and permission-aware.", "后续工作流定义应该继续保持本地化和权限感知。", locale)
                )
            ]
        }
    }

    private var grantedPermissionCount: Int {
        state.snapshot?.settings.plugins.grantedPermissions.values.reduce(0) { partial, permissions in
            partial + permissions.count
        } ?? 0
    }

    private func metaRow(title: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title.uppercased())
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(Color(nsColor: .tertiaryLabelColor))
            Text(value)
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(Color(nsColor: .labelColor))
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(Color(nsColor: .controlBackgroundColor).opacity(0.62))
        )
    }

    private var languageCard: some View {
        card {
            VStack(alignment: .leading, spacing: 12) {
                Text(localized("Language", "语言", locale))
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(Color(nsColor: .labelColor))

                Text(
                    localized(
                        "Choose how the native macOS shell presents the launcher and config surfaces.",
                        "选择原生 macOS 壳层在启动器和配置界面中的显示语言。",
                        locale
                    )
                )
                .font(.system(size: 14))
                .foregroundStyle(Color(nsColor: .secondaryLabelColor))
                .fixedSize(horizontal: false, vertical: true)

                Picker("", selection: $state.selectedLanguage) {
                    ForEach(LauncherLanguagePreference.allCases) { option in
                        Text(option.label(in: locale)).tag(option)
                    }
                }
                .pickerStyle(.segmented)

                HStack {
                    if let message = state.languageSaveMessage {
                        Text(message)
                            .font(.system(size: 12))
                            .foregroundStyle(Color(nsColor: .secondaryLabelColor))
                    } else if let error = state.languageSaveError {
                        Text(error)
                            .font(.system(size: 12))
                            .foregroundStyle(Color(nsColor: .systemRed))
                    } else {
                        Text(
                            localized(
                                "Search bar copy, config labels, and workflow chrome switch with this setting.",
                                "搜索栏文案、配置标签和工作流界面会跟随这个设置切换。",
                                locale
                            )
                        )
                        .font(.system(size: 12))
                        .foregroundStyle(Color(nsColor: .secondaryLabelColor))
                    }

                    Spacer()

                    Button(
                        state.isSavingLanguage
                            ? localized("Saving...", "保存中...", locale)
                            : localized("Save language", "保存语言", locale)
                    ) {
                        onSaveLanguage()
                    }
                    .disabled(
                        state.isSavingLanguage
                            || state.selectedLanguage.rawValue
                                == LauncherLanguagePreference.from(
                                    rawValue: state.snapshot?.settings.language
                                ).rawValue
                    )
                }
            }
        }
    }

    private func card<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        content()
            .padding(20)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                ZStack {
                    RoundedRectangle(cornerRadius: 24, style: .continuous)
                        .fill(.thickMaterial)
                    RoundedRectangle(cornerRadius: 24, style: .continuous)
                        .fill(Color(nsColor: .windowBackgroundColor).opacity(0.12))
                }
            )
            .overlay(
                RoundedRectangle(cornerRadius: 24, style: .continuous)
                    .stroke(Color(nsColor: .separatorColor).opacity(0.5), lineWidth: 1)
            )
    }
}

private struct DetailMetric {
    let title: String
    let value: String
    let note: String
}
