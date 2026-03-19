import { WORKFLOW_TEMPLATES, type WorkflowTemplate } from "@osb/core";
import type { WorkflowRecord } from "@osb/shared-types";

interface WorkflowTemplateGalleryProps {
  onSelect(workflow: WorkflowRecord): void;
  onBlank(): void;
  onClose(): void;
}

const CATEGORY_COLORS: Record<WorkflowTemplate["category"], string> = {
  "web-search": "#3b82f6",
  "api-integration": "#8b5cf6",
  "text-processing": "#f59e0b",
  "launcher-results": "#10b981",
};

export function WorkflowTemplateGallery({ onSelect, onBlank, onClose }: WorkflowTemplateGalleryProps) {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-[color:var(--shell-fill-muted)]/90 backdrop-blur-sm rounded-[24px]">
      <div className="w-full max-w-2xl p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-semibold text-[color:var(--shell-text-primary)]">
            Start from a template
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-[color:var(--shell-text-secondary)] hover:text-[color:var(--shell-text-primary)] transition"
          >
            Cancel
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {/* Blank workflow card */}
          <button
            type="button"
            onClick={onBlank}
            className="rounded-[18px] border-2 border-dashed border-[color:var(--shell-border)] bg-[color:var(--shell-fill-soft)] p-4 text-left transition hover:border-[color:var(--shell-border-strong)] hover:bg-[color:var(--shell-fill-muted)]"
          >
            <div className="text-sm font-semibold text-[color:var(--shell-text-primary)]">
              Blank Workflow
            </div>
            <div className="mt-1 text-xs text-[color:var(--shell-text-secondary)]">
              Start from scratch with a query input and return node.
            </div>
            <div className="mt-3 flex items-center gap-2">
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-[color:var(--shell-fill-muted)] text-[color:var(--shell-text-tertiary)]">
                2 nodes
              </span>
            </div>
          </button>

          {/* Template cards */}
          {WORKFLOW_TEMPLATES.map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              onClick={() => onSelect(tpl.create())}
              className="rounded-[18px] border border-[color:var(--shell-border)] bg-[color:var(--shell-fill-soft)] p-4 text-left transition hover:border-[color:var(--shell-border-strong)] hover:bg-[color:var(--shell-fill-muted)]"
            >
              <div className="text-sm font-semibold text-[color:var(--shell-text-primary)]">
                {tpl.name}
              </div>
              <div className="mt-1 text-xs text-[color:var(--shell-text-secondary)] line-clamp-2">
                {tpl.description}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <span
                  className="text-[10px] px-2 py-0.5 rounded-full text-white"
                  style={{ backgroundColor: CATEGORY_COLORS[tpl.category] }}
                >
                  {tpl.triggerType}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[color:var(--shell-fill-muted)] text-[color:var(--shell-text-tertiary)]">
                  {tpl.nodeCount} nodes
                </span>
                {tpl.tags.slice(0, 2).map((tag) => (
                  <span
                    key={tag}
                    className="text-[10px] px-2 py-0.5 rounded-full bg-[color:var(--shell-fill-muted)] text-[color:var(--shell-text-muted)]"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
