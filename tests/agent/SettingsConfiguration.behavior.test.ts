import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import StoryAgentService, {
  type AgentConfigurationRequest,
} from "../../src/main/bootstrap/StoryAgentService.ts";
import Configuration, {
  type InfoType,
} from "../../src/main/story/config/index.ts";
import type DesktopController from "../../src/main/desktop/DesktopController.ts";
import type { ModelConnectionConfiguration } from "../../src/main/agent/model/ModelConfiguration.ts";
import { getCustomizeWorkSpace } from "../../src/main/story/workspace/path.ts";
import LiveModelConnection from "../../src/main/agent/model/LiveModelConnection.ts";

type ServiceInternals = {
  controller: DesktopController | null;
  initializeRuntime: (
    configuration: ModelConnectionConfiguration,
  ) => Promise<void>;
  runtimeInitialization: Promise<void> | null;
};
const original: InfoType = {
  schemaVersion: 2,
  chat: {
    provider: "deepseek",
    modelName: "deepseek-chat",
    baseUrl: "https://api.deepseek.com",
    apiKey: "original-test-key",
  },
  embedding: { enabled: false },
  workspace: { defaultProjectsRoot: "" },
  logLevel: "debug",
};
const request: AgentConfigurationRequest = {
  provider: "deepseek",
  modelName: "deepseek-chat",
  baseUrl: "https://api.deepseek.com",
  apiKey: "",
  workspacePath: "",
  embedding: { enabled: false },
};
let directory: string;
let environment: NodeJS.ProcessEnv;

function createService() {
  const service = new StoryAgentService({
    agentHome: directory,
    bundledSkillRoot: path.join(directory, "skills"),
  });
  const internals = service as unknown as ServiceInternals;
  let connection: LiveModelConnection;
  const prepare = vi.fn((configuration: ModelConnectionConfiguration) =>
    connection.prepareUpdate(configuration),
  );
  const controller = {
    shutdown: vi.fn(async () => undefined),
    prepareModelConfiguration: prepare,
  } as unknown as DesktopController;
  const initialize = vi
    .spyOn(internals, "initializeRuntime")
    .mockImplementation(async (configuration) => {
      connection = new LiveModelConnection(configuration);
      internals.controller = controller;
    });
  return {
    service,
    internals,
    controller,
    initialize,
    prepare,
    getClient: () => connection.getClient(),
  };
}

beforeEach(() => {
  environment = { ...process.env };
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "storyos-settings-"));
  fs.writeFileSync(
    path.join(directory, "config.json"),
    JSON.stringify(original),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  for (const key of Object.keys(process.env))
    if (!(key in environment)) delete process.env[key];
  Object.assign(process.env, environment);
  fs.rmSync(directory, { recursive: true, force: true });
});

