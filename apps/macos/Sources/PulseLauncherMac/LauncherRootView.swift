import AppKit
import SwiftUI

struct LauncherRootView: View {
    @ObservedObject var viewModel: LauncherViewModel

    private var locale: LauncherLocale {
        resolveLauncherLocale(settings: viewModel.bridgeSnapshot?.settings)
    }

    var body: some View {
        VStack(spacing: 12) {
            SearchBarView(
                text: Binding(
                    get: { viewModel.query },
                    set: { viewModel.updateQuery($0) }
                ),
                focusNonce: viewModel.focusNonce,
                placeholder: localized("Search or type /config", "搜索内容或输入 /config", locale)
            )

            switch viewModel.mode {
            case .settings:
                SettingsPanelView(
                    activeSection: viewModel.activeSettingsSection,
                    snapshot: viewModel.bridgeSnapshot,
                    bridgeStatus: viewModel.bridgeStatus,
                    locale: locale,
                    onSelectSection: { viewModel.openSettings($0) },
                    onClose: { viewModel.closeSettings() }
                )
            case .actions:
                if let result = viewModel.selectedResult {
                    ActionPanelView(
                        result: result,
                        selectedIndex: viewModel.selectedActionIndex,
                        locale: locale,
                        onHover: { viewModel.selectAction(at: $0) },
                        onTap: { _ in viewModel.executeSelectedAction() },
                        onClose: { viewModel.dismissTransientPanels() }
                    )
                }
            case .search:
                if !viewModel.query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    ResultListView(
                        results: viewModel.results,
                        selectedIndex: viewModel.selectedIndex,
                        locale: locale,
                        onHover: { viewModel.selectResult(at: $0) },
                        onTap: { _ in viewModel.executePrimarySelection() },
                        emptyStateText: viewModel.bridgeStatus.isConnected
                            ? localized(
                                "No matching results. Try apps, files, snippets, clipboard, plugins, or /config.",
                                "没有匹配结果。试试搜索应用、文件、片段、剪贴板、插件，或者输入 /config。",
                                locale
                            )
                            : localized(
                                "No matching results. Shared services are still connecting, so only the local shell results may appear.",
                                "没有匹配结果。共享服务仍在连接中，所以当前可能只会显示本地壳层结果。",
                                locale
                            )
                    )
                }
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(Color.clear)
    }
}

private struct SearchBarView: View {
    @Binding var text: String
    let focusNonce: Int
    let placeholder: String

    var body: some View {
        HStack(spacing: 16) {
            ZStack {
                Circle()
                    .fill(
                        Color(nsColor: .controlBackgroundColor)
                            .opacity(0.9)
                    )
                Circle()
                    .strokeBorder(Color.launcherStroke.opacity(0.6), lineWidth: 1)
                Image(systemName: "command")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(Color.launcherPrimary)
            }
            .frame(width: 48, height: 48)

            NativeSearchField(text: $text, focusNonce: focusNonce, placeholder: placeholder)
                .frame(height: 40)
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 16)
        .background(MaterialCard(cornerRadius: 28))
        .shadow(color: .black.opacity(0.08), radius: 24, y: 8)
    }
}

private struct ResultListView: View {
    let results: [LauncherResult]
    let selectedIndex: Int
    let locale: LauncherLocale
    let onHover: (Int) -> Void
    let onTap: (Int) -> Void
    let emptyStateText: String

