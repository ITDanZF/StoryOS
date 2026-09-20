import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import type {
  InstanceSnapshot,
  StoryInstanceDto,
} from "../../../shared/contracts/instances/contracts.ts";
import {
  normalizeInstancePath,
  pathsConflict,
  readInstanceMetadata,
} from "./InstanceLayout.ts";
import { InstanceError } from "./instanceErrors.ts";
import Configuration from "../config/index.ts";

type RegistryEntry = {
  readonly id: string;
  readonly name: string;
  readonly rootPath: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly lastOpenedAt: string | null;
};

type RegistryFile = {
  readonly schemaVersion: 1;
  readonly lastActiveInstanceId: string | null;
  readonly firstSelectionCompleted: boolean;
  readonly instances: readonly RegistryEntry[];
};

function isRegistryFile(value: unknown): value is RegistryFile {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<RegistryFile>;
  const fieldsValid =
    candidate.schemaVersion === 1 &&
    typeof candidate.firstSelectionCompleted === "boolean" &&
    (candidate.lastActiveInstanceId === null ||
      typeof candidate.lastActiveInstanceId === "string") &&
    Array.isArray(candidate.instances) &&
    candidate.instances.every(
      (entry) =>
        entry &&
        typeof entry === "object" &&
        typeof (entry as RegistryEntry).id === "string" &&
        typeof (entry as RegistryEntry).name === "string" &&
        typeof (entry as RegistryEntry).rootPath === "string" &&
        typeof (entry as RegistryEntry).createdAt === "string" &&
        typeof (entry as RegistryEntry).updatedAt === "string" &&
        ((entry as RegistryEntry).lastOpenedAt === null ||
          typeof (entry as RegistryEntry).lastOpenedAt === "string"),
    );
  if (!fieldsValid) return false;
  const entries = candidate.instances as RegistryEntry[];
  if (new Set(entries.map((entry) => entry.id)).size !== entries.length)
    return false;
  if (
    candidate.lastActiveInstanceId !== null &&
    !entries.some((entry) => entry.id === candidate.lastActiveInstanceId)
  )
    return false;
  if (
    !candidate.firstSelectionCompleted &&
    candidate.lastActiveInstanceId !== null
  )
    return false;
  return entries.every((entry, index) =>
    entries
      .slice(index + 1)
      .every((other) => !pathsConflict(entry.rootPath, other.rootPath)),
  );
}

export default class InstanceRegistry {
  private value: RegistryFile;

  constructor(
    private readonly registryPath: string,
    private readonly defaultRootPath: string,
  ) {
    this.value = this.loadOrReset();
  }

  getSnapshot(activeInstanceId: string | null = null): InstanceSnapshot {
    return Object.freeze({
      activeInstanceId,
      lastActiveInstanceId: this.value.lastActiveInstanceId,
      firstSelectionCompleted: this.value.firstSelectionCompleted,
      suggestedRootPath: normalizeInstancePath(this.defaultRootPath),
      instances: Object.freeze(
        this.value.instances
          .map((entry) => this.toDto(entry))
          .sort((first, second) =>
            (second.lastOpenedAt ?? "").localeCompare(first.lastOpenedAt ?? ""),
          ),
      ),
    });
  }

  get(instanceId: string): RegistryEntry {
    const entry = this.value.instances.find((item) => item.id === instanceId);
    if (!entry)
      throw new InstanceError(
        "INSTANCE_NOT_FOUND",
        `实例不存在：${instanceId}`,
      );
    return entry;
  }

  add(input: {
    readonly id?: string;
    readonly name: string;
    readonly rootPath: string;
  }): RegistryEntry {
    const name = input.name.trim();
    if (!name) throw new Error("实例名称不能为空。");
    const rootPath = normalizeInstancePath(input.rootPath);
    this.assertPathAvailable(rootPath);
    const now = new Date().toISOString();
    const entry: RegistryEntry = Object.freeze({
      id: input.id ?? randomUUID(),
      name,
      rootPath,
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: null,
    });
    this.commit({ ...this.value, instances: [...this.value.instances, entry] });
    return entry;
  }

  assertCustomPathAvailable(rootPath: string): void {
    this.assertPathAvailable(normalizeInstancePath(rootPath));
  }

  rename(instanceId: string, name: string): void {
    const normalized = name.trim();
    if (!normalized) throw new Error("实例名称不能为空。");
    this.get(instanceId);
    this.commit({
      ...this.value,
      instances: this.value.instances.map((entry) =>
        entry.id === instanceId
          ? { ...entry, name: normalized, updatedAt: new Date().toISOString() }
          : entry,
      ),
    });
  }

