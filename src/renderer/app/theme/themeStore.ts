import { useSyncExternalStore } from "react";
import {
  DEFAULT_THEME,
  parseThemePreference,
  resolveTheme,
  THEME_STORAGE_KEY,
  type ThemePreference,
} from "./themeModel.ts";

let preference: ThemePreference = DEFAULT_THEME;
const listeners = new Set<() => void>();
let media: MediaQueryList;
let initialized = false;
function apply() {
  const resolved = resolveTheme(preference, media.matches);
  const root = document.documentElement;
  root.dataset.appearance = resolved.appearance;
  root.style.colorScheme = resolved.appearance;
  for (const [name, value] of Object.entries(resolved.tokens))
    root.style.setProperty(`--app-${name}`, value);
}
/** Runs before React, independent of model configuration and route lifetime. */
export function initializeTheme() {
  if (initialized) return;
  initialized = true;
  try {
    preference = parseThemePreference(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    preference = { ...DEFAULT_THEME };
  }
  media = matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", apply);
  window.addEventListener("storage", onStorage);
  apply();
}
function onStorage(event: StorageEvent) {
  if (event.key !== THEME_STORAGE_KEY && event.key !== null) return;
  preference = parseThemePreference(event.newValue);
  apply();
  listeners.forEach((listener) => listener());
}
export function setThemePreference(next: ThemePreference) {
  // Resolve before publishing, so an invalid palette can never partially update the UI.
  resolveTheme(next, media.matches);
  localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(next));
  preference = next;
  apply();
  listeners.forEach((listener) => listener());
}
export function useThemePreference() {
  return useSyncExternalStore(
    (callback) => {
      listeners.add(callback);
      return () => {
        listeners.delete(callback);
      };
    },
    () => preference,
  );
}
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    media?.removeEventListener("change", apply);
    window.removeEventListener("storage", onStorage);
    listeners.clear();
  });
