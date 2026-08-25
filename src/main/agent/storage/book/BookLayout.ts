import path from "node:path";
import { mkdirSync } from "node:fs";

export type BookLayout = {
  readonly rootPath: string;
  readonly databasePath: string;
};

function requireBookId(bookId: string): string {
  if (!/^book_[0-9a-f-]{36}$/i.test(bookId)) {
    throw new Error(`Invalid book id: ${bookId}`);
  }
  return bookId;
}

export function getBookLibraryRoot(agentHome: string): string {
  return path.resolve(agentHome, "library", "books");
}

export function getBookCreationRoot(agentHome: string): string {
  return path.resolve(agentHome, "library", ".creating");
}

export function getBookDeletionRoot(agentHome: string): string {
  return path.resolve(agentHome, "library", ".deleting");
}

export function getBookLayout(agentHome: string, bookId: string): BookLayout {
  const libraryRoot = getBookLibraryRoot(agentHome);
  const rootPath = path.resolve(libraryRoot, requireBookId(bookId));
  if (path.dirname(rootPath) !== libraryRoot) {
    throw new Error(`Book path escapes the library root: ${rootPath}`);
  }
  return Object.freeze({
    rootPath,
    databasePath: path.join(rootPath, "book.sqlite"),
  });
}

export function ensureBookLayout(agentHome: string, bookId: string): BookLayout {
  const layout = getBookLayout(agentHome, bookId);
  mkdirSync(layout.rootPath, { recursive: true });
  return layout;
}
