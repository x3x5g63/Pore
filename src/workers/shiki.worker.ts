import {
  bundledLanguages,
  bundledLanguagesAlias,
  bundledThemes,
  createHighlighter,
  createJavaScriptRegexEngine,
  type BundledLanguage,
  type BundledTheme,
  type Highlighter,
  type ThemedToken,
} from "shiki";

export interface ShikiHighlightRequest {
  id: number;
  code: string;
  theme: BundledTheme;
  filename?: string;
  lang?: string;
}

export type ShikiHighlightResponse =
  | { id: number; lang: string; lines: string[] }
  | { id: number; error: string };

const FALLBACK_THEME: BundledTheme = "github-dark-default";

const FILENAME_TO_LANG: Record<string, string> = {
  dockerfile: "dockerfile",
  makefile: "makefile",
  gnumakefile: "makefile",
  "cmakelists.txt": "cmake",
  "cargo.toml": "toml",
  "cargo.lock": "toml",
  "package.json": "json",
  "tsconfig.json": "jsonc",
  ".gitignore": "gitignore",
  ".gitattributes": "gitattributes",
  ".env": "dotenv",
  ".env.local": "dotenv",
  ".env.example": "dotenv",
  ".bashrc": "bash",
  ".zshrc": "zsh",
  ".editorconfig": "ini",
  gemfile: "ruby",
  rakefile: "ruby",
  podfile: "ruby",
  justfile: "makefile",
};

const EXT_TO_LANG: Record<string, string> = {
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  tsx: "tsx",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "jsx",
  rs: "rust",
  py: "python",
  pyi: "python",
  go: "go",
  rb: "ruby",
  java: "java",
  kt: "kotlin",
  kts: "kotlin",
  swift: "swift",
  c: "c",
  h: "c",
  cc: "cpp",
  cpp: "cpp",
  cxx: "cpp",
  hpp: "cpp",
  hh: "cpp",
  cs: "csharp",
  php: "php",
  sh: "bash",
  bash: "bash",
  zsh: "zsh",
  fish: "fish",
  ps1: "powershell",
  json: "json",
  jsonc: "jsonc",
  json5: "json5",
  toml: "toml",
  yaml: "yaml",
  yml: "yaml",
  xml: "xml",
  svg: "xml",
  html: "html",
  htm: "html",
  css: "css",
  scss: "scss",
  sass: "sass",
  less: "less",
  md: "markdown",
  markdown: "markdown",
  mdx: "mdx",
  sql: "sql",
  graphql: "graphql",
  gql: "graphql",
  vue: "vue",
  svelte: "svelte",
  astro: "astro",
  zig: "zig",
  lua: "lua",
  nix: "nix",
  ex: "elixir",
  exs: "elixir",
  erl: "erlang",
  hs: "haskell",
  ml: "ocaml",
  mli: "ocaml",
  dart: "dart",
  scala: "scala",
  r: "r",
  tf: "hcl",
  hcl: "hcl",
  prisma: "prisma",
  proto: "proto",
  ini: "ini",
  cfg: "ini",
  conf: "nginx",
  diff: "diff",
  patch: "diff",
  lock: "yaml",
  txt: "text",
};

let highlighterPromise: Promise<Highlighter> | null = null;
const loadingLangs = new Map<string, Promise<void>>();
const loadingThemes = new Map<string, Promise<void>>();

function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: [],
      langs: [],
      engine: createJavaScriptRegexEngine({ forgiving: true }),
    });
  }
  return highlighterPromise;
}

function isBundledLanguage(lang: string): lang is BundledLanguage {
  return lang in bundledLanguages || lang in bundledLanguagesAlias;
}

function resolveTheme(theme?: string): BundledTheme {
  if (theme && theme in bundledThemes) return theme as BundledTheme;
  return FALLBACK_THEME;
}

function resolveLanguage(filename?: string, explicitLang?: string): BundledLanguage | "text" {
  if (explicitLang) {
    const normalized = explicitLang.toLowerCase();
    if (isBundledLanguage(normalized)) return normalized;
    const mapped = EXT_TO_LANG[normalized];
    if (mapped && isBundledLanguage(mapped)) return mapped;
  }

  if (filename) {
    const base = filename.split(/[\\/]/).pop()?.toLowerCase() ?? "";
    const exact = FILENAME_TO_LANG[base];
    if (exact && isBundledLanguage(exact)) return exact;

    if (base.startsWith(".env.")) {
      return isBundledLanguage("dotenv") ? "dotenv" : "text";
    }

    const dotIdx = base.lastIndexOf(".");
    if (dotIdx > 0 && dotIdx < base.length - 1) {
      const ext = base.slice(dotIdx + 1);
      const mapped = EXT_TO_LANG[ext] ?? ext;
      if (isBundledLanguage(mapped)) return mapped;
    }
  }

  return "text";
}

async function ensureThemeLoaded(highlighter: Highlighter, theme: BundledTheme): Promise<void> {
  if (highlighter.getLoadedThemes().includes(theme)) return;

  let pending = loadingThemes.get(theme);
  if (!pending) {
    pending = highlighter.loadTheme(theme).finally(() => {
      loadingThemes.delete(theme);
    });
    loadingThemes.set(theme, pending);
  }
  await pending;
}

async function ensureLanguageLoaded(highlighter: Highlighter, lang: BundledLanguage): Promise<void> {
  if (highlighter.getLoadedLanguages().includes(lang)) return;

  let pending = loadingLangs.get(lang);
  if (!pending) {
    pending = highlighter.loadLanguage(lang).finally(() => {
      loadingLangs.delete(lang);
    });
    loadingLangs.set(lang, pending);
  }
  await pending;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderLineTokens(tokens: ThemedToken[]): string {
  if (tokens.length === 0) return "";
  let html = "";
  for (const token of tokens) {
    const escaped = escapeHtml(token.content);
    const styles: string[] = [];

    if (token.color) styles.push(`color:${token.color}`);
    const fontStyle = token.fontStyle ?? 0;
    if (fontStyle & 1) styles.push("font-style:italic");
    if (fontStyle & 2) styles.push("font-weight:600");
    if (fontStyle & 4) styles.push("text-decoration:underline");

    if (styles.length > 0) {
      html += `<span style="${styles.join(";")}">${escaped}</span>`;
    } else {
      html += escaped;
    }
  }
  return html;
}

self.onmessage = async (event: MessageEvent<ShikiHighlightRequest>) => {
  const { id, code, theme: requestedTheme, filename, lang: explicitLang } = event.data;

  try {
    const highlighter = await getHighlighter();
    const theme = resolveTheme(requestedTheme);
    let lang = resolveLanguage(filename, explicitLang);

    await ensureThemeLoaded(highlighter, theme);

    if (lang !== "text") {
      try {
        await ensureLanguageLoaded(highlighter, lang);
      } catch {
        lang = "text";
      }
    }

    const result = highlighter.codeToTokens(code, { lang, theme });
    const lines = result.tokens.map(renderLineTokens);

    const response: ShikiHighlightResponse = { id, lang, lines };
    self.postMessage(response);
  } catch (err) {
    const response: ShikiHighlightResponse = {
      id,
      error: err instanceof Error ? err.message : String(err),
    };
    self.postMessage(response);
  }
};
