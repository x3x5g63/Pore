import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  FileCode2,
  FileText,
  Folder,
  FolderGit2,
  FolderOpen,
  GitBranch,
  RefreshCw,
} from "lucide-react";
import { listDir } from "../lib/tauri";
import type { ChangeStatus, FileNode, GitChangeItem } from "../types/ipc";

export type SidebarTab = "files" | "changes";

export interface SidebarProps {
  repoPath: string | null;
  tab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
  selectedPath: string | null;
  selectedMode: "file" | "diff";
  changes: GitChangeItem[];
  isGitRepo: boolean;
  refreshing: boolean;
  refreshSeq: number;
  onSelectFile: (relPath: string, mode: "file" | "diff") => void;
  onOpenFolder: () => void;
  onRefresh: () => void;
}

const STATUS_BADGE: Record<ChangeStatus, { label: string; cls: string }> = {
  modified: { label: "M", cls: "text-amber-500" },
  added: { label: "A", cls: "text-emerald-500" },
  untracked: { label: "U", cls: "text-emerald-500" },
  deleted: { label: "D", cls: "text-rose-500" },
  renamed: { label: "R", cls: "text-sky-500" },
  conflicted: { label: "C", cls: "text-orange-500" },
};

function isMarkdownName(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.endsWith(".md") || lower.endsWith(".markdown") || lower.endsWith(".mdx");
}

function splitChangePath(relPath: string): { name: string; dir: string } {
  const idx = relPath.lastIndexOf("/");
  if (idx === -1) return { name: relPath, dir: "" };
  return { name: relPath.slice(idx + 1), dir: relPath.slice(0, idx) };
}

