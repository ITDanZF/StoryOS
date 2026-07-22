import Model from "./Model.ts";
export type AgentId = string;
export type AgentStatus = "idle" | "running" | "disabled";

export type AgentRuntime = {
  id: AgentId;
  name: string;
  description?: string;
  model: Model;
  status: AgentStatus;
  metadata?: Record<string, unknown>;
};

export type CreateAgentOptions = {
  id: AgentId;
  name: string;
  description?: string;
  model?: Model;
  metadata?: Record<string, unknown>;
};

export default class AgentModel {
  private AgentManage = new Map<AgentId, AgentRuntime>();
  private activeAgentId: AgentId | null = null;
  constructor() {
    this.createAgent({
      id: "1",
      name: "Main_Agent",
    });
  }

  createAgent(options: CreateAgentOptions): AgentRuntime {
    if (this.AgentManage.has(options.id)) {
      throw new Error(`Agent already exists: ${options.id}`);
    }

    const model = new Model();

    const agent: AgentRuntime = {
      id: options.id,
      name: options.name,
      description: options.description,
      model: options.model ?? model,
      status: "idle",
      metadata: options.metadata,
    };

    this.AgentManage.set(agent.id, agent);

    if (!this.activeAgentId) {
      this.activeAgentId = agent.id;
    }

    return agent;
  }

  getActiveAgent(): AgentRuntime {
    if (!this.activeAgentId) {
      throw new Error("No active agent");
    }

    const agent = this.AgentManage.get(this.activeAgentId);

    if (!agent) {
      throw new Error(`Active agent not found: ${this.activeAgentId}`);
    }

    return agent;
  }

  getAgent(id: AgentId) {
    return this.AgentManage.get(id);
  }

  listAgents() {
    return Array.from(this.AgentManage.values());
  }
}
