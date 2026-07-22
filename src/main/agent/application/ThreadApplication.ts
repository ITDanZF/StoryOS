import type {
  AppendMessageRequest,
  CreateThreadRequest,
  MessageDto,
  ThreadDto,
  ThreadSnapshot,
} from "./threadContracts.ts";
import type {
  MessageRecord,
  ThreadPersistence,
  ThreadMetadata,
  ThreadRecord,
  ThreadSkillState,
} from "./threadPorts.ts";

function normalizeSkillIds(skillIds: readonly string[] | undefined): readonly string[] {
  return Object.freeze(
    [...new Set((skillIds ?? [])
      .map((skillId) => skillId.trim())
      .filter(Boolean))].sort(),
  );
}

function normalizeSkillState(thread: ThreadRecord): ThreadSkillState {
  return Object.freeze({
    activeSkillIds: normalizeSkillIds(thread.metadata?.activeSkillIds),
    disabledSkillIds: normalizeSkillIds(thread.metadata?.disabledSkillIds),
  });
}

function toThreadDto(thread: ThreadRecord): ThreadDto {
  const projectPath = thread.metadata?.projectPath?.trim();
  return Object.freeze({
    id: thread.id,
    title: thread.title,
    createdAt: thread.createdAt.toISOString(),
    updatedAt: thread.updatedAt.toISOString(),
    metadata: Object.freeze({
      ...(projectPath ? { projectPath } : {}),
      activeSkillIds: normalizeSkillState(thread).activeSkillIds,
      disabledSkillIds: normalizeSkillState(thread).disabledSkillIds,
    }),
  });
}

function toMessageDto(message: MessageRecord): MessageDto {
  return Object.freeze({
    id: message.id,
    threadId: message.threadId,
    role: message.role,
    content: message.content,
    createdAt: message.createdAt.toISOString(),
  });
}

export default class ThreadApplication {
  private activeThreadId: string;

  constructor(private readonly store: ThreadPersistence) {
    this.activeThreadId = store.ensureInitialThread().id;
  }

  getActiveThreadId(): string {
    return this.activeThreadId;
  }

  getSnapshot(projectPath?: string | null): ThreadSnapshot {
    const threads = this.listThreadsForProject(projectPath);
    if (!threads.some((thread) => thread.id === this.activeThreadId)) {
      const [firstThread] = threads;
      if (firstThread) {
        this.activeThreadId = firstThread.id;
      } else {
        const thread = this.store.createThread("新对话", undefined, this.threadMetadataForProject(projectPath));
        this.activeThreadId = thread.id;
        threads.unshift(thread);
      }
    }

    const activeThread = this.requireThread(this.activeThreadId);
    return Object.freeze({
      activeThreadId: this.activeThreadId,
      activeThread: toThreadDto(activeThread),
      threads: Object.freeze(threads.map(toThreadDto)),
    });
  }

  createThread(request: CreateThreadRequest): ThreadDto {
    const title = request.title.trim();
    if (!title) {
      throw new Error("Thread title is required.");
    }

    const thread = this.store.createThread(title, request.id, this.threadMetadataForProject(request.projectPath));
    this.activeThreadId = thread.id;
    return toThreadDto(thread);
  }

  switchThread(threadId: string): ThreadSnapshot {
    const normalizedId = threadId.trim();
    this.requireThread(normalizedId);
    this.activeThreadId = normalizedId;
    return this.getSnapshot();
  }

  appendMessage(request: AppendMessageRequest): MessageDto {
    const threadId = request.threadId?.trim() ?? this.activeThreadId;
    this.requireThread(threadId);
    return toMessageDto(
      this.store.appendMessage({
        threadId,
        role: request.role,
        content: request.content,
      }),
    );
  }

  listMessages(threadId = this.activeThreadId): readonly MessageDto[] {
    this.requireThread(threadId);
    return Object.freeze(this.store.listMessages(threadId).map(toMessageDto));
  }

  deleteThread(threadId: string): ThreadSnapshot {
    const normalizedId = threadId.trim();
    this.requireThread(normalizedId);
    this.store.deleteThread(normalizedId);

    if (normalizedId === this.activeThreadId) {
      this.activeThreadId = this.store.ensureInitialThread().id;
    }
    return this.getSnapshot();
  }

  getThreadSkillState(threadId = this.activeThreadId): ThreadSkillState {
    return normalizeSkillState(this.requireThread(threadId));
  }

  useSkill(skillId: string, threadId = this.activeThreadId): ThreadSkillState {
    const normalizedSkillId = this.normalizeSkillId(skillId);
    const thread = this.requireThread(threadId);
    const state = normalizeSkillState(thread);
    const activeSkillIds = normalizeSkillIds([
      ...state.activeSkillIds,
      normalizedSkillId,
    ]);
    const disabledSkillIds = normalizeSkillIds(
      state.disabledSkillIds.filter((item) => item !== normalizedSkillId),
    );

    const updated = this.store.updateThreadMetadata(thread.id, {
      ...thread.metadata,
      activeSkillIds,
      disabledSkillIds,
    });
    return normalizeSkillState(updated);
  }

  disableSkill(skillId: string, threadId = this.activeThreadId): ThreadSkillState {
    const normalizedSkillId = this.normalizeSkillId(skillId);
    const thread = this.requireThread(threadId);
    const state = normalizeSkillState(thread);
    const activeSkillIds = normalizeSkillIds(
      state.activeSkillIds.filter((item) => item !== normalizedSkillId),
    );
    const disabledSkillIds = normalizeSkillIds([
      ...state.disabledSkillIds,
      normalizedSkillId,
    ]);

    const updated = this.store.updateThreadMetadata(thread.id, {
      ...thread.metadata,
      activeSkillIds,
      disabledSkillIds,
    });
    return normalizeSkillState(updated);
  }

  clearSkillState(threadId = this.activeThreadId): ThreadSkillState {
    const thread = this.requireThread(threadId);
    const updated = this.store.updateThreadMetadata(thread.id, {
      ...thread.metadata,
      activeSkillIds: Object.freeze([]),
      disabledSkillIds: Object.freeze([]),
    });
    return normalizeSkillState(updated);
  }

  private requireThread(threadId: string): ThreadRecord {
    if (!threadId) {
      throw new Error("Thread id is required.");
    }

    const thread = this.store.getThread(threadId);
    if (!thread) {
      throw new Error(`Thread not found: ${threadId}`);
    }
    return thread;
  }

  private normalizeSkillId(skillId: string): string {
    const normalizedSkillId = skillId.trim();
    if (!normalizedSkillId) {
      throw new Error("Skill id is required.");
    }
    return normalizedSkillId;
  }

  private listThreadsForProject(projectPath?: string | null): ThreadRecord[] {
    if (projectPath === undefined) return this.store.listThreads();
    const normalizedProjectPath = projectPath?.trim() ?? "";
    return this.store.listThreads().filter((thread) => {
      const threadProjectPath = thread.metadata?.projectPath?.trim() ?? "";
      return normalizedProjectPath
        ? threadProjectPath === normalizedProjectPath
        : !threadProjectPath;
    });
  }

  private threadMetadataForProject(projectPath?: string | null): ThreadMetadata | undefined {
    const normalizedProjectPath = projectPath?.trim() ?? "";
    return normalizedProjectPath ? { projectPath: normalizedProjectPath } : undefined;
  }
}
