import clsx from "clsx";

import type { ResultItem } from "@pulse/shared-types";

interface ResultListProps {
  results: ResultItem[];
  selectedIndex: number;
  loading: boolean;
  onSelect(index: number): void;
  onExecute(index: number): void;
}

export function ResultList({
  results,
  selectedIndex,
  loading,
  onSelect,
  onExecute
}: ResultListProps) {
  if (!loading && results.length === 0) {
    return (
      <div className="rounded-[28px] border border-white/8 bg-white/5 px-5 py-7 text-sm text-slate-400">
        Start typing to search applications, files, clipboard history, snippets, plugins,
        or a web shortcut.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {results.map((result, index) => (
        <button
          key={result.id}
          type="button"
          className={clsx(
            "w-full rounded-[24px] border px-4 py-3 text-left transition",
            index === selectedIndex
              ? "border-pulse-400/60 bg-pulse-500/14 shadow-halo"
              : "border-white/6 bg-white/4 hover:border-white/12 hover:bg-white/7"
          )}
          onMouseEnter={() => onSelect(index)}
          onDoubleClick={() => onExecute(index)}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="truncate font-display text-lg text-white">
                {result.title}
              </div>
              <div className="truncate text-sm text-slate-400">{result.subtitle}</div>
            </div>
            <div className="shrink-0 rounded-full border border-white/8 bg-black/20 px-2 py-1 text-[11px] uppercase tracking-[0.22em] text-slate-300">
              {result.source}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
