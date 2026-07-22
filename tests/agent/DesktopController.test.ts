import { describe, expect, it, vi } from "vitest";
import type { MessageRole, ThreadSkillState } from "../../src/main/agent/application/threadPorts.ts";
import DesktopController from "../../src/main/agent/electron/DesktopController.ts";
import type { DesktopControllerDependencies } from "../../src/main/agent/electron/DesktopController.ts";

type StoredMessage = { readonly role: MessageRole; readonly content: string; readonly threadId: string };
type TestMessage = StoredMessage & { readonly id: string; readonly createdAt: string };

function createDeferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<T>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, resolve, reject };
}

function createHarness() {
    const completion = createDeferred<string>();
    const messages: StoredMessage[] = [];
    const skillState: ThreadSkillState = { activeSkillIds: [], disabledSkillIds: [] };
    const activeThread = {
        id: "thread-1",
        title: "Desktop",
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
        metadata: {},
    };
    const snapshot = {
        activeThreadId: "thread-1",
        activeThread,
        threads: [] as Array<typeof activeThread>,
    };
    const agent = {
        startRun: vi.fn(() => "run-1"),
        waitForRun: vi.fn((): Promise<string> => completion.promise),
        cancelRun: vi.fn(() => true),
        listRuns: vi.fn(() => []),
        resolveApproval: vi.fn(async () => true),
        subscribe: vi.fn((): (() => void) => () => undefined),
    };
    const threads = {
        appendMessage: vi.fn((input: StoredMessage): TestMessage => {
            messages.push(input);
            return { id: `message-${messages.length}`, createdAt: new Date(0).toISOString(), ...input };
        }),
        getSnapshot: vi.fn(() => snapshot),
        listMessages: vi.fn(() => []),
        createThread: vi.fn(),
        switchThread: vi.fn(() => snapshot),
        deleteThread: vi.fn(() => snapshot),
        useSkill: vi.fn(() => skillState),
        disableSkill: vi.fn(() => skillState),
        clearSkillState: vi.fn(() => skillState),
    };
    const skills = {
        getSnapshot: vi.fn(() => ({ skills: [], issues: [], loadedAt: new Date(0).toISOString() })),
        getSkill: vi.fn(() => null),
    };
    const dependencies = { agent, threads, skills } as unknown as DesktopControllerDependencies;
    return { agent, completion, controller: new DesktopController(dependencies), messages };
}

describe("DesktopController", () => {
    it("persists the user message before the run and the answer after completion", async () => {
        const harness = createHarness();
        expect(harness.controller.sendMessage({ threadId: "thread-1", content: "hello" }))
            .toEqual({ runId: "run-1" });
        expect(harness.messages).toEqual([{ threadId: "thread-1", role: "user", content: "hello" }]);
        expect(harness.agent.startRun).toHaveBeenCalledWith({ threadId: "thread-1", input: "hello" });
        harness.completion.resolve("world");
        await harness.completion.promise;
        await Promise.resolve();
        expect(harness.messages).toEqual([
            { threadId: "thread-1", role: "user", content: "hello" },
            { threadId: "thread-1", role: "assistant", content: "world" },
        ]);
    });

    it("does not persist an assistant message when the run fails", async () => {
        const harness = createHarness();
        harness.controller.sendMessage({ threadId: "thread-1", content: "hello" });
        harness.completion.reject(new Error("model failed"));
        await expect(harness.completion.promise).rejects.toThrow("model failed");
        await Promise.resolve();
        expect(harness.messages).toHaveLength(1);
        expect(harness.messages[0]?.role).toBe("user");
    });

    it("rejects empty messages before writing history", () => {
        const harness = createHarness();
        expect(() => harness.controller.sendMessage({ threadId: "thread-1", content: "  " }))
            .toThrow("Message content is required.");
        expect(harness.messages).toEqual([]);
    });
});
