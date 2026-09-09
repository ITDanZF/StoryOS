export const THEME_STORAGE_KEY = "storyos.appearance.v1";
export type Appearance = "light" | "dark" | "system";
export type ThemePreference = {
  version: 1;
  appearance: Appearance;
  paletteId: string;
};
export const DEFAULT_THEME: ThemePreference = {
  version: 1,
  appearance: "system",
  paletteId: "default",
};

const light = {
  background: "#ffffff",
  foreground: "#171717",
  card: "#ffffff",
  "card-foreground": "#171717",
  popover: "#ffffff",
  "popover-foreground": "#171717",
  primary: "#171717",
  "primary-foreground": "#fafafa",
  "primary-hover": "#404040",
  secondary: "#f5f5f5",
  "secondary-foreground": "#171717",
  muted: "#f5f5f5",
  "muted-foreground": "#737373",
  accent: "#f5f3ff",
  "accent-foreground": "#6d28d9",
  "accent-border": "#c4b5fd",
  destructive: "#dc2626",
  "destructive-foreground": "#ffffff",
  "danger-hover": "#b91c1c",
  border: "#e5e5e5",
  input: "#e5e5e5",
  ring: "#737373",
  "border-strong": "#d4d4d4",
  "surface-app": "#f5f5f5",
  "surface-subtle": "#fafafa",
  "surface-canvas": "#f6f6f4",
  "text-secondary": "#525252",
  "text-subtle": "#a3a3a3",
  inverse: "#ffffff",
  "danger-surface": "#fef2f2",
  "danger-text": "#b91c1c",
  "danger-border": "#fecaca",
  "success-surface": "#ecfdf5",
  "success-text": "#047857",
  "success-border": "#a7f3d0",
  "warning-surface": "#fffbeb",
  "warning-text": "#92400e",
  "warning-border": "#fde68a",
};
export type AppSemanticTokens = Record<keyof typeof light, string>;
export type ThemeDefinition = {
  id: string;
  label: string;
  schemes: Record<"light" | "dark", AppSemanticTokens>;
};
const dark: AppSemanticTokens = {
  background: "#202124",
  foreground: "#ebebed",
  card: "#242529",
  "card-foreground": "#ebebed",
  popover: "#2b2c31",
  "popover-foreground": "#ebebed",
  primary: "#ebebed",
  "primary-foreground": "#202124",
  "primary-hover": "#d4d4d8",
  secondary: "#303136",
  "secondary-foreground": "#ebebed",
  muted: "#303136",
  "muted-foreground": "#a6a6af",
  accent: "#382c4e",
  "accent-foreground": "#d8b4fe",
  "accent-border": "#735197",
  destructive: "#dc2626",
  "destructive-foreground": "#ffffff",
  "danger-hover": "#b91c1c",
  border: "#3d3e44",
  input: "#474850",
  ring: "#c4b5fd",
  "border-strong": "#575961",
  "surface-app": "#191a1e",
  "surface-subtle": "#28292e",
  "surface-canvas": "#1b1c20",
  "text-secondary": "#c4c4cb",
  "text-subtle": "#9797a1",
  inverse: "#ffffff",
  "danger-surface": "#3d252b",
  "danger-text": "#fca5a5",
  "danger-border": "#713b43",
  "success-surface": "#1c352e",
  "success-text": "#6ee7b7",
  "success-border": "#315e4c",
  "warning-surface": "#3b3224",
  "warning-text": "#fcd88c",
  "warning-border": "#695637",
};
export const THEMES: readonly ThemeDefinition[] = [
  { id: "default", label: "经典", schemes: { light, dark } },
];

export function parseThemePreference(raw: string | null): ThemePreference {
  try {
    const value = JSON.parse(raw) as Partial<ThemePreference> | null;
    if (!value || value.version !== 1) return { ...DEFAULT_THEME };
    return {
      version: 1,
      appearance: ["light", "dark", "system"].includes(value.appearance)
        ? value.appearance
        : DEFAULT_THEME.appearance,
      paletteId: THEMES.some((theme) => theme.id === value.paletteId)
        ? value.paletteId
        : DEFAULT_THEME.paletteId,
    };
  } catch {
    return { ...DEFAULT_THEME };
  }
}
export function resolveTheme(preference: ThemePreference, systemDark: boolean) {
  const appearance =
    preference.appearance === "system"
      ? systemDark
        ? "dark"
        : "light"
      : preference.appearance;
  const theme = THEMES.find((theme) => theme.id === preference.paletteId);
  if (!theme) throw new Error(`未知界面主题：${preference.paletteId}`);
  return { appearance, tokens: theme.schemes[appearance] };
}
