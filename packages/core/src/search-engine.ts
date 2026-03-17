import type { ResultItem, SearchContext, SearchProvider } from "@pulse/shared-types";

import { rankResult } from "./ranking";

export interface SearchEngineOptions {
  providerTimeoutMs: number;
  logger?: SearchEngineLogger;
}

export interface SearchEngineLogger {
  warn(message: string, meta?: Record<string, unknown>): void;
}

export class SearchEngine {
  #providers: SearchProvider[];
  #options: SearchEngineOptions;

  constructor(providers: SearchProvider[], options?: Partial<SearchEngineOptions>) {
    this.#providers = providers;
    this.#options = {
      providerTimeoutMs: 600,
      ...options
    };
  }

  async warmup(): Promise<void> {
    const settled = await Promise.allSettled(
      this.#providers.map((provider) => provider.warmup?.() ?? Promise.resolve())
    );

    settled.forEach((entry, index) => {
      if (entry.status === "rejected") {
        this.#options.logger?.warn("Provider warmup failed.", {
          providerId: this.#providers[index]?.id,
          error:
            entry.reason instanceof Error ? entry.reason.message : String(entry.reason)
        });
      }
    });
  }

  async search(query: string, context: SearchContext): Promise<ResultItem[]> {
    const settled = await Promise.allSettled(
      this.#providers.map((provider) =>
        withTimeout(
          provider.search(query, context),
          provider.timeoutMs ?? this.#options.providerTimeoutMs,
          provider.id
        ).then((results) => ({ provider, results }))
      )
    );

    const merged = settled.flatMap((entry) => {
      if (entry.status === "rejected") {
        const meta: Record<string, unknown> = {
          error:
            entry.reason instanceof Error ? entry.reason.message : String(entry.reason)
        };

        if (entry.reason instanceof SearchProviderTimeoutError) {
          meta.providerId = entry.reason.providerId;
          meta.timeoutMs = entry.reason.timeoutMs;
        }

        this.#options.logger?.warn("Provider search failed.", {
          ...meta
        });
        return [];
      }

      return entry.value.results.map((result) =>
        rankResult(
          result,
          query,
          context.usageByItemId[result.id],
          context.settings.search.sourceWeights[result.source] ??
            entry.value.provider.sourceWeight,
          context.now
        )
      );
    });

    return dedupeResults(merged)
      .sort((left, right) => right.score - left.score)
      .slice(0, context.settings.search.maxResults);
  }
}

export class SearchProviderTimeoutError extends Error {
  providerId: string;
  timeoutMs: number;

  constructor(providerId: string, timeoutMs: number) {
    super(`Provider ${providerId} timed out after ${timeoutMs}ms.`);
    this.providerId = providerId;
    this.timeoutMs = timeoutMs;
  }
}

function dedupeResults(results: ResultItem[]): ResultItem[] {
  const byId = new Map<string, ResultItem>();

  for (const result of results) {
    const existing = byId.get(result.id);
    if (!existing || result.score > existing.score) {
      byId.set(result.id, result);
    }
  }

  return [...byId.values()];
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  providerId: string
): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new SearchProviderTimeoutError(providerId, timeoutMs));
        }, timeoutMs);
      })
    ]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}
