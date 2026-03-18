import clsx from "clsx";

import {
  CONFIG_HUB_SECTIONS,
  CONFIG_SECTION_META,
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
  onSelect(section: ConfigSection): void;
  onOpen(section: ConfigSection): void;
  onClose(): void;
}

export function ConfigHub({
  selectedSection,
  stats,
  onSelect,
  onOpen,
  onClose
}: ConfigHubProps) {
  const meta = CONFIG_SECTION_META[selectedSection];

  return (
    <section className="shell-panel rounded-[30px] p-4 md:p-5">
      <div className="grid gap-4 md:grid-cols-[280px_minmax(0,1fr)]">
        <div className="space-y-2">
          <div className="shell-kicker">Configuration</div>
          {CONFIG_HUB_SECTIONS.map((section) => {
            const sectionMeta = CONFIG_SECTION_META[section];
            const selected = section === selectedSection;

            return (
              <button
                key={section}
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
          <div className="shell-kicker">Section Intro</div>
          <h2 className="mt-2 text-[1.9rem] font-semibold tracking-[-0.03em] text-[color:var(--shell-text-primary)]">
            {meta.label}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[color:var(--shell-text-secondary)]">
            {meta.intro}
          </p>

          <div className="mt-5 rounded-[20px] border border-[color:var(--shell-border)] bg-[color:var(--shell-fill-soft)] px-4 py-3 text-sm text-[color:var(--shell-text-secondary)]">
            {meta.summary}
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <MetricCard
              title="Indexed files"
              value={String(stats.indexedFiles)}
              note="Lightweight filename and path entries ready for file search."
            />
            <MetricCard
              title="Clipboard"
              value={String(stats.clipboardItems)}
              note="Local clipboard items available to search and actions."
            />
            <MetricCard
              title="Snippets"
              value={String(stats.snippets)}
              note="Saved snippets ready for search and expansion actions."
            />
            <MetricCard
              title="Plugins"
              value={String(stats.plugins)}
              note="Discovered plugin runtimes or manifests in the current workspace."
            />
            <MetricCard
              title="Workflow"
              value="Dedicated"
              note="Workflow opens as its own surface instead of bloating the launcher bar."
            />
            <MetricCard
              title="Perm prompts"
              value={String(stats.pendingPermissions)}
              note="Pending plugin permission approvals waiting for attention."
            />
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              className="button-primary"
              onClick={() => onOpen(selectedSection)}
            >
              Open {meta.label}
            </button>
            <button type="button" className="button-secondary" onClick={onClose}>
              Back
            </button>
          </div>

          <div className="mt-5 text-xs uppercase tracking-[0.24em] text-[color:var(--shell-text-tertiary)]">
            Up/Down to move, Enter to open
          </div>
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
