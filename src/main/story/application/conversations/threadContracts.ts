import type { MessageRole, ThreadSkillState } from "./threadPorts.ts";
export type {
  MessageDto,
  ThreadDto,
  ThreadSnapshot,
} from "../../../../shared/contracts/conversations/threadContracts.ts";

export type CreateThreadRequest = {
  readonly title: string;
  readonly id?: string;
};
export type AppendMessageRequest = {
  readonly role: MessageRole;
  readonly content: string;
  readonly threadId?: string;
};
export type ThreadSkillStateDto = ThreadSkillState;
