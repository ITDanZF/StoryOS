import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";
import { InstanceError } from "./instanceErrors.ts";

export const INSTANCE_METADATA_VERSION = 1;

export type InstanceMetadata = {
  readonly schemaVersion: 1;
  readonly instanceId: string;
  readonly createdAt: string;
};

export type InstanceLayout = {
  readonly rootPath: string;
  readonly metadataPath: string;
  readonly configurationPath: string;
  readonly applicationDatabasePath: string;
};

export function normalizeInstancePath(input: string): string {
  const normalized = input.trim();
  if (!normalized)
    throw new InstanceError("INSTANCE_PATH_MISSING", "实例存储路径不能为空。");
  if (!path.isAbsolute(normalized))
    throw new InstanceError(
      "INSTANCE_PATH_MISSING",
      "实例存储路径必须是绝对路径。",
    );
  return path.resolve(normalized);
}

function comparablePath(input: string): string {
  let ancestor = path.resolve(input);
  const missing: string[] = [];
  while (!existsSync(ancestor)) {
    const parent = path.dirname(ancestor);
    if (parent === ancestor) break;
    missing.unshift(path.basename(ancestor));
    ancestor = parent;
  }
  const actual = path.join(realpathSync.native(ancestor), ...missing);
  return process.platform === "win32" ? actual.toLowerCase() : actual;
}

export function pathsConflict(first: string, second: string): boolean {
  const left = comparablePath(first);
  const right = comparablePath(second);
  if (left === right) return true;
  const relativeFromLeft = path.relative(left, right);
  const relativeFromRight = path.relative(right, left);
  return (
    (!relativeFromLeft.startsWith("..") &&
      !path.isAbsolute(relativeFromLeft)) ||
    (!relativeFromRight.startsWith("..") && !path.isAbsolute(relativeFromRight))
  );
}

export function getInstanceLayout(rootPath: string): InstanceLayout {
  const resolved = normalizeInstancePath(rootPath);
  return Object.freeze({
    rootPath: resolved,
    metadataPath: path.join(resolved, "instance.json"),
    configurationPath: path.join(resolved, "config.json"),
    applicationDatabasePath: path.join(resolved, "app.sqlite"),
  });
}

export function readInstanceMetadata(
  rootPath: string,
): InstanceMetadata | null {
  const metadataPath = getInstanceLayout(rootPath).metadataPath;
  if (!existsSync(metadataPath)) return null;
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(metadataPath, "utf-8"));
  } catch (cause) {
    throw new InstanceError(
      "INSTANCE_METADATA_INVALID",
      "实例元数据无法读取。",
      { cause },
    );
  }
  if (
    !value ||
    typeof value !== "object" ||
    (value as Partial<InstanceMetadata>).schemaVersion !==
      INSTANCE_METADATA_VERSION ||
    typeof (value as Partial<InstanceMetadata>).instanceId !== "string" ||
    !(value as Partial<InstanceMetadata>).instanceId?.trim() ||
    typeof (value as Partial<InstanceMetadata>).createdAt !== "string"
  ) {
    throw new InstanceError(
      "INSTANCE_METADATA_INVALID",
      "实例元数据格式无效。",
    );
  }
  return Object.freeze(value as InstanceMetadata);
}

export function writeInstanceMetadata(
  rootPath: string,
  metadata: InstanceMetadata,
): void {
  writeFileSync(
    getInstanceLayout(rootPath).metadataPath,
    JSON.stringify(metadata, null, 2),
    {
      encoding: "utf-8",
      mode: 0o600,
    },
  );
}
