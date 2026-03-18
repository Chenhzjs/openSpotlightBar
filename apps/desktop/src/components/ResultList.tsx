import clsx from "clsx";

import type { ResultItem } from "@pulse/shared-types";

interface ResultListProps {
  results: ResultItem[];
  selectedIndex: number;
  loading: boolean;
  emptyTitle?: string;
  emptyDetail?: string;
  loadingLabel?: string;
  onSelect(index: number): void;
  onExecute(index: number): void;
}

export function ResultList({
  results,
  selectedIndex,
  loading,
  emptyTitle = "No matching results.",
  emptyDetail,
  loadingLabel = "Searching...",
  onSelect,
  onExecute
}: ResultListProps) {
  if (loading && results.length === 0) {
    return (
      <div className="shell-panel rounded-[24px] px-5 py-4">
        <div className="text-sm font-medium text-[color:var(--shell-text-primary)]">
          {loadingLabel}
        </div>
        {emptyDetail ? (
          <div className="mt-1 text-sm text-[color:var(--shell-text-secondary)]">
            {emptyDetail}
          </div>
        ) : null}
      </div>
    );
  }

  if (!loading && results.length === 0) {
    return (
      <div className="shell-panel rounded-[24px] px-5 py-4">
        <div className="text-sm font-medium text-[color:var(--shell-text-primary)]">
          {emptyTitle}
        </div>
        {emptyDetail ? (
          <div className="mt-1 text-sm text-[color:var(--shell-text-secondary)]">
            {emptyDetail}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="shell-panel overflow-hidden rounded-[24px]">
      {results.map((result, index) => (
        <button
          key={result.id}
          type="button"
          className={clsx(
            "flex w-full items-center gap-4 border-b px-4 py-3 text-left transition last:border-b-0",
            index === selectedIndex
              ? "border-[color:var(--shell-border)] bg-[color:var(--shell-accent-muted)]"
              : "border-[color:var(--shell-border)] bg-transparent hover:bg-[color:var(--shell-fill-soft)]"
          )}
          onMouseEnter={() => onSelect(index)}
          onDoubleClick={() => onExecute(index)}
        >
          <div
            className={clsx(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border text-[11px] uppercase tracking-[0.18em]",
              index === selectedIndex
                ? "border-[color:var(--shell-accent-soft)] bg-[color:var(--shell-accent-muted)] text-[color:var(--shell-text-primary)]"
                : "border-[color:var(--shell-border)] bg-[color:var(--shell-fill-muted)] text-[color:var(--shell-text-secondary)]"
            )}
          >
            {result.source.slice(0, 3)}
          </div>

          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-medium text-[color:var(--shell-text-primary)]">
              {result.title}
            </div>
            <div className="truncate text-sm text-[color:var(--shell-text-secondary)]">
              {result.subtitle}
            </div>
          </div>

          <div className="flex shrink-0 flex-col items-end gap-1">
            <div className="rounded-full border border-[color:var(--shell-border)] px-2 py-1 text-[11px] uppercase tracking-[0.18em] text-[color:var(--shell-text-secondary)]">
              {result.source}
            </div>
            {index === selectedIndex ? (
              <div className="text-[11px] text-[color:var(--shell-text-tertiary)]">
                Enter to open
              </div>
            ) : null}
          </div>
        </button>
      ))}
    </div>
  );
}
