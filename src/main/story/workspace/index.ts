import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { getAgentHome, getCustomizeWorkSpace } from "./path.ts";

export default class WorkSpace {
  constructor(private readonly agentHome = getAgentHome()) {}
  async createHomeRoot() {
    const agentHome = this.agentHome;
    await mkdir(agentHome, { recursive: true });
    return { agentHome };
  }

  async createAgentWorkSpace() {
    const workSpacePath =
      getCustomizeWorkSpace() || path.join(this.agentHome, "workSpaceRoot");
    if (!existsSync(workSpacePath))
      await mkdir(workSpacePath, { recursive: true });
    return workSpacePath;
  }
}