    var body: some View {
        VStack(spacing: 10) {
            if results.isEmpty {
                EmptyStateCard(text: emptyStateText)
            } else {
                ForEach(Array(results.enumerated()), id: \.element.id) { index, result in
                    Button {
                        onTap(index)
                    } label: {
                        HStack(spacing: 14) {
                            Text(result.source.label(in: locale).uppercased())
                                .font(.system(size: 11, weight: .semibold, design: .rounded))
                                .foregroundStyle(Color.launcherSecondary)
                                .padding(.horizontal, 11)
                                .padding(.vertical, 8)
                                .background(
                                    Capsule()
                                        .fill(
                                            index == selectedIndex
                                                ? Color.launcherAccent.opacity(0.16)
                                                : Color(nsColor: .controlBackgroundColor).opacity(0.86)
                                        )
                                )

                            VStack(alignment: .leading, spacing: 4) {
                                Text(result.title)
                                    .font(.system(size: 18, weight: .semibold))
                                    .foregroundStyle(Color.launcherPrimary)
                                    .lineLimit(1)
                                Text(result.subtitle)
                                    .font(.system(size: 13, weight: .regular))
                                    .foregroundStyle(Color.launcherSecondary)
                                    .lineLimit(1)
                            }

                            Spacer(minLength: 0)
                        }
                        .padding(.horizontal, 18)
                        .padding(.vertical, 14)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(
                            ResultCardBackground(isSelected: index == selectedIndex)
                        )
                    }
                    .buttonStyle(.plain)
                    .onHover { hovering in
                        if hovering {
                            onHover(index)
                        }
                    }
                }
            }
        }
    }
}

private struct ActionPanelView: View {
    let result: LauncherResult
    let selectedIndex: Int
    let locale: LauncherLocale
    let onHover: (Int) -> Void
    let onTap: (Int) -> Void
    let onClose: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text(localized("Actions", "动作", locale))
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(Color.launcherTertiary)
                        .textCase(.uppercase)
                    Text(result.title)
                        .font(.system(size: 22, weight: .semibold))
                        .foregroundStyle(Color.launcherPrimary)
                }
                Spacer()
                Button("Esc") {
                    onClose()
                }
                .buttonStyle(.borderless)
                .foregroundStyle(Color.launcherSecondary)
            }

            ForEach(Array(result.actions.enumerated()), id: \.element.id) { index, action in
                Button {
                    onTap(index)
                } label: {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(localizedActionTitle(action.title, locale: locale))
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(Color.launcherPrimary)
                        if let subtitle = action.subtitle {
                            Text(subtitle)
                                .font(.system(size: 13))
                                .foregroundStyle(Color.launcherSecondary)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
                    .background(
                        RoundedRectangle(cornerRadius: 18, style: .continuous)
                            .fill(
                                index == selectedIndex
                                    ? Color.launcherAccent.opacity(0.14)
                                    : Color(nsColor: .controlBackgroundColor).opacity(0.72)
                            )
                    )
                }
                .buttonStyle(.plain)
                .onHover { hovering in
                    if hovering {
                        onHover(index)
                    }
                }
            }
        }
        .padding(16)
        .background(MaterialCard(cornerRadius: 26))
    }
}

private struct SettingsPanelView: View {
    let activeSection: SettingsSection
    let snapshot: NativeShellSnapshot?
    let bridgeStatus: NativeShellBridgeStatus
    let locale: LauncherLocale
    let onSelectSection: (SettingsSection) -> Void
    let onClose: () -> Void

    var body: some View {
        HStack(spacing: 14) {
            VStack(alignment: .leading, spacing: 10) {
                ForEach(SettingsSection.hubSections) { section in
                    Button {
                        onSelectSection(section)
                    } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(section.title(in: locale))
                                .font(.system(size: 15, weight: .semibold))
                                .foregroundStyle(Color.launcherPrimary)
                            Text(section.command)
                                .font(.system(size: 12))
                                .foregroundStyle(Color.launcherSecondary)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 12)
                        .background(
                            RoundedRectangle(cornerRadius: 18, style: .continuous)
                                .fill(
                                    activeSection == section
                                        ? Color.launcherAccent.opacity(0.14)
                                        : Color(nsColor: .controlBackgroundColor).opacity(0.66)
                                )
                        )
                    }
                    .buttonStyle(.plain)
                }

                Spacer()

                Button(localized("Back", "返回", locale)) {
                    onClose()
                }
                .buttonStyle(.plain)
                .foregroundStyle(Color.launcherSecondary)
            }
            .frame(width: 248, alignment: .top)

