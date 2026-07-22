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
  const configPath = path.join(getAgentHome(), "config.json");
  const config = JSON.parse(readFileSync(configPath, "utf-8")) as { AGENT_WORKSPACE?: string };
  const customizeWorkSpace = config.AGENT_WORKSPACE?.trim();
  if (!customizeWorkSpace) return null;
  return path.isAbsolute(customizeWorkSpace)
    ? path.normalize(customizeWorkSpace)
    : path.join(homedir(), customizeWorkSpace);
}
