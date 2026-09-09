import { requireText } from "./validation.ts";
import { AGENT_IPC_CHANNELS } from "../../../shared/agent/contracts.ts";
import type DesktopController from "../DesktopController.ts";
import IpcRegistrar from "./IpcRegistrar.ts";
export default class SkillIpcController {
  constructor(
    registrar: IpcRegistrar,
    getController: () => Pick<
      DesktopController,
      "getSkillSnapshot" | "getSkill" | "useSkill" | "disableSkill" | "clearSkillState"
    >,
  ) {
    const handle = registrar.handle.bind(registrar) as IpcRegistrar["handle"];
    handle(AGENT_IPC_CHANNELS.skillSnapshot, () => getController().getSkillSnapshot());
    handle(AGENT_IPC_CHANNELS.getSkill, (skillId: string) =>
      getController().getSkill(requireText(skillId, "Skill id")),
    );
    handle(AGENT_IPC_CHANNELS.useSkill, (skillId: string, threadId?: string) =>
      getController().useSkill(
        requireText(skillId, "Skill id"),
        threadId === undefined ? undefined : requireText(threadId, "Thread id"),
      ),
    );
    handle(AGENT_IPC_CHANNELS.disableSkill, (skillId: string, threadId?: string) =>
      getController().disableSkill(
        requireText(skillId, "Skill id"),
        threadId === undefined ? undefined : requireText(threadId, "Thread id"),
      ),
    );
    handle(AGENT_IPC_CHANNELS.clearSkillState, (threadId?: string) =>
      getController().clearSkillState(
        threadId === undefined ? undefined : requireText(threadId, "Thread id"),
      ),
    );
  }
}
