import { ipcMain, shell } from "electron";
import { INSTANCE_IPC_CHANNELS } from "../../../shared/contracts/instances/channels.ts";
import type { CreateInstanceRequest } from "../../../shared/contracts/instances/contracts.ts";
import type { AgentConfigurationInput } from "../../../shared/contracts/settings/contracts.ts";
import type InstanceHost from "../../bootstrap/InstanceHost.ts";

export function registerInstanceIpc(
  host: InstanceHost,
  trusted: (id: number) => boolean,
): () => void {
  const handlers = {
    snapshot: () => host.getSnapshot(),
    create: (request: CreateInstanceRequest) => host.create(request),
    configuration: (instanceId: string) => host.getConfiguration(instanceId),
    updateConfiguration: (
      instanceId: string,
      configuration: AgentConfigurationInput,
    ) => host.updateConfiguration(instanceId, configuration),
    open: (instanceId: string) => host.open(instanceId),
    rename: (instanceId: string, name: string) => host.rename(instanceId, name),
    relocate: (instanceId: string, rootPath: string) =>
      host.relocate(instanceId, rootPath),
    remove: (instanceId: string) => host.remove(instanceId),
    reveal: (instanceId: string) =>
      shell.showItemInFolder(host.registry.get(instanceId).rootPath),
    returnToPanel: () => host.returnToPanel(),
  };
  for (const method of Object.keys(handlers) as (keyof typeof handlers)[]) {
    ipcMain.handle(INSTANCE_IPC_CHANNELS[method], (event, ...args: never[]) => {
      if (
        event.senderFrame !== event.sender.mainFrame ||
        !trusted(event.sender.id)
      ) {
        throw new Error("Untrusted application frame.");
      }
      return (handlers[method] as (...values: never[]) => unknown)(...args);
    });
  }
  return () => {
    for (const channel of Object.values(INSTANCE_IPC_CHANNELS))
      ipcMain.removeHandler(channel);
  };
}
