import { homedir } from "node:os";
import path from "node:path";
import { currentApplicationEnvironment } from "./AgentEnvironment.ts";

export function workSpaceRoot() {
  return path.join(homedir(), "workSpaceRoot");
}

export function getAgentHome() {
  const environment = currentApplicationEnvironment();
  if (environment) return path.resolve(environment.agentHome);
  const override = process.env.MINI_AGENT_HOME?.trim();
  return override ? path.resolve(override) : path.join(homedir(), ".mini-agent");
}

export function getDefaultWorkSpace() {
  return path.join(getAgentHome(), "workSpaceRoot");
}
