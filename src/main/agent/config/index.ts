import { ConfigKey, REQUIRED_CONFIG_KEYS } from "../enum/Config.constant.ts";
import { getAgentHome } from "../workspace/path.ts";
import path from "node:path";
import fs from "node:fs";
export type InfoType = Partial<Record<ConfigKey, string>>;
export default class Configuration {
  private BaseProjectInfo: InfoType;

  constructor() {
    this.BaseProjectInfo = {};
  }

  /**
   * 保存配置信息
   */
  saveConfig(config: InfoType) {
    const userHomePath = getAgentHome();
    const configPath = path.join(userHomePath, "config.json");

    if (!fs.existsSync(configPath)) {
      throw new Error(`该用户目录 ${configPath}不存在`);
    }

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
    Object.entries(config).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        process.env[key] = String(value);
      }
    });
  }

  /**
   * 加载配置信息
   */
  loadConfig(): InfoType | null {
    const userHomePath = getAgentHome();
    const configPath = path.join(userHomePath, "config.json");
    if (!fs.existsSync(configPath)) {
      return null;
    }

    try {
      const content = fs.readFileSync(configPath, "utf-8");
      const config = JSON.parse(content) as InfoType;

      if (
        !config.MODEL_PROVIDER ||
        !config.MODEL_NAME ||
        !config.MODEL_BASE_URL ||
        !config.MODEL_API_KEY
      ) {
        return null;
      }

      Object.entries(config).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== "") {
          process.env[key] = String(value);
        }
      });

      this.BaseProjectInfo = config;

      return config;
    } catch (error) {
      return null;
    }
  }

  /**
   * 配置文件校验信息
   */
  checkConfigInfo(config: InfoType) {
    const missingKeys = REQUIRED_CONFIG_KEYS.filter((key) => {
      const value = config[key];
      return typeof value !== "string" || value.trim() === "";
    });

    if (missingKeys.length > 0) {
      console.error(
        `配置文件校验失败，缺少必要字段：${missingKeys.join(", ")}`,
      );
      process.exit(1);
    }

    console.log("配置文件校验成功");
  }
}
