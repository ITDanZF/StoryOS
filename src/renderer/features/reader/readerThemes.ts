import type { CSSProperties } from "react";
import type { ReaderPreferences } from "../../../shared/book/reader.ts";

type ReaderTheme = {
  version: number;
  paper: string;
  ink: string;
  muted: string;
  colorScheme: "light" | "dark";
};
export const READER_THEMES: Record<ReaderPreferences["theme"], ReaderTheme> = {
  paper: {
    version: 1,
    paper: "#f5f1e9",
    ink: "#302c28",
    muted: "#80776a",
    colorScheme: "light",
  },
  dark: {
    version: 1,
    paper: "#272b34",
    ink: "#dedbd5",
    muted: "#aaa497",
    colorScheme: "dark",
  },
};
export function readerThemeStyle(
  id: ReaderPreferences["theme"],
): CSSProperties {
  const theme = READER_THEMES[id];
  return {
    "--reader-paper": theme.paper,
    "--reader-ink": theme.ink,
    "--reader-paper-muted": theme.muted,
    colorScheme: theme.colorScheme,
  } as CSSProperties;
}
export function readerThemeKey(id: ReaderPreferences["theme"]): string {
  return `${id}:${READER_THEMES[id].version}`;
}
