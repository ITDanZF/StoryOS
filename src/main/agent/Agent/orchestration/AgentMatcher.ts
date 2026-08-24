import AgentFailure from "../../errors/AgentFailure.ts";
import ToolAccessResolver from "../../tools/ToolAccessResolver.ts";
import { coversAll } from "../capabilities.ts";
import AgentRegistry from "../AgentRegistry.ts";
import type { PlannedTask, ProposedTask } from "./contracts.ts";

export default class AgentMatcher {
  constructor(
    private readonly agents: AgentRegistry,
    private readonly tools: ToolAccessResolver,
  ) {}

  hasCandidate(task: Pick<ProposedTask, "requirements">): boolean {
    return this.candidates(task).length > 0;
  }

  assign(task: ProposedTask): PlannedTask {
    const agent = this.candidates(task)[0];
    if (!agent) {
      throw new AgentFailure(
        "routing.no_capable_agent",
        "routing",
        `没有 Agent 能够完成任务“${task.title}”。`,
        false,
        { taskId: task.id },
      );
    }
    return Object.freeze({
      ...task,
      assignedAgentId: agent.id,
      grantedToolIds: this.tools.forAgent(agent, task.requirements).toolIds,
    });
  }

  private candidates(task: Pick<ProposedTask, "requirements">) {
    return this.agents.list()
      .filter((agent) => agent.executionModes.includes("planned"))
      .filter((agent) => coversAll(agent.capabilities, task.requirements.capabilities))
      .filter((agent) => coversAll(agent.allowedEffects, task.requirements.effects))
      .filter((agent) => coversAll(agent.acceptedContexts, task.requirements.contextKinds))
      .filter((agent) => agent.outputKinds.includes(task.requirements.outputKind))
      .sort((left, right) => {
        const permissionDelta = left.allowedToolIds.length - right.allowedToolIds.length;
        return permissionDelta || left.id.localeCompare(right.id);
      });
  }
}

