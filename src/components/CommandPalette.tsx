import { useEffect, useMemo, useRef, useState } from "react";
import { FileCode2, FileText, Search } from "lucide-react";
import type { ChangeStatus, FileNode, GitChangeItem } from "../types/ipc";

export interface CommandPaletteProps {
  open: boolean;
  files: FileNode[];
  loading: boolean;
  changes: GitChangeItem[];
  onClose: () => void;
  onSelectFile: (relPath: string) => void;
}

interface ScoredMatch {
  node: FileNode;
  score: number;
  positions: Set<number>;
}

const MAX_RESULTS = 50;

const STATUS_LABEL: Record<ChangeStatus, { text: string; cls: string }> = {
  modified: { text: "M", cls: "text-amber-500" },
  added: { text: "A", cls: "text-emerald-500" },
  untracked: { text: "U", cls: "text-emerald-500" },
  deleted: { text: "D", cls: "text-rose-500" },
  renamed: { text: "R", cls: "text-sky-500" },
  conflicted: { text: "C", cls: "text-orange-500" },
};

function fuzzyMatchPath(query: string, relPath: string): { score: number; positions: Set<number> } | null {
  const q = query.trim().toLowerCase();
  if (!q) return { score: 0, positions: new Set() };

  const target = relPath.toLowerCase();
  const baseStart = relPath.lastIndexOf("/") + 1;

  const positions = new Set<number>();
  let qi = 0;
  let score = 0;
  let prevMatch = -2;

  for (let ti = 0; ti < target.length && qi < q.length; ti++) {
    if (target[ti] === q[qi]) {
      positions.add(ti);
      let pts = 1;
      if (ti === prevMatch + 1) pts += 6;
      if (
        ti === 0 ||
        target[ti - 1] === "/" ||
        target[ti - 1] === "_" ||
        target[ti - 1] === "-" ||
        target[ti - 1] === "."
      ) {
        pts += 5;
      }
      if (ti >= baseStart) pts += 4;
      score += pts;
      prevMatch = ti;
      qi++;
    }
  }

  if (qi < q.length) return null;

  const baseName = target.slice(baseStart);
  if (baseName.startsWith(q)) score += 40;
  else if (baseName.includes(q)) score += 20;

  score -= relPath.length * 0.05;

  return { score, positions };
}

function HighlightedPath({ text, positions }: { text: string; positions: Set<number> }) {
  if (positions.size === 0) return <>{text}</>;
  const parts: Array<{ text: string; match: boolean }> = [];
  let buf = "";
  let bufMatch = positions.has(0);

  for (let i = 0; i < text.length; i++) {
    const isMatch = positions.has(i);
    if (isMatch !== bufMatch && buf.length > 0) {
      parts.push({ text: buf, match: bufMatch });
      buf = "";
    }
    buf += text[i];
    bufMatch = isMatch;
  }
  if (buf.length > 0) parts.push({ text: buf, match: bufMatch });

  return (
    <>
      {parts.map((part, idx) =>
        part.match ? (
          <span key={idx} className="font-semibold text-[var(--accent)]">
            {part.text}
          </span>
        ) : (
          <span key={idx}>{part.text}</span>
        ),
      )}
    </>
  );
}

