/** Available color themes. */
export type ThemeId = "default" | "forest" | "sunset" | "ocean" | "berry" | "slate" | "rose";

export interface ThemeDef {
  id: ThemeId;
  name: string;
  vars: Record<string, string>;
  dark: boolean;
}

/**
 * Full theme definitions — a mix of light and dark themes.
 * Each overrides ALL CSS custom properties so the entire screen is recolored.
 *
 * Light: default, sunset, rose
 * Dark:  forest, ocean, berry, slate
 */
export const THEMES: ThemeDef[] = [
  {
    id: "default",
    name: "Neutral Light",
    dark: false,
    vars: {}, // uses globals.css defaults
  },
  // ---- Dark themes ----
  {
    id: "forest",
    name: "Forest (Dark)",
    dark: true,
    vars: {
      "--background": "oklch(0.16 0.02 150)",
      "--foreground": "oklch(0.92 0.02 150)",
      "--card": "oklch(0.21 0.025 150)",
      "--card-foreground": "oklch(0.92 0.02 150)",
      "--popover": "oklch(0.21 0.025 150)",
      "--popover-foreground": "oklch(0.92 0.02 150)",
      "--primary": "oklch(0.65 0.18 150)",
      "--primary-foreground": "oklch(0.12 0.02 150)",
      "--secondary": "oklch(0.28 0.03 150)",
      "--secondary-foreground": "oklch(0.92 0.02 150)",
      "--muted": "oklch(0.26 0.02 150)",
      "--muted-foreground": "oklch(0.7 0.03 150)",
      "--accent": "oklch(0.28 0.03 150)",
      "--accent-foreground": "oklch(0.92 0.02 150)",
      "--destructive": "oklch(0.65 0.2 25)",
      "--border": "oklch(0.3 0.02 150)",
      "--input": "oklch(0.3 0.02 150)",
      "--ring": "oklch(0.65 0.18 150)",
      "--chart-1": "oklch(0.6 0.2 150)",
      "--chart-2": "oklch(0.6 0.15 110)",
      "--chart-3": "oklch(0.55 0.18 180)",
    },
  },
  // ---- Light themes ----
  {
    id: "sunset",
    name: "Sunset (Light)",
    dark: false,
    vars: {
      "--background": "oklch(0.97 0.01 35)",
      "--foreground": "oklch(0.2 0.02 35)",
      "--card": "oklch(0.99 0.005 35)",
      "--card-foreground": "oklch(0.2 0.02 35)",
      "--popover": "oklch(0.99 0.005 35)",
      "--popover-foreground": "oklch(0.2 0.02 35)",
      "--primary": "oklch(0.58 0.22 35)",
      "--primary-foreground": "oklch(0.98 0 0)",
      "--secondary": "oklch(0.93 0.02 35)",
      "--secondary-foreground": "oklch(0.25 0.03 35)",
      "--muted": "oklch(0.94 0.015 35)",
      "--muted-foreground": "oklch(0.5 0.03 35)",
      "--accent": "oklch(0.9 0.05 35)",
      "--accent-foreground": "oklch(0.25 0.05 35)",
      "--border": "oklch(0.88 0.02 35)",
      "--input": "oklch(0.9 0.02 35)",
      "--ring": "oklch(0.58 0.22 35)",
      "--chart-1": "oklch(0.65 0.25 35)",
      "--chart-2": "oklch(0.6 0.2 15)",
      "--chart-3": "oklch(0.7 0.18 60)",
    },
  },
  // ---- Dark themes ----
  {
    id: "ocean",
    name: "Ocean (Dark)",
    dark: true,
    vars: {
      "--background": "oklch(0.15 0.02 230)",
      "--foreground": "oklch(0.92 0.02 230)",
      "--card": "oklch(0.2 0.025 230)",
      "--card-foreground": "oklch(0.92 0.02 230)",
      "--popover": "oklch(0.2 0.025 230)",
      "--popover-foreground": "oklch(0.92 0.02 230)",
      "--primary": "oklch(0.65 0.16 230)",
      "--primary-foreground": "oklch(0.12 0.02 230)",
      "--secondary": "oklch(0.27 0.03 230)",
      "--secondary-foreground": "oklch(0.92 0.02 230)",
      "--muted": "oklch(0.25 0.02 230)",
      "--muted-foreground": "oklch(0.7 0.03 230)",
      "--accent": "oklch(0.27 0.03 230)",
      "--accent-foreground": "oklch(0.92 0.02 230)",
      "--destructive": "oklch(0.65 0.2 25)",
      "--border": "oklch(0.29 0.02 230)",
      "--input": "oklch(0.29 0.02 230)",
      "--ring": "oklch(0.65 0.16 230)",
      "--chart-1": "oklch(0.6 0.2 230)",
      "--chart-2": "oklch(0.55 0.18 200)",
      "--chart-3": "oklch(0.6 0.15 260)",
    },
  },
  // ---- Dark themes ----
  {
    id: "berry",
    name: "Berry (Dark)",
    dark: true,
    vars: {
      "--background": "oklch(0.15 0.025 340)",
      "--foreground": "oklch(0.92 0.02 340)",
      "--card": "oklch(0.2 0.03 340)",
      "--card-foreground": "oklch(0.92 0.02 340)",
      "--popover": "oklch(0.2 0.03 340)",
      "--popover-foreground": "oklch(0.92 0.02 340)",
      "--primary": "oklch(0.62 0.22 340)",
      "--primary-foreground": "oklch(0.12 0.02 340)",
      "--secondary": "oklch(0.27 0.03 340)",
      "--secondary-foreground": "oklch(0.92 0.02 340)",
      "--muted": "oklch(0.25 0.025 340)",
      "--muted-foreground": "oklch(0.7 0.03 340)",
      "--accent": "oklch(0.27 0.03 340)",
      "--accent-foreground": "oklch(0.92 0.02 340)",
      "--destructive": "oklch(0.65 0.2 25)",
      "--border": "oklch(0.29 0.025 340)",
      "--input": "oklch(0.29 0.025 340)",
      "--ring": "oklch(0.62 0.22 340)",
      "--chart-1": "oklch(0.55 0.25 340)",
      "--chart-2": "oklch(0.55 0.2 300)",
      "--chart-3": "oklch(0.6 0.18 20)",
    },
  },
  // ---- Dark themes ----
  {
    id: "slate",
    name: "Slate (Dark)",
    dark: true,
    vars: {
      "--background": "oklch(0.18 0.01 250)",
      "--foreground": "oklch(0.95 0.01 250)",
      "--card": "oklch(0.23 0.015 250)",
      "--card-foreground": "oklch(0.95 0.01 250)",
      "--popover": "oklch(0.23 0.015 250)",
      "--popover-foreground": "oklch(0.95 0.01 250)",
      "--primary": "oklch(0.7 0.12 230)",
      "--primary-foreground": "oklch(0.15 0.01 250)",
      "--secondary": "oklch(0.3 0.02 250)",
      "--secondary-foreground": "oklch(0.95 0.01 250)",
      "--muted": "oklch(0.28 0.015 250)",
      "--muted-foreground": "oklch(0.72 0.02 250)",
      "--accent": "oklch(0.3 0.02 250)",
      "--accent-foreground": "oklch(0.95 0.01 250)",
      "--destructive": "oklch(0.65 0.2 25)",
      "--border": "oklch(1 0 0 / 12%)",
      "--input": "oklch(1 0 0 / 15%)",
      "--ring": "oklch(0.7 0.12 230)",
    },
  },
  // ---- Light themes ----
  {
    id: "rose",
    name: "Rose (Light)",
    dark: false,
    vars: {
      "--background": "oklch(0.97 0.01 15)",
      "--foreground": "oklch(0.2 0.02 15)",
      "--card": "oklch(0.99 0.005 15)",
      "--card-foreground": "oklch(0.2 0.02 15)",
      "--popover": "oklch(0.99 0.005 15)",
      "--popover-foreground": "oklch(0.2 0.02 15)",
      "--primary": "oklch(0.55 0.2 15)",
      "--primary-foreground": "oklch(0.98 0 0)",
      "--secondary": "oklch(0.93 0.02 15)",
      "--secondary-foreground": "oklch(0.25 0.03 15)",
      "--muted": "oklch(0.94 0.015 15)",
      "--muted-foreground": "oklch(0.5 0.03 15)",
      "--accent": "oklch(0.9 0.05 15)",
      "--accent-foreground": "oklch(0.25 0.05 15)",
      "--border": "oklch(0.88 0.02 15)",
      "--input": "oklch(0.9 0.02 15)",
      "--ring": "oklch(0.55 0.2 15)",
      "--chart-1": "oklch(0.65 0.22 15)",
      "--chart-2": "oklch(0.6 0.18 350)",
      "--chart-3": "oklch(0.65 0.2 40)",
    },
  },
];

