import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { currentApplicationEnvironment } from "../../agent/environment/AgentEnvironment.ts";
import { getAgentHome } from "../../agent/environment/paths.ts";
export { getAgentHome, getDefaultWorkSpace, workSpaceRoot } from "../../agent/environment/paths.ts";
export function getCustomizeWorkSpace() {
  // A running service keeps its startup path until restart, even after settings are saved.
  let configuredPath =
    currentApplicationEnvironment()?.workspacePath ?? process.env.AGENT_WORKSPACE;
  if (configuredPath === undefined) {
    const configPath = path.join(getAgentHome(), "config.json");
    const config = JSON.parse(readFileSync(configPath, "utf-8")) as { AGENT_WORKSPACE?: string };
    configuredPath = config.AGENT_WORKSPACE;
  }
  const customizeWorkSpace = configuredPath?.trim();
  if (!customizeWorkSpace) return null;
  return path.isAbsolute(customizeWorkSpace)
    ? path.normalize(customizeWorkSpace)
    : path.join(homedir(), customizeWorkSpace);
}
