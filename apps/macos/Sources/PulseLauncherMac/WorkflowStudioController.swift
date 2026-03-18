import AppKit
import SwiftUI

@MainActor
final class WorkflowStudioController: NSObject, NSWindowDelegate {
    private let state = WorkflowStudioState()
    private let window: LauncherChildWindow
    var returnToLauncher: (() -> Void)?

    override init() {
        self.window = LauncherChildWindow(
            contentRect: NSRect(x: 0, y: 0, width: 980, height: 680),
            styleMask: [.titled, .closable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )

        super.init()

        let hostingView = NSHostingView(rootView: WorkflowStudioView(state: state))
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
        window.title = "Workflow Studio"
        window.titleVisibility = .hidden
        window.titlebarAppearsTransparent = true
        window.isReleasedWhenClosed = false
        window.center()
        window.tabbingMode = .disallowed
        window.setFrameAutosaveName("PulseLauncherWorkflowStudio")
        window.onEscape = { [weak self] in
            self?.window.performClose(nil)
        }
    }

    func show(snapshot: NativeShellSnapshot?, bridgeStatus: NativeShellBridgeStatus) {
        state.snapshot = snapshot
        state.bridgeStatus = bridgeStatus
        window.title = localized(
            "Workflow Studio",
            "工作流工作台",
            resolveLauncherLocale(settings: snapshot?.settings)
        )

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
        DispatchQueue.main.async { [weak self] in
            self?.returnToLauncher?()
        }
    }
}

@MainActor
private final class WorkflowStudioState: ObservableObject {
    @Published var snapshot: NativeShellSnapshot?
    @Published var bridgeStatus: NativeShellBridgeStatus = .loading
}

private struct WorkflowStudioView: View {
    @ObservedObject var state: WorkflowStudioState

    private let fallbackTemplates: [WorkflowTemplate] = [
        WorkflowTemplate(
            title: "Morning Launch Set",
            summary: "Open a group of apps, a folder, and a startup search in one step.",
            trigger: "Manual command",
            output: "App + file + web actions"
        ),
        WorkflowTemplate(
            title: "Research Sweep",
            summary: "Combine a web search shortcut with snippets and clipboard recall.",
            trigger: "Search result action",
            output: "Structured research handoff"
        ),
        WorkflowTemplate(
            title: "Shell Runner",
            summary: "Wrap a shell command behind explicit permissions and formatted output.",
            trigger: "Plugin or system action",
            output: "Permission-aware command execution"
        )
    ]

    private let buildingBlocks: [WorkflowBuildingBlock] = [
        WorkflowBuildingBlock(title: "Trigger", summary: "Manual command, hotkey follow-up, or future event hooks."),
        WorkflowBuildingBlock(title: "Query", summary: "Ask providers for apps, files, snippets, clipboard, or plugin data."),
        WorkflowBuildingBlock(title: "Action", summary: "Run existing launcher actions with explicit permissions and local state."),
        WorkflowBuildingBlock(title: "Output", summary: "Reveal a result, copy content, or open a follow-up surface.")
    ]

    private var locale: LauncherLocale {
        resolveLauncherLocale(settings: state.snapshot?.settings)
    }

