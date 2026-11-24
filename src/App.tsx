import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Code2,
  FolderOpen,
  GitCompareArrows,
  Minus,
  Moon,
  Palette,
  Plus,
  RotateCcw,
  Search,
  Sun,
  Type,
} from "lucide-react";
import { CommandPalette } from "./components/CommandPalette";
import { Sidebar, type SidebarTab } from "./components/Sidebar";
import { CodeViewer } from "./components/viewers/CodeViewer";
import { DiffViewer } from "./components/viewers/DiffViewer";
import { MdViewer } from "./components/viewers/MdViewer";
import {
  getFileDiff,
  getGitChanges,
  listFiles,
  listSystemFonts,
  onFsChanged,
  readFile,
  watchRepo,
} from "./lib/tauri";
import {
  THEMES,
  applyTheme,
  getThemeById,
  loadSavedThemeId,
  type ThemeDefinition,
  type ThemeId,
} from "./lib/themes";
import type { FileContent, FileDiffPayload, FileNode, GitChangeItem } from "./types/ipc";

const LAST_REPO_KEY = "pore:lastRepoPath";
const FONT_FAMILY_KEY = "pore:fontFamily";
const FONT_SIZE_KEY = "pore:fontSize";

const DEFAULT_FONT_FAMILY = "JetBrains Mono";
const DEFAULT_FONT_SIZE = 14;
const MIN_FONT_SIZE = 11;
const MAX_FONT_SIZE = 22;

function joinPath(root: string, relPath: string): string {
  const cleanRoot = root.replace(/[\\/]+$/, "");
  const cleanRel = relPath.replace(/^[\\/]+/, "");
  return `${cleanRoot}/${cleanRel}`;
}

function isMarkdownPath(path: string): boolean {
  return /\.(md|markdown|mdx)$/i.test(path);
}

function buildFontStack(family: string): string {
  const escaped = family.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `"${escaped}", "JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace`;
}

const DARK_THEMES = THEMES.filter((t) => t.appearance === "dark");
const LIGHT_THEMES = THEMES.filter((t) => t.appearance === "light");

function ThemeSwatches({ swatches }: { swatches: ThemeDefinition["swatches"] }) {
  return (
    <span className="inline-flex shrink-0 items-center -space-x-1">
      {swatches.map((color, idx) => (
        <span
          key={idx}
          className="h-3 w-3 rounded-full border border-[var(--border-strong)]"
          style={{ backgroundColor: color }}
        />
      ))}
    </span>
  );
}

