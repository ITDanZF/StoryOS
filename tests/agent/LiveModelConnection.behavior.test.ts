import { createServer, type Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import LiveModelConnection from "../../src/main/agent/model/LiveModelConnection.ts";
import Model from "../../src/main/agent/model/Model.ts";
import AgentApplication from "../../src/main/story/application/conversations/AgentApplication.ts";
import type { ModelConnectionConfiguration } from "../../src/main/agent/model/ModelConfiguration.ts";
import type { ModelSessionStore } from "../../src/main/agent/model/ModelSessionStore.ts";
import type { ModelRunInput } from "../../src/main/agent/model/ModelGateway.ts";
import ChapterGenerationService from "../../src/main/story/application/books/ChapterGenerationService.ts";
import type NovelApplication from "../../src/main/story/application/books/NovelApplication.ts";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
let server: Server;
let configuration: ModelConnectionConfiguration;
let streamGate: ReturnType<typeof deferred>;
let requests: Array<{ model: string; authorization: string }>;

beforeEach(async () => {
  requests = [];
  streamGate = deferred();
  server = createServer(async (request, response) => {
    let body = "";
    for await (const part of request) body += part;
    const value = JSON.parse(body) as { model: string; stream?: boolean };
    requests.push({ model: value.model, authorization: request.headers.authorization ?? "" });
    if (value.stream) {
      response.writeHead(200, { "Content-Type": "text/event-stream" });
      const chunk = (content: string) =>
        `data: ${JSON.stringify({ id: "test", object: "chat.completion.chunk", created: 1, model: value.model, choices: [{ index: 0, delta: { role: "assistant", content }, finish_reason: null }] })}\n\n`;
      response.write(chunk(`${value.model}:start`));
      await streamGate.promise;
      response.write(chunk(`${value.model}:end`));
      response.end("data: [DONE]\n\n");
    } else {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({
          id: "test",
          object: "chat.completion",
          created: 1,
          model: value.model,
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: value.model },
              finish_reason: "stop",
            },
          ],
        }),
      );
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing test server port");
  configuration = {
    modelName: "model-a",
    apiKey: "test-key-a",
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
  };
});

afterEach(async () => {
  streamGate.resolve();
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

const sessions: ModelSessionStore = {
  getCheckpointer: () => undefined,
  getConfig: (threadId) => ({ configurable: { thread_id: threadId } }),
  close: () => undefined,
};
const input = (threadId: string): ModelRunInput => ({
  prompt: "test",
  threadId,
  systemPrompt: "test",
  tools: [],
});

describe("live model switching", () => {
  it("keeps standalone chapter retries on the original snapshot", async () => {
    const connection = new LiveModelConnection(configuration);
    const seen: string[] = [];
    const novels = {
      getChapter: () => ({ id: "chapter", title: "Chapter", rowVersion: 1 }),
      getCurrentRevision: (): null => null,
      saveRevision: () => ({ revisionNumber: 1, characterCount: 7 }),
    } as unknown as NovelApplication;
    const chapter = new ChapterGenerationService(
      {
        withSnapshot: (operation) => connection.withSnapshot(operation),
        stream: async function* () {
          seen.push(connection.getClient().model);
          if (seen.length === 1) {
            connection.prepareUpdate({ ...configuration, modelName: "model-b" })();
            throw new Error("ECONNRESET");
          }
          yield "正文内容";
        },
      },
      novels,
      async () => undefined,
    );
    await chapter.generate({
      projectId: "project",
      chapterId: "chapter",
      mode: "rewrite",
      instruction: "test",
    });
    expect(seen).toEqual(["model-a", "model-a"]);
    expect(connection.getClient()).toMatchObject({ model: "model-b" });
  });

  it("keeps task A on its original client while task B uses the new model and key", async () => {
    const connection = new LiveModelConnection(configuration);
    const model = new Model({ configuration, connection, sessions });
    const taskGate = deferred();
    const firstCall = deferred();
    const runner = {
      run: async (_input: unknown, options: { threadId: string }) => {
        const first = await model.invokeText(input(options.threadId));
        if (options.threadId === "a") {
          firstCall.resolve();
          await taskGate.promise;
        }
        // Represents another planning/tool/retry step in the same task.
        const second = await model.invokeText(input(options.threadId));
        return `${first}/${second}`;
      },
      cancelRun: () => false,
    };
    const application = new AgentApplication(runner, {
      withRunContext: (operation) => connection.withNewTask(operation),
    });
    const a = application.startRun({ threadId: "a", message: { messageId: "a", content: "test" } });
    await firstCall.promise;
    connection.prepareUpdate({ ...configuration, modelName: "model-b", apiKey: "test-key-b" })();
    const b = application.startRun({ threadId: "b", message: { messageId: "b", content: "test" } });
    expect(await application.waitForRun(b)).toBe("model-b/model-b");
    taskGate.resolve();
    expect(await application.waitForRun(a)).toBe("model-a/model-a");
    expect(
      requests
        .filter((request) => request.model === "model-a")
        .map((request) => request.authorization),
    ).toEqual(["Bearer test-key-a", "Bearer test-key-a"]);
    expect(
      requests
        .filter((request) => request.model === "model-b")
        .map((request) => request.authorization),
    ).toEqual(["Bearer test-key-b", "Bearer test-key-b"]);
    await application.shutdown();
  });

  it("captures at task acceptance, before asynchronous event recording", async () => {
    const connection = new LiveModelConnection(configuration);
    const model = new Model({ configuration, connection, sessions });
    const gate = deferred();
    const application = new AgentApplication(
      { run: () => model.invokeText(input("a")), cancelRun: () => false },
      {
        withRunContext: (operation) => connection.withNewTask(operation),
        eventRecorder: {
          record: async () => {
            await gate.promise;
          },
        },
      },
    );
    const runId = application.startRun({
      threadId: "a",
      message: { messageId: "a", content: "test" },
    });
    connection.prepareUpdate({ ...configuration, modelName: "model-b" })();
    gate.resolve();
    expect(await application.waitForRun(runId)).toBe("model-a");
    await application.shutdown();
  });

  it("finishes an existing stream on the old model and uses the new client for subsequent calls", async () => {
    const connection = new LiveModelConnection(configuration);
    const model = new Model({ configuration, connection, sessions });
    const iterator = model.stream(input("stream"));
    expect((await iterator.next()).value).toMatchObject({ delta: "model-a:start" });
    connection.prepareUpdate({ ...configuration, modelName: "model-b" })();
    expect(await model.invokeText(input("next"))).toBe("model-b");
    streamGate.resolve();
    const remaining = [];
    for await (const part of iterator) remaining.push(part.delta);
    expect(remaining.join("")).toBe("model-a:end");
  });

  it("shares updates across existing and newly created gateways without replacing sessions", async () => {
    const connection = new LiveModelConnection(configuration);
    const global = new Model({ configuration, connection, sessions });
    const project = new Model({ configuration, connection, sessions });
    const original = connection.getClient();
    connection.prepareUpdate(configuration)();
    expect(connection.getClient()).toBe(original);
    const publishB = connection.prepareUpdate({ ...configuration, modelName: "model-b" });
    expect(connection.getClient()).toBe(original);
    publishB();
    connection.prepareUpdate({ ...configuration, modelName: "model-c" })();
    const newProject = new Model({ configuration, connection, sessions });
    expect(
      await Promise.all([
        global.invokeText(input("global")),
        project.invokeText(input("project")),
        newProject.invokeText(input("new")),
      ]),
    ).toEqual(["model-c", "model-c", "model-c"]);
  });
});