    var body: some View {
        HStack(spacing: 20) {
            VStack(alignment: .leading, spacing: 18) {
                Text(localized("Workflow Studio", "工作流工作台", locale))
                    .font(.system(size: 30, weight: .bold))
                    .foregroundStyle(Color(nsColor: .labelColor))

                Text(
                    localized(
                        "A dedicated foundation for future launcher automation without overloading the command bar.",
                        "为未来启动器自动化准备的独立基础界面，不把命令栏塞得过满。",
                        locale
                    )
                )
                    .font(.system(size: 15))
                    .foregroundStyle(Color(nsColor: .secondaryLabelColor))

                VStack(spacing: 12) {
                    workflowMetaRow(title: localized("Status", "状态", locale), value: state.bridgeStatus.title(in: locale))
                    workflowMetaRow(title: localized("Entry point", "入口", locale), value: localized("Use /config workflow from the launcher", "在启动器里使用 /config workflow", locale))
                    workflowMetaRow(
                        title: localized("Shared assets", "共享资源", locale),
                        value: locale == .chineseSimplified
                            ? "\(state.snapshot?.snippets.count ?? 0) 个片段 • \(state.snapshot?.plugins.count ?? 0) 个插件 • \(state.snapshot?.workflows.count ?? 0) 个工作流"
                            : "\(state.snapshot?.snippets.count ?? 0) snippets • \(state.snapshot?.plugins.count ?? 0) plugins • \(state.snapshot?.workflows.count ?? 0) workflows"
                    )
                    workflowMetaRow(
                        title: localized("Runtime", "运行时", locale),
                        value: localized(
                            "Metadata bridged, execution still shared-runtime follow-up",
                            "元数据已桥接，执行仍是共享运行时的下一步工作",
                            locale
                        )
                    )
                }

                Spacer()
            }
            .frame(width: 280, alignment: .topLeading)

            VStack(alignment: .leading, spacing: 16) {
                card {
                    VStack(alignment: .leading, spacing: 10) {
                        Text(localized("Workflow Library", "工作流库", locale))
                            .font(.system(size: 18, weight: .semibold))
                            .foregroundStyle(Color(nsColor: .labelColor))

                        if workflowEntries.isEmpty {
                            Text(localized("No saved workflows yet. Built-in workflow seeding still needs to move fully into the shared bridge path, so this native surface currently only shows workflows that already exist in the shared store.", "当前还没有可见的工作流。内置工作流的自动注入还没有完全下沉到共享 bridge 路径，所以这个原生界面目前只会显示已经存在于共享存储里的工作流。", locale))
                                .font(.system(size: 14))
                                .foregroundStyle(Color(nsColor: .secondaryLabelColor))
                                .fixedSize(horizontal: false, vertical: true)

                            ForEach(fallbackTemplates) { template in
                                VStack(alignment: .leading, spacing: 6) {
                                    Text(template.title)
                                        .font(.system(size: 15, weight: .semibold))
                                        .foregroundStyle(Color(nsColor: .labelColor))
                                    Text(template.summary)
                                        .font(.system(size: 13))
                                        .foregroundStyle(Color(nsColor: .secondaryLabelColor))
                                    HStack(spacing: 8) {
                                        workflowPill(template.trigger)
                                        workflowPill(template.output)
                                    }
                                }
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(14)
                                .background(
                                    RoundedRectangle(cornerRadius: 18, style: .continuous)
                                        .fill(Color(nsColor: .controlBackgroundColor).opacity(0.55))
                                )
                            }
                        } else {
                            Text(localized("These workflows come from the shared local store used by the launcher runtime. Built-ins, custom commands, and reusable helpers all appear here once they exist in the shared catalog.", "这些工作流来自启动器运行时共用的本地存储。内置命令、自定义命令和可复用助手一旦存在于共享目录里，都会出现在这里。", locale))
                                .font(.system(size: 14))
                                .foregroundStyle(Color(nsColor: .secondaryLabelColor))
                                .fixedSize(horizontal: false, vertical: true)

                            ForEach(workflowEntries) { workflow in
                                VStack(alignment: .leading, spacing: 6) {
                                    HStack(spacing: 8) {
                                        Text(workflow.name)
                                            .font(.system(size: 15, weight: .semibold))
                                            .foregroundStyle(Color(nsColor: .labelColor))
                                        workflowPill(triggerBadge(for: workflow))
                                        if workflow.reusable {
                                            workflowPill(localized("Reusable", "可复用", locale))
                                        }
                                        if workflow.builtIn {
                                            workflowPill(localized("Built-in", "内置", locale))
                                        }
                                    }
                                    Text(workflow.description ?? localized("No description yet.", "暂时没有描述。", locale))
                                        .font(.system(size: 13))
                                        .foregroundStyle(Color(nsColor: .secondaryLabelColor))
                                    HStack(spacing: 8) {
                                        workflowPill(workflow.triggerLabel)
                                        workflowPill(workflow.enabled ? localized("Enabled", "已启用", locale) : localized("Disabled", "已禁用", locale))
                                    }
                                }
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(14)
                                .background(
                                    RoundedRectangle(cornerRadius: 18, style: .continuous)
                                        .fill(Color(nsColor: .controlBackgroundColor).opacity(0.55))
                                )
                            }
                        }
                    }
                }

                card {
                    VStack(alignment: .leading, spacing: 12) {
                        Text(localized("Editor Scaffold", "编辑器骨架", locale))
                            .font(.system(size: 18, weight: .semibold))
                            .foregroundStyle(Color(nsColor: .labelColor))

                        Text(localized("This is the structural shape of workflow editing for the next phase. The runtime is still deferred, but the concepts are now stable enough to demo.", "这是下一阶段工作流编辑的结构形态。runtime 仍然后置，但概念已经足够稳定，可以用于演示。", locale))
                            .font(.system(size: 14))
                            .foregroundStyle(Color(nsColor: .secondaryLabelColor))
                            .fixedSize(horizontal: false, vertical: true)

                        ForEach(buildingBlocks) { block in
                            VStack(alignment: .leading, spacing: 4) {
                                Text(block.title)
                                    .font(.system(size: 15, weight: .semibold))
                                    .foregroundStyle(Color(nsColor: .labelColor))
                                Text(block.summary)
                                    .font(.system(size: 13))
                                    .foregroundStyle(Color(nsColor: .secondaryLabelColor))
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(14)
                            .background(
                                RoundedRectangle(cornerRadius: 18, style: .continuous)
                                    .fill(Color(nsColor: .controlBackgroundColor).opacity(0.55))
                            )
                        }
                    }
                }

                card {
                    VStack(alignment: .leading, spacing: 10) {
                        Text(localized("Next bridge work", "下一步桥接工作", locale))
                            .font(.system(size: 18, weight: .semibold))
                            .foregroundStyle(Color(nsColor: .labelColor))

                        workflowBullet(localized("Reuse shared SQLite data for workflow suggestions, history, and permission-aware outputs.", "复用共享 SQLite 数据来支撑工作流建议、历史和权限感知输出。", locale))
                        workflowBullet(localized("Route provider queries and result actions through the same Rust bridge used by the native shell.", "把 provider 查询和结果动作接到原生壳层已经在用的 Rust bridge 上。", locale))
                        workflowBullet(localized("Add persisted workflow definitions and a future execution graph without breaking local-first guarantees.", "在不破坏 local-first 前提下，增加持久化工作流定义和后续执行图。", locale))
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
                    .fill(Color(nsColor: .windowBackgroundColor).opacity(0.18))
            }
        )
    }

    private var workflowEntries: [NativeWorkflowSummary] {
        (state.snapshot?.workflows ?? []).sorted { left, right in
            if left.builtIn != right.builtIn {
                return left.builtIn && !left.reusable
            }
            return left.name.localizedCaseInsensitiveCompare(right.name) == .orderedAscending
        }
    }

    private func workflowMetaRow(title: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title.uppercased())
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(Color(nsColor: .tertiaryLabelColor))
            Text(value)
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(Color(nsColor: .labelColor))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(Color(nsColor: .controlBackgroundColor).opacity(0.62))
        )
    }

    private func workflowBullet(_ text: String) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Circle()
                .fill(Color(nsColor: .controlAccentColor).opacity(0.85))
                .frame(width: 8, height: 8)
                .padding(.top, 5)
            Text(text)
                .font(.system(size: 14))
                .foregroundStyle(Color(nsColor: .labelColor))
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func workflowPill(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 11, weight: .semibold))
            .foregroundStyle(Color(nsColor: .secondaryLabelColor))
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(
                Capsule()
                    .fill(Color(nsColor: .controlBackgroundColor).opacity(0.72))
            )
    }

    private func triggerBadge(for workflow: NativeWorkflowSummary) -> String {
        switch workflow.triggerType {
        case "slash-command":
            return localized("Slash", "斜杠命令", locale)
        case "keyword":
            return localized("Keyword", "关键词", locale)
        case "manual":
            return localized("Manual", "手动", locale)
        case "hotkey":
            return localized("Hotkey", "热键", locale)
        default:
            return workflow.triggerType
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
                        .fill(Color(nsColor: .windowBackgroundColor).opacity(0.14))
                }
            )
            .overlay(
                RoundedRectangle(cornerRadius: 24, style: .continuous)
                    .stroke(Color(nsColor: .separatorColor).opacity(0.5), lineWidth: 1)
            )
    }
}

private struct WorkflowTemplate: Identifiable {
    let id = UUID()
    let title: String
    let summary: String
    let trigger: String
    let output: String
}

private struct WorkflowBuildingBlock: Identifiable {
    let id = UUID()
    let title: String
    let summary: String
}
