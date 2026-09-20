import { homedir } from "node:os";
import path from "node:path";
import { currentApplicationEnvironment } from "../../agent/environment/AgentEnvironment.ts";
export {
  getAgentHome,
  getDefaultWorkSpace,
  workSpaceRoot,
} from "../../agent/environment/paths.ts";
export function getCustomizeWorkSpace() {
  const configuredPath = currentApplicationEnvironment()?.defaultProjectsRoot;
  const customizeWorkSpace = configuredPath?.trim();
  if (!customizeWorkSpace) return null;
  return path.isAbsolute(customizeWorkSpace)
    ? path.normalize(customizeWorkSpace)
    : path.join(homedir(), customizeWorkSpace);
}
