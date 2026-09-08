import path from "node:path";
import { homedir } from "node:os";
import { readFileSync } from "node:fs";

export function workSpaceRoot() {
  return path.join(homedir(), "workSpaceRoot");
}

export function getAgentHome() {
  const override = process.env.MINI_AGENT_HOME?.trim();
  return override ? path.resolve(override) : path.join(homedir(), ".mini-agent");
}

export function getDefaultWorkSpace() {
  return path.join(getAgentHome(), "workSpaceRoot");
}

export function getCustomizeWorkSpace() {
  // A running service keeps its startup path until restart, even after settings are saved.
  let configuredPath = process.env.AGENT_WORKSPACE;
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