export default function App() {
  const [themeId, setThemeId] = useState<ThemeId>(() => loadSavedThemeId());
  const theme = useMemo(() => getThemeById(themeId), [themeId]);
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const themeMenuRef = useRef<HTMLDivElement>(null);

  const [fontFamily, setFontFamily] = useState<string>(() => {
    try {
      return window.localStorage.getItem(FONT_FAMILY_KEY) || DEFAULT_FONT_FAMILY;
    } catch {
      return DEFAULT_FONT_FAMILY;
    }
  });
  const [fontSize, setFontSize] = useState<number>(() => {
    try {
      const raw = Number(window.localStorage.getItem(FONT_SIZE_KEY));
      if (Number.isFinite(raw) && raw >= MIN_FONT_SIZE && raw <= MAX_FONT_SIZE) return raw;
    } catch {
      // Ignore storage errors.
    }
    return DEFAULT_FONT_SIZE;
  });
  const [fontMenuOpen, setFontMenuOpen] = useState(false);
  const [fontQuery, setFontQuery] = useState("");
  const [systemFonts, setSystemFonts] = useState<string[]>([]);
  const [loadingFonts, setLoadingFonts] = useState(false);
  const fontMenuRef = useRef<HTMLDivElement>(null);
  const fontSearchRef = useRef<HTMLInputElement>(null);

  const [repoPath, setRepoPath] = useState<string | null>(() => {
    try {
      return window.localStorage.getItem(LAST_REPO_KEY);
    } catch {
      return null;
    }
  });
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("files");
  const [paletteOpen, setPaletteOpen] = useState(false);

  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"file" | "diff">("file");

  const [fileContent, setFileContent] = useState<FileContent | null>(null);
  const [diffPayload, setDiffPayload] = useState<FileDiffPayload | null>(null);
  const [loadingView, setLoadingView] = useState(false);
  const [viewError, setViewError] = useState<string | null>(null);

  const [changes, setChanges] = useState<GitChangeItem[]>([]);
  const [isGitRepo, setIsGitRepo] = useState(false);
  const [allFiles, setAllFiles] = useState<FileNode[]>([]);
  const [indexingFiles, setIndexingFiles] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshSeq, setRefreshSeq] = useState(0);

  const loadSeqRef = useRef(0);
  const lastSelectionKeyRef = useRef<string | null>(null);

  // Sync active theme CSS variables and storage.
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Sync active typography CSS variables (applies to CodeViewer, MdViewer, and @pierre/diffs).
  useEffect(() => {
    const root = document.documentElement;
    const stack = buildFontStack(fontFamily);
    const lineHeight = `${Math.round(fontSize * 1.6)}px`;
    const size = `${fontSize}px`;

    root.style.setProperty("--code-font-family", stack);
    root.style.setProperty("--code-font-size", size);
    root.style.setProperty("--code-line-height", lineHeight);
    root.style.setProperty("--diffs-font-family", stack);
    root.style.setProperty("--diffs-font-size", size);
    root.style.setProperty("--diffs-line-height", lineHeight);

    try {
      window.localStorage.setItem(FONT_FAMILY_KEY, fontFamily);
      window.localStorage.setItem(FONT_SIZE_KEY, String(fontSize));
    } catch {
      // Ignore storage errors.
    }
  }, [fontFamily, fontSize]);

  // Lazy-load system fonts when the font menu is first opened.
  useEffect(() => {
    if (!fontMenuOpen) return;
    setFontQuery("");
    window.requestAnimationFrame(() => fontSearchRef.current?.focus());

    if (systemFonts.length > 0 || loadingFonts) return;
    setLoadingFonts(true);
    listSystemFonts()
      .then((fonts) => setSystemFonts(fonts))
      .catch(() => setSystemFonts([DEFAULT_FONT_FAMILY]))
      .finally(() => setLoadingFonts(false));
  }, [fontMenuOpen, systemFonts.length, loadingFonts]);

  // Close popovers on outside click or Escape.
  useEffect(() => {
    if (!themeMenuOpen && !fontMenuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (themeMenuOpen && themeMenuRef.current && !themeMenuRef.current.contains(target)) {
        setThemeMenuOpen(false);
      }
      if (fontMenuOpen && fontMenuRef.current && !fontMenuRef.current.contains(target)) {
        setFontMenuOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setThemeMenuOpen(false);
        setFontMenuOpen(false);
      }
    };
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [themeMenuOpen, fontMenuOpen]);

  const filteredFonts = useMemo(() => {
    const base = systemFonts.includes(DEFAULT_FONT_FAMILY)
      ? systemFonts
      : [DEFAULT_FONT_FAMILY, ...systemFonts];
    const q = fontQuery.trim().toLowerCase();
    if (!q) {
      // Surface common coding/monospace fonts first when unfiltered.
      const monoRe = /(mono|code|fira|hack|menlo|consolas|courier|iosevka|cascadia|maple|geist|meslo|sf mono|inconsolata|source code|ubuntu mono|roboto mono)/i;
      const preferred: string[] = [];
      const others: string[] = [];
      for (const name of base) {
        if (name === DEFAULT_FONT_FAMILY || monoRe.test(name)) preferred.push(name);
        else others.push(name);
      }
      return [...preferred, ...others];
    }
    return base.filter((name) => name.toLowerCase().includes(q));
  }, [systemFonts, fontQuery]);

  const toggleAppearance = useCallback(() => {
    setThemeId((current) => {
      const curr = getThemeById(current);
      return curr.appearance === "dark" ? "linear-light" : "linear-dark";
    });
  }, []);

  const repoName = useMemo(() => {
    if (!repoPath) return "";
    const parts = repoPath.replace(/[\\/]+$/, "").split(/[\\/]/);
    return parts[parts.length - 1] || repoPath;
  }, [repoPath]);

  const changesSet = useMemo(() => new Set(changes.map((c) => c.path)), [changes]);

  const loadRepoMetadata = useCallback(async (targetRepo: string) => {
    setRefreshing(true);
    setIndexingFiles(true);

    const gitPromise = getGitChanges(targetRepo)
      .then((items) => {
        setChanges(items);
        setIsGitRepo(true);
      })
      .catch(() => {
        setChanges([]);
        setIsGitRepo(false);
      });

    const filesPromise = listFiles(targetRepo)
      .then((nodes) => {
        setAllFiles(nodes);
      })
      .catch(() => {
        setAllFiles([]);
      })
      .finally(() => {
        setIndexingFiles(false);
      });

    await Promise.all([gitPromise, filesPromise]);
    setRefreshing(false);
  }, []);

  const openRepository = useCallback((nextPath: string) => {
    setRepoPath(nextPath);
    setSelectedPath(null);
    setViewMode("file");
    setFileContent(null);
    setDiffPayload(null);
    setViewError(null);
    try {
      window.localStorage.setItem(LAST_REPO_KEY, nextPath);
    } catch {
      // Ignore storage failures.
    }
  }, []);

  const handleOpenFolder = useCallback(async () => {
    try {
      const picked = await open({
        directory: true,
        multiple: false,
        title: "Open Folder",
      });
      if (typeof picked === "string" && picked.length > 0) {
        openRepository(picked);
      }
    } catch {
      // User cancelled or dialog unavailable.
    }
  }, [openRepository]);

  const handleRefresh = useCallback(() => {
    if (!repoPath) return;
    setRefreshSeq((n) => n + 1);
    void loadRepoMetadata(repoPath);
  }, [repoPath, loadRepoMetadata]);

  useEffect(() => {
    if (!repoPath) {
      setChanges([]);
      setIsGitRepo(false);
      setAllFiles([]);
      void watchRepo(null).catch(() => {});
      return;
    }

    void loadRepoMetadata(repoPath);
    void watchRepo(repoPath).catch(() => {});

    let cancelled = false;
    let unlisten: (() => void) | null = null;

    onFsChanged(() => {
      if (cancelled) return;
      setRefreshSeq((n) => n + 1);
      void loadRepoMetadata(repoPath);
    })
      .then((fn) => {
        if (cancelled) fn();
        else unlisten = fn;
      })
      .catch(() => {
        // Ignore if running outside Tauri webview.
      });

    return () => {
      cancelled = true;
      unlisten?.();
      void watchRepo(null).catch(() => {});
    };
  }, [repoPath, loadRepoMetadata]);

  useEffect(() => {
    if (!repoPath || !selectedPath) {
      lastSelectionKeyRef.current = null;
      setFileContent(null);
      setDiffPayload(null);
      setViewError(null);
      setLoadingView(false);
      return;
    }

    const selectionKey = `${repoPath}\0${selectedPath}\0${viewMode}`;
    const isSilentReload = lastSelectionKeyRef.current === selectionKey;
    lastSelectionKeyRef.current = selectionKey;

    const seq = ++loadSeqRef.current;
    if (!isSilentReload) {
      setLoadingView(true);
    }
    setViewError(null);

    if (viewMode === "diff") {
      getFileDiff(repoPath, selectedPath)
        .then((payload) => {
          if (loadSeqRef.current === seq) {
            setDiffPayload(payload);
            setFileContent(null);
          }
        })
        .catch((err) => {
          if (loadSeqRef.current === seq) {
            setViewError(err instanceof Error ? err.message : String(err));
          }
        })
        .finally(() => {
          if (loadSeqRef.current === seq) setLoadingView(false);
        });
    } else {
      readFile(joinPath(repoPath, selectedPath))
        .then((content) => {
          if (loadSeqRef.current === seq) {
            setFileContent(content);
            setDiffPayload(null);
          }
        })
        .catch((err) => {
          if (loadSeqRef.current === seq) {
            setViewError(err instanceof Error ? err.message : String(err));
          }
        })
        .finally(() => {
          if (loadSeqRef.current === seq) setLoadingView(false);
        });
    }
  }, [repoPath, selectedPath, viewMode, refreshSeq]);

  const handleSelectFile = useCallback((relPath: string, mode: "file" | "diff") => {
    setSelectedPath(relPath);
    setViewMode(mode);
  }, []);

  // Global keyboard shortcuts: Cmd+P (quick open), Cmd+O (open folder), Cmd+/-/0 (font size).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      if (!mod) return;

      const key = event.key.toLowerCase();
      if (key === "p") {
        event.preventDefault();
        if (repoPath) setPaletteOpen((open) => !open);
      } else if (key === "o") {
        event.preventDefault();
        void handleOpenFolder();
      } else if (key === "=" || key === "+") {
        event.preventDefault();
        setFontSize((s) => Math.min(MAX_FONT_SIZE, s + 1));
      } else if (key === "-") {
        event.preventDefault();
        setFontSize((s) => Math.max(MIN_FONT_SIZE, s - 1));
      } else if (key === "0") {
        event.preventDefault();
        setFontSize(DEFAULT_FONT_SIZE);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [repoPath, handleOpenFolder]);

  const breadcrumbs = useMemo(() => {
    if (!selectedPath) return [];
    return selectedPath.split("/");
  }, [selectedPath]);

  const selectedHasDiff = selectedPath !== null && isGitRepo && changesSet.has(selectedPath);

  const renderViewport = () => {
    if (!repoPath) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-5 px-6 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--border-strong)] bg-[var(--bg-subtle)] shadow-sm">
            <span
              className="h-3.5 w-3.5 rounded-full"
              style={{
                background: `radial-gradient(circle at 35% 35%, var(--accent), transparent 95%)`,
                boxShadow: "0 0 18px var(--accent-soft)",
              }}
            />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-[17px] font-semibold tracking-[-0.02em] text-[var(--fg-primary)]">
              Pore
            </h1>
            <p className="max-w-xs text-[13px] leading-relaxed text-[var(--fg-muted)]">
              Fast, zero-AI reader for source code, rendered Markdown, and Git diffs.
            </p>
          </div>
          <button
            type="button"
            onClick={handleOpenFolder}
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-3.5 py-2 text-[13px] font-medium text-[var(--fg-primary)] shadow-xs transition-colors hover:bg-[var(--bg-hover)]"
          >
            <FolderOpen className="h-3.5 w-3.5 text-[var(--accent)]" />
            <span>Open Folder</span>
            <kbd className="ml-1 rounded border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--fg-muted)]">
              ⌘O
            </kbd>
          </button>
        </div>
      );
    }

    if (!selectedPath) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3.5 px-6 text-center text-[var(--fg-muted)]">
          <p className="text-[13px]">Select a file from the sidebar or jump with Quick Open.</p>
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-3 py-1.5 text-xs font-medium text-[var(--fg-primary)] shadow-xs transition-colors hover:bg-[var(--bg-hover)]"
          >
            <Search className="h-3.5 w-3.5 text-[var(--accent)]" />
            <span>Find File</span>
            <kbd className="rounded border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--fg-muted)]">
              ⌘P
            </kbd>
          </button>
        </div>
      );
    }

    if (loadingView) {
      return (
        <div className="flex h-full items-center justify-center text-xs text-[var(--fg-muted)]">
          Loading…
        </div>
      );
    }

    if (viewError) {
      return (
        <div className="flex h-full items-center justify-center px-6 text-center text-sm text-rose-500">
          {viewError}
        </div>
      );
    }

    if (viewMode === "diff" && diffPayload) {
      return <DiffViewer diff={diffPayload} theme={theme} />;
    }

    if (fileContent) {
      if (!fileContent.is_binary && isMarkdownPath(selectedPath)) {
        return (
          <MdViewer
            content={fileContent.content}
            filename={selectedPath}
            theme={theme.shikiTheme}
            fontSize={fontSize}
          />
        );
      }
      return (
        <CodeViewer
          content={fileContent.content}
          filename={selectedPath}
          theme={theme.shikiTheme}
          fontSize={fontSize}
          isBinary={fileContent.is_binary}
        />
      );
    }

    return null;
  };

  return (
    <div className="flex h-full w-full overflow-hidden bg-[var(--bg-sidebar)] text-[var(--fg-primary)]">
      {/* Permanent Linear-style sidebar seamlessly embedded in window chrome */}
      <Sidebar
        repoPath={repoPath}
        tab={sidebarTab}
        onTabChange={setSidebarTab}
        selectedPath={selectedPath}
        selectedMode={viewMode}
        changes={changes}
        isGitRepo={isGitRepo}
        refreshing={refreshing}
        refreshSeq={refreshSeq}
        onSelectFile={handleSelectFile}
        onOpenFolder={handleOpenFolder}
        onRefresh={handleRefresh}
      />

      {/* Linear-style rounded inset main surface */}
      <main className="my-2 mr-2 flex min-w-0 flex-1 flex-col overflow-hidden rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-canvas)] shadow-xs">
        <header
          data-tauri-drag-region
          className="flex h-10 shrink-0 items-center justify-between gap-3 border-b border-[var(--border-subtle)] px-3.5"
        >
          <div data-tauri-drag-region className="flex min-w-0 items-center gap-1.5">
            {repoPath ? (
              <nav
                aria-label="Breadcrumb"
                className="flex min-w-0 items-center gap-1 text-xs text-[var(--fg-muted)]"
              >
                <span className="shrink-0 font-medium text-[var(--fg-secondary)]">{repoName}</span>
                {breadcrumbs.map((segment, idx) => {
                  const isLast = idx === breadcrumbs.length - 1;
                  return (
                    <span key={`${idx}-${segment}`} className="flex min-w-0 items-center gap-1">
                      <ChevronRight className="h-3 w-3 shrink-0 opacity-50" />
                      <span
                        className={`truncate ${
                          isLast
                            ? "font-medium text-[var(--fg-primary)]"
                            : "text-[var(--fg-muted)]"
                        }`}
                      >
                        {segment}
                      </span>
                    </span>
                  );
                })}
              </nav>
            ) : (
              <span
                data-tauri-drag-region
                className="text-xs font-medium text-[var(--fg-muted)]"
              >
                Pore
              </span>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {selectedHasDiff && (
              <div
                role="tablist"
                aria-label="File or Diff view"
                className="inline-flex items-center rounded-md border border-[var(--border-subtle)] bg-[var(--bg-subtle)] p-0.5"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={viewMode === "file"}
                  onClick={() => setViewMode("file")}
                  className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
                    viewMode === "file"
                      ? "bg-[var(--bg-elevated)] text-[var(--fg-primary)] shadow-xs"
                      : "text-[var(--fg-muted)] hover:text-[var(--fg-primary)]"
                  }`}
                >
                  <Code2 className="h-3 w-3" />
                  <span>File</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={viewMode === "diff"}
                  onClick={() => setViewMode("diff")}
                  className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
                    viewMode === "diff"
                      ? "bg-[var(--bg-elevated)] text-[var(--fg-primary)] shadow-xs"
                      : "text-[var(--fg-muted)] hover:text-[var(--fg-primary)]"
                  }`}
                >
                  <GitCompareArrows className="h-3 w-3" />
                  <span>Diff</span>
                </button>
              </div>
            )}

            {repoPath && (
              <button
                type="button"
                onClick={() => setPaletteOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-2 py-1 text-xs text-[var(--fg-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--fg-primary)]"
                title="Quick Open File (⌘P)"
              >
                <Search className="h-3 w-3 text-[var(--fg-muted)]" />
                <span className="hidden sm:inline">Search</span>
                <kbd className="rounded border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-1 py-px font-mono text-[10px] text-[var(--fg-muted)]">
                  ⌘P
                </kbd>
              </button>
            )}

            {/* Typography / System Font & Font Size Popover */}
            <div ref={fontMenuRef} className="relative">
              <button
                type="button"
                onClick={() => {
                  setThemeMenuOpen(false);
                  setFontMenuOpen((o) => !o);
                }}
                aria-expanded={fontMenuOpen}
                className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-2 py-1 text-xs text-[var(--fg-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--fg-primary)]"
                title="Font & Size (⌘+/⌘-/⌘0)"
              >
                <Type className="h-3 w-3 text-[var(--fg-muted)]" />
                <span className="font-mono text-[11px] tabular-nums">{fontSize}px</span>
              </button>

              {fontMenuOpen && (
                <div className="absolute right-0 z-40 mt-1.5 w-72 overflow-hidden rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] p-2 shadow-2xl">
                  {/* Font size stepper */}
                  <div className="flex items-center justify-between px-1 pb-2">
                    <span className="text-[11px] font-medium text-[var(--fg-secondary)]">
                      Font Size
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setFontSize((s) => Math.max(MIN_FONT_SIZE, s - 1))}
                        disabled={fontSize <= MIN_FONT_SIZE}
                        className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-subtle)] p-1 text-[var(--fg-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--fg-primary)] disabled:opacity-40"
                        title="Decrease font size (⌘-)"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="w-10 text-center font-mono text-xs tabular-nums text-[var(--fg-primary)]">
                        {fontSize}px
                      </span>
                      <button
                        type="button"
                        onClick={() => setFontSize((s) => Math.min(MAX_FONT_SIZE, s + 1))}
                        disabled={fontSize >= MAX_FONT_SIZE}
                        className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-subtle)] p-1 text-[var(--fg-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--fg-primary)] disabled:opacity-40"
                        title="Increase font size (⌘+)"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                      {(fontSize !== DEFAULT_FONT_SIZE || fontFamily !== DEFAULT_FONT_FAMILY) && (
                        <button
                          type="button"
                          onClick={() => {
                            setFontSize(DEFAULT_FONT_SIZE);
                            setFontFamily(DEFAULT_FONT_FAMILY);
                          }}
                          className="ml-0.5 rounded-md p-1 text-[var(--fg-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--fg-primary)]"
                          title="Reset to defaults"
                        >
                          <RotateCcw className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="mb-2 border-t border-[var(--border-subtle)]" />

                  {/* System font search */}
                  <div className="mb-1.5 flex items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-2.5 py-1.5">
                    <Search className="h-3 w-3 shrink-0 text-[var(--fg-muted)]" />
                    <input
                      ref={fontSearchRef}
                      type="text"
                      value={fontQuery}
                      onChange={(e) => setFontQuery(e.target.value)}
                      placeholder="Search installed fonts..."
                      spellCheck={false}
                      className="w-full bg-transparent text-xs text-[var(--fg-primary)] placeholder-[var(--fg-muted)] outline-none"
                    />
                  </div>

                  {/* Installed fonts list */}
                  <div className="max-h-60 overflow-y-auto pr-0.5">
                    {loadingFonts ? (
                      <div className="py-6 text-center text-xs text-[var(--fg-muted)]">
                        Scanning system fonts…
                      </div>
                    ) : filteredFonts.length === 0 ? (
                      <div className="py-6 text-center text-xs text-[var(--fg-muted)]">
                        No matching fonts
                      </div>
                    ) : (
                      <div className="space-y-0.5">
                        {filteredFonts.slice(0, 120).map((name) => {
                          const active = name === fontFamily;
                          return (
                            <button
                              key={name}
                              type="button"
                              onClick={() => setFontFamily(name)}
                              className={`flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors ${
                                active
                                  ? "bg-[var(--bg-active)] font-medium text-[var(--fg-primary)]"
                                  : "text-[var(--fg-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--fg-primary)]"
                              }`}
                            >
                              <span
                                className="truncate"
                                style={{ fontFamily: buildFontStack(name) }}
                              >
                                {name}
                              </span>
                              {active && (
                                <Check className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Quick Light / Dark appearance toggle */}
            <button
              type="button"
              onClick={toggleAppearance}
              className="rounded-md border border-transparent p-1.5 text-[var(--fg-muted)] transition-colors hover:border-[var(--border-subtle)] hover:bg-[var(--bg-hover)] hover:text-[var(--fg-primary)]"
              title={`Switch to ${theme.appearance === "dark" ? "Light" : "Dark"} mode`}
            >
              {theme.appearance === "dark" ? (
                <Sun className="h-3.5 w-3.5" />
              ) : (
                <Moon className="h-3.5 w-3.5" />
              )}
            </button>

            {/* Theme Switcher Popover */}
            <div ref={themeMenuRef} className="relative">
              <button
                type="button"
                onClick={() => {
                  setFontMenuOpen(false);
                  setThemeMenuOpen((o) => !o);
                }}
                aria-expanded={themeMenuOpen}
                aria-haspopup="listbox"
                className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-2 py-1 text-xs text-[var(--fg-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--fg-primary)]"
                title="Switch Color Theme"
              >
                <Palette className="h-3 w-3 text-[var(--fg-muted)]" />
                <span className="hidden max-w-[110px] truncate md:inline">{theme.name}</span>
                <ChevronDown className="h-3 w-3 text-[var(--fg-muted)]" />
              </button>

              {themeMenuOpen && (
                <div
                  role="listbox"
                  aria-label="Color themes"
                  className="absolute right-0 z-40 mt-1.5 w-60 overflow-hidden rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] p-1.5 shadow-2xl"
                >
                  <div className="px-2 py-1 text-[10px] font-semibold tracking-wider text-[var(--fg-muted)] uppercase">
                    Dark
                  </div>
                  <div className="space-y-0.5">
                    {DARK_THEMES.map((item) => {
                      const active = item.id === theme.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          role="option"
                          aria-selected={active}
                          onClick={() => {
                            setThemeId(item.id);
                            setThemeMenuOpen(false);
                          }}
                          className={`flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors ${
                            active
                              ? "bg-[var(--bg-active)] font-medium text-[var(--fg-primary)]"
                              : "text-[var(--fg-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--fg-primary)]"
                          }`}
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <ThemeSwatches swatches={item.swatches} />
                            <span className="truncate">{item.name}</span>
                          </span>
                          {active && <Check className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />}
                        </button>
                      );
                    })}
                  </div>

                  <div className="my-1.5 border-t border-[var(--border-subtle)]" />

                  <div className="px-2 py-1 text-[10px] font-semibold tracking-wider text-[var(--fg-muted)] uppercase">
                    Light
                  </div>
                  <div className="space-y-0.5">
                    {LIGHT_THEMES.map((item) => {
                      const active = item.id === theme.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          role="option"
                          aria-selected={active}
                          onClick={() => {
                            setThemeId(item.id);
                            setThemeMenuOpen(false);
                          }}
                          className={`flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors ${
                            active
                              ? "bg-[var(--bg-active)] font-medium text-[var(--fg-primary)]"
                              : "text-[var(--fg-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--fg-primary)]"
                          }`}
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <ThemeSwatches swatches={item.swatches} />
                            <span className="truncate">{item.name}</span>
                          </span>
                          {active && <Check className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="min-h-0 flex-1">{renderViewport()}</div>
      </main>

      <CommandPalette
        open={paletteOpen}
        files={allFiles}
        loading={indexingFiles}
        changes={changes}
        onClose={() => setPaletteOpen(false)}
        onSelectFile={(relPath) => handleSelectFile(relPath, "file")}
      />
    </div>
  );
}
