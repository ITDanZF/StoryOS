import AgentRegistry from "../AgentRegistry.ts";
import { isAgentPlanningEligible } from "../AgentPlanning.ts";
import type { ExecutionPlan, PlannedExecutionPlan, PlannedTask } from "./contracts.ts";

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
    private readonly registry: AgentRegistry,
    private readonly limits: PlanValidationLimits = DEFAULT_LIMITS,
  ) {}

  validate(plan: ExecutionPlan): ExecutionPlan {
    if (plan.mode === "direct") {
      return plan;
    }
    if (plan.tasks.length > this.limits.maxTasks) {
      throw new Error(
        `Plan has ${plan.tasks.length} tasks; maximum is ${this.limits.maxTasks}.`,
      );
    }

    const tasks = new Map(plan.tasks.map((task) => [task.id, task]));
    if (tasks.size !== plan.tasks.length) {
      throw new Error("Plan contains duplicate task ids.");
    }

    for (const task of plan.tasks) {
      const agent = this.registry.get(task.agentType);
      if (!isAgentPlanningEligible(agent)) {
        throw new Error(`Agent is not eligible for planned tasks: ${task.agentType}`);
      }
      if (new Set(task.dependsOn).size !== task.dependsOn.length) {
        throw new Error(`Task has duplicate dependencies: ${task.id}`);
      }
      for (const dependencyId of task.dependsOn) {
        if (dependencyId === task.id) {
          throw new Error(`Task cannot depend on itself: ${task.id}`);
        }
        if (!tasks.has(dependencyId)) {
          throw new Error(
            `Task ${task.id} depends on unknown task: ${dependencyId}`,
          );
        }
      }
    }

    this.validateAcyclic(plan, tasks);
    return plan;
  }

  private validateAcyclic(
    plan: PlannedExecutionPlan,
    tasks: ReadonlyMap<string, PlannedTask>,
  ): void {
    const visiting = new Set<string>();
    const visited = new Set<string>();

    const visit = (taskId: string, depth: number): void => {
      if (depth > this.limits.maxDepth) {
        throw new Error(
          `Plan dependency depth exceeds ${this.limits.maxDepth} at ${taskId}.`,
        );
      }
      if (visiting.has(taskId)) {
        throw new Error(`Plan contains a dependency cycle at task: ${taskId}`);
      }
      if (visited.has(taskId)) {
        return;
      }

      visiting.add(taskId);
      const task = tasks.get(taskId);
      if (!task) {
        throw new Error(`Task not found during validation: ${taskId}`);
      }
      for (const dependencyId of task.dependsOn) {
        visit(dependencyId, depth + 1);
      }
      visiting.delete(taskId);
      visited.add(taskId);
    };

    for (const task of plan.tasks) {
      visit(task.id, 1);
    }
  }
}