  remove(instanceId: string): void {
    this.get(instanceId);
    this.commit({
      ...this.value,
      lastActiveInstanceId:
        this.value.lastActiveInstanceId === instanceId
          ? null
          : this.value.lastActiveInstanceId,
      instances: this.value.instances.filter((item) => item.id !== instanceId),
    });
  }

  relocate(instanceId: string, rootPath: string): void {
    this.get(instanceId);
    const normalized = normalizeInstancePath(rootPath);
    if (
      this.value.instances.some(
        (item) =>
          item.id !== instanceId && pathsConflict(item.rootPath, normalized),
      )
    )
      throw new InstanceError(
        "INSTANCE_PATH_CONFLICT",
        "实例路径与现有实例冲突。",
      );
    this.commit({
      ...this.value,
      instances: this.value.instances.map((item) =>
        item.id === instanceId
          ? {
              ...item,
              rootPath: normalized,
              updatedAt: new Date().toISOString(),
            }
          : item,
      ),
    });
  }

  markOpened(instanceId: string): void {
    this.get(instanceId);
    const now = new Date().toISOString();
    this.commit({
      ...this.value,
      firstSelectionCompleted: true,
      lastActiveInstanceId: instanceId,
      instances: this.value.instances.map((entry) =>
        entry.id === instanceId
          ? { ...entry, updatedAt: now, lastOpenedAt: now }
          : entry,
      ),
    });
  }

  private assertPathAvailable(rootPath: string): void {
    if (
      this.value.instances.some((entry) =>
        pathsConflict(entry.rootPath, rootPath),
      )
    ) {
      throw new InstanceError(
        "INSTANCE_PATH_CONFLICT",
        "实例路径与现有实例冲突。",
      );
    }
  }

  private loadOrReset(): RegistryFile {
    if (existsSync(this.registryPath)) {
      try {
        const parsed = JSON.parse(
          readFileSync(this.registryPath, "utf-8"),
        ) as unknown;
        if (isRegistryFile(parsed)) {
          const legacyDefault = parsed.instances.some(
            (entry) => entry.id === "default",
          );
          if (!legacyDefault) return parsed;
          const migrated: RegistryFile = Object.freeze({
            ...parsed,
            lastActiveInstanceId:
              parsed.lastActiveInstanceId === "default"
                ? null
                : parsed.lastActiveInstanceId,
            firstSelectionCompleted:
              parsed.lastActiveInstanceId !== "default" &&
              parsed.firstSelectionCompleted,
            instances: Object.freeze(
              parsed.instances.filter((entry) => entry.id !== "default"),
            ),
          });
          this.write(migrated);
          return migrated;
        }
      } catch {
        /* Validation below rejects corrupt registries without deleting data. */
      }
      throw new InstanceError(
        "INSTANCE_METADATA_INVALID",
        "实例注册表损坏，请先处理注册表文件。",
      );
    }
    const initial: RegistryFile = Object.freeze({
      schemaVersion: 1,
      lastActiveInstanceId: null,
      firstSelectionCompleted: false,
      instances: Object.freeze([]),
    });
    this.write(initial);
    return initial;
  }

  private commit(next: RegistryFile): void {
    this.write(next);
    this.value = next;
  }

  private write(value: RegistryFile): void {
    mkdirSync(path.dirname(this.registryPath), { recursive: true });
    const temporaryPath = `${this.registryPath}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temporaryPath, JSON.stringify(value, null, 2), {
        encoding: "utf-8",
        mode: 0o600,
      });
      renameSync(temporaryPath, this.registryPath);
    } finally {
      rmSync(temporaryPath, { force: true });
    }
  }

  private toDto(entry: RegistryEntry): StoryInstanceDto {
    if (!existsSync(entry.rootPath))
      return Object.freeze({
        ...entry,
        status: "missing",
      });
    try {
      const metadata = readInstanceMetadata(entry.rootPath);
      if (!metadata) return Object.freeze({ ...entry, status: "needs-setup" });
      return Object.freeze({
        ...entry,
        status:
          metadata.instanceId !== entry.id
            ? "invalid"
            : new Configuration(entry.rootPath).loadConfig()
              ? "ready"
              : "needs-setup",
      });
    } catch {
      return Object.freeze({ ...entry, status: "invalid" });
    }
  }
}
