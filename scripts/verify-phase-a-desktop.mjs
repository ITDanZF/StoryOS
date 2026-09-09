import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { _electron } from "playwright";

const require = createRequire(import.meta.url);
const root = path.resolve("test-results/phase-a-desktop", crypto.randomUUID());
fs.mkdirSync(root, { recursive: true });
const home = path.join(root, "home");
fs.mkdirSync(home);
fs.writeFileSync(
  path.join(home, "config.json"),
  JSON.stringify({
    MODEL_PROVIDER: "openai",
    MODEL_NAME: "storage-test",
    MODEL_BASE_URL: "https://example.invalid/v1",
    MODEL_API_KEY: "test-only",
    AGENT_WORKSPACE: "",
    LOG_LEVEL: "error",
  }),
);
const packaged = path.resolve("out/storyos-win32-x64/resources/app.asar");
const bootstrap = path.join(root, "bootstrap.cjs");
fs.writeFileSync(
  bootstrap,
  `const {app,BrowserWindow}=require(${JSON.stringify(require.resolve("electron"))});
BrowserWindow.prototype.show=function(){};
app.on("web-contents-created",(_event,contents)=>{contents.openDevTools=function(){};contents.setBackgroundThrottling(false);});
app.setAppPath(${JSON.stringify(packaged)});
require(${JSON.stringify(path.join(packaged, ".vite/build/main.js"))});`,
);
// The bootstrap requires the built-in Electron module, not the npm path resolver.
fs.writeFileSync(
  bootstrap,
  fs
    .readFileSync(bootstrap, "utf8")
    .replace(JSON.stringify(require.resolve("electron")), "'electron'"),
);
const env = { ...process.env, MINI_AGENT_HOME: home };
delete env.ELECTRON_RUN_AS_NODE;
async function waitForApi(
  page,
  predicate,
  argument,
  { timeout = 10_000 } = {},
) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await page.evaluate(predicate, argument)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`IPC condition did not become true within ${timeout} ms`);
}
let application;
try {
  application = await _electron.launch({
    executablePath: require("electron"),
    args: [bootstrap, "--disable-gpu"],
    env,
    timeout: 30_000,
  });
  await application.firstWindow();
  const page = application
    .windows()
    .find((page) => !page.url().startsWith("devtools:"));
  if (!page) throw new Error("Main window missing.");
  console.log("Test window", page.url());
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") console.error(message.text());
  });
  await page.waitForFunction(() => Boolean(window.storyOSAgent), undefined, {
    polling: 100,
  });
  const ids = await page.evaluate(async () => {
    const api = window.storyOSAgent;
    const project = await api.createProject({ name: "存储验收" });
    const projectId = project.projects.activeProjectId;
    const book = await api.createBook({
      projectId,
      title: "架构验收",
      synopsis: "本地优先",
      status: "writing",
    });
    const volume = await api.createBookVolume({ projectId, title: "第一卷" });
    const workspace = await api.createBookChapter({
      projectId,
      volumeId: volume.volumes[0].id,
      title: "第一章",
    });
    const chapterId = workspace.chapters[0].id;
    const content = JSON.stringify({
      schemaVersion: 1,
      document: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "持久化正文" }],
          },
        ],
      },
    });
    const loaded = await api.getBookChapterContent({ projectId, chapterId });
    const draft = await api.chapterDraft({
      action: "save",
      projectId,
      chapterId,
      baseRevisionId: null,
      expectedDraftVersion: 0,
      content,
    });
    const saved = await api.saveBookChapterContent({
      projectId,
      chapterId,
      content,
      expectedCurrentRevisionId: null,
      expectedRowVersion: loaded.rowVersion,
      expectedDraftVersion: draft.draftVersion,
    });
    const metadata = await api.getBookWorkspace(projectId);
    if ("content" in metadata.chapters[0])
      throw new Error("Directory payload contains正文");
    if (
      (await api.chapterDraft({ action: "read", projectId, chapterId })) !==
      null
    )
      throw new Error("Committed draft was not removed");
    const shelf = await api.getBookshelfBooks({ limit: 1 });
    if (shelf[0].characterCount !== 5)
      throw new Error("Bookshelf count is stale");
    location.hash = `#/projects/${projectId}/book`;
    return {
      projectId,
      chapterId,
      bookId: book.book.id,
      revisionId: saved.revision.id,
    };
  });
  const chapter = page.getByText("第一章", { exact: true });
  await chapter.first().click();
  const editor = page.locator(
    '[contenteditable="true"][aria-label="章节正文"]',
  );
  await editor.waitFor({ state: "visible", timeout: 20_000 });
  assert.match(await editor.innerText(), /持久化正文/);
  await editor.fill("输入期间的恢复草稿");
  await waitForApi(
    page,
    async ({ projectId, chapterId }) => {
      const draft = await window.storyOSAgent.chapterDraft({
        action: "read",
        projectId,
        chapterId,
      });
      return draft?.content.includes("输入期间的恢复草稿");
    },
    ids,
    { timeout: 4_000, polling: 100 },
  );
  const unchanged = await page.evaluate(
    async (ids) =>
      (await window.storyOSAgent.getBookChapterContent(ids)).currentRevisionId,
    ids,
  );
  assert.equal(
    unchanged,
    ids.revisionId,
    "typing draft must not create a permanent revision immediately",
  );
  await editor.press("Control+s");
  await waitForApi(
    page,
    async (ids) =>
      (await window.storyOSAgent.getBookChapterContent(ids))
        .currentRevisionId !== ids.revisionId,
    ids,
    { timeout: 10_000, polling: 100 },
  );
  await editor.fill("重启后恢复的草稿");
  await waitForApi(
    page,
    async (ids) =>
      (
        await window.storyOSAgent.chapterDraft({ action: "read", ...ids })
      )?.content.includes("重启后恢复的草稿"),
    ids,
    { timeout: 4000, polling: 100 },
  );
  // A graceful close flushes formal saves; terminate the main process to test crash recovery.
  const crashed = application;
  const exited = new Promise((resolve) =>
    crashed.process().once("exit", resolve),
  );
  crashed.process().kill("SIGKILL");
  await exited;
  await crashed.close().catch(() => undefined);
  application = await _electron.launch({
    executablePath: require("electron"),
    args: [bootstrap, "--disable-gpu"],
    env,
    timeout: 30_000,
  });
  const reopened = await application.firstWindow();
  await reopened.waitForFunction(
    () => Boolean(window.storyOSAgent),
    undefined,
    { polling: 100 },
  );
  const persisted = await reopened.evaluate(
    async (ids) => ({
      draft: await window.storyOSAgent.chapterDraft({ action: "read", ...ids }),
      chapter: await window.storyOSAgent.getBookChapterContent(ids),
    }),
    ids,
  );
  assert.match(persisted.draft?.content ?? "", /重启后恢复的草稿/);
  assert.doesNotMatch(persisted.chapter.content ?? "", /重启后恢复的草稿/);
  await reopened.evaluate((ids) => {
    location.hash = `#/projects/${ids.projectId}/book`;
  }, ids);
  await reopened.getByText("第一章", { exact: true }).first().click();
  const recoveredEditor = reopened.locator(
    '[contenteditable="true"][aria-label="章节正文"]',
  );
  await recoveredEditor.waitFor({ state: "visible", timeout: 20_000 });
  assert.match(await recoveredEditor.innerText(), /重启后恢复的草稿/);
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify(
      {
        passed: true,
        checks: [
          "production IPC",
          "metadata-only directory",
          "draft CAS and commit",
          "bookshelf projection",
          "lazy chapter loading",
          "typing draft / Ctrl+S revision",
          "draft recovery after restart",
        ],
        artifacts: root,
      },
      null,
      2,
    ),
  );
} finally {
  await application?.close();
}
