import { Handle, Position } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";

import { NODE_WIDTH } from "./canvas-constants";
import type { CanvasNodeData } from "./canvas-adapters";

const INLINE_DEBUG_TYPES = new Set(["query-input", "clipboard-input", "static-value"]);

export function WorkflowCanvasNode({
  id,
  data,
  selected
}: NodeProps & { data: CanvasNodeData }) {
  const isPlanned = data.status === "planned";
  const hasSubflow = !!data.subflowName;
  const showInlineDebug = INLINE_DEBUG_TYPES.has(data.nodeType);
  const isStaticValue = data.nodeType === "static-value";

  return (
    <div
      className={`
        relative overflow-hidden rounded-xl border text-left
        ${selected ? "border-[color:var(--shell-accent-soft)] shadow-md" : "border-[color:var(--shell-border)]"}
        ${isPlanned ? "opacity-60 border-dashed" : ""}
        ${hasSubflow ? "ring-1 ring-offset-1" : ""}
      `}
      style={
        hasSubflow
          ? ({
              width: NODE_WIDTH,
              "--tw-ring-color": data.colors.bar,
              "--tw-ring-offset-color": data.colors.bg
            } as React.CSSProperties)
          : { width: NODE_WIDTH }
      }
    >
      {/* Category color bar */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl"
        style={{ backgroundColor: data.colors.bar }}
      />

      <div className="py-2.5 pl-4 pr-3" style={{ backgroundColor: data.colors.bg }}>
        <div className="text-sm font-semibold text-[color:var(--shell-text-primary)] leading-tight truncate">
          {data.label}
        </div>
        <div
          className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.15em]"
          style={{ color: data.colors.text }}
        >
          {data.category}
        </div>
        {hasSubflow && (
          <div className="mt-0.5 text-[9px] text-[color:var(--shell-text-secondary)] truncate">
            ↳ {data.subflowName}
          </div>
        )}
      </div>

      {/* Ports */}
      <div className="relative px-3 py-2 bg-[color:var(--shell-fill-soft)]">
        {data.inputs.map((port, i) => (
          <Handle
            key={`in-${port.name}`}
            type="target"
            position={Position.Left}
            id={port.name}
            className="!w-2.5 !h-2.5 !border-2 !border-[color:var(--shell-border-strong)] !bg-[color:var(--shell-fill-muted)]"
            style={{ top: 12 + i * 20 }}
          />
        ))}
        {data.outputs.map((port, i) => (
          <Handle
            key={`out-${port.name}`}
            type="source"
            position={Position.Right}
            id={port.name}
            className="!w-2.5 !h-2.5 !border-2 !border-[color:var(--shell-border-strong)] !bg-[color:var(--shell-fill-muted)]"
            style={{ top: 12 + i * 20 }}
          />
        ))}

        {/* Port labels */}
        <div className="flex justify-between gap-2 min-h-[20px]">
          <div className="space-y-0.5">
            {data.inputs.map((port) => (
              <div
                key={port.name}
                className="text-[10px] text-[color:var(--shell-text-tertiary)]"
              >
                {port.name}
              </div>
            ))}
            {data.inputs.length === 0 && (
              <div className="text-[10px] text-[color:var(--shell-text-muted)] italic">
                no inputs
              </div>
            )}
          </div>
          <div className="space-y-0.5 text-right">
            {data.outputs.map((port) => (
              <div
                key={port.name}
                className="flex items-center justify-end gap-1 text-[10px] text-[color:var(--shell-text-tertiary)]"
              >
                {port.name}
                <span className="text-[8px] px-1 rounded bg-[color:var(--shell-fill-muted)] text-[color:var(--shell-text-muted)]">
                  {port.valueType}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Input sources summary */}
        {data.inputSources.length > 0 && (
          <div className="mt-1.5 border-t border-[color:var(--shell-border)] pt-1">
            {data.inputSources.slice(0, 3).map((src, i) => (
              <div
                key={i}
                className={`text-[9px] leading-tight truncate ${
                  src.implicit
                    ? "text-[color:var(--shell-text-muted)] italic"
                    : "text-[color:var(--shell-text-tertiary)]"
                }`}
              >
                {src.label}
              </div>
            ))}
            {data.inputSources.length > 3 && (
              <div className="text-[9px] text-[color:var(--shell-text-muted)]">
                +{data.inputSources.length - 3} more
              </div>
            )}
          </div>
        )}

        {/* Inline debug input */}
        {showInlineDebug && (
          <div className="mt-1.5 border-t border-[color:var(--shell-border)] pt-1.5">
            {isStaticValue ? (
              <div className="text-[10px] text-[color:var(--shell-text-tertiary)] truncate italic">
                {data.staticValue ? data.staticValue.slice(0, 80) : "(empty)"}
              </div>
            ) : (
              <input
                className="nopan nodrag nowheel w-full rounded border border-[color:var(--shell-border)] bg-[color:var(--shell-fill-muted)] px-1.5 py-1 text-[10px] text-[color:var(--shell-text-primary)] outline-none placeholder:text-[color:var(--shell-text-muted)] focus:border-[color:var(--shell-border-strong)]"
                value={data.debugValue ?? ""}
                onChange={(e) => data.onDebugValueChange?.(id, e.target.value)}
                placeholder={
                  data.nodeType === "query-input" ? "Test input..." : "Clipboard text..."
                }
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
