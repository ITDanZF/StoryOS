import { describe, expect, it } from "vitest";
import ThreadApplication from "./ThreadApplication.ts";
import type {
  MessageRecord,
  ThreadMetadata,
  ThreadPersistence,
  ThreadRecord,
} from "./threadPorts.ts";

class MemoryThreadPersistence implements ThreadPersistence {
  private activeThreadId: string | null = null;
  private readonly threads = new Map<string, ThreadRecord>();
  private readonly messages = new Map<string, MessageRecord[]>();

  getActiveThreadId() { return this.activeThreadId; }
  setActiveThreadId(threadId: string | null) { this.activeThreadId = threadId; }
  createThread(title: string, id = crypto.randomUUID(), metadata?: ThreadMetadata) {
    const thread = { id, title, createdAt: new Date(0), updatedAt: new Date(0), metadata };
    this.threads.set(id, thread);
    this.messages.set(id, []);
    return thread;
  }
  getThread(threadId: string) { return this.threads.get(threadId) ?? null; }
  listThreads() { return [...this.threads.values()]; }
  touchThread(threadId: string) {
    const thread = this.requireThread(threadId);
    this.threads.set(threadId, { ...thread, updatedAt: new Date() });
  }
  updateThreadTitle(threadId: string, title: string) {
    const updated = { ...this.requireThread(threadId), title, updatedAt: new Date() };
    this.threads.set(threadId, updated);
    return updated;
  }
  updateThreadMetadata(threadId: string, metadata: ThreadMetadata) {
    const updated = { ...this.requireThread(threadId), metadata, updatedAt: new Date() };
    this.threads.set(threadId, updated);
    return updated;
  }
  deleteThread(threadId: string) {
    this.threads.delete(threadId);
    this.messages.delete(threadId);
  }
  appendMessage(input: {
    threadId: string;
    role: MessageRecord["role"];
    content: string;
    id?: string;
  }) {
    const message = {
      id: input.id ?? crypto.randomUUID(),
      threadId: input.threadId,
      role: input.role,
      content: input.content,
      createdAt: new Date(),
    };
    this.messages.set(input.threadId, [...this.listMessages(input.threadId), message]);
    return message;
  }
  listMessages(threadId: string) { return [...(this.messages.get(threadId) ?? [])]; }

  private requireThread(threadId: string) {
    const thread = this.getThread(threadId);
    if (!thread) throw new Error(`Thread not found: ${threadId}`);
    return thread;
  }
}

describe("ThreadApplication titles", () => {
  it("renames an untitled thread from its first user prompt", () => {
    const application = new ThreadApplication(new MemoryThreadPersistence());
    const thread = application.createThread({ title: "新对话", id: "thread-1" });

    application.appendMessage({
      threadId: thread.id,
      role: "user",
      content: "请帮我检查第五章的节奏，并给出三条建议。",
    });

    expect(application.getSnapshot().activeThread?.title)
      .toBe("检查第五章的节奏，并给出三条建议");
  });

  it("does not rename the thread again or replace an explicit title", () => {
    const application = new ThreadApplication(new MemoryThreadPersistence());
    const untitled = application.createThread({ title: "新对话", id: "thread-1" });
    application.appendMessage({ threadId: untitled.id, role: "user", content: "分析第一章" });
    application.appendMessage({ threadId: untitled.id, role: "user", content: "改成另一个标题" });
    expect(application.getSnapshot().activeThread?.title).toBe("分析第一章");

    const named = application.createThread({ title: "人物设定", id: "thread-2" });
    application.appendMessage({ threadId: named.id, role: "user", content: "生成角色关系" });
    expect(application.getSnapshot().activeThread?.title).toBe("人物设定");
  });
});
