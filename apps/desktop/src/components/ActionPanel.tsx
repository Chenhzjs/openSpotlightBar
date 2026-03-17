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
    <section className="rounded-[28px] border border-pulse-400/30 bg-ink-900/92 p-4 shadow-halo backdrop-blur-xl">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.24em] text-pulse-300/80">
            Actions
          </div>
          <div className="mt-1 font-display text-xl text-white">{result.title}</div>
        </div>
        <button
          type="button"
          className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300 transition hover:border-white/20 hover:text-white"
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
                ? "border-amber-400/60 bg-amber-400/10"
                : "border-white/8 bg-white/4 hover:border-white/12"
            )}
            onMouseEnter={() => onSelect(index)}
            onClick={() => onExecute(index)}
          >
            <div>
              <div className="font-medium text-white">{action.title}</div>
              {action.description ? (
                <div className="text-sm text-slate-400">{action.description}</div>
              ) : null}
            </div>
            {action.shortcut ? (
              <div className="rounded-full border border-white/8 px-2 py-1 font-mono text-[11px] text-slate-300">
                {action.shortcut}
              </div>
            ) : null}
          </button>
        ))}
      </div>
    </section>
  );
}
