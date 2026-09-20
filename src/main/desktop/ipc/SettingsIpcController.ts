import { AGENT_IPC_CHANNELS } from "../../../shared/agent/contracts.ts";
import type {
  AgentConfigurationRequest,
  EmbeddingConfigurationInput,
} from "../../../shared/contracts/settings/contracts.ts";
import StoryAgentService from "../../bootstrap/StoryAgentService.ts";
import IpcRegistrar from "./IpcRegistrar.ts";
export default class SettingsIpcController {
  constructor(
    registrar: IpcRegistrar,
    resolveService: () => Pick<
      StoryAgentService,
      "getStatus" | "configure" | "testEmbedding"
    >,
  ) {
    const handle = registrar.handle.bind(registrar) as IpcRegistrar["handle"];
    handle(AGENT_IPC_CHANNELS.status, () => resolveService().getStatus());
    handle(AGENT_IPC_CHANNELS.configure, (request: AgentConfigurationRequest) =>
      resolveService().configure(request),
    );
    handle(
      AGENT_IPC_CHANNELS.testEmbedding,
      (request: EmbeddingConfigurationInput) =>
        resolveService().testEmbedding(request),
    );
  }
}
