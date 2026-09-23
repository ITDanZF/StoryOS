import { compileSkillAgents } from "../skills/SkillAgentCompiler.ts";
import type { SkillContextProvider } from "../skills/SkillContextProvider.ts";
import type { SkillInstaller } from "../skills/SkillInstallService.ts";
import type { SkillDefinition } from "../skills/SkillTypes.ts";
import Memory from "../checkpoints/index.ts";
import Model from "../model/Model.ts";
import type { ModelGateway } from "../model/ModelGateway.ts";
import type { OrchestrationTextModel } from "./ports.ts";
import { readModelConnectionConfigurationFromEnvironment } from "../model/ModelConfiguration.ts";
import type { ModelGatewayRegistration } from "../model/ModelRouter.ts";
import ModelRouter from "../model/ModelRouter.ts";
import ToolPolicy, { denyToolApproval } from "../tools/security/ToolPolicy.ts";
import ToolAccessResolver from "../tools/ToolAccessResolver.ts";
import { describeToolSecurity } from "../tools/ToolManifest.ts";
import type { AgentDefinition } from "../runtime/types.ts";
import ToolResolver from "../tools/ToolResolver.ts";
import type WorkspaceToolContext from "../tools/WorkspaceToolContext.ts";
import AgentExecutor from "../runtime/AgentExecutor.ts";
import AgentGenerator from "../runtime/AgentGenerator.ts";
import AgentRegistry from "../runtime/AgentRegistry.ts";
import AgentRuntime from "../runtime/AgentRuntime.ts";
import { builtInAgents } from "../runtime/builtInAgents.ts";
import { DEFAULT_RUN_LIMITS, type RunLimits } from "../runtime/RunLimits.ts";
import AgentMatcher from "./AgentMatcher.ts";
import AgentOrchestrator from "./AgentOrchestrator.ts";
import AgentTaskRunner from "./AgentTaskRunner.ts";
import AnswerSynthesizer from "./AnswerSynthesizer.ts";
import ExecutionRouter from "./ExecutionRouter.ts";
import PlanValidator from "./PlanValidator.ts";
import RequirementResolver from "./RequirementResolver.ts";
import ResultReviewer from "./ResultReviewer.ts";
import TaskPlanner from "./TaskPlanner.ts";
import TaskScheduler from "./TaskScheduler.ts";

export type AgentOrchestratorFactoryOptions = {
  readonly limits?: RunLimits;
  readonly model?: ModelGateway & OrchestrationTextModel;
  readonly modelGateways?: readonly ModelGatewayRegistration[];
  readonly skillContextProvider?: SkillContextProvider;
  readonly skillDefinitions?: readonly SkillDefinition[];
  readonly skillDefinitionsProvider?: () => readonly SkillDefinition[];
  readonly skillInstaller?: SkillInstaller;
  readonly workspaceContext?: WorkspaceToolContext;
  readonly toolResolver?: ToolResolver;
  readonly agents?: readonly AgentDefinition[];
  readonly skillContexts?: readonly string[];
  readonly policy?: ToolPolicy;
  readonly grantsEffects?: ConstructorParameters<typeof ToolAccessResolver>[1];
  readonly systemPrompt?: string;
  readonly rejectDelegation?: (subagentType: string) => string | null;
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
  const limits = usesLegacyLimits ? options : (options.limits ?? DEFAULT_RUN_LIMITS);
  const skillContextProvider = usesLegacyLimits ? undefined : options.skillContextProvider;
  const skillDefinitions = usesLegacyLimits ? [] : (options.skillDefinitions ?? []);
  const skillDefinitionsProvider = usesLegacyLimits
    ? () => skillDefinitions
    : (options.skillDefinitionsProvider ?? (() => skillDefinitions));
  const skillInstaller = usesLegacyLimits ? undefined : options.skillInstaller;
  const workspaceContext = usesLegacyLimits ? undefined : options.workspaceContext;
  const model = usesLegacyLimits ? createDefaultModel() : (options.model ?? createDefaultModel());
  const modelRouter = new ModelRouter(model, usesLegacyLimits ? [] : options.modelGateways);
  const toolResolver =
    (!usesLegacyLimits && options.toolResolver) ||
    new ToolResolver({
      skillInstaller,
      workspaceContext,
    });
  const registry = new AgentRegistry(
    usesLegacyLimits ? builtInAgents : (options.agents ?? builtInAgents),
  );
  const syncSkillAgents = () => {
    const result = registry.replaceWhere(
      isSkillAgent,
      compileSkillAgents(skillDefinitionsProvider(), {
        knownToolNames: toolResolver.listNames(),
        describeTool: (id) => toolResolver.registry.getManifest(id),
        defaultContexts: usesLegacyLimits ? undefined : options.skillContexts,
      }),
    );
    registry.validateAgainstTools(toolResolver.registry);
    return result;
  };
  syncSkillAgents();
  skillInstaller?.onAfterInstall?.(() => {
    syncSkillAgents();
  });

  const policy =
    (!usesLegacyLimits && options.policy) ||
    new ToolPolicy((id) =>
      toolResolver.has(id) ? toolResolver.registry.getManifest(id) : describeToolSecurity(id),
    );
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
    systemPrompt: usesLegacyLimits ? undefined : options.systemPrompt,
    rejectDelegation: usesLegacyLimits ? undefined : options.rejectDelegation,
  });
  const scheduler = new TaskScheduler(
    new AgentTaskRunner(taskRuntime),
    new ResultReviewer(model),
    new AnswerSynthesizer(model),
  );
  const toolAccess = new ToolAccessResolver(
    toolResolver.registry,
    usesLegacyLimits ? undefined : options.grantsEffects,
  );
  const matcher = new AgentMatcher(registry, toolAccess);
  const validator = new PlanValidator(registry, toolResolver.registry);
  const requirements = new RequirementResolver();
  const router = new ExecutionRouter(matcher, toolAccess);

  return new AgentOrchestrator(
    directRunner,
    new TaskPlanner(model, matcher, validator),
    scheduler,
    requirements,
    router,
    limits,
  );
}
