import clsx from "clsx";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { MarketplaceEntry } from "@osb/shared-types";

import {
  fetchPluginRegistry,
  installMarketplacePlugin,
  uninstallMarketplacePlugin
} from "../lib/backend";

interface MarketplacePanelProps {
  installedPluginIds: string[];
  useChineseCopy: boolean;
  onPluginsChanged(): void;
}

type SortBy = "stars" | "updated";

export function MarketplacePanel({
  installedPluginIds,
  useChineseCopy,
  onPluginsChanged
}: MarketplacePanelProps) {
  const [entries, setEntries] = useState<MarketplaceEntry[]>([]);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("stars");
  const [installedIds, setInstalledIds] = useState<Set<string>>(
    () => new Set(installedPluginIds)
  );
  const [installing, setInstalling] = useState<string | null>(null);
  const [uninstalling, setUninstalling] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const zh = useChineseCopy;

  useEffect(() => {
    setInstalledIds(new Set(installedPluginIds));
  }, [installedPluginIds]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchPluginRegistry()
      .then((data) => {
        if (!cancelled) setEntries(data);
      })
      .catch((err) => {
        if (!cancelled) setError(String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = entries;
    if (q) {
      list = list.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          e.description.toLowerCase().includes(q) ||
          e.tags.some((t) => t.toLowerCase().includes(q))
      );
    }
    return [...list].sort((a, b) =>
      sortBy === "stars"
        ? b.stars - a.stars
        : b.updatedAt.localeCompare(a.updatedAt)
    );
  }, [entries, search, sortBy]);

  const handleInstall = useCallback(
    async (entry: MarketplaceEntry) => {
      setInstalling(entry.id);
      try {
        await installMarketplacePlugin(entry.repoUrl, entry.id);
        setInstalledIds((prev) => new Set([...prev, entry.id]));
        onPluginsChanged();
      } catch (err) {
        setError(String(err));
      } finally {
        setInstalling(null);
      }
    },
    [onPluginsChanged]
  );

  const handleUninstall = useCallback(
    async (pluginId: string) => {
      setUninstalling(pluginId);
      try {
        await uninstallMarketplacePlugin(pluginId);
        setInstalledIds((prev) => {
          const next = new Set(prev);
          next.delete(pluginId);
          return next;
        });
        onPluginsChanged();
      } catch (err) {
        setError(String(err));
      } finally {
        setUninstalling(null);
      }
    },
    [onPluginsChanged]
  );
  function formatStars(n: number): string {
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
    return String(n);
  }

  return (
    <section className="rounded-[24px] border border-[color:var(--shell-border)] bg-[color:var(--shell-fill-muted)] p-4 md:p-5">
      <div className="mb-4">
        <div className="text-xl font-semibold text-[color:var(--shell-text-primary)]">
          {zh ? "插件市场" : "Plugin Marketplace"}
        </div>
        <div className="mt-1 text-sm text-[color:var(--shell-text-secondary)]">
          {zh
            ? "浏览和安装社区插件"
            : "Browse and install community plugins"}
        </div>
      </div>

      <div className="mb-4 flex items-center gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={zh ? "搜索插件..." : "Search plugins..."}
          className="flex-1 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-[color:var(--shell-text-primary)] placeholder:text-[color:var(--shell-text-tertiary)] outline-none focus:border-white/20"
        />
        <button
          type="button"
          onClick={() => setSortBy("stars")}
          className={clsx(
            "rounded-lg px-3 py-2 text-xs font-medium transition-colors",
            sortBy === "stars"
              ? "bg-white/15 text-[color:var(--shell-text-primary)]"
              : "text-[color:var(--shell-text-tertiary)] hover:text-[color:var(--shell-text-secondary)]"
          )}
        >
          Stars
        </button>
        <button
          type="button"
          onClick={() => setSortBy("updated")}
          className={clsx(
            "rounded-lg px-3 py-2 text-xs font-medium transition-colors",
            sortBy === "updated"
              ? "bg-white/15 text-[color:var(--shell-text-primary)]"
              : "text-[color:var(--shell-text-tertiary)] hover:text-[color:var(--shell-text-secondary)]"
          )}
        >
          {zh ? "最近更新" : "Updated"}
        </button>
      </div>
      {error && (
        <div className="mb-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center text-sm text-[color:var(--shell-text-tertiary)]">
          {zh ? "加载中..." : "Loading registry..."}
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center text-sm text-[color:var(--shell-text-tertiary)]">
          {zh ? "没有找到插件" : "No plugins found"}
        </div>
      ) : (
        <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
          {filtered.map((entry) => {
            const isInstalled = installedIds.has(entry.id);
            const isInstallingThis = installing === entry.id;
            const isUninstallingThis = uninstalling === entry.id;

            return (
              <div
                key={entry.id}
                className="rounded-2xl border border-white/8 bg-black/20 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-[color:var(--shell-text-primary)]">
                        {entry.name}
                      </span>
                      <span className="text-xs text-yellow-400/80">
                        ★ {formatStars(entry.stars)}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-[color:var(--shell-text-secondary)] line-clamp-2">
                      {entry.description}
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-[10px] text-[color:var(--shell-text-tertiary)]">
                      <span>{entry.author}</span>
                      <span>·</span>
                      <span>v{entry.version}</span>
                      {entry.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-md bg-white/5 px-1.5 py-0.5"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex-shrink-0">
                    {isInstalled ? (
                      <button
                        type="button"
                        disabled={isUninstallingThis}
                        onClick={() => handleUninstall(entry.id)}
                        className="group flex items-center gap-1 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-emerald-400 transition-colors hover:border-red-400/30 hover:text-red-400"
                      >
                        <span className="group-hover:hidden">
                          {isUninstallingThis
                            ? zh ? "卸载中..." : "Removing..."
                            : zh ? "已安装 ✓" : "Installed ✓"}
                        </span>
                        <span className="hidden group-hover:inline">
                          {zh ? "卸载" : "Uninstall"}
                        </span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={isInstallingThis}
                        onClick={() => handleInstall(entry)}
                        className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-[color:var(--shell-text-primary)] transition-colors hover:bg-white/15 disabled:opacity-50"
                      >
                        {isInstallingThis
                          ? zh ? "安装中..." : "Installing..."
                          : zh ? "安装" : "Install"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
