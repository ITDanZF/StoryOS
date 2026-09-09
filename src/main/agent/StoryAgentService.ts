import type {
    ConversationApplicationEventHandler,
} from "./application/conversationContracts.ts";
import ProjectApplication from "./application/ProjectApplication.ts";
import Configuration, { type InfoType } from "./config/index.ts";
import DesktopController from "./electron/DesktopController.ts";
import ApplicationDatabase from "./storage/global/ApplicationDatabase.ts";
import SqliteProjectStore from "./storage/global/SqliteProjectStore.ts";
import SqliteBookStore from "./storage/global/SqliteBookStore.ts";
import ProjectNavigationReader from "./application/ProjectNavigationReader.ts";
import { prepareLegacyGlobalStorageReset } from "./storage/LegacyStorageReset.ts";
import {
  createModelConnectionConfiguration,
  type ModelConnectionConfiguration,
} from "./model/ModelConfiguration.ts";
import WorkSpace from "./workspace/index.ts";
import WorkspaceRuntimeManager from "./runtime/WorkspaceRuntimeManager.ts";
import BookRuntimeManager from "./runtime/BookRuntimeManager.ts";
import BookProvisioningService from "./application/BookProvisioningService.ts";
import BookshelfApplication from "./application/BookshelfApplication.ts";
import ProjectBookBindingService from "./application/ProjectBookBindingService.ts";
import BookRegistryReconciler from "./application/BookRegistryReconciler.ts";
import BookLifecycleService from "./application/BookLifecycleService.ts";
import BookTransferService from "./application/BookTransferService.ts";
import ProjectArchiveService from "./application/ProjectArchiveService.ts";
import SqliteProjectArchiveStore from "./storage/global/SqliteProjectArchiveStore.ts";
import type { RendererEditorToolClient } from "./tools/editor/contracts.ts";
import BookReaderApplication from "./application/BookReaderApplication.ts";
import SqliteBookReadingStateStore from "./storage/global/SqliteBookReadingStateStore.ts";

export type AgentConfigurationRequest = {
    readonly provider: "deepseek" | "openai" | "qwen";
    readonly modelName: string;
    readonly baseUrl: string;
    readonly apiKey: string;
    readonly workspacePath?: string;
};

