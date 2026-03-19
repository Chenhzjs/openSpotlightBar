import clsx from "clsx";

import type { LucideIcon } from "lucide-react";
import {
  AppWindow,
  Clipboard,
  File,
  Folder,
  Globe,
  Hash,
  Puzzle,
  Search,
  Settings,
  TextCursorInput,
  Workflow
} from "lucide-react";

import type { ResultItem } from "@osb/shared-types";

const SOURCE_ICONS: Record<string, LucideIcon> = {
  apps: AppWindow,
  files: File,
  web: Globe,
  clipboard: Clipboard,
  snippets: TextCursorInput,
  plugins: Puzzle,
  workflows: Workflow,
  system: Settings
};

const TYPE_ICONS: Record<string, LucideIcon> = {
  folder: Folder,
  url: Globe,
  command: Hash,
  workflow: Workflow,
  plugin: Puzzle,
  system: Settings
};

function getResultIcon(result: ResultItem) {
  return TYPE_ICONS[result.type] ?? SOURCE_ICONS[result.source] ?? Search;
}

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
      {results.map((result, index) => {
        const Icon = getResultIcon(result);
        return (
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
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border",
                index === selectedIndex
                  ? "border-[color:var(--shell-accent-soft)] bg-[color:var(--shell-accent-muted)] text-[color:var(--shell-text-primary)]"
                  : "border-[color:var(--shell-border)] bg-[color:var(--shell-fill-muted)] text-[color:var(--shell-text-secondary)]"
              )}
            >
              <Icon size={18} />
            </div>

            <div className="min-w-0 flex-1">
              <div className="truncate text-[15px] font-medium text-[color:var(--shell-text-primary)]">
                {result.title}
              </div>
              <div className="truncate text-sm text-[color:var(--shell-text-secondary)]">
                {result.subtitle}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
