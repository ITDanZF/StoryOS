import path from "node:path";
import {
  mkdirSync,
  existsSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { getAgentHome } from "../workspace/path.ts";
import type {
  MessageRecord,
  MessageRole,
  MessageStore,
  ThreadRecord,
  ThreadStore,
  ThreadMetadata,
} from "../application/threadPorts.ts";

export type ThreadInfo = ThreadRecord;
export type StoredMessageRole = MessageRole;
export type StoredMessage = MessageRecord;

type JsonThread = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  metadata?: ThreadMetadata;
};

type JsonMessage = {
  id: string;
  threadId: string;
  role: StoredMessageRole;
  content: string;
  createdAt: string;
};

type JsonIndexState = {
  threads: JsonThread[];
};

type JsonSessionState = {
  threadId: string;
  messages: JsonMessage[];
};

export default class JsonStore implements ThreadStore, MessageStore {
  private readonly sessionsDir: string;
  private readonly indexPath: string;

  constructor(sessionsDir = path.join(getAgentHome(), "sessions")) {
    this.sessionsDir = sessionsDir;
    this.indexPath = path.join(this.sessionsDir, "index.json");

    this.ensureStore();
  }

  ensureInitialThread(): ThreadInfo {
    const [existing] = this.listThreads();

    if (existing) {
      return existing;
    }

    return this.createThread("Default Thread");
  }

  createThread(title: string, id: string = crypto.randomUUID()): ThreadInfo {
    const index = this.readIndex();

    if (index.threads.some((thread) => thread.id === id)) {
      throw new Error(`Thread already exists: ${id}`);
    }

    const now = new Date().toISOString();
    const thread: JsonThread = {
      id,
      title,
      createdAt: now,
      updatedAt: now,
    };

    index.threads.push(thread);
    this.writeIndex(index);
    this.writeSession(id, {
      threadId: id,
      messages: [],
    });

    return this.toThreadInfo(thread);
  }

  getThread(threadId: string): ThreadInfo | null {
    const index = this.readIndex();
    const thread = index.threads.find((item) => item.id === threadId);

    return thread ? this.toThreadInfo(thread) : null;
  }

  listThreads(): ThreadInfo[] {
    const index = this.readIndex();

    return index.threads
      .slice()
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((thread) => this.toThreadInfo(thread));
  }

  updateThreadTitle(threadId: string, title: string) {
    const index = this.readIndex();
    const thread = index.threads.find((item) => item.id === threadId);

    if (!thread) {
      throw new Error(`Thread not found: ${threadId}`);
    }

    thread.title = title;
    thread.updatedAt = new Date().toISOString();

    this.writeIndex(index);
  }

  touchThread(threadId: string) {
    const index = this.readIndex();
    const thread = index.threads.find((item) => item.id === threadId);

    if (!thread) {
      throw new Error(`Thread not found: ${threadId}`);
    }

    thread.updatedAt = new Date().toISOString();
    this.writeIndex(index);
  }

  updateThreadMetadata(threadId: string, metadata: ThreadMetadata): ThreadInfo {
    const index = this.readIndex();
    const thread = index.threads.find((item) => item.id === threadId);

    if (!thread) {
      throw new Error(`Thread not found: ${threadId}`);
    }

    thread.metadata = this.normalizeThreadMetadata(metadata);
    thread.updatedAt = new Date().toISOString();
    this.writeIndex(index);
    return this.toThreadInfo(thread);
  }

  deleteThread(threadId: string) {
    const index = this.readIndex();

    index.threads = index.threads.filter((item) => item.id !== threadId);
    this.writeIndex(index);

    const sessionPath = this.getSessionPath(threadId);
    if (existsSync(sessionPath)) {
      rmSync(sessionPath);
    }
  }

  appendMessage(input: {
    threadId: string;
    role: StoredMessageRole;
    content: string;
    id?: string;
  }): StoredMessage {
    const index = this.readIndex();
    const thread = index.threads.find((item) => item.id === input.threadId);

    if (!thread) {
      throw new Error(`Thread not found: ${input.threadId}`);
    }

    const now = new Date().toISOString();
    const session = this.readSession(input.threadId);
    const message: JsonMessage = {
      id: input.id ?? crypto.randomUUID(),
      threadId: input.threadId,
      role: input.role,
      content: input.content,
      createdAt: now,
    };

    session.messages.push(message);
    thread.updatedAt = now;

    this.writeSession(input.threadId, session);
    this.writeIndex(index);

    return this.toStoredMessage(message);
  }

  listMessages(threadId: string): StoredMessage[] {
    if (!this.getThread(threadId)) {
      throw new Error(`Thread not found: ${threadId}`);
    }

    return this.readSession(threadId).messages.map((message) =>
      this.toStoredMessage(message),
    );
  }

  private ensureStore() {
    mkdirSync(this.sessionsDir, { recursive: true });

    if (!existsSync(this.indexPath)) {
      this.writeIndex({
        threads: [],
      });
    }
  }

  private readIndex(): JsonIndexState {
    return this.readJson<JsonIndexState>(this.indexPath);
  }

  private writeIndex(state: JsonIndexState) {
    this.writeJson(this.indexPath, state);
  }

  private readSession(threadId: string): JsonSessionState {
    const sessionPath = this.getSessionPath(threadId);

    if (!existsSync(sessionPath)) {
      return {
        threadId,
        messages: [],
      };
    }

    return this.readJson<JsonSessionState>(sessionPath);
  }

  private writeSession(threadId: string, state: JsonSessionState) {
    this.writeJson(this.getSessionPath(threadId), state);
  }

  private getSessionPath(threadId: string) {
    return path.join(this.sessionsDir, `${encodeURIComponent(threadId)}.json`);
  }

  private readJson<T>(filePath: string): T {
    const content = readFileSync(filePath, "utf-8");
    return JSON.parse(content) as T;
  }

  private writeJson(filePath: string, value: unknown) {
    writeFileSync(filePath, JSON.stringify(value, null, 2), "utf-8");
  }

  private toThreadInfo(thread: JsonThread): ThreadInfo {
    return {
      id: thread.id,
      title: thread.title,
      createdAt: new Date(thread.createdAt),
      updatedAt: new Date(thread.updatedAt),
      metadata: this.normalizeThreadMetadata(thread.metadata),
    };
  }

  private normalizeThreadMetadata(metadata: ThreadMetadata | undefined): ThreadMetadata {
    const activeSkillIds = this.normalizeSkillIds(metadata?.activeSkillIds);
    const disabledSkillIds = this.normalizeSkillIds(metadata?.disabledSkillIds);

    return Object.freeze({
      activeSkillIds,
      disabledSkillIds,
    });
  }

  private normalizeSkillIds(skillIds: readonly string[] | undefined): readonly string[] {
    return Object.freeze(
      [...new Set((skillIds ?? [])
        .filter((value): value is string => typeof value === "string")
        .map((skillId) => skillId.trim())
        .filter(Boolean))].sort(),
    );
  }

  private toStoredMessage(message: JsonMessage): StoredMessage {
    return {
      id: message.id,
      threadId: message.threadId,
      role: message.role,
      content: message.content,
      createdAt: new Date(message.createdAt),
    };
  }
}