export function CommandPalette({
  open,
  files,
  loading,
  changes,
  onClose,
  onSelectFile,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const changesMap = useMemo(() => {
    const map = new Map<string, GitChangeItem>();
    for (const c of changes) map.set(c.path, c);
    return map;
  }, [changes]);

  const results = useMemo<ScoredMatch[]>(() => {
    const q = query.trim();
    if (!q) {
      return files.slice(0, MAX_RESULTS).map((node) => ({
        node,
        score: 0,
        positions: new Set(),
      }));
    }

    const matches: ScoredMatch[] = [];
    for (const node of files) {
      const m = fuzzyMatchPath(q, node.rel_path);
      if (m) {
        matches.push({ node, score: m.score, positions: m.positions });
      }
    }
    matches.sort((a, b) => b.score - a.score);
    return matches.slice(0, MAX_RESULTS);
  }, [files, query]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActiveIndex(0);
    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    const activeEl = listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    activeEl?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  if (!open) return null;

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((idx) => (results.length === 0 ? 0 : (idx + 1) % results.length));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((idx) =>
        results.length === 0 ? 0 : (idx - 1 + results.length) % results.length,
      );
      return;
    }
    if (event.key === "Enter" && results[activeIndex]) {
      event.preventDefault();
      onSelectFile(results[activeIndex].node.rel_path);
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[14vh] backdrop-blur-[3px]"
      style={{ backgroundColor: "var(--backdrop)" }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Quick open file"
        className="w-full max-w-[580px] overflow-hidden rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] shadow-2xl"
      >
        <div className="flex items-center gap-2.5 border-b border-[var(--border-subtle)] px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-[var(--fg-muted)]" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Jump to file..."
            spellCheck={false}
            autoComplete="off"
            className="w-full bg-transparent text-sm text-[var(--fg-primary)] placeholder-[var(--fg-muted)] outline-none"
          />
          <kbd className="shrink-0 rounded border border-[var(--border-strong)] bg-[var(--bg-subtle)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--fg-muted)]">
            ESC
          </kbd>
        </div>

        <div ref={listRef} className="max-h-[360px] overflow-y-auto p-1.5">
          {loading && files.length === 0 ? (
            <div className="py-10 text-center text-xs text-[var(--fg-muted)]">
              Indexing files…
            </div>
          ) : results.length === 0 ? (
            <div className="py-10 text-center text-xs text-[var(--fg-muted)]">
              No matching files
            </div>
          ) : (
            results.map(({ node, positions }, index) => {
              const slash = node.rel_path.lastIndexOf("/");
              const dir = slash === -1 ? "" : node.rel_path.slice(0, slash);
              const baseOffset = slash + 1;

              const basePositions = new Set<number>();
              const dirPositions = new Set<number>();
              for (const p of positions) {
                if (p >= baseOffset) basePositions.add(p - baseOffset);
                else dirPositions.add(p);
              }

              const isActive = index === activeIndex;
              const isMd = /\.(md|markdown|mdx)$/i.test(node.name);
              const change = changesMap.get(node.rel_path);
              const status = change?.worktree_status ?? change?.index_status ?? null;
              const badge = status ? STATUS_LABEL[status] : null;

              return (
                <button
                  key={node.rel_path}
                  data-index={index}
                  type="button"
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => {
                    onSelectFile(node.rel_path);
                    onClose();
                  }}
                  className={`flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left transition-colors ${
                    isActive
                      ? "bg-[var(--bg-active)] text-[var(--fg-primary)]"
                      : "text-[var(--fg-secondary)]"
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    {isMd ? (
                      <FileText
                        className={`h-4 w-4 shrink-0 ${
                          isActive ? "text-[var(--accent)]" : "text-[var(--fg-muted)]"
                        }`}
                      />
                    ) : (
                      <FileCode2
                        className={`h-4 w-4 shrink-0 ${
                          isActive ? "text-[var(--accent)]" : "text-[var(--fg-muted)]"
                        }`}
                      />
                    )}
                    <div className="min-w-0">
                      <div className="truncate text-[13px] leading-snug text-[var(--fg-primary)]">
                        <HighlightedPath text={node.name} positions={basePositions} />
                      </div>
                      {dir && (
                        <div className="truncate text-[11px] leading-snug text-[var(--fg-muted)]">
                          <HighlightedPath text={dir} positions={dirPositions} />
                        </div>
                      )}
                    </div>
                  </div>

                  {badge && (
                    <span className={`shrink-0 font-mono text-[11px] font-semibold ${badge.cls}`}>
                      {badge.text}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-between border-t border-[var(--border-subtle)] px-4 py-2 text-[11px] text-[var(--fg-muted)]">
          <span>
            {files.length.toLocaleString()} {files.length === 1 ? "file" : "files"} indexed
          </span>
          <span>↑↓ navigate · ↵ open</span>
        </div>
      </div>
    </div>
  );
}
