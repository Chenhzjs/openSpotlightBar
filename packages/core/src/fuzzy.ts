export interface MatchScore {
  fuzzyScore: number;
  prefixBonus: number;
  exactBonus: number;
}

export function scoreTextMatch(candidate: string, query: string): MatchScore {
  const normalizedCandidate = candidate.trim().toLowerCase();
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return { fuzzyScore: 0.15, prefixBonus: 0, exactBonus: 0 };
  }

  if (normalizedCandidate === normalizedQuery) {
    return { fuzzyScore: 1, prefixBonus: 0.3, exactBonus: 0.4 };
  }

  const prefixBonus = normalizedCandidate.startsWith(normalizedQuery) ? 0.24 : 0;
  const fuzzyScore = computeOrderedFuzzyScore(normalizedCandidate, normalizedQuery);

  return {
    fuzzyScore,
    prefixBonus,
    exactBonus: 0
  };
}

function computeOrderedFuzzyScore(candidate: string, query: string): number {
  let score = 0;
  let searchIndex = 0;
  let contiguous = 0;

  for (const char of query) {
    const index = candidate.indexOf(char, searchIndex);
    if (index === -1) {
      return 0;
    }

    const distance = index - searchIndex;
    contiguous = distance === 0 ? contiguous + 1 : 1;
    score += 0.08 + Math.min(contiguous * 0.03, 0.18);
    score -= Math.min(distance * 0.01, 0.12);
    searchIndex = index + 1;
  }

  return Math.max(score, 0.05);
}
