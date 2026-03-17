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
  const { fuzzyScore, prefixBonus, exactBonus } = scoreTextMatch(item.title, query);
  const recencyBonus = computeRecencyBonus(usage?.lastSelectedAt, now);
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

function computeRecencyBonus(lastSelectedAt?: number, now = Date.now()): number {
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
