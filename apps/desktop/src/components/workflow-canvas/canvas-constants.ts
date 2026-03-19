import type { WorkflowNodeCategory } from "@pulse/core";

export const NODE_WIDTH = 220;
export const NODE_MIN_HEIGHT = 60;

export const LAYER_GAP_X = 280;
export const LAYER_GAP_Y = 140;

export const CATEGORY_COLORS: Record<
  WorkflowNodeCategory,
  { bar: string; bg: string; border: string; text: string }
> = {
  input: {
    bar: "#d97706",
    bg: "rgba(217, 119, 6, 0.08)",
    border: "rgba(217, 119, 6, 0.25)",
    text: "#b45309"
  },
  transform: {
    bar: "#7c3aed",
    bg: "rgba(124, 58, 237, 0.08)",
    border: "rgba(124, 58, 237, 0.25)",
    text: "#6d28d9"
  },
  action: {
    bar: "#0284c7",
    bg: "rgba(2, 132, 199, 0.08)",
    border: "rgba(2, 132, 199, 0.25)",
    text: "#0369a1"
  },
  output: {
    bar: "#059669",
    bg: "rgba(5, 150, 105, 0.08)",
    border: "rgba(5, 150, 105, 0.25)",
    text: "#047857"
  }
};
