import clsx from "clsx";
import { useEffect, useRef } from "react";

import {
  CONFIG_HUB_SECTIONS,
  getConfigSectionMeta,
  type ConfigSection
} from "../features/commands/config-command";

interface ConfigHubStats {
  indexedFiles: number;
  clipboardItems: number;
  snippets: number;
  plugins: number;
  pendingPermissions: number;
}

interface ConfigHubProps {
  selectedSection: ConfigSection;
  stats: ConfigHubStats;
  useChineseCopy: boolean;
  onSelect(section: ConfigSection): void;
  onOpen(section: ConfigSection): void;
  onClose(): void;
}

export function ConfigHub({
  selectedSection,
  stats,
  useChineseCopy,
  onSelect,
  onOpen,
  onClose: _onClose
}: ConfigHubProps) {
  const meta = getConfigSectionMeta(selectedSection, useChineseCopy);
  const showOverviewMetrics = selectedSection === "overview";
  const itemRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    const el = itemRefs.current[selectedSection];
    if (el) {
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [selectedSection]);
  const copy = useChineseCopy
    ? {
        configuration: "配置",
        metrics: {
          indexedFiles: "已索引文件",
          clipboard: "剪贴板",
          snippets: "片段",
          plugins: "插件",
          workflow: "工作流",
          permPrompts: "权限请求"
        },
        workflowValue: "独立界面",
        notes: {
          indexedFiles: "轻量文件名和路径条目已可用于文件搜索。",
          clipboard: "本地剪贴板条目可用于搜索和动作执行。",
          snippets: "已保存片段可用于搜索和展开动作。",
          plugins: "当前工作区中已发现的插件运行时或清单。",
          workflow: "工作流保持独立界面，避免把启动器 bar 挤满。",
          permPrompts: "等待处理的插件权限批准请求。"
        }
      }
    : {
        configuration: "Configuration",
        metrics: {
          indexedFiles: "Indexed files",
          clipboard: "Clipboard",
          snippets: "Snippets",
          plugins: "Plugins",
          workflow: "Workflow",
          permPrompts: "Perm prompts"
        },
        workflowValue: "Dedicated",
        notes: {
          indexedFiles: "Lightweight filename and path entries ready for file search.",
          clipboard: "Local clipboard items available to search and actions.",
          snippets: "Saved snippets ready for search and expansion actions.",
          plugins: "Discovered plugin runtimes or manifests in the current workspace.",
          workflow: "Workflow opens as its own surface instead of bloating the launcher bar.",
          permPrompts: "Pending plugin permission approvals waiting for attention."
        }
      };

  return (
    <section className="shell-panel rounded-[30px] p-4 md:p-5">
      <div className="grid gap-4 md:grid-cols-[280px_minmax(0,1fr)]">
        <div className="space-y-2 overflow-y-auto max-h-[calc(100vh-120px)]">
          <div className="shell-kicker">{copy.configuration}</div>
          {CONFIG_HUB_SECTIONS.map((section) => {
            const sectionMeta = getConfigSectionMeta(section, useChineseCopy);
            const selected = section === selectedSection;

            return (
              <button
                key={section}
                ref={(el) => { itemRefs.current[section] = el; }}
                type="button"
                className={clsx(
                  "w-full rounded-[22px] border px-4 py-3 text-left transition",
                  selected
                    ? "border-[color:var(--shell-accent-soft)] bg-[color:var(--shell-accent-muted)]"
                    : "border-[color:var(--shell-border)] bg-[color:var(--shell-fill-muted)] hover:border-[color:var(--shell-border-strong)]"
                )}
                onMouseEnter={() => onSelect(section)}
                onClick={() => onOpen(section)}
              >
                <div className="text-[15px] font-semibold text-[color:var(--shell-text-primary)]">
                  {sectionMeta.label}
                </div>
                <div className="mt-1 text-sm text-[color:var(--shell-text-secondary)]">
                  {sectionMeta.command}
                </div>
              </button>
            );
          })}
        </div>

        <div className="rounded-[24px] border border-[color:var(--shell-border)] bg-[color:var(--shell-fill-muted)] p-5">
          <h2 className="text-[1.9rem] font-semibold tracking-[-0.03em] text-[color:var(--shell-text-primary)]">
            {meta.label}
          </h2>
          {showOverviewMetrics ? (
            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <MetricCard
                title={copy.metrics.indexedFiles}
                value={String(stats.indexedFiles)}
                note={copy.notes.indexedFiles}
              />
              <MetricCard
                title={copy.metrics.clipboard}
                value={String(stats.clipboardItems)}
                note={copy.notes.clipboard}
              />
              <MetricCard
                title={copy.metrics.snippets}
                value={String(stats.snippets)}
                note={copy.notes.snippets}
              />
              <MetricCard
                title={copy.metrics.plugins}
                value={String(stats.plugins)}
                note={copy.notes.plugins}
              />
              <MetricCard
                title={copy.metrics.workflow}
                value={copy.workflowValue}
                note={copy.notes.workflow}
              />
              <MetricCard
                title={copy.metrics.permPrompts}
                value={String(stats.pendingPermissions)}
                note={copy.notes.permPrompts}
              />
            </div>
          ) : (
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[color:var(--shell-text-secondary)]">
              {meta.intro}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function MetricCard({
  title,
  value,
  note
}: {
  title: string;
  value: string;
  note: string;
}) {
  return (
    <div className="rounded-[20px] border border-[color:var(--shell-border)] bg-[color:var(--shell-fill-soft)] p-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--shell-text-tertiary)]">
        {title}
      </div>
      <div className="mt-2 text-lg font-semibold text-[color:var(--shell-text-primary)]">
        {value}
      </div>
      <div className="mt-1 text-sm leading-6 text-[color:var(--shell-text-secondary)]">
        {note}
      </div>
    </div>
  );
}
