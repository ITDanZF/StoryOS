import AgentFailure from "../../errors/AgentFailure.ts";
import ToolRegistry from "../../tools/ToolRegistry.ts";
import { coversAll } from "../capabilities.ts";
import AgentRegistry from "../AgentRegistry.ts";
import type { PlannedExecutionPlan, PlannedTask } from "./contracts.ts";

export type PlanValidationLimits = {
  readonly maxTasks: number;
  readonly maxDepth: number;
};

const DEFAULT_LIMITS: PlanValidationLimits = Object.freeze({
  maxTasks: 6,
  maxDepth: 4,
});

export default class PlanValidator {
  constructor(
    private readonly agents: AgentRegistry,
    private readonly tools: ToolRegistry,
    private readonly limits: PlanValidationLimits = DEFAULT_LIMITS,
  ) {}

  validate(plan: PlannedExecutionPlan): PlannedExecutionPlan {
    if (plan.requirements.effects.length > 0) {
      throw new AgentFailure(
        "planning.effect_not_allowed",
        "planning",
        "当前 planned 模式不允许包含写入副作用。",
        false,
      );
    }
    if (plan.tasks.length > this.limits.maxTasks) {
      this.invalid(`Plan has ${plan.tasks.length} tasks; maximum is ${this.limits.maxTasks}.`);
    }
    const tasks = new Map(plan.tasks.map((task) => [task.id, task]));
    if (tasks.size !== plan.tasks.length) this.invalid("Plan contains duplicate task ids.");

    for (const task of plan.tasks) {
      this.validateTask(task, plan);
      if (new Set(task.dependsOn).size !== task.dependsOn.length) {
        this.invalid(`Task has duplicate dependencies: ${task.id}`);
      }
      for (const dependencyId of task.dependsOn) {
        if (dependencyId === task.id) this.invalid(`Task cannot depend on itself: ${task.id}`);
        if (!tasks.has(dependencyId)) {
          this.invalid(`Task ${task.id} depends on unknown task: ${dependencyId}`);
        }
      }
    }
    this.validateAcyclic(plan, tasks);
    return plan;
  }

  private validateTask(task: PlannedTask, plan: PlannedExecutionPlan): void {
    if (task.requirements.effects.length > 0) {
      throw new AgentFailure(
        "planning.effect_not_allowed",
        "planning",
        `任务“${task.title}”包含 planned 模式不允许的副作用。`,
        false,
        { taskId: task.id },
      );
    }
    if (!coversAll(plan.requirements.effects, task.requirements.effects)) {
      this.invalid(`Task effects exceed root requirements: ${task.id}.`);
    }
    if (!coversAll(plan.requirements.contextKinds, task.requirements.contextKinds)) {
      this.invalid(`Task context is not available from the root request: ${task.id}.`);
    }
    const agent = this.agents.get(task.assignedAgentId);
    if (!agent.executionModes.includes("planned")
      || !coversAll(agent.capabilities, task.requirements.capabilities)
      || !coversAll(agent.allowedEffects, task.requirements.effects)
      || !coversAll(agent.acceptedContexts, task.requirements.contextKinds)
      || !agent.outputKinds.includes(task.requirements.outputKind)) {
      this.invalid(`Assigned agent cannot satisfy task requirements: ${task.id}.`);
    }
    if (!coversAll(agent.allowedToolIds, task.grantedToolIds)) {
      this.invalid(`Task grant exceeds agent tools: ${task.id}.`);
    }
    for (const toolId of task.grantedToolIds) {
      const manifest = this.tools.getManifest(toolId);
      if (!coversAll(task.requirements.effects, manifest.effects)) {
        this.invalid(`Task grant exceeds declared effects: ${task.id}/${toolId}.`);
      }
      if (!coversAll(task.requirements.contextKinds, manifest.requiredContexts)) {
        this.invalid(`Task context cannot satisfy tool: ${task.id}/${toolId}.`);
      }
    }
  }

  private validateAcyclic(
    plan: PlannedExecutionPlan,
    tasks: ReadonlyMap<string, PlannedTask>,
  ): void {
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const visit = (taskId: string, depth: number): void => {
      if (depth > this.limits.maxDepth) {
        this.invalid(`Plan dependency depth exceeds ${this.limits.maxDepth} at ${taskId}.`);
      }
      if (visiting.has(taskId)) this.invalid(`Plan contains a dependency cycle at task: ${taskId}`);
      if (visited.has(taskId)) return;
      visiting.add(taskId);
      const task = tasks.get(taskId);
      if (!task) this.invalid(`Task not found during validation: ${taskId}`);
      for (const dependencyId of task.dependsOn) visit(dependencyId, depth + 1);
      visiting.delete(taskId);
      visited.add(taskId);
    };
    for (const task of plan.tasks) visit(task.id, 1);
  }

  private invalid(message: string): never {
    throw new AgentFailure(
      "planning.invalid_plan",
      "planning",
      message,
      false,
    );
  }
}
