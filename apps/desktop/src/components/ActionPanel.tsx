import clsx from "clsx";

import type { ResultItem } from "@pulse/shared-types";

interface ActionPanelProps {
  result: ResultItem;
  selectedIndex: number;
  onSelect(index: number): void;
  onExecute(index: number): void;
  onClose(): void;
}

export function ActionPanel({
  result,
  selectedIndex,
  onSelect,
  onExecute,
  onClose
}: ActionPanelProps) {
  return (
    <section className="shell-panel rounded-[24px] p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="shell-kicker">
            Actions
          </div>
          <div className="mt-1 text-xl font-semibold text-[color:var(--shell-text-primary)]">
            {result.title}
          </div>
        </div>
        <button
          type="button"
          className="button-secondary px-3 py-1 text-xs"
          onClick={onClose}
        >
          Esc
        </button>
      </div>

      <div className="space-y-2">
        {result.actions.map((action, index) => (
          <button
            key={action.id}
            type="button"
            className={clsx(
              "flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition",
              index === selectedIndex
                ? "border-[color:var(--shell-accent-soft)] bg-[color:var(--shell-accent-muted)]"
                : "border-[color:var(--shell-border)] bg-[color:var(--shell-fill-muted)] hover:border-[color:var(--shell-border-strong)]"
            )}
            onMouseEnter={() => onSelect(index)}
            onClick={() => onExecute(index)}
          >
            <div>
              <div className="font-medium text-[color:var(--shell-text-primary)]">
                {action.title}
              </div>
              {action.description ? (
                <div className="text-sm text-[color:var(--shell-text-secondary)]">
                  {action.description}
                </div>
              ) : null}
            </div>
            {action.shortcut ? (
              <div className="rounded-full border border-[color:var(--shell-border)] px-2 py-1 font-mono text-[11px] text-[color:var(--shell-text-secondary)]">
                {action.shortcut}
              </div>
            ) : null}
          </button>
        ))}
      </div>
    </section>
  );
}
