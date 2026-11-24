import type { BundledTheme } from "shiki";

export type ThemeAppearance = "light" | "dark";

export type ThemeId =
  | "linear-dark"
  | "gruvbox-dark"
  | "everforest-dark"
  | "linear-light"
  | "vitesse-light";

export interface ThemeVars {
  "--bg-canvas": string;
  "--bg-sidebar": string;
  "--bg-elevated": string;
  "--bg-subtle": string;
  "--bg-hover": string;
  "--bg-active": string;
  "--border-subtle": string;
  "--border-strong": string;
  "--fg-primary": string;
  "--fg-secondary": string;
  "--fg-muted": string;
  "--accent": string;
  "--accent-fg": string;
  "--accent-soft": string;
  "--scrollbar-thumb": string;
  "--scrollbar-thumb-hover": string;
  "--backdrop": string;
}

export interface ThemeDefinition {
  id: ThemeId;
  name: string;
  appearance: ThemeAppearance;
  shikiTheme: BundledTheme;
  /** Preview dots: [canvas, sidebar/surface, accent] */
  swatches: [string, string, string];
  vars: ThemeVars;
}

export const DEFAULT_THEME_ID: ThemeId = "linear-dark";
export const THEME_STORAGE_KEY = "pore:themeId";
export const THEME_BG_STORAGE_KEY = "pore:themeBg";

