import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getAgentHome } from "../../agent/environment/paths.ts";
import {
  ALIYUN_EMBEDDING_DIMENSIONS,
  ALIYUN_TEXT_EMBEDDING_MODEL,
  type AgentConfigurationInput,
  type AliyunEmbeddingConfigurationInput,
  type AliyunEmbeddingDimensions,
} from "../../../shared/contracts/settings/contracts.ts";

export type InfoType = AgentConfigurationInput;

export type StoredAgentConfiguration =
  | AgentConfigurationInput
  | (Omit<AgentConfigurationInput, "embedding"> & {
      readonly embedding: { readonly enabled: false };
    });

function isHttpUrl(value: string): boolean {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

function isAliyunDimension(value: unknown): value is AliyunEmbeddingDimensions {
  return (
    typeof value === "number" &&
    (ALIYUN_EMBEDDING_DIMENSIONS as readonly number[]).includes(value)
  );
}

function isAliyunEmbedding(value: unknown): value is AliyunEmbeddingConfigurationInput {
  if (!value || typeof value !== "object") return false;
  const embedding = value as Partial<AliyunEmbeddingConfigurationInput>;
  return Boolean(
    embedding.enabled === true &&
    embedding.modelName === ALIYUN_TEXT_EMBEDDING_MODEL &&
    typeof embedding.apiKey === "string" &&
    embedding.apiKey.trim() &&
    typeof embedding.baseUrl === "string" &&
    isHttpUrl(embedding.baseUrl.trim()) &&
    isAliyunDimension(embedding.dimensions),
  );
}

function hasConfigurationEnvelope(
  value: unknown,
): value is Omit<StoredAgentConfiguration, "embedding"> & { readonly embedding: unknown } {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<StoredAgentConfiguration>;
  const chat = candidate.chat;
  return Boolean(
    candidate.schemaVersion === 2 &&
    chat &&
    ["deepseek", "openai", "qwen"].includes(chat.provider) &&
    chat.modelName?.trim() &&
    chat.apiKey?.trim() &&
    isHttpUrl(chat.baseUrl) &&
    candidate.workspace &&
    typeof candidate.workspace.defaultProjectsRoot === "string" &&
    typeof candidate.logLevel === "string",
  );
}

export function isCompleteConfiguration(value: unknown): value is InfoType {
  return hasConfigurationEnvelope(value) && isAliyunEmbedding(value.embedding);
}

function isStoredConfiguration(value: unknown): value is StoredAgentConfiguration {
  if (!hasConfigurationEnvelope(value)) return false;
  const embedding = value.embedding;
  return (
    isAliyunEmbedding(embedding) ||
    Boolean(embedding && typeof embedding === "object" && "enabled" in embedding && embedding.enabled === false)
  );
}

export function sameAliyunEmbeddingAddress(
  previous: StoredAgentConfiguration["embedding"],
  next: Pick<AliyunEmbeddingConfigurationInput, "baseUrl">,
): boolean {
  if (!previous.enabled) return false;
  return previous.baseUrl === next.baseUrl;
}
export default class Configuration {
  constructor(private readonly agentHome = getAgentHome()) {}

  /**
   * 保存配置信息
   */
  saveConfig(config: InfoType) {
    if (!isCompleteConfiguration(config)) throw new Error("配置格式无效。");
    const userHomePath = this.agentHome;
    const configPath = path.join(userHomePath, "config.json");

    const temporaryPath = `${configPath}.${randomUUID()}.tmp`;
    try {
      fs.writeFileSync(temporaryPath, JSON.stringify(config, null, 2), {
        encoding: "utf-8",
        mode: 0o600,
      });
      fs.renameSync(temporaryPath, configPath);
    } finally {
      if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
    }
  }

  /**
   * 加载配置信息
   */
  loadConfig(): StoredAgentConfiguration | null {
    const userHomePath = this.agentHome;
    const configPath = path.join(userHomePath, "config.json");
    if (!fs.existsSync(configPath)) {
      return null;
    }

    try {
      const content = fs.readFileSync(configPath, "utf-8");
      const config = JSON.parse(content) as unknown;
      return isStoredConfiguration(config) ? config : null;
    } catch {
      return null;
    }
  }

  /**
   * 配置文件校验信息
   */
  checkConfigInfo(config: InfoType) {
    if (!isCompleteConfiguration(config)) throw new Error("配置格式无效。");
  }
}
