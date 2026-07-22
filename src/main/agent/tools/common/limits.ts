export const MAX_TEXT_FILE_BYTES = 1024 * 1024;
export const MAX_READ_RESULT_CHARS = 80_000;
export const DEFAULT_LIST_LIMIT = 100;
export const MAX_LIST_LIMIT = 500;
export const DEFAULT_SEARCH_LIMIT = 100;
export const MAX_SEARCH_LIMIT = 500;

export const DEFAULT_EXCLUDED_DIRS = new Set([
  ".git",
  ".hg",
  ".svn",
  "node_modules",
  "dist",
  "build",
  ".next",
  ".turbo",
  "coverage",
]);