export function Sidebar({
  repoPath,
  tab,
  onTabChange,
  selectedPath,
  selectedMode,
  changes,
  isGitRepo,
  refreshing,
  refreshSeq,
  onSelectFile,
  onOpenFolder,
  onRefresh,
}: SidebarProps) {
  const [childrenByDir, setChildrenByDir] = useState<Record<string, FileNode[]>>({});
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(() => new Set());
  const [loadingDirs, setLoadingDirs] = useState<Set<string>>(() => new Set());
  const [treeError, setTreeError] = useState<string | null>(null);

  const repoName = useMemo(() => {
    if (!repoPath) return "Pore";
    const parts = repoPath.replace(/[\\/]+$/, "").split(/[\\/]/);
    return parts[parts.length - 1] || repoPath;
  }, [repoPath]);

  const changesByPath = useMemo(() => {
    const map = new Map<string, GitChangeItem>();
    for (const item of changes) {
      map.set(item.path, item);
    }
    return map;
  }, [changes]);

  const loadDirectory = useCallback(
    async (subPath: string) => {
      if (!repoPath) return;
      setLoadingDirs((prev) => {
        const next = new Set(prev);
        next.add(subPath);
        return next;
      });
      try {
        const nodes = await listDir(repoPath, subPath || undefined);
        setChildrenByDir((prev) => ({ ...prev, [subPath]: nodes }));
        if (subPath === "") setTreeError(null);
      } catch (err) {
        if (subPath === "") {
          setTreeError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        setLoadingDirs((prev) => {
          const next = new Set(prev);
          next.delete(subPath);
          return next;
        });
      }
    },
    [repoPath],
  );

  useEffect(() => {
    setChildrenByDir({});
    setExpandedDirs(new Set());
    setTreeError(null);
    if (repoPath) {
      void loadDirectory("");
    }
  }, [repoPath, loadDirectory]);

  useEffect(() => {
    if (!repoPath || refreshSeq === 0) return;
    void loadDirectory("");
    for (const dir of expandedDirs) {
      void loadDirectory(dir);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSeq]);

  const toggleDir = (relPath: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(relPath)) {
        next.delete(relPath);
      } else {
        next.add(relPath);
        if (!childrenByDir[relPath]) {
          void loadDirectory(relPath);
        }
      }
      return next;
    });
  };

  const renderTreeNodes = (subPath: string, depth: number) => {
    const nodes = childrenByDir[subPath];
    if (!nodes) {
      if (loadingDirs.has(subPath)) {
        return (
          <div
            className="py-1 text-[11px] text-[var(--fg-muted)]"
            style={{ paddingLeft: `${depth * 14 + 28}px` }}
          >
            Loading…
          </div>
        );
      }
      return null;
    }

    if (nodes.length === 0 && depth === 0) {
      return (
        <div className="px-3 py-6 text-center text-xs text-[var(--fg-muted)]">Empty folder</div>
      );
    }

    return nodes.map((node) => {
      if (node.is_dir) {
        const isExpanded = expandedDirs.has(node.rel_path);
        return (
          <div key={node.rel_path}>
            <button
              type="button"
              onClick={() => toggleDir(node.rel_path)}
              className="flex h-7 w-full items-center gap-1.5 rounded-md pr-2 text-left text-[13px] text-[var(--fg-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--fg-primary)]"
              style={{ paddingLeft: `${depth * 14 + 8}px` }}
            >
              {isExpanded ? (
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[var(--fg-muted)]" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[var(--fg-muted)]" />
              )}
              {isExpanded ? (
                <FolderOpen className="h-3.5 w-3.5 shrink-0 text-[var(--fg-muted)]" />
              ) : (
                <Folder className="h-3.5 w-3.5 shrink-0 text-[var(--fg-muted)]" />
              )}
              <span className="truncate">{node.name}</span>
            </button>
            {isExpanded && renderTreeNodes(node.rel_path, depth + 1)}
          </div>
        );
      }

      const isSelected = selectedPath === node.rel_path && selectedMode === "file";
      const change = changesByPath.get(node.rel_path);
      const status = change?.worktree_status ?? change?.index_status ?? null;
      const badge = status ? STATUS_BADGE[status] : null;

      return (
        <button
          key={node.rel_path}
          type="button"
          onClick={() => onSelectFile(node.rel_path, "file")}
          className={`flex h-7 w-full items-center justify-between gap-2 rounded-md pr-2.5 text-left text-[13px] transition-colors ${
            isSelected
              ? "bg-[var(--bg-active)] font-medium text-[var(--fg-primary)]"
              : "text-[var(--fg-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--fg-primary)]"
          }`}
          style={{ paddingLeft: `${depth * 14 + 26}px` }}
          title={node.rel_path}
        >
          <span className="flex min-w-0 items-center gap-1.5">
            {isMarkdownName(node.name) ? (
              <FileText
                className={`h-3.5 w-3.5 shrink-0 ${
                  isSelected ? "text-[var(--accent)]" : "text-[var(--fg-muted)]"
                }`}
              />
            ) : (
              <FileCode2
                className={`h-3.5 w-3.5 shrink-0 ${
                  isSelected ? "text-[var(--accent)]" : "text-[var(--fg-muted)]"
                }`}
              />
            )}
            <span className="truncate">{node.name}</span>
          </span>
          {badge && (
            <span className={`shrink-0 font-mono text-[10px] font-semibold ${badge.cls}`}>
              {badge.label}
            </span>
          )}
        </button>
      );
    });
  };

  return (
    <aside className="flex h-full w-[256px] shrink-0 flex-col bg-transparent select-none">
      {/* Top drag region: blends seamlessly into window chrome (no hard hairline divider). */}
      <div
        data-tauri-drag-region
        className="flex h-11 shrink-0 items-center justify-between pr-2.5 pl-[76px]"
      >
        <span
          data-tauri-drag-region
          className="truncate text-[13px] font-semibold tracking-[-0.015em] text-[var(--fg-primary)]"
          title={repoPath ?? undefined}
        >
          {repoName}
        </span>

        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={onOpenFolder}
            className="rounded-md p-1.5 text-[var(--fg-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--fg-primary)]"
            title="Open Folder (⌘O)"
          >
            <FolderOpen className="h-3.5 w-3.5" />
          </button>
          {repoPath && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              className="rounded-md p-1.5 text-[var(--fg-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--fg-primary)] disabled:opacity-50"
              title="Refresh Files & Git Status"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            </button>
          )}
        </div>
      </div>

      {/* Mode switcher: Files vs Changes */}
      <div className="shrink-0 px-2.5 pb-2">
        <div className="flex items-center gap-0.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-subtle)] p-0.5">
          <button
            type="button"
            onClick={() => onTabChange("files")}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1 text-xs font-medium transition-colors ${
              tab === "files"
                ? "bg-[var(--bg-elevated)] text-[var(--fg-primary)] shadow-xs"
                : "text-[var(--fg-muted)] hover:text-[var(--fg-primary)]"
            }`}
          >
            <FolderGit2 className="h-3.5 w-3.5" />
            <span>Files</span>
          </button>

          <button
            type="button"
            onClick={() => onTabChange("changes")}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1 text-xs font-medium transition-colors ${
              tab === "changes"
                ? "bg-[var(--bg-elevated)] text-[var(--fg-primary)] shadow-xs"
                : "text-[var(--fg-muted)] hover:text-[var(--fg-primary)]"
            }`}
          >
            <GitBranch className="h-3.5 w-3.5" />
            <span>Changes</span>
            {changes.length > 0 && (
              <span className="rounded-full bg-[var(--accent-soft)] px-1.5 py-px font-mono text-[10px] leading-none font-medium tabular-nums text-[var(--accent)]">
                {changes.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Scrollable tree / changes list */}
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {!repoPath ? (
          <div className="flex h-full flex-col items-center justify-center gap-2.5 px-4 text-center">
            <p className="text-xs text-[var(--fg-muted)]">No folder open</p>
            <button
              type="button"
              onClick={onOpenFolder}
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-2.5 py-1 text-xs font-medium text-[var(--fg-primary)] transition-colors hover:bg-[var(--bg-hover)]"
            >
              <FolderOpen className="h-3.5 w-3.5" />
              <span>Open Folder</span>
            </button>
          </div>
        ) : tab === "files" ? (
          treeError ? (
            <div className="px-3 py-4 text-xs text-rose-500">{treeError}</div>
          ) : (
            renderTreeNodes("", 0)
          )
        ) : !isGitRepo ? (
          <div className="px-3 py-8 text-center text-xs text-[var(--fg-muted)]">
            Not a Git repository
          </div>
        ) : changes.length === 0 ? (
          <div className="px-3 py-8 text-center text-xs text-[var(--fg-muted)]">
            Working tree clean
          </div>
        ) : (
          <div className="space-y-0.5">
            {changes.map((item) => {
              const isSelected = selectedPath === item.path && selectedMode === "diff";
              const status = item.worktree_status ?? item.index_status ?? "modified";
              const badge = STATUS_BADGE[status];
              const { name, dir } = splitChangePath(item.path);

              return (
                <button
                  key={item.path}
                  type="button"
                  onClick={() => onSelectFile(item.path, "diff")}
                  className={`flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left transition-colors ${
                    isSelected
                      ? "bg-[var(--bg-active)] text-[var(--fg-primary)]"
                      : "text-[var(--fg-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--fg-primary)]"
                  }`}
                  title={item.path}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] leading-tight font-medium">{name}</div>
                    {dir && (
                      <div className="truncate text-[11px] leading-tight text-[var(--fg-muted)]">
                        {dir}
                      </div>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5">
                    {item.index_status && item.worktree_status && (
                      <span
                        className="h-1.5 w-1.5 rounded-full bg-emerald-500"
                        title="Staged + unstaged changes"
                      />
                    )}
                    <span className={`font-mono text-[11px] font-semibold ${badge.cls}`}>
                      {badge.label}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}