describe("settings configuration lifecycle", () => {
  it("applies model edits without replacing the controller or the active workspace path", async () => {
    const { service, controller, initialize, getClient } = createService();
    await service.initialize();
    const status = await service.configure({
      ...request,
      modelName: "changed-model",
      workspacePath: path.join(directory, "new-workspace"),
    });
    expect(status).toMatchObject({
      initialized: true,
      restartRequired: true,
      modelName: "changed-model",
    });
    expect(service.requireController()).toBe(controller);
    expect(initialize).toHaveBeenCalledOnce();
    expect(process.env.MODEL_NAME === environment.MODEL_NAME).toBe(true);
    expect(getClient()).toMatchObject({ model: "changed-model" });
    expect(
      await service.runBusinessRequest(() => getCustomizeWorkSpace()),
    ).toBeNull();
    service.getStatus();
    expect(process.env.MODEL_NAME === environment.MODEL_NAME).toBe(true);
    expect(JSON.stringify(status)).not.toContain("original-test-key");
    expect(new Configuration(directory).loadConfig()).toMatchObject({
      chat: {
        modelName: "changed-model",
        apiKey: original.chat.apiKey,
      },
      logLevel: "debug",
    });
  });

  it("clears pending status when all settings are restored and applies saved settings on the next startup", async () => {
    const { service } = createService();
    await service.initialize();
    expect(
      (await service.configure({ ...request, modelName: "next-model" }))
        .restartRequired,
    ).toBe(false);
    expect((await service.configure(request)).restartRequired).toBe(false);
    await service.configure({
      ...request,
      modelName: "next-model",
      apiKey: "replacement-test-key",
    });
    await service.shutdown();
    const restarted = createService();
    expect(await restarted.service.initialize()).toMatchObject({
      restartRequired: false,
      modelName: "next-model",
    });
    expect(restarted.initialize).toHaveBeenCalledWith({
      modelName: "next-model",
      apiKey: "replacement-test-key",
      baseUrl: request.baseUrl,
    });
  });

  it("requires a new key after changing provider or address and preserves the old file on validation errors", async () => {
    const { service } = createService();
    await service.initialize();
    await expect(
      service.configure({ ...request, provider: "openai" }),
    ).rejects.toThrow("API Key");
    await expect(
      service.configure({ ...request, baseUrl: "https://other.example/v1" }),
    ).rejects.toThrow("API Key");
    await expect(
      service.configure({
        ...request,
        apiKey: "new-key",
        baseUrl: "file:///tmp/model",
      }),
    ).rejects.toThrow("HTTP");
    await expect(
      service.configure({ ...request, modelName: "  " }),
    ).rejects.toThrow("模型名称");
    expect(new Configuration(directory).loadConfig()).toEqual(original);
  });

  it("tracks key-only changes without exposing credentials in status", async () => {
    const { service } = createService();
    await service.initialize();
    const status = await service.configure({
      ...request,
      apiKey: "new-test-key",
    });
    expect(status.restartRequired).toBe(false);
    expect(JSON.stringify(status)).not.toContain("new-test-key");
    expect(process.env.MODEL_API_KEY === environment.MODEL_API_KEY).toBe(true);
  });

  it("keeps the existing file intact if atomic replacement fails", async () => {
    const { service, getClient } = createService();
    await service.initialize();
    const previousClient = getClient();
    vi.spyOn(fs, "renameSync").mockImplementation(() => {
      throw new Error("write denied");
    });
    await expect(
      service.configure({ ...request, modelName: "next" }),
    ).rejects.toThrow("write denied");
    expect(new Configuration(directory).loadConfig()).toEqual(original);
    expect(
      fs.readdirSync(directory).filter((name) => name.endsWith(".tmp")),
    ).toEqual([]);
    expect(service.getStatus().restartRequired).toBe(false);
    expect(getClient()).toBe(previousClient);
    expect(process.env.MODEL_NAME === environment.MODEL_NAME).toBe(true);
  });

  it("does not persist settings if client preparation fails", async () => {
    const { service, prepare, getClient } = createService();
    await service.initialize();
    const previousClient = getClient();
    prepare.mockImplementationOnce(() => {
      throw new Error("invalid client");
    });
    await expect(
      service.configure({ ...request, modelName: "next" }),
    ).rejects.toThrow("invalid client");
    expect(new Configuration(directory).loadConfig()).toEqual(original);
    expect(getClient()).toBe(previousClient);
  });

  it("initializes the first configuration and rejects concurrent configuration during startup", async () => {
    fs.writeFileSync(path.join(directory, "config.json"), "{}");
    const { service, internals, initialize } = createService();
    expect((await service.initialize()).initialized).toBe(false);
    let resolveStartup: () => void;
    internals.runtimeInitialization = new Promise<void>((resolve) => {
      resolveStartup = resolve;
    });
    await expect(
      service.configure({ ...request, apiKey: "first-test-key" }),
    ).rejects.toThrow("稍后重试");
    resolveStartup();
    internals.runtimeInitialization = null;
    expect(
      await service.configure({ ...request, apiKey: "first-test-key" }),
    ).toMatchObject({
      initialized: true,
      configured: true,
      restartRequired: false,
    });
    expect(initialize).toHaveBeenCalledOnce();
  });
});
