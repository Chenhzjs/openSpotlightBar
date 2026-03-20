import { useRef } from "react";
import clsx from "clsx";

import type { LucideIcon } from "lucide-react";
import {
  AppWindow,
  ChevronDown,
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
  maxVisible?: number;
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
  maxVisible = 7,
  emptyTitle = "No matching results.",
  emptyDetail,
  loadingLabel = "Searching...",
  onSelect,
  onExecute
}: ResultListProps) {
  const startIndexRef = useRef(0);
  const lastMousePos = useRef({ x: 0, y: 0 });

  // Compute the sliding window based on selectedIndex
  let start = startIndexRef.current;
  const total = results.length;
  const windowSize = Math.min(maxVisible, total);

  if (selectedIndex < start) {
    start = selectedIndex;
  } else if (selectedIndex >= start + windowSize) {
    start = selectedIndex - windowSize + 1;
  }
  start = Math.max(0, Math.min(start, Math.max(total - windowSize, 0)));
  startIndexRef.current = start;

  const visibleResults = results.slice(start, start + windowSize);
  const remaining = Math.max(total - (start + windowSize), 0);

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
      {visibleResults.map((result, i) => {
        const globalIndex = start + i;
        const isLast = i === visibleResults.length - 1;
        const Icon = getResultIcon(result);
        return (
          <button
            key={result.id}
            type="button"
            className={clsx(
              "flex w-full items-center gap-4 border-b px-4 py-3 text-left transition",
              isLast && remaining <= 0 && "border-b-0",
              globalIndex === selectedIndex
                ? "border-[color:var(--shell-border)] bg-[color:var(--shell-accent-muted)]"
                : "border-[color:var(--shell-border)] bg-transparent hover:bg-[color:var(--shell-fill-soft)]"
            )}
            onMouseMove={(e) => {
              const prev = lastMousePos.current;
              if (prev.x !== e.clientX || prev.y !== e.clientY) {
                lastMousePos.current = { x: e.clientX, y: e.clientY };
                onSelect(globalIndex);
              }
            }}
            onDoubleClick={() => onExecute(globalIndex)}
          >
            <div
              className={clsx(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border",
                globalIndex === selectedIndex
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
      {remaining > 0 && (
        <div className="flex items-center justify-center gap-1 py-2 text-xs text-[color:var(--shell-text-secondary)]">
          <ChevronDown size={12} />
          <span>还有 {remaining} 项</span>
        </div>
      )}
    </div>
  );
}
