import { existsSync, lstatSync, mkdirSync } from "node:fs";
import path from "node:path";
import { LancePathError } from "./errors.ts";

const REMOTE_URI = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//;

export function resolveLocalLanceDirectory(directoryPath: string): string {
  if (typeof directoryPath !== "string" || directoryPath.trim() === "") {
    throw new LancePathError("LanceDB directory path is required.");
  }
  if (REMOTE_URI.test(directoryPath)) {
    throw new LancePathError("LanceDB only accepts a local directory path.");
  }
  const resolved = path.resolve(directoryPath);
  if (existsSync(resolved)) {
    const stats = lstatSync(resolved);
    if (stats.isSymbolicLink()) {
      throw new LancePathError("LanceDB directory must not be a symbolic link.");
    }
    if (!stats.isDirectory()) {
      throw new LancePathError(`LanceDB path is not a directory: ${resolved}`);
    }
    return resolved;
  }
  mkdirSync(resolved, { recursive: true });
  if (lstatSync(resolved).isSymbolicLink()) {
    throw new LancePathError("LanceDB directory must not be a symbolic link.");
  }
  return resolved;
}
