import { BezierEdge } from "@xyflow/react";
import type { EdgeProps } from "@xyflow/react";

export function WorkflowCanvasEdge(
  props: EdgeProps & { data?: { fromPort: string; implicit?: boolean } }
) {
  const fromPort = props.data?.fromPort;
  const isImplicit = props.data?.implicit === true;

  let strokeColor = "var(--shell-text-tertiary)";
  if (isImplicit) {
    strokeColor = "var(--shell-text-muted)";
  } else if (fromPort === "true") {
    strokeColor = "#059669";
  } else if (fromPort === "false") {
    strokeColor = "#dc2626";
  }

  return (
    <BezierEdge
      {...props}
      style={{
        stroke: strokeColor,
        strokeWidth: isImplicit ? 1.5 : 2,
        strokeDasharray: isImplicit ? "6 4" : undefined,
        ...props.style
      }}
    />
  );
}
