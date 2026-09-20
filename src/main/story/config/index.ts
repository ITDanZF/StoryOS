import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getAgentHome } from "../../agent/environment/paths.ts";
import type { AgentConfigurationInput } from "../../../shared/contracts/settings/contracts.ts";

export type InfoType = AgentConfigurationInput;

function isHttpUrl(value: string): boolean {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

function isConfiguration(value: unknown): value is InfoType {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<InfoType>;
  const chat = candidate.chat;
  const embedding = candidate.embedding;
  return Boolean(
    candidate.schemaVersion === 2 &&
    chat &&
    ["deepseek", "openai", "qwen"].includes(chat.provider) &&
    chat.modelName?.trim() &&
    chat.apiKey?.trim() &&
    isHttpUrl(chat.baseUrl) &&
    candidate.workspace &&
    typeof candidate.workspace.defaultProjectsRoot === "string" &&
    typeof candidate.logLevel === "string" &&
    embedding &&
    (embedding.enabled === false ||
      (embedding.enabled === true &&
        embedding.modelName?.trim() &&
        embedding.apiKey?.trim() &&
        isHttpUrl(embedding.endpointUrl) &&
        (embedding.dimensions === undefined ||
          (Number.isInteger(embedding.dimensions) &&
            embedding.dimensions > 0)))),
  );
}
export default class Configuration {
  constructor(private readonly agentHome = getAgentHome()) {}

  /**
   * 保存配置信息
   */
  saveConfig(config: InfoType) {
    if (!isConfiguration(config)) throw new Error("配置格式无效。");
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
  loadConfig(): InfoType | null {
    const userHomePath = this.agentHome;
    const configPath = path.join(userHomePath, "config.json");
    if (!fs.existsSync(configPath)) {
      return null;
    }

    try {
      const content = fs.readFileSync(configPath, "utf-8");
      const config = JSON.parse(content) as unknown;
      return isConfiguration(config) ? config : null;
    } catch {
      return null;
    }
  }

  /**
   * 配置文件校验信息
   */
  checkConfigInfo(config: InfoType) {
    if (!isConfiguration(config)) throw new Error("配置格式无效。");
  }
}
