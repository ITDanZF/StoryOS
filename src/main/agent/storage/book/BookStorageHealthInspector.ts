import path from "node:path";
import { existsSync } from "node:fs";
import type { BookRecord } from "../../application/bookRegistryPorts.ts";
import BookDatabase from "./BookDatabase.ts";
import { getBookLayout, type BookLayout } from "./BookLayout.ts";

export type BookStorageHealth =
  | {
      readonly state: "available";
      readonly layout: BookLayout;
    }
  | {
      readonly state: "missing" | "corrupted";
      readonly layout: BookLayout | null;
      readonly reason: string;
      readonly cause?: unknown;
    };

function samePath(first: string, second: string): boolean {
  const left = path.resolve(first);
  const right = path.resolve(second);
  return process.platform === "win32"
    ? left.toLowerCase() === right.toLowerCase()
    : left === right;
}

export default class BookStorageHealthInspector {
  constructor(private readonly agentHome: string) {}

  inspect(book: BookRecord): BookStorageHealth {
    let layout: BookLayout;
    try {
      layout = getBookLayout(this.agentHome, book.id);
    } catch (error) {
      return Object.freeze({
        state: "corrupted",
        layout: null,
        reason: `Invalid registered book id: ${book.id}`,
        cause: error,
      });
    }
    if (!samePath(book.storagePath, layout.rootPath)) {
      return Object.freeze({
        state: "corrupted",
        layout,
        reason: `Invalid registered book path: ${book.storagePath}`,
      });
    }
    if (!existsSync(layout.rootPath) || !existsSync(layout.databasePath)) {
      return Object.freeze({
        state: "missing",
        layout,
        reason: `Book database does not exist: ${layout.databasePath}`,
      });
    }
    try {
      BookDatabase.validateExisting(layout.databasePath);
      return Object.freeze({ state: "available", layout });
    } catch (error) {
      return Object.freeze({
        state: "corrupted",
        layout,
        reason: `Book database is corrupted: ${book.id}`,
        cause: error,
      });
    }
  }
}
