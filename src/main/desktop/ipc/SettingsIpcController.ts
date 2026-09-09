import { AGENT_IPC_CHANNELS } from "../../../shared/agent/contracts.ts";
import type { AgentConfigurationRequest } from "../../bootstrap/StoryAgentService.ts";
import StoryAgentService from "../../bootstrap/StoryAgentService.ts";
import IpcRegistrar from "./IpcRegistrar.ts";
export default class SettingsIpcController {
  constructor(registrar: IpcRegistrar, service: Pick<StoryAgentService, "getStatus" | "configure">) {
    const handle = registrar.handle.bind(registrar) as IpcRegistrar["handle"];
    handle(AGENT_IPC_CHANNELS.status, () => service.getStatus());
    handle(AGENT_IPC_CHANNELS.configure, (request: AgentConfigurationRequest) =>
      service.configure(request),
    );
  }
}
