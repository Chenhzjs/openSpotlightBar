import type { ResultItem, UsageStat } from "@pulse/shared-types";

import { scoreTextMatch } from "./fuzzy";

export interface RankedResult extends ResultItem {
  scoreBreakdown: {
    providerScore: number;
    fuzzyScore: number;
    prefixBonus: number;
    exactBonus: number;
    recencyBonus: number;
    usageBonus: number;
    sourceWeight: number;
  };
}

export function rankResult(
  item: ResultItem,
  query: string,
  usage?: UsageStat,
  sourceWeight = 1,
  now = Date.now()
): RankedResult {
  const primaryMatch = scoreTextMatch(item.title, query);
  const secondaryMatch =
    item.source === "files" && item.subtitle
      ? scoreTextMatch(item.subtitle, query)
      : { fuzzyScore: 0, prefixBonus: 0, exactBonus: 0 };
  const fuzzyScore = primaryMatch.fuzzyScore + secondaryMatch.fuzzyScore * 0.35;
  const prefixBonus = primaryMatch.prefixBonus + secondaryMatch.prefixBonus * 0.2;
  const exactBonus = primaryMatch.exactBonus + secondaryMatch.exactBonus * 0.15;
  const recencyBonus = computeRecencyBonus(
    usage?.lastSelectedAt,
    item.source === "files" ? readFileModifiedAt(item) : undefined,
    now
  );
  const usageBonus = usage ? Math.min(usage.selectedCount * 0.035, 0.22) : 0;
  const providerScore = item.score;
  const score =
    providerScore +
    fuzzyScore +
    prefixBonus +
    exactBonus +
    recencyBonus +
    usageBonus +
    sourceWeight;

  return {
    ...item,
    score,
    scoreBreakdown: {
      providerScore,
      fuzzyScore,
      prefixBonus,
      exactBonus,
      recencyBonus,
      usageBonus,
      sourceWeight
    }
  };
}

function computeRecencyBonus(
  lastSelectedAt?: number,
  fileModifiedAt?: number,
  now = Date.now()
): number {
  const usageRecency = lastSelectedAt
    ? computeSelectionRecencyBonus(lastSelectedAt, now)
    : 0;
  const fileRecency = fileModifiedAt ? computeFileRecencyBonus(fileModifiedAt, now) : 0;

  return Math.min(usageRecency + fileRecency, 0.38);
}

function computeSelectionRecencyBonus(lastSelectedAt: number, now = Date.now()): number {
  if (!lastSelectedAt) {
    return 0;
  }

  const ageHours = (now - lastSelectedAt) / (1000 * 60 * 60);
  if (ageHours < 1) {
    return 0.28;
  }
  if (ageHours < 6) {
    return 0.16;
  }
  if (ageHours < 24) {
    return 0.08;
  }
  return 0;
}

function computeFileRecencyBonus(fileModifiedAt: number, now = Date.now()): number {
  const ageHours = (now - fileModifiedAt) / (1000 * 60 * 60);
  if (ageHours < 0) {
    return 0;
  }
  if (ageHours < 6) {
    return 0.16;
  }
  if (ageHours < 24) {
    return 0.1;
  }
  if (ageHours < 24 * 7) {
    return 0.05;
  }
  if (ageHours < 24 * 30) {
    return 0.02;
  }
  return 0;
}

function readFileModifiedAt(item: ResultItem): number | undefined {
  const value = item.payload?.mtimeMs;
  return typeof value === "number" ? value : undefined;
}