export const THEMES: ThemeDefinition[] = [
  // ── Dark Themes ────────────────────────────────────────────────────────────
  {
    id: "linear-dark",
    name: "Linear Dark",
    appearance: "dark",
    shikiTheme: "github-dark-default",
    swatches: ["#08090a", "#141516", "#5e6ad2"],
    vars: {
      "--bg-canvas": "#08090a",
      "--bg-sidebar": "#0f1011",
      "--bg-elevated": "#161719",
      "--bg-subtle": "#141516",
      "--bg-hover": "rgba(255, 255, 255, 0.05)",
      "--bg-active": "rgba(255, 255, 255, 0.09)",
      "--border-subtle": "rgba(255, 255, 255, 0.08)",
      "--border-strong": "rgba(255, 255, 255, 0.14)",
      "--fg-primary": "#f7f8f8",
      "--fg-secondary": "#b4b8bf",
      "--fg-muted": "#6f747d",
      "--accent": "#5e6ad2",
      "--accent-fg": "#ffffff",
      "--accent-soft": "rgba(94, 106, 210, 0.18)",
      "--scrollbar-thumb": "rgba(255, 255, 255, 0.16)",
      "--scrollbar-thumb-hover": "rgba(255, 255, 255, 0.28)",
      "--backdrop": "rgba(0, 0, 0, 0.62)",
    },
  },
  {
    id: "gruvbox-dark",
    name: "Gruvbox Dark",
    appearance: "dark",
    shikiTheme: "gruvbox-dark-medium",
    swatches: ["#282828", "#3c3836", "#d79921"],
    vars: {
      "--bg-canvas": "#282828",
      "--bg-sidebar": "#1d2021",
      "--bg-elevated": "#32302f",
      "--bg-subtle": "#242424",
      "--bg-hover": "rgba(235, 219, 178, 0.06)",
      "--bg-active": "rgba(215, 153, 33, 0.16)",
      "--border-subtle": "rgba(235, 219, 178, 0.1)",
      "--border-strong": "rgba(235, 219, 178, 0.18)",
      "--fg-primary": "#ebdbb2",
      "--fg-secondary": "#d5c4a1",
      "--fg-muted": "#928374",
      "--accent": "#d79921",
      "--accent-fg": "#1d2021",
      "--accent-soft": "rgba(215, 153, 33, 0.2)",
      "--scrollbar-thumb": "rgba(235, 219, 178, 0.18)",
      "--scrollbar-thumb-hover": "rgba(235, 219, 178, 0.32)",
      "--backdrop": "rgba(15, 16, 16, 0.68)",
    },
  },
  {
    id: "everforest-dark",
    name: "Everforest Dark",
    appearance: "dark",
    shikiTheme: "everforest-dark",
    swatches: ["#2d353b", "#3d484d", "#a7c080"],
    vars: {
      "--bg-canvas": "#2d353b",
      "--bg-sidebar": "#272e33",
      "--bg-elevated": "#343f44",
      "--bg-subtle": "#2b3339",
      "--bg-hover": "rgba(211, 198, 170, 0.06)",
      "--bg-active": "rgba(167, 192, 128, 0.15)",
      "--border-subtle": "rgba(211, 198, 170, 0.11)",
      "--border-strong": "rgba(211, 198, 170, 0.2)",
      "--fg-primary": "#d3c6aa",
      "--fg-secondary": "#b5ad96",
      "--fg-muted": "#859289",
      "--accent": "#a7c080",
      "--accent-fg": "#232a2e",
      "--accent-soft": "rgba(167, 192, 128, 0.18)",
      "--scrollbar-thumb": "rgba(211, 198, 170, 0.2)",
      "--scrollbar-thumb-hover": "rgba(211, 198, 170, 0.34)",
      "--backdrop": "rgba(20, 25, 28, 0.65)",
    },
  },

  // ── Light Themes ───────────────────────────────────────────────────────────
  {
    id: "linear-light",
    name: "Linear Light",
    appearance: "light",
    shikiTheme: "github-light-default",
    swatches: ["#ffffff", "#f7f8f8", "#5e6ad2"],
    vars: {
      "--bg-canvas": "#ffffff",
      "--bg-sidebar": "#f7f8f8",
      "--bg-elevated": "#ffffff",
      "--bg-subtle": "#f2f3f5",
      "--bg-hover": "rgba(0, 0, 0, 0.04)",
      "--bg-active": "rgba(94, 106, 210, 0.1)",
      "--border-subtle": "rgba(0, 0, 0, 0.08)",
      "--border-strong": "rgba(0, 0, 0, 0.14)",
      "--fg-primary": "#16181d",
      "--fg-secondary": "#4c515c",
      "--fg-muted": "#8a8f98",
      "--accent": "#5e6ad2",
      "--accent-fg": "#ffffff",
      "--accent-soft": "rgba(94, 106, 210, 0.12)",
      "--scrollbar-thumb": "rgba(0, 0, 0, 0.16)",
      "--scrollbar-thumb-hover": "rgba(0, 0, 0, 0.28)",
      "--backdrop": "rgba(15, 17, 21, 0.28)",
    },
  },
  {
    id: "vitesse-light",
    name: "Vitesse Light",
    appearance: "light",
    shikiTheme: "vitesse-light",
    swatches: ["#ffffff", "#f7f7f7", "#1c6b48"],
    vars: {
      "--bg-canvas": "#ffffff",
      "--bg-sidebar": "#f7f7f7",
      "--bg-elevated": "#ffffff",
      "--bg-subtle": "#f1f1f1",
      "--bg-hover": "rgba(0, 0, 0, 0.04)",
      "--bg-active": "rgba(28, 107, 72, 0.1)",
      "--border-subtle": "rgba(0, 0, 0, 0.08)",
      "--border-strong": "rgba(0, 0, 0, 0.15)",
      "--fg-primary": "#393a34",
      "--fg-secondary": "#5c5d56",
      "--fg-muted": "#999992",
      "--accent": "#1c6b48",
      "--accent-fg": "#ffffff",
      "--accent-soft": "rgba(28, 107, 72, 0.12)",
      "--scrollbar-thumb": "rgba(0, 0, 0, 0.16)",
      "--scrollbar-thumb-hover": "rgba(0, 0, 0, 0.28)",
      "--backdrop": "rgba(15, 17, 21, 0.26)",
    },
  },
];

export const THEME_MAP: Record<ThemeId, ThemeDefinition> = Object.fromEntries(
  THEMES.map((t) => [t.id, t]),
) as Record<ThemeId, ThemeDefinition>;

export function getThemeById(id: string | null | undefined): ThemeDefinition {
  if (id && id in THEME_MAP) {
    return THEME_MAP[id as ThemeId];
  }
  return THEME_MAP[DEFAULT_THEME_ID];
}

export function loadSavedThemeId(): ThemeId {
  try {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (saved && saved in THEME_MAP) return saved as ThemeId;
    if (window.matchMedia?.("(prefers-color-scheme: light)").matches) {
      return "linear-light";
    }
  } catch {
    // Ignore storage errors.
  }
  return DEFAULT_THEME_ID;
}

export function applyTheme(theme: ThemeDefinition): void {
  const root = document.documentElement;
  root.dataset.theme = theme.id;
  root.dataset.appearance = theme.appearance;
  root.style.colorScheme = theme.appearance;

  for (const [key, value] of Object.entries(theme.vars)) {
    root.style.setProperty(key, value);
  }

  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme.id);
    window.localStorage.setItem(THEME_BG_STORAGE_KEY, theme.vars["--bg-canvas"]);
  } catch {
    // Ignore storage errors.
  }
}
