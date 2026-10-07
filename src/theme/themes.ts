// Ids match the [data-theme] blocks in src/index.css. "system" sets no
// attribute so the app follows the OS light/dark setting.
export const THEMES = [
  { id: "system", label: "System" },
  { id: "studio-light", label: "Studio Light" },
  { id: "studio-dark", label: "Studio Dark" },
  { id: "olivia", label: "Olivia" },
  { id: "botanical", label: "Botanical" },
  { id: "laser", label: "Laser" },
  { id: "nord", label: "Nord" },
  { id: "mocha", label: "Mocha" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

export const THEME_STORAGE_KEY = "theme";

const isThemeId = (value: string | null): value is ThemeId =>
  THEMES.some((t) => t.id === value);

export function loadTheme(): ThemeId {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeId(saved) ? saved : "system";
  } catch {
    return "system";
  }
}

export function applyTheme(theme: ThemeId) {
  if (theme === "system") {
    delete document.documentElement.dataset.theme;
  } else {
    document.documentElement.dataset.theme = theme;
  }
}
