import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { Check, Code2, Copy, Eye } from "lucide-react";
import type { BundledTheme } from "shiki";
import { renderMarkdown } from "../../lib/markdown";
import { CodeViewer } from "./CodeViewer";

export interface MdViewerProps {
  content: string;
  filename: string;
  theme: BundledTheme;
  fontSize?: number;
}

type MdViewMode = "preview" | "raw";

export function MdViewer({ content, filename, theme, fontSize = 14 }: MdViewerProps) {
  const [mode, setMode] = useState<MdViewMode>("preview");
  const [rendered, setRendered] = useState<{ key: string; html: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const renderKey = `${theme}\0${content}`;

  const stats = useMemo(() => {
    const trimmed = content.trim();
    const words = trimmed ? trimmed.split(/\s+/).length : 0;
    const minutes = Math.max(1, Math.ceil(words / 220));
    return { words, minutes };
  }, [content]);

  useEffect(() => {
    if (mode !== "preview") return;

    let cancelled = false;
    setError(null);

    renderMarkdown(content, theme)
      .then((html) => {
        if (!cancelled) {
          setRendered({ key: renderKey, html });
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [content, theme, mode, renderKey]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [filename, mode]);

  const handleArticleClick = (event: MouseEvent<HTMLElement>) => {
    const anchor = (event.target as HTMLElement | null)?.closest("a");
    if (!anchor) return;

    const href = anchor.getAttribute("href");
    if (!href) return;

    // Prevent the Tauri webview from navigating away from the app shell.
    event.preventDefault();

    if (href.startsWith("#")) {
      const targetId = decodeURIComponent(href.slice(1));
      const target = document.getElementById(targetId);
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Ignore clipboard failures.
    }
  };

  const isRendering = mode === "preview" && rendered?.key !== renderKey && !error;

  return (
    <div className="flex h-full flex-col bg-[var(--bg-canvas)] text-[var(--fg-primary)]">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-[var(--border-subtle)] px-4 text-xs">
        <div className="flex items-center gap-2.5 text-[var(--fg-muted)]">
          <span className="rounded border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--fg-secondary)]">
            markdown
          </span>
          <span className="tabular-nums">
            {stats.words.toLocaleString()} {stats.words === 1 ? "word" : "words"}
          </span>
          <span className="opacity-40">·</span>
          <span className="tabular-nums">{stats.minutes} min read</span>
        </div>

        <div className="flex items-center gap-2">
          <div
            role="tablist"
            aria-label="Markdown view mode"
            className="inline-flex items-center rounded-md border border-[var(--border-subtle)] bg-[var(--bg-subtle)] p-0.5"
          >
            <button
              type="button"
              role="tab"
              aria-selected={mode === "preview"}
              onClick={() => setMode("preview")}
              className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs font-medium transition-colors ${
                mode === "preview"
                  ? "bg-[var(--bg-elevated)] text-[var(--fg-primary)] shadow-xs"
                  : "text-[var(--fg-muted)] hover:text-[var(--fg-primary)]"
              }`}
            >
              <Eye className="h-3.5 w-3.5" />
              <span>Preview</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "raw"}
              onClick={() => setMode("raw")}
              className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs font-medium transition-colors ${
                mode === "raw"
                  ? "bg-[var(--bg-elevated)] text-[var(--fg-primary)] shadow-xs"
                  : "text-[var(--fg-muted)] hover:text-[var(--fg-primary)]"
              }`}
            >
              <Code2 className="h-3.5 w-3.5" />
              <span>Raw</span>
            </button>
          </div>

          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-[var(--fg-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--fg-primary)]"
            title="Copy Markdown source"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-500" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>
      </div>

      {mode === "raw" ? (
        <div className="min-h-0 flex-1">
          <CodeViewer
            content={content}
            filename={filename}
            theme={theme}
            fontSize={fontSize}
            lang="markdown"
            hideHeader
          />
        </div>
      ) : (
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
          {error ? (
            <div className="mx-auto max-w-2xl px-10 py-12 text-sm text-rose-500">
              Failed to render Markdown: {error}
            </div>
          ) : isRendering ? (
            <div className="mx-auto max-w-[800px] space-y-3 px-11 py-10">
              <div className="h-6 w-1/3 animate-pulse rounded bg-[var(--bg-subtle)]" />
              <div className="h-4 w-5/6 animate-pulse rounded bg-[var(--bg-subtle)] opacity-80" />
              <div className="h-4 w-2/3 animate-pulse rounded bg-[var(--bg-subtle)] opacity-70" />
            </div>
          ) : (
            <article
              className="md-body"
              onClick={handleArticleClick}
              dangerouslySetInnerHTML={{ __html: rendered?.html ?? "" }}
            />
          )}
        </div>
      )}
    </div>
  );
}
