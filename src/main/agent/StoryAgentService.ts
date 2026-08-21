import type {
    ConversationApplicationEventHandler,
} from "./application/conversationContracts.ts";
import ProjectApplication from "./application/ProjectApplication.ts";
import Configuration from "./config/index.ts";
import DesktopController from "./electron/DesktopController.ts";
import ApplicationDatabase from "./storage/global/ApplicationDatabase.ts";
import SqliteProjectStore from "./storage/global/SqliteProjectStore.ts";
import {
  createModelConnectionConfiguration,
  type ModelConnectionConfiguration,
} from "./model/ModelConfiguration.ts";
import WorkSpace from "./workspace/index.ts";
import WorkspaceRuntimeManager from "./runtime/WorkspaceRuntimeManager.ts";
import type { RendererEditorToolClient } from "./tools/editor/contracts.ts";

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
    readonly rendererEditorTools?: RendererEditorToolClient;
};

export default class StoryAgentService {
    private readonly configuration = new Configuration();
    private readonly workspace = new WorkSpace();
    private readonly subscribers =
        new Set<ConversationApplicationEventHandler>();
    private readonly controllerUnsubscribers =
        new Map<ConversationApplicationEventHandler, () => void>();
    private controller: DesktopController | null = null;
    private applicationDatabase: ApplicationDatabase | null = null;
    private configured = false;
    private runtimeInitialization: Promise<void> | null = null;
    private shutdownPromise: Promise<void> | null = null;

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

    subscribe(handler: ConversationApplicationEventHandler): () => void {
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

    shutdown(): Promise<void> {
        if (this.shutdownPromise) return this.shutdownPromise;
        this.shutdownPromise = this.performShutdown();
        return this.shutdownPromise;
    }

    private async performShutdown(): Promise<void> {
        if (this.runtimeInitialization) {
            await Promise.allSettled([this.runtimeInitialization]);
        }
        const controller = this.controller;
        this.controller = null;
        for (const unsubscribe of this.controllerUnsubscribers.values()) {
            try {
                unsubscribe();
            } catch {
                // One faulty listener must not block runtime shutdown.
            }
        }
        this.controllerUnsubscribers.clear();
        try {
            await controller?.shutdown();
        } finally {
            try {
                this.applicationDatabase?.close();
                this.applicationDatabase = null;
            } finally {
                this.subscribers.clear();
            }
        }
    }

    private initializeRuntime(
        modelConfiguration: ModelConnectionConfiguration,
    ): Promise<void> {
        if (this.shutdownPromise) {
            return Promise.reject(new Error("Agent service is shutting down."));
        }
        if (this.runtimeInitialization) {
            return this.runtimeInitialization;
        }
        const initialization = this.performInitializeRuntime(modelConfiguration);
        const tracked = initialization.finally(() => {
            if (this.runtimeInitialization === tracked) {
                this.runtimeInitialization = null;
            }
        });
        this.runtimeInitialization = tracked;
        return tracked;
    }

    private async performInitializeRuntime(
        modelConfiguration: ModelConnectionConfiguration,
    ): Promise<void> {
        await this.workspace.createAgentWorkSpace();
        const applicationDatabase = new ApplicationDatabase(this.options.agentHome);
        try {
            const projects = new ProjectApplication(
                new SqliteProjectStore(applicationDatabase.handle),
            );
            const runtime = await WorkspaceRuntimeManager.create(
                projects,
                modelConfiguration,
                this.options.rendererEditorTools,
            );
            const controller = new DesktopController({ projects, runtime });
            for (const subscriber of this.subscribers) {
                this.controllerUnsubscribers.set(
                    subscriber,
                    controller.subscribe(subscriber),
                );
            }
            this.applicationDatabase = applicationDatabase;
            this.controller = controller;
        } catch (error) {
            applicationDatabase.close();
            throw error;
        }
    }

    private requireValue(value: string, label: string): string {
        const normalized = value.trim();
        if (!normalized) throw new Error(`${label} is required.`);
        return normalized;
    }
}
