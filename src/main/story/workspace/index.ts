import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { getAgentHome, getCustomizeWorkSpace, getDefaultWorkSpace } from "./path.ts";

export default class WorkSpace {
  constructor(private readonly agentHome = getAgentHome()) {}
  async createHomeRoot() {
    const agentHome = this.agentHome;
    const configPath = path.join(agentHome, "config.json");
    await mkdir(agentHome, { recursive: true });
    await mkdir(path.join(agentHome, "logs"), { recursive: true });
    if (!existsSync(configPath)) {
      await writeFile(
        configPath,
        JSON.stringify(
          {
            MODEL_PROVIDER: "",
            MODEL_NAME: "",
            MODEL_BASE_URL: "",
            MODEL_API_KEY: "",
            AGENT_WORKSPACE: "",
            LOG_LEVEL: "info",
          },
          null,
          2,
        ),
        "utf-8",
      );
      return { agentHome, configPath };
    }
    return { agentHome, configPath };
  }

  async createAgentWorkSpace() {
    const workSpacePath = getCustomizeWorkSpace() || getDefaultWorkSpace();
    if (!existsSync(workSpacePath)) await mkdir(workSpacePath, { recursive: true });
    return workSpacePath;
  }
}
