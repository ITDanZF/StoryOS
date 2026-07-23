import Memory from "../../Memory/index.ts";
import {
  readModelConnectionConfigurationFromEnvironment,
} from "../../model/ModelConfiguration.ts";
import type { ModelGatewayRegistration } from "../../model/ModelRouter.ts";
import ModelRouter from "../../model/ModelRouter.ts";
import Model from "../../model/Model.ts";
import ToolResolver from "../../tools/ToolResolver.ts";
import type WorkspaceToolContext from "../../tools/WorkspaceToolContext.ts";
import ToolPolicy, { denyToolApproval } from "../../security/ToolPolicy.ts";
import type { SkillInstaller } from "../../skills/SkillInstallService.ts";
import AgentExecutor from "../AgentExecutor.ts";
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
  readonly modelGateways?: readonly ModelGatewayRegistration[];
  readonly skillContextProvider?: SkillContextProvider;
  readonly skillDefinitions?: readonly SkillDefinition[];
  readonly skillDefinitionsProvider?: () => readonly SkillDefinition[];
  readonly skillInstaller?: SkillInstaller;
  readonly workspaceContext?: WorkspaceToolContext;
};

function isSkillAgent(definition: { readonly metadata?: Readonly<Record<string, unknown>> }) {
  return definition.metadata?.source === "skill";
}

function createDefaultModel(): Model {
  return new Model({
    configuration: readModelConnectionConfigurationFromEnvironment(),
    sessions: new Memory(),
  });
}

export function createAgentOrchestrator(
  options: AgentOrchestratorFactoryOptions | RunLimits = {},
): AgentOrchestrator {
  const usesLegacyLimits = "maxTurns" in options;
  const limits = usesLegacyLimits ? options : options.limits ?? DEFAULT_RUN_LIMITS;
  const skillContextProvider = usesLegacyLimits
    ? undefined
    : options.skillContextProvider;
  const skillDefinitions = usesLegacyLimits
    ? []
    : options.skillDefinitions ?? [];
  const skillDefinitionsProvider = usesLegacyLimits
    ? () => skillDefinitions
    : options.skillDefinitionsProvider ?? (() => skillDefinitions);
  const skillInstaller = usesLegacyLimits ? undefined : options.skillInstaller;
  const workspaceContext = usesLegacyLimits ? undefined : options.workspaceContext;
  const model = usesLegacyLimits ? createDefaultModel() : options.model ?? createDefaultModel();
  const modelRouter = new ModelRouter(
    model,
    usesLegacyLimits ? [] : options.modelGateways,
  );
  const toolResolver = new ToolResolver({ skillInstaller, workspaceContext });
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
  const executor = new AgentExecutor(modelRouter);
  const taskRuntime = new AgentRuntime(
    registry,
    model,
    toolResolver,
    policy,
    denyToolApproval,
    executor,
  );
  const directRunner = new AgentGenerator({
    model,
    registry,
    toolResolver,
    policy,
    limits,
    skillContextProvider,
    executor,
    subagentRuntime: taskRuntime,
  });
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
