import Model from "../../model/Model.ts";
import ToolResolver from "../../tools/ToolResolver.ts";
import ToolPolicy, { denyToolApproval } from "../../security/ToolPolicy.ts";
import type { SkillInstaller } from "../../skills/SkillInstallService.ts";
import AgentGenerator from "../AgentGenerator.ts";
import AgentRuntime from "../AgentRuntime.ts";
import AgentRegistry from "../AgentRegistry.ts";
import { builtInAgents } from "../builtInAgents.ts";
import { DEFAULT_RUN_LIMITS, type RunLimits } from "../RunLimits.ts";
import type { SkillContextProvider } from "../../skills/SkillContextProvider.ts";
import { compileSkillAgents } from "../../skills/SkillAgentCompiler.ts";
import type { SkillDefinition } from "../../skills/SkillTypes.ts";
import AgentOrchestrator from "./AgentOrchestrator.ts";
import AgentTaskRunner from "./AgentTaskRunner.ts";
import AnswerSynthesizer from "./AnswerSynthesizer.ts";
import ResultReviewer from "./ResultReviewer.ts";
import TaskPlanner from "./TaskPlanner.ts";
import TaskScheduler from "./TaskScheduler.ts";

export type AgentOrchestratorFactoryOptions = {
  readonly limits?: RunLimits;
  readonly model?: Model;
  readonly skillContextProvider?: SkillContextProvider;
  readonly skillDefinitions?: readonly SkillDefinition[];
  readonly skillDefinitionsProvider?: () => readonly SkillDefinition[];
  readonly skillInstaller?: SkillInstaller;
};

function isSkillAgent(definition: { readonly metadata?: Readonly<Record<string, unknown>> }) {
  return definition.metadata?.source === "skill";
}

export function createAgentOrchestrator(
  options: AgentOrchestratorFactoryOptions | RunLimits = {},
): AgentOrchestrator {
  const limits = "maxTurns" in options ? options : options.limits ?? DEFAULT_RUN_LIMITS;
  const skillContextProvider = "maxTurns" in options
    ? undefined
    : options.skillContextProvider;
  const skillDefinitions = "maxTurns" in options
    ? []
    : options.skillDefinitions ?? [];
  const skillDefinitionsProvider = "maxTurns" in options
    ? () => skillDefinitions
    : options.skillDefinitionsProvider ?? (() => skillDefinitions);
  const skillInstaller = "maxTurns" in options
    ? undefined
    : options.skillInstaller;
  const model = "maxTurns" in options ? new Model() : options.model ?? new Model();
  const toolResolver = new ToolResolver({ skillInstaller });
  const registry = new AgentRegistry(builtInAgents);
  const syncSkillAgents = () => registry.replaceWhere(
    isSkillAgent,
    compileSkillAgents(skillDefinitionsProvider(), {
      knownToolNames: toolResolver.listNames(),
    }),
  );
  syncSkillAgents();
  skillInstaller?.onAfterInstall?.(() => {
    syncSkillAgents();
  });
  const policy = new ToolPolicy();
  const directRunner = new AgentGenerator({
    model,
    registry,
    toolResolver,
    policy,
    limits,
    skillContextProvider,
  });
  const taskRuntime = new AgentRuntime(
    registry,
    model,
    toolResolver,
    policy,
    denyToolApproval,
  );
  const scheduler = new TaskScheduler(
    new AgentTaskRunner(taskRuntime),
    new ResultReviewer(model),
    new AnswerSynthesizer(model),
  );

  return new AgentOrchestrator(
    directRunner,
    new TaskPlanner(model, registry),
    scheduler,
    limits,
  );
}