            VStack(alignment: .leading, spacing: 12) {
                Text(activeSection.introTitle(in: locale))
                    .font(.system(size: 28, weight: .bold))
                    .foregroundStyle(Color.launcherPrimary)
                Text(activeSection.introBody(in: locale))
                    .font(.system(size: 15))
                    .foregroundStyle(Color.launcherSecondary)

                HStack(spacing: 10) {
                    settingsCard(
                        title: localized("Bridge", "桥接", locale),
                        value: bridgeStatus.title(in: locale),
                        note: bridgeStatus.detail(in: locale)
                    )
                    settingsCard(
                        title: localized("Command", "命令", locale),
                        value: activeSection.command,
                        note: localized(
                            "Press Enter to open this section in its own window.",
                            "按 Enter 在独立窗口中打开这个分区。",
                            locale
                        )
                    )
                }

                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                    ForEach(hubMetrics, id: \.title) { metric in
                        settingsCard(title: metric.title, value: metric.value, note: metric.note)
                    }
                }

                VStack(alignment: .leading, spacing: 8) {
                    Text(localized("What opens next", "接下来会打开", locale))
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(Color.launcherTertiary)
                        .textCase(.uppercase)

                    Text(activeSection.detailStatus(in: locale))
                        .font(.system(size: 14))
                        .foregroundStyle(Color.launcherSecondary)

                    ForEach(Array(activeSection.detailHighlights(in: locale).prefix(2).enumerated()), id: \.offset) { _, item in
                        HStack(alignment: .top, spacing: 10) {
                            Circle()
                                .fill(Color.launcherAccent.opacity(0.85))
                                .frame(width: 8, height: 8)
                                .padding(.top, 5)
                            Text(item)
                                .font(.system(size: 14))
                                .foregroundStyle(Color.launcherPrimary)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }

                Spacer()
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        }
        .padding(16)
        .background(MaterialCard(cornerRadius: 28))
    }

