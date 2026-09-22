import type {
  InstanceDesktopApi,
  InstanceSnapshot,
  StoryInstanceDto,
} from "../../../shared/contracts/instances/contracts.ts";

if (!window.storyOSInstances) {
  const primaryInstance: StoryInstanceDto = {
    id: "preview-primary",
    name: "我的工作空间",
    rootPath: "/preview/.mini-agent",
    status: "ready",
    lastOpenedAt: null,
  };
  let activeInstanceId: string | null = primaryInstance.id;
  let lastActiveInstanceId: string | null = primaryInstance.id;
  const instances: StoryInstanceDto[] = [primaryInstance];
  const configurations = new Map<
    string,
    Parameters<InstanceDesktopApi["updateConfiguration"]>[1]
  >([
    [
      primaryInstance.id,
      {
        schemaVersion: 2,
        chat: {
          provider: "openai",
          modelName: "gpt-4.1-mini",
          baseUrl: "https://api.openai.com/v1",
          apiKey: "preview-key",
        },
        embedding: {
          enabled: true,
          modelName: "text-embedding-v4",
          apiKey: "preview-key",
          baseUrl: "https://ws-example.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1",
          dimensions: 1024,
        },
        workspace: { defaultProjectsRoot: "" },
        logLevel: "info",
      },
    ],
  ]);
  const getSnapshot = (): InstanceSnapshot => ({
    activeInstanceId,
    lastActiveInstanceId,
    firstSelectionCompleted: true,
    suggestedRootPath: "/preview/.mini-agent",
    instances: [...instances],
  });
  const api: InstanceDesktopApi = {
    getSnapshot: async () => getSnapshot(),
    create: async (request) => {
      const instance: StoryInstanceDto = {
        id: crypto.randomUUID(),
        name: request.name,
        rootPath: request.rootPath,
        status: "ready",
        lastOpenedAt: new Date().toISOString(),
      };
      instances.push(instance);
      configurations.set(instance.id, request.configuration);
      activeInstanceId = instance.id;
      lastActiveInstanceId = instance.id;
      return { instance, snapshot: getSnapshot() };
    },
    getConfiguration: async (instanceId) => {
      const configuration = configurations.get(instanceId);
      if (!configuration) throw new Error("实例不存在。");
      return {
        ...configuration,
        chat: { ...configuration.chat, apiKeyConfigured: true },
        embedding: {
          enabled: true,
          modelName: configuration.embedding.modelName,
          baseUrl: configuration.embedding.baseUrl,
          dimensions: configuration.embedding.dimensions,
          apiKeyConfigured: true,
        },
      };
    },
    updateConfiguration: async (instanceId, configuration) => {
      if (!configurations.has(instanceId)) throw new Error("实例不存在。");
      configurations.set(instanceId, configuration);
      return getSnapshot();
    },
    open: async (instanceId) => {
      const instance = instances.find((item) => item.id === instanceId);
      if (!instance) throw new Error("实例不存在。");
      activeInstanceId = instanceId;
      lastActiveInstanceId = instanceId;
      return { instance, snapshot: getSnapshot() };
    },
    rename: async (instanceId, name) => {
      const index = instances.findIndex((item) => item.id === instanceId);
      if (index < 0) throw new Error("实例不存在。");
      instances[index] = { ...instances[index], name };
      return getSnapshot();
    },
    relocate: async (instanceId, rootPath) => {
      const index = instances.findIndex((item) => item.id === instanceId);
      if (index < 0 || instanceId === activeInstanceId)
        throw new Error("无法重新定位实例。");
      instances[index] = { ...instances[index], rootPath, status: "ready" };
      return getSnapshot();
    },
    remove: async (instanceId) => {
      const index = instances.findIndex((item) => item.id === instanceId);
      if (index < 0 || instanceId === activeInstanceId)
        throw new Error("无法移除实例。");
      instances.splice(index, 1);
      return getSnapshot();
    },
    reveal: async () => undefined,
    returnToPanel: async () => getSnapshot(),
  };
  Object.defineProperty(window, "storyOSInstances", {
    value: api,
    configurable: true,
  });
}
