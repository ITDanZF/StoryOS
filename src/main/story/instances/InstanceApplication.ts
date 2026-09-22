import { randomUUID } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import type {
  CreateInstanceRequest,
  InstanceConfigurationDto,
  InstanceSnapshot,
  StoryInstanceDto,
} from "../../../shared/contracts/instances/contracts.ts";
import Configuration, { sameAliyunEmbeddingAddress } from "../config/index.ts";
import InstanceRegistry from "./InstanceRegistry.ts";
import {
  normalizeInstancePath,
  readInstanceMetadata,
  writeInstanceMetadata,
} from "./InstanceLayout.ts";

function requireEmptyDirectory(rootPath: string): boolean {
  if (!existsSync(rootPath)) return true;
  if (lstatSync(rootPath).isSymbolicLink())
    throw new Error("不能使用符号链接实例目录。");
  if (readdirSync(rootPath).length > 0) throw new Error("实例目录必须为空。");
  return false;
}

export default class InstanceApplication {
  constructor(private readonly registry: InstanceRegistry) {}

  getSnapshot(activeInstanceId: string | null = null): InstanceSnapshot {
    return this.registry.getSnapshot(activeInstanceId);
  }

  create(request: CreateInstanceRequest): StoryInstanceDto {
    const instanceId = randomUUID();
    return this.createAt({
      id: instanceId,
      name: request.name,
      rootPath: request.rootPath,
      configuration: request.configuration,
    });
  }

  getConfiguration(instanceId: string): InstanceConfigurationDto {
    const config = this.requireConfiguration(instanceId);
    return Object.freeze({
      schemaVersion: 2,
      chat: Object.freeze({
        provider: config.chat.provider,
        modelName: config.chat.modelName,
        baseUrl: config.chat.baseUrl,
        apiKeyConfigured: true,
      }),
      embedding: config.embedding.enabled
        ? Object.freeze({
            enabled: true,
            modelName: config.embedding.modelName,
            baseUrl: config.embedding.baseUrl,
            dimensions: config.embedding.dimensions,
            apiKeyConfigured: true,
          })
        : Object.freeze({ enabled: false }),
      workspace: Object.freeze({ ...config.workspace }),
      logLevel: config.logLevel,
    });
  }

  updateConfiguration(
    instanceId: string,
    input: CreateInstanceRequest["configuration"],
  ): void {
    const entry = this.registry.get(instanceId);
    const previous = this.requireConfiguration(instanceId);
    const canReuseChatKey =
      previous.chat.provider === input.chat.provider &&
      previous.chat.baseUrl === input.chat.baseUrl;
    const chat = {
      ...input.chat,
      apiKey:
        input.chat.apiKey.trim() ||
        (canReuseChatKey ? previous.chat.apiKey : ""),
    };
    const embedding =
      !input.embedding.apiKey.trim() &&
      previous.embedding.enabled &&
      sameAliyunEmbeddingAddress(previous.embedding, input.embedding)
        ? { ...input.embedding, apiKey: previous.embedding.apiKey }
        : input.embedding;
    new Configuration(entry.rootPath).saveConfig({ ...input, chat, embedding });
  }

  rename(instanceId: string, name: string): InstanceSnapshot {
    this.registry.rename(instanceId, name);
    return this.getSnapshot();
  }

  remove(instanceId: string): InstanceSnapshot {
    this.registry.remove(instanceId);
    return this.getSnapshot();
  }

  relocate(instanceId: string, rootPath: string): InstanceSnapshot {
    this.registry.get(instanceId);
    const normalized = normalizeInstancePath(rootPath);
    if (!existsSync(normalized) || lstatSync(normalized).isSymbolicLink())
      throw new Error("目标实例目录不可用。");
    if (
      readInstanceMetadata(normalized)?.instanceId !== instanceId ||
      !new Configuration(normalized).loadConfig()
    )
      throw new Error("目标目录的实例身份或配置无效。");
    this.registry.relocate(instanceId, normalized);
    return this.getSnapshot();
  }

  discardCreated(instanceId: string, directoryCreated: boolean): void {
    const entry = this.registry.get(instanceId);
    const metadata = readInstanceMetadata(entry.rootPath);
    if (metadata?.instanceId !== instanceId)
      throw new Error("实例目录所有权无法确认。");
    this.registry.remove(instanceId);
    if (directoryCreated) {
      rmSync(entry.rootPath, { recursive: true, force: true });
    } else {
      rmSync(path.join(entry.rootPath, "instance.json"), { force: true });
      rmSync(path.join(entry.rootPath, "config.json"), { force: true });
    }
  }

  private createAt(input: {
    readonly id: string;
    readonly name: string;
    readonly rootPath: string;
    readonly configuration: CreateInstanceRequest["configuration"];
  }): StoryInstanceDto {
    const rootPath = normalizeInstancePath(input.rootPath);
    this.registry.assertCustomPathAvailable(rootPath);
    const directoryCreated = requireEmptyDirectory(rootPath);
    mkdirSync(rootPath, { recursive: true });
    try {
      writeInstanceMetadata(rootPath, {
        schemaVersion: 1,
        instanceId: input.id,
        createdAt: new Date().toISOString(),
      });
      new Configuration(rootPath).saveConfig(input.configuration);
      this.registry.add({ id: input.id, name: input.name, rootPath });
      return this.requireDto(input.id);
    } catch (error) {
      if (readInstanceMetadata(rootPath)?.instanceId === input.id) {
        rmSync(path.join(rootPath, "instance.json"), { force: true });
        rmSync(path.join(rootPath, "config.json"), { force: true });
        if (directoryCreated && readdirSync(rootPath).length === 0)
          rmSync(rootPath, { recursive: true });
      }
      throw error;
    }
  }

  private requireDto(instanceId: string): StoryInstanceDto {
    const instance = this.registry
      .getSnapshot()
      .instances.find((candidate) => candidate.id === instanceId);
    if (!instance) throw new Error(`实例注册失败：${instanceId}`);
    return instance;
  }

  private requireConfiguration(instanceId: string) {
    const config = new Configuration(
      this.registry.get(instanceId).rootPath,
    ).loadConfig();
    if (!config) throw new Error("实例配置无效。");
    return config;
  }
}