    private var hubMetrics: [HubMetric] {
        switch activeSection {
        case .general:
            [
                HubMetric(title: localized("Hotkey", "热键", locale), value: snapshot?.settings.hotkey ?? "Alt+Space", note: localized("Shared launcher entry point", "共享启动器入口热键", locale)),
                HubMetric(title: localized("Language", "语言", locale), value: localizedLanguageName(snapshot?.settings.language, locale: locale), note: localized("Native shell copy follows this preference", "原生壳层文案跟随这个偏好", locale)),
                HubMetric(title: localized("Dismissal", "关闭方式", locale), value: localized("Focus-loss hide", "失焦隐藏", locale), note: localized("Outside clicks collapse the panel", "点击外部会收起面板", locale)),
                HubMetric(title: localized("Theme", "主题", locale), value: localizedTheme(snapshot?.settings.theme ?? "system", locale: locale), note: localized("Shared appearance preference", "共享外观偏好", locale))
            ]
        case .search:
            [
                HubMetric(title: localized("Indexed files", "已索引文件", locale), value: "\(snapshot?.indexedFileCount ?? 0)", note: localized("SQLite-backed filename and path index", "由 SQLite 支撑的文件名和路径索引", locale)),
                HubMetric(title: localized("Max results", "结果上限", locale), value: "\(snapshot?.settings.search.maxResults ?? 0)", note: localized("Current ranked output limit", "当前排序输出上限", locale)),
                HubMetric(title: localized("Roots", "根目录", locale), value: "\(snapshot?.settings.indexPaths.count ?? 0)", note: localized("Configured index directories", "已配置的索引目录", locale)),
                HubMetric(title: localized("Usage ranking", "使用排序", locale), value: (snapshot?.usageStats.isEmpty == false) ? localized("Active", "已启用", locale) : localized("Collecting", "采集中", locale), note: localized("Historical selections boost result order", "历史选择会提升结果排序", locale))
            ]
        case .clipboard:
            [
                HubMetric(title: localized("Items", "项目数", locale), value: "\(snapshot?.clipboardItems.count ?? 0)", note: localized("Local clipboard history", "本地剪贴板历史", locale)),
                HubMetric(title: localized("Pinned", "置顶", locale), value: "\(snapshot?.clipboardItems.filter(\.pinned).count ?? 0)", note: localized("Always-on-top clipboard entries", "始终置顶的剪贴板条目", locale)),
                HubMetric(title: localized("Retention", "保留", locale), value: "\(snapshot?.settings.clipboard.maxItems ?? 0)", note: localized("Max locally stored clips", "本地存储条目的上限", locale)),
                HubMetric(title: localized("Private apps", "隐私应用", locale), value: "\(snapshot?.settings.clipboard.privateApps.count ?? 0)", note: localized("Privacy exclusion scaffold", "隐私排除配置", locale))
            ]
        case .snippets:
            [
                HubMetric(title: localized("Snippets", "片段", locale), value: "\(snapshot?.snippets.count ?? 0)", note: localized("Saved snippet records", "已保存片段记录", locale)),
                HubMetric(title: localized("Search", "搜索", locale), value: snapshot?.settings.snippets.enabledInSearch == true ? localized("Enabled", "开启", locale) : localized("Disabled", "关闭", locale), note: localized("Snippet search visibility", "片段搜索可见性", locale)),
                HubMetric(title: localized("Hooks", "挂钩", locale), value: snapshot?.settings.snippets.enableExpansionHooks == true ? localized("Planned", "计划中", locale) : localized("Off", "关闭", locale), note: localized("Global expansion remains roadmap", "全局扩展仍在路线图中", locale)),
                HubMetric(title: localized("Variables", "变量", locale), value: "4", note: localized("Date, time, clipboard, UUID", "日期、时间、剪贴板、UUID", locale))
            ]
        case .plugins:
            [
                HubMetric(title: localized("Plugins", "插件", locale), value: "\(snapshot?.plugins.count ?? 0)", note: localized("Discovered plugin manifests", "已发现的插件清单", locale)),
                HubMetric(title: localized("Disabled", "已禁用", locale), value: "\(snapshot?.settings.plugins.disabledPluginIds.count ?? 0)", note: localized("Shared disabled-state list", "共享禁用列表", locale)),
                HubMetric(title: localized("Timeout", "超时", locale), value: "\(snapshot?.settings.plugins.timeoutMs ?? 0) ms", note: localized("Worker timeout budget", "Worker 超时预算", locale)),
                HubMetric(title: localized("Perms", "权限", locale), value: "\(grantedPermissionCount)", note: localized("Granted permissions stored locally", "已授权权限本地存储", locale))
            ]
        case .appearance:
            [
                HubMetric(title: localized("Density", "密度", locale), value: snapshot?.settings.appearance.denseMode == true ? localized("Compact", "紧凑", locale) : localized("Comfortable", "舒适", locale), note: localized("Shared density preference", "共享密度偏好", locale)),
                HubMetric(title: localized("Motion", "动效", locale), value: snapshot?.settings.appearance.reduceMotion == true ? localized("Reduced", "减少", locale) : localized("Standard", "标准", locale), note: localized("Transition behavior", "过渡行为", locale)),
                HubMetric(title: localized("Renderer", "渲染器", locale), value: "SwiftUI", note: localized("Native shell presentation", "原生壳层呈现", locale)),
                HubMetric(title: localized("Material", "材质", locale), value: localized("Semantic", "语义化", locale), note: localized("Readable over varied desktop content", "在不同桌面背景下保持可读", locale))
            ]
        case .workflow:
            [
                HubMetric(title: localized("Surface", "界面", locale), value: localized("Dedicated window", "独立窗口", locale), note: localized("Separate from the launcher bar", "与启动栏分离", locale)),
                HubMetric(title: localized("Snippets", "片段", locale), value: "\(snapshot?.snippets.count ?? 0)", note: localized("Reusable text assets for future flows", "未来工作流可复用的文本资源", locale)),
                HubMetric(title: localized("Plugins", "插件", locale), value: "\(snapshot?.plugins.count ?? 0)", note: localized("Future workflow building blocks", "后续工作流构建块", locale)),
                HubMetric(title: localized("Runtime", "运行时", locale), value: localized("Planned", "计划中", locale), note: localized("Execution graph is not part of this phase", "执行图不在本阶段范围内", locale))
            ]
        }
    }

