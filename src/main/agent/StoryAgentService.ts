import type { ApplicationEventHandler } from "./application/contracts.ts";
import ProjectApplication from "./application/ProjectApplication.ts";
import Configuration from "./config/index.ts";
import DesktopController from "./electron/DesktopController.ts";
import ProjectJsonStore from "./Memory/ProjectJsonStore.ts";
import {
  createModelConnectionConfiguration,
  type ModelConnectionConfiguration,
} from "./model/ModelConfiguration.ts";
import WorkSpace from "./workspace/index.ts";
import LegacyWorkspaceMigrator from "./runtime/LegacyWorkspaceMigrator.ts";
import WorkspaceRuntimeManager from "./runtime/WorkspaceRuntimeManager.ts";

export type AgentConfigurationRequest = {
    readonly provider: "deepseek" | "openai" | "qwen";
    readonly modelName: string;
    readonly baseUrl: string;
    readonly apiKey: string;
    readonly workspacePath?: string;
};

export type AgentServiceStatus = {
    readonly configured: boolean;
    readonly initialized: boolean;
    readonly provider?: string;
    readonly modelName?: string;
    readonly baseUrl?: string;
    readonly workspacePath?: string;
};

export type StoryAgentServiceOptions = {
    readonly agentHome: string;
    readonly bundledSkillRoot: string;
};

export default class StoryAgentService {
    private readonly configuration = new Configuration();
    private readonly workspace = new WorkSpace();
    private readonly subscribers = new Set<ApplicationEventHandler>();
    private readonly controllerUnsubscribers = new Map<ApplicationEventHandler, () => void>();
    private controller: DesktopController | null = null;
    private configured = false;

    constructor(private readonly options: StoryAgentServiceOptions) {
        process.env.MINI_AGENT_HOME = options.agentHome;
        process.env.MINI_AGENT_BUNDLED_SKILLS = options.bundledSkillRoot;
    }

    async initialize(): Promise<AgentServiceStatus> {
        await this.workspace.createHomeRoot();
        const config = this.configuration.loadConfig();
        this.configured = config !== null;
        if (config && !this.controller) {
            await this.initializeRuntime(createModelConnectionConfiguration(config));
        }
        return this.getStatus();
    }

    async configure(request: AgentConfigurationRequest): Promise<AgentServiceStatus> {
        if (this.controller) {
            throw new Error("Agent is already initialized. Restart StoryOS to change its configuration.");
        }

        if (!["deepseek", "openai", "qwen"].includes(request.provider)) {
            throw new Error("Unsupported model provider.");
        }
        const modelName = this.requireValue(request.modelName, "Model name");
        const baseUrl = this.requireValue(request.baseUrl, "Base URL");
        const apiKey = this.requireValue(request.apiKey, "API key");
        const workspacePath = request.workspacePath?.trim() ?? "";
        let parsedBaseUrl: URL;
        try {
            parsedBaseUrl = new URL(baseUrl);
        } catch {
            throw new Error("Base URL must be a valid absolute URL.");
        }
        if (parsedBaseUrl.protocol !== "https:" && parsedBaseUrl.protocol !== "http:") {
            throw new Error("Base URL must use HTTP or HTTPS.");
        }

        const config = {
            MODEL_PROVIDER: request.provider,
            MODEL_NAME: modelName,
            MODEL_BASE_URL: baseUrl,
            MODEL_API_KEY: apiKey,
            AGENT_WORKSPACE: workspacePath,
            LOG_LEVEL: "info",
        } as const;
        this.configuration.saveConfig(config);
        this.configured = true;
        await this.initializeRuntime(createModelConnectionConfiguration(config));
        return this.getStatus();
    }

    getStatus(): AgentServiceStatus {
        const config = this.configuration.loadConfig();
        return Object.freeze({
            configured: this.configured,
            initialized: this.controller !== null,
            ...(config?.MODEL_PROVIDER ? { provider: config.MODEL_PROVIDER } : {}),
            ...(config?.MODEL_NAME ? { modelName: config.MODEL_NAME } : {}),
            ...(config?.MODEL_BASE_URL ? { baseUrl: config.MODEL_BASE_URL } : {}),
            ...(config?.AGENT_WORKSPACE ? { workspacePath: config.AGENT_WORKSPACE } : {}),
        });
    }

    requireController(): DesktopController {
        if (!this.controller) throw new Error("Agent is not configured.");
        return this.controller;
    }

    subscribe(handler: ApplicationEventHandler): () => void {
        this.subscribers.add(handler);
        if (this.controller) {
            this.controllerUnsubscribers.set(handler, this.controller.subscribe(handler));
        }
        return () => {
            this.subscribers.delete(handler);
            this.controllerUnsubscribers.get(handler)?.();
            this.controllerUnsubscribers.delete(handler);
        };
    }

    private async initializeRuntime(
        modelConfiguration: ModelConnectionConfiguration,
    ): Promise<void> {
        await this.workspace.createAgentWorkSpace();
        const projects = new ProjectApplication(new ProjectJsonStore());
        new LegacyWorkspaceMigrator(projects).migrate();
        const runtime = await WorkspaceRuntimeManager.create(projects, modelConfiguration);
        const controller = new DesktopController({ projects, runtime });
        for (const subscriber of this.subscribers) {
            this.controllerUnsubscribers.set(subscriber, controller.subscribe(subscriber));
        }
        this.controller = controller;
    }

    private requireValue(value: string, label: string): string {
        const normalized = value.trim();
        if (!normalized) throw new Error(`${label} is required.`);
        return normalized;
    }
}
