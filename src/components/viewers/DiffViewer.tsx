import { useMemo, useState } from "react";
import { processFile, type FileDiffMetadata } from "@pierre/diffs";
import { FileDiff } from "@pierre/diffs/react";
import { Columns2, FileDiff as FileDiffIcon, Rows2 } from "lucide-react";
import type { ThemeDefinition } from "../../lib/themes";
import type { DiffLine, FileDiffPayload } from "../../types/ipc";

export interface DiffViewerProps {
  diff: FileDiffPayload;
  theme: ThemeDefinition;
}

type DiffStyleMode = "split" | "unified";

function linePrefix(tag: DiffLine["tag"]): string {
  switch (tag) {
    case "insert":
      return "+";
    case "delete":
      return "-";
    default:
      return " ";
  }
}

function formatGitHeaderPath(prefix: "a/" | "b/", path: string): string {
  const full = `${prefix}${path}`;
  if (/[\s"\\]/.test(full)) {
    return `"${full.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return full;
}

/**
 * Serializes Rust's precomputed `similar` hunks into a git unified patch string
 * so `@pierre/diffs` renders them without recomputing the diff in JavaScript.
 */
function buildPatchFromRustHunks(diff: FileDiffPayload): string {
  const isNew = diff.old_content.length === 0 && diff.new_content.length > 0;
  const isDeleted = diff.old_content.length > 0 && diff.new_content.length === 0;
  const aPath = formatGitHeaderPath("a/", diff.path);
  const bPath = formatGitHeaderPath("b/", diff.path);

  const lines: string[] = [`diff --git ${aPath} ${bPath}`];
  if (isNew) {
    lines.push("new file mode 100644");
    lines.push("--- /dev/null");
    lines.push(`+++ ${bPath}`);
  } else if (isDeleted) {
    lines.push("deleted file mode 100644");
    lines.push(`--- ${aPath}`);
    lines.push("+++ /dev/null");
  } else {
    lines.push(`--- ${aPath}`);
    lines.push(`+++ ${bPath}`);
  }

  for (const hunk of diff.hunks) {
    const oldStart = hunk.old_lines === 0 ? Math.max(0, hunk.old_start - 1) : hunk.old_start;
    const newStart = hunk.new_lines === 0 ? Math.max(0, hunk.new_start - 1) : hunk.new_start;
    lines.push(`@@ -${oldStart},${hunk.old_lines} +${newStart},${hunk.new_lines} @@`);

    for (const line of hunk.lines) {
      const text = line.segments.map((s) => s.text).join("");
      const hasNewline = text.endsWith("\n");
      const body = hasNewline ? text.slice(0, -1) : text;
      lines.push(`${linePrefix(line.tag)}${body}`);
      if (!hasNewline) {
        lines.push("\\ No newline at end of file");
      }
    }
  }

  return `${lines.join("\n")}\n`;
}

function toPierreMetadata(diff: FileDiffPayload): FileDiffMetadata | null {
  if (diff.is_binary || diff.hunks.length === 0) return null;

  const patch = buildPatchFromRustHunks(diff);
  const metadata = processFile(patch, {
    isGitDiff: true,
    oldFile: { name: diff.path, contents: diff.old_content },
    newFile: { name: diff.path, contents: diff.new_content },
  });

  return metadata ?? null;
}

export function DiffViewer({ diff, theme }: DiffViewerProps) {
  const [diffStyle, setDiffStyle] = useState<DiffStyleMode>("split");

  const fileDiff = useMemo(() => toPierreMetadata(diff), [diff]);

  const options = useMemo(
    () => ({
      diffStyle,
      theme: theme.shikiTheme,
      themeType: theme.appearance,
      disableFileHeader: true,
      overflow: "scroll" as const,
    }),
    [diffStyle, theme.shikiTheme, theme.appearance],
  );

  const changeBadge = useMemo(() => {
    if (diff.old_content.length === 0 && diff.new_content.length > 0) {
      return {
        label: "Added",
        cls: "bg-emerald-500/12 text-emerald-500",
      };
    }
    if (diff.old_content.length > 0 && diff.new_content.length === 0) {
      return {
        label: "Deleted",
        cls: "bg-rose-500/12 text-rose-500",
      };
    }
    return {
      label: "Modified",
      cls: "bg-amber-500/12 text-amber-500",
    };
  }, [diff.old_content.length, diff.new_content.length]);

  return (
    <div className="flex h-full flex-col bg-[var(--bg-canvas)] text-[var(--fg-primary)]">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-[var(--border-subtle)] px-4 text-xs">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium ${changeBadge.cls}`}>
            {changeBadge.label}
          </span>
          <span className="truncate font-mono text-[var(--fg-secondary)]">{diff.path}</span>
          {!diff.is_binary && (
            <div className="flex shrink-0 items-center gap-1.5 font-mono text-[11px] tabular-nums">
              <span className="text-emerald-500">+{diff.additions}</span>
              <span className="text-rose-500">-{diff.deletions}</span>
            </div>
          )}
        </div>

        <div
          role="tablist"
          aria-label="Diff layout mode"
          className="inline-flex shrink-0 items-center rounded-md border border-[var(--border-subtle)] bg-[var(--bg-subtle)] p-0.5"
        >
          <button
            type="button"
            role="tab"
            aria-selected={diffStyle === "split"}
            onClick={() => setDiffStyle("split")}
            className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs font-medium transition-colors ${
              diffStyle === "split"
                ? "bg-[var(--bg-elevated)] text-[var(--fg-primary)] shadow-xs"
                : "text-[var(--fg-muted)] hover:text-[var(--fg-primary)]"
            }`}
          >
            <Columns2 className="h-3.5 w-3.5" />
            <span>Split</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={diffStyle === "unified"}
            onClick={() => setDiffStyle("unified")}
            className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs font-medium transition-colors ${
              diffStyle === "unified"
                ? "bg-[var(--bg-elevated)] text-[var(--fg-primary)] shadow-xs"
                : "text-[var(--fg-muted)] hover:text-[var(--fg-primary)]"
            }`}
          >
            <Rows2 className="h-3.5 w-3.5" />
            <span>Unified</span>
          </button>
        </div>
      </div>

      {diff.is_binary ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-[var(--fg-muted)]">
          <FileDiffIcon className="h-8 w-8 stroke-[1.4] opacity-70" />
          <p className="text-sm font-medium text-[var(--fg-primary)]">Binary or oversized file</p>
          <p className="text-xs text-[var(--fg-muted)]">
            Diff view is unavailable for binary files or files over 5 MB.
          </p>
        </div>
      ) : !fileDiff ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-[var(--fg-muted)]">
          <FileDiffIcon className="h-8 w-8 stroke-[1.4] opacity-70" />
          <p className="text-sm font-medium text-[var(--fg-primary)]">No textual changes</p>
          <p className="text-xs text-[var(--fg-muted)]">
            Working tree matches HEAD for this file.
          </p>
        </div>
      ) : (
        <div className="selectable min-h-0 flex-1 overflow-auto">
          <FileDiff
            fileDiff={fileDiff}
            options={options}
            disableWorkerPool
            className="block min-h-full"
          />
        </div>
      )}
    </div>
  );
}