    private var grantedPermissionCount: Int {
        snapshot?.settings.plugins.grantedPermissions.values.reduce(0) { partial, permissions in
            partial + permissions.count
        } ?? 0
    }

    private func settingsCard(title: String, value: String, note: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title.uppercased())
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(Color.launcherTertiary)
            Text(value)
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(Color.launcherPrimary)
            Text(note)
                .font(.system(size: 12))
                .foregroundStyle(Color.launcherSecondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(18)
        .background(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .fill(Color(nsColor: .controlBackgroundColor).opacity(0.68))
        )
    }
}

private struct HubMetric {
    let title: String
    let value: String
    let note: String
}

private struct EmptyStateCard: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.system(size: 14))
            .foregroundStyle(Color.launcherSecondary)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 18)
            .padding(.vertical, 16)
            .background(MaterialCard(cornerRadius: 22))
    }
}

private struct ResultCardBackground: View {
    let isSelected: Bool

    var body: some View {
        ZStack {
            MaterialCard(cornerRadius: 22)
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .fill(
                    isSelected
                        ? Color.launcherAccent.opacity(0.1)
                        : Color.clear
                )
        }
    }
}

private struct MaterialCard: View {
    let cornerRadius: CGFloat

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                .fill(.regularMaterial)
            RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                .fill(Color(nsColor: .windowBackgroundColor).opacity(0.18))
            RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                .stroke(Color.launcherStroke.opacity(0.5), lineWidth: 1)
        }
    }
}

private struct NativeSearchField: NSViewRepresentable {
    @Binding var text: String
    let focusNonce: Int
    let placeholder: String

    func makeCoordinator() -> Coordinator {
        Coordinator(text: $text)
    }

    func makeNSView(context: Context) -> NSSearchField {
        let field = NSSearchField()
        field.delegate = context.coordinator
        field.focusRingType = .none
        field.isBordered = false
        field.drawsBackground = false
        field.font = .systemFont(ofSize: 28, weight: .semibold)
        field.textColor = .labelColor
        field.sendsSearchStringImmediately = true
        field.maximumRecents = 0
        if let cell = field.cell as? NSSearchFieldCell {
            cell.placeholderAttributedString = NSAttributedString(
                string: placeholder,
                attributes: [
                    .foregroundColor: NSColor.secondaryLabelColor,
                    .font: NSFont.systemFont(ofSize: 24, weight: .medium)
                ]
            )
        }
        return field
    }

    func updateNSView(_ nsView: NSSearchField, context: Context) {
        if nsView.stringValue != text {
            nsView.stringValue = text
        }

        if let cell = nsView.cell as? NSSearchFieldCell,
           cell.placeholderAttributedString?.string != placeholder {
            cell.placeholderAttributedString = NSAttributedString(
                string: placeholder,
                attributes: [
                    .foregroundColor: NSColor.secondaryLabelColor,
                    .font: NSFont.systemFont(ofSize: 24, weight: .medium)
                ]
            )
        }

        if context.coordinator.lastFocusNonce != focusNonce {
            context.coordinator.lastFocusNonce = focusNonce
            DispatchQueue.main.async {
                nsView.window?.makeFirstResponder(nsView)
            }
        }
    }

    final class Coordinator: NSObject, NSSearchFieldDelegate {
        @Binding var text: String
        var lastFocusNonce = -1

        init(text: Binding<String>) {
            self._text = text
        }

        func controlTextDidChange(_ obj: Notification) {
            guard let field = obj.object as? NSSearchField else {
                return
            }
            text = field.stringValue
        }
    }
}

private extension Color {
    static let launcherPrimary = Color(nsColor: .labelColor)
    static let launcherSecondary = Color(nsColor: .secondaryLabelColor)
    static let launcherTertiary = Color(nsColor: .tertiaryLabelColor)
    static let launcherStroke = Color(nsColor: .separatorColor)
    static let launcherAccent = Color(nsColor: .controlAccentColor)
}
