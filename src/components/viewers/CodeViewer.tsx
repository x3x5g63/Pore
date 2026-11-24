import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Check, Copy, FileCode2 } from "lucide-react";
import type { BundledTheme } from "shiki";
import type { ShikiHighlightRequest, ShikiHighlightResponse } from "../../workers/shiki.worker";

export interface CodeViewerProps {
  content: string;
  filename: string;
  theme: BundledTheme;
  fontSize?: number;
  lang?: string;
  isBinary?: boolean;
  /** Hide the compact top status bar (e.g. when embedded inside MdViewer raw mode). */
  hideHeader?: boolean;
}

let sharedWorker: Worker | null = null;
let nextRequestId = 1;
const pendingRequests = new Map<
  number,
  {
    resolve: (value: { lang: string; lines: string[] }) => void;
    reject: (reason: Error) => void;
  }
>();

function getShikiWorker(): Worker {
  if (!sharedWorker) {
    sharedWorker = new Worker(new URL("../../workers/shiki.worker.ts", import.meta.url), {
      type: "module",
    });
    sharedWorker.onmessage = (event: MessageEvent<ShikiHighlightResponse>) => {
      const msg = event.data;
      const pending = pendingRequests.get(msg.id);
      if (!pending) return;
      pendingRequests.delete(msg.id);

      if ("error" in msg) {
        pending.reject(new Error(msg.error));
      } else {
        pending.resolve({ lang: msg.lang, lines: msg.lines });
      }
    };
    sharedWorker.onerror = (event) => {
      const err = new Error(event.message || "Shiki worker error");
      for (const pending of pendingRequests.values()) {
        pending.reject(err);
      }
      pendingRequests.clear();
      sharedWorker?.terminate();
      sharedWorker = null;
    };
  }
  return sharedWorker;
}

function highlightInWorker(
  code: string,
  filename: string,
  theme: BundledTheme,
  lang?: string,
): { promise: Promise<{ lang: string; lines: string[] }>; cancel: () => void } {
  const id = nextRequestId++;
  const worker = getShikiWorker();

  const promise = new Promise<{ lang: string; lines: string[] }>((resolve, reject) => {
    pendingRequests.set(id, { resolve, reject });
    const req: ShikiHighlightRequest = { id, code, theme, filename, lang };
    worker.postMessage(req);
  });

  return {
    promise,
    cancel: () => {
      pendingRequests.delete(id);
    },
  };
}

export function CodeViewer({
  content,
  filename,
  theme,
  fontSize = 14,
  lang,
  isBinary = false,
  hideHeader = false,
}: CodeViewerProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [highlighted, setHighlighted] = useState<{
    key: string;
    lang: string;
    lines: string[];
  } | null>(null);
  const [copied, setCopied] = useState(false);

  const lineHeight = Math.round(fontSize * 1.6);

  const rawLines = useMemo(() => {
    if (isBinary || content.length === 0) return [];
    return content.split(/\r?\n/);
  }, [content, isBinary]);

  const highlightKey = `${filename}\0${theme}\0${lang ?? ""}\0${content.length}\0${content.slice(0, 64)}`;

  useEffect(() => {
    if (isBinary || content.length === 0) return;

    let cancelled = false;
    const { promise, cancel } = highlightInWorker(content, filename, theme, lang);

    promise
      .then((res) => {
        if (!cancelled) {
          setHighlighted({ key: highlightKey, lang: res.lang, lines: res.lines });
        }
      })
      .catch(() => {
        // Keep plain text fallback on highlight error.
      });

    return () => {
      cancelled = true;
      cancel();
    };
  }, [content, filename, theme, lang, isBinary, highlightKey]);

  useEffect(() => {
    scrollContainerRef.current?.scrollTo({ top: 0, left: 0 });
  }, [filename]);

  const activeHighlight = highlighted?.key === highlightKey ? highlighted : null;
  const lineCount = activeHighlight ? activeHighlight.lines.length : rawLines.length;
  const gutterCh = Math.max(3, String(Math.max(1, lineCount)).length);

  const virtualizer = useVirtualizer({
    count: lineCount,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => lineHeight,
    overscan: 30,
  });

  // Re-measure virtualized rows whenever fontSize / lineHeight changes.
  useEffect(() => {
    virtualizer.measure();
  }, [lineHeight, virtualizer]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Ignore clipboard failures in restricted environments.
    }
  };

  if (isBinary) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-[var(--fg-muted)]">
        <FileCode2 className="h-8 w-8 stroke-[1.4] opacity-70" />
        <p className="text-sm font-medium text-[var(--fg-primary)]">Binary or oversized file</p>
        <p className="text-xs text-[var(--fg-muted)]">
          Preview is disabled for binary files and files over 5 MB.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-[var(--bg-canvas)] text-[var(--fg-primary)]">
      {!hideHeader && (
        <div className="flex h-9 shrink-0 items-center justify-between border-b border-[var(--border-subtle)] px-4 text-xs text-[var(--fg-muted)]">
          <div className="flex items-center gap-2.5">
            <span className="rounded border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--fg-secondary)]">
              {activeHighlight?.lang ?? lang ?? "text"}
            </span>
            <span className="tabular-nums">
              {lineCount.toLocaleString()} {lineCount === 1 ? "line" : "lines"}
            </span>
          </div>

          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-[var(--fg-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--fg-primary)]"
            title="Copy file contents"
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
      )}

      {lineCount === 0 ? (
        <div className="flex flex-1 items-center justify-center text-xs text-[var(--fg-muted)]">
          Empty file
        </div>
      ) : (
        <div
          ref={scrollContainerRef}
          className="code-body shiki flex-1 overflow-auto"
          style={{
            fontFamily: "var(--code-font-family)",
            fontSize: `${fontSize}px`,
            lineHeight: `${lineHeight}px`,
          }}
        >
          <div
            className="relative min-w-max py-3"
            style={{ height: `${virtualizer.getTotalSize() + 24}px` }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const idx = virtualRow.index;
              const htmlLine = activeHighlight?.lines[idx];
              const rawLine = rawLines[idx] ?? "";

              return (
                <div
                  key={virtualRow.key}
                  className="group absolute left-0 right-0 flex hover:bg-[var(--bg-hover)]"
                  style={{
                    top: `${virtualRow.start + 12}px`,
                    height: `${lineHeight}px`,
                  }}
                >
                  <span
                    aria-hidden="true"
                    className="sticky left-0 z-10 shrink-0 select-none border-r border-[var(--border-subtle)] bg-[var(--bg-canvas)] pr-3 pl-4 text-right text-xs tabular-nums text-[var(--fg-muted)] group-hover:text-[var(--fg-secondary)]"
                    style={{
                      width: `calc(${gutterCh}ch + 28px)`,
                      lineHeight: `${lineHeight}px`,
                    }}
                  >
                    {idx + 1}
                  </span>

                  {htmlLine !== undefined ? (
                    <span
                      className="whitespace-pre pr-8 pl-4"
                      dangerouslySetInnerHTML={{ __html: htmlLine || " " }}
                    />
                  ) : (
                    <span className="whitespace-pre pr-8 pl-4 text-[var(--fg-primary)]">
                      {rawLine || " "}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
