import { contextBridge, ipcRenderer } from "electron";
import { INSTANCE_IPC_CHANNELS } from "../shared/contracts/instances/channels.ts";
import type {
  CreateInstanceRequest,
  InstanceDesktopApi,
} from "../shared/contracts/instances/contracts.ts";
import type { AgentConfigurationInput } from "../shared/contracts/settings/contracts.ts";

const instanceApi: InstanceDesktopApi = {
  getSnapshot: () => ipcRenderer.invoke(INSTANCE_IPC_CHANNELS.snapshot),
  create: (request: CreateInstanceRequest) =>
    ipcRenderer.invoke(INSTANCE_IPC_CHANNELS.create, request),
  getConfiguration: (instanceId) =>
    ipcRenderer.invoke(INSTANCE_IPC_CHANNELS.configuration, instanceId),
  updateConfiguration: (instanceId, configuration: AgentConfigurationInput) =>
    ipcRenderer.invoke(
      INSTANCE_IPC_CHANNELS.updateConfiguration,
      instanceId,
      configuration,
    ),
  open: (instanceId) =>
    ipcRenderer.invoke(INSTANCE_IPC_CHANNELS.open, instanceId),
  rename: (instanceId, name) =>
    ipcRenderer.invoke(INSTANCE_IPC_CHANNELS.rename, instanceId, name),
  relocate: (instanceId, rootPath) =>
    ipcRenderer.invoke(INSTANCE_IPC_CHANNELS.relocate, instanceId, rootPath),
  remove: (instanceId) =>
    ipcRenderer.invoke(INSTANCE_IPC_CHANNELS.remove, instanceId),
  reveal: (instanceId) =>
    ipcRenderer.invoke(INSTANCE_IPC_CHANNELS.reveal, instanceId),
  returnToPanel: () => ipcRenderer.invoke(INSTANCE_IPC_CHANNELS.returnToPanel),
};

contextBridge.exposeInMainWorld("storyOSInstances", instanceApi);