/** Apply a theme by setting CSS custom properties on document.documentElement. */
export function applyTheme(themeId: ThemeId): void {
  if (typeof document === "undefined") return;
  const theme = THEMES.find((t) => t.id === themeId) || THEMES[0];
  const root = document.documentElement;
  const previouslySet = root.getAttribute("data-theme-vars");
  if (previouslySet) {
    for (const key of previouslySet.split(",")) {
      root.style.removeProperty(key);
    }
  }
  if (root.classList.contains("dark")) {
    root.classList.remove("dark");
  }
  const setKeys: string[] = [];
  for (const [key, value] of Object.entries(theme.vars)) {
    root.style.setProperty(key, value);
    setKeys.push(key);
  }
  if (theme.dark) {
    root.classList.add("dark");
  }
  root.setAttribute("data-theme-vars", setKeys.join(","));
  root.setAttribute("data-theme", themeId);
}

const THEME_PREF_KEY = "langlearn.theme";
const SOUND_PREF_KEY = "langlearn.sound";

export function loadThemePref(): ThemeId {
  if (typeof window === "undefined") return "default";
  try {
    const v = localStorage.getItem(THEME_PREF_KEY) as ThemeId | null;
    if (v && THEMES.some((t) => t.id === v)) return v;
  } catch {}
  return "default";
}

export function saveThemePref(theme: ThemeId): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(THEME_PREF_KEY, theme);
  } catch {}
}

export function loadSoundPref(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const v = localStorage.getItem(SOUND_PREF_KEY);
    if (v === "false") return false;
    if (v === "true") return true;
  } catch {}
  return true;
}

export function saveSoundPref(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SOUND_PREF_KEY, String(enabled));
  } catch {}
}
