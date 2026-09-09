import { existsSync, lstatSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const markerName = ".storyos-operation.json";
export function markOperationDirectory(root: string, operationId: string): void {
  writeFileSync(path.join(root, markerName), JSON.stringify({ version: 1, operationId }), "utf8");
}
export function ownsOperationDirectory(root: string, operationId: string): boolean {
  if (!existsSync(root)) return false;
  if (lstatSync(root).isSymbolicLink()) return false;
  const normalize = (p: string) => (process.platform === "win32" ? p.toLowerCase() : p);
  if (normalize(realpathSync(root)) !== normalize(path.resolve(root))) return false;
  try {
    const marker = JSON.parse(readFileSync(path.join(root, markerName), "utf8"));
    return marker.version === 1 && marker.operationId === operationId;
  } catch {
    return false;
  }
}
export function removeOperationDirectory(root: string, operationId: string): void {
  if (!existsSync(root)) return;
  if (!ownsOperationDirectory(root, operationId))
    throw new Error(`Operation does not own directory: ${root}`);
  rmSync(path.resolve(root), { recursive: true, force: true });
}
