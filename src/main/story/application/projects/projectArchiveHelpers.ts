import path from "node:path";
import { type ProjectArchiveDto, type ProjectArchiveRecord } from "./projectArchiveContracts.ts";
export function toDto(record: ProjectArchiveRecord): ProjectArchiveDto {
  return Object.freeze({
    ...record,
    createdAt: record.createdAt.toISOString(),
    restoredAt: record.restoredAt?.toISOString() ?? null,
  });
}
export function requireAbsolutePath(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized || !path.isAbsolute(normalized)) {
    throw new Error(`${label} must be an absolute path.`);
  }
  return path.resolve(normalized);
}
export function isPathInside(rootPath: string, candidatePath: string): boolean {
  const relative = path.relative(path.resolve(rootPath), path.resolve(candidatePath));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