export type AgentServiceStatus = {
    /** Only workspace path changes require a restart; model changes apply to new tasks immediately. */
    readonly restartRequired?: boolean;
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
    private activeConfiguration: InfoType | null = null;
    private developerPaused = false;
    private businessRequests = 0;
    private bookReader: BookReaderApplication | null = null;

    requireBookReader(): BookReaderApplication {
        if (!this.bookReader) throw new Error("阅读服务尚未初始化，请重新打开应用。");
        return this.bookReader;
    }

    closeBookReaders(owner: number): void { this.bookReader?.closeOwner(owner); }

    async runBusinessRequest<T>(run: () => T | Promise<T>): Promise<T> {
        if (this.developerPaused) throw new Error("数据库编辑会话期间，业务访问已暂停。");
        this.businessRequests += 1;
        try { return await run(); } finally { this.businessRequests -= 1; }
    }

    async pauseForDeveloper(): Promise<void> {
        if (this.developerPaused && !this.controller && !this.applicationDatabase) return;
        if (this.businessRequests || this.runtimeInitialization || this.shutdownPromise || this.controller?.hasActiveRun()) {
            throw new Error("仍有任务或数据操作进行中，请等待完成后再开启编辑会话。");
        }
        this.developerPaused = true;
        this.bookReader?.dispose();
        this.bookReader = null;
        const controller = this.controller;
        for (const unsubscribe of this.controllerUnsubscribers.values()) unsubscribe();
        this.controllerUnsubscribers.clear();
        try {
            await controller?.closeForDeveloper();
            this.controller = null;
            this.applicationDatabase?.close();
            this.applicationDatabase = null;
        } catch (error) {
            // Keep the gate closed if resource shutdown failed; never allow concurrent writes.
            throw new Error(`无法关闭业务数据库：${String(error)}`);
        }
    }

    async resumeFromDeveloper(): Promise<void> {
        if (!this.developerPaused) return;
        if (this.activeConfiguration) await this.initializeRuntime(createModelConnectionConfiguration(this.activeConfiguration));
        this.developerPaused = false;
    }

    constructor(private readonly options: StoryAgentServiceOptions) {
        process.env.MINI_AGENT_HOME = options.agentHome;
        process.env.MINI_AGENT_BUNDLED_SKILLS = options.bundledSkillRoot;
    }

    async initialize(): Promise<AgentServiceStatus> {
        await this.workspace.createHomeRoot();
        const config = this.configuration.loadConfig(!this.controller);
        this.configured = config !== null;
        if (config && !this.controller) {
            await this.initializeRuntime(createModelConnectionConfiguration(config));
            this.activeConfiguration = config;
        }
        return this.getStatus();
    }

    async configure(request: AgentConfigurationRequest): Promise<AgentServiceStatus> {
        if (this.shutdownPromise || this.runtimeInitialization) {
            throw new Error("模型服务正在启动或关闭，请稍后重试。");
        }

        if (!request || !["deepseek", "openai", "qwen"].includes(request.provider)) {
            throw new Error("请选择支持的模型服务商。");
        }
        const modelName = this.requireValue(request.modelName, "模型名称");
        const baseUrl = this.requireValue(request.baseUrl, "接口地址");
        const previous = this.configuration.loadConfig(false);
        const canReuseKey = previous?.MODEL_PROVIDER === request.provider
            && previous?.MODEL_BASE_URL === baseUrl;
        const apiKey = this.requireValue(
            (typeof request.apiKey === "string" ? request.apiKey.trim() : "")
                || (canReuseKey ? previous?.MODEL_API_KEY : "") || "",
            "API Key",
        );
        if (request.workspacePath !== undefined && typeof request.workspacePath !== "string") {
            throw new Error("工作区路径必须为文本。");
        }
        const workspacePath = request.workspacePath?.trim() ?? previous?.AGENT_WORKSPACE ?? "";
        let parsedBaseUrl: URL;
        try {
            parsedBaseUrl = new URL(baseUrl);
        } catch {
            throw new Error("请输入有效的完整接口地址。");
        }
        if (parsedBaseUrl.protocol !== "https:" && parsedBaseUrl.protocol !== "http:") {
            throw new Error("接口地址必须使用 HTTP 或 HTTPS。");
        }

        const config = {
            ...previous,
            MODEL_PROVIDER: request.provider,
            MODEL_NAME: modelName,
            MODEL_BASE_URL: baseUrl,
            MODEL_API_KEY: apiKey,
            AGENT_WORKSPACE: workspacePath,
            LOG_LEVEL: previous?.LOG_LEVEL ?? "info",
        } as const;
        const modelConfiguration = createModelConnectionConfiguration(config);
        const applyModelConfiguration = this.controller?.prepareModelConfiguration(modelConfiguration);
        this.configuration.saveConfig(config, !this.controller);
        this.configured = true;
        if (!this.controller) {
            await this.initializeRuntime(modelConfiguration);
            this.activeConfiguration = config;
        } else {
            applyModelConfiguration();
            this.activeConfiguration = { ...config, AGENT_WORKSPACE: this.activeConfiguration?.AGENT_WORKSPACE ?? "" };
            Object.assign(process.env, {
                MODEL_PROVIDER: config.MODEL_PROVIDER,
                MODEL_NAME: config.MODEL_NAME,
                MODEL_BASE_URL: config.MODEL_BASE_URL,
                MODEL_API_KEY: config.MODEL_API_KEY,
            });
        }
        return this.getStatus();
    }

    getStatus(): AgentServiceStatus {
        const config = this.configuration.loadConfig(false);
        return Object.freeze({
            restartRequired: Boolean(this.controller && this.activeConfiguration && config
                && (config.AGENT_WORKSPACE ?? "") !== (this.activeConfiguration.AGENT_WORKSPACE ?? "")),
            configured: this.configured,
            initialized: this.controller !== null,
            ...(config?.MODEL_PROVIDER ? { provider: config.MODEL_PROVIDER } : {}),
            ...(config?.MODEL_NAME ? { modelName: config.MODEL_NAME } : {}),
            ...(config?.MODEL_BASE_URL ? { baseUrl: config.MODEL_BASE_URL } : {}),
            ...(config?.AGENT_WORKSPACE ? { workspacePath: config.AGENT_WORKSPACE } : {}),
        });
    }

    requireController(): DesktopController {
        if (this.developerPaused) throw new Error("数据库编辑会话期间，业务访问已暂停。");
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
        this.bookReader?.dispose();
        this.bookReader = null;
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
        const legacyReset = prepareLegacyGlobalStorageReset(
            this.options.agentHome,
        );
        const applicationDatabase = new ApplicationDatabase(this.options.agentHome);
        try {
            legacyReset.complete();
            const projects = new ProjectApplication(
                new SqliteProjectStore(applicationDatabase.handle),
            );
            const books = new SqliteBookStore(applicationDatabase.handle);
            const bookRuntimes = new BookRuntimeManager(
                this.options.agentHome,
                books,
            );
            const bookProvisioning = new BookProvisioningService(
                this.options.agentHome,
                books,
                bookRuntimes,
            );
            const bookReconciler = new BookRegistryReconciler(
                books,
                bookRuntimes,
            );
            bookReconciler.reconcile();
            const projectArchives = new ProjectArchiveService(
                this.options.agentHome,
                projects,
                books,
                new SqliteProjectArchiveStore(applicationDatabase.handle),
                bookRuntimes,
            );
            projectArchives.reconcile();
            const runtime = await WorkspaceRuntimeManager.create(
                projects,
                books,
                bookRuntimes,
                bookProvisioning,
                modelConfiguration,
                this.options.rendererEditorTools,
            );
            const bookBindings = new ProjectBookBindingService(
                projects,
                books,
                bookRuntimes,
                runtime,
            );
            const bookLifecycle = new BookLifecycleService(
                this.options.agentHome,
                books,
                bookRuntimes,
            );
            const bookTransfer = new BookTransferService(
                this.options.agentHome,
                books,
                bookRuntimes,
            );
            const bookshelf = new BookshelfApplication(
                books,
                bookRuntimes,
                bookBindings,
                bookReconciler,
                bookLifecycle,
                bookTransfer,
                projectArchives,
                bookProvisioning,
            );
            const controller = new DesktopController({
                projects,
                runtime,
                projectNavigation: new ProjectNavigationReader(
                    projects,
                    books,
                    bookRuntimes,
                ),
                bookshelf,
            });
            for (const subscriber of this.subscribers) {
                this.controllerUnsubscribers.set(
                    subscriber,
                    controller.subscribe(subscriber),
                );
            }
            this.applicationDatabase = applicationDatabase;
            this.bookReader = new BookReaderApplication(bookRuntimes, new SqliteBookReadingStateStore(applicationDatabase.handle));
            this.controller = controller;
        } catch (error) {
            applicationDatabase.close();
            throw error;
        }
    }

    private requireValue(value: string, label: string): string {
        const normalized = typeof value === "string" ? value.trim() : "";
        if (!normalized) throw new Error(`请填写${label}。`);
        return normalized;
    }
}
