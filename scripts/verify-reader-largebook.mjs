import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { _electron as electron } from "playwright";

// Renderer benchmark against the explicit preview adapter. Real SQLite/offline tests are separate.
const require = createRequire(import.meta.url);
const url = process.env.STORYOS_READER_TEST_URL ?? "http://127.0.0.1:4319/?preview=1";
const application = await electron.launch({ executablePath: require("electron"),
  args: [path.resolve("scripts/electron-reader-preview.cjs")], env: { ...process.env, STORYOS_TEST_URL: url } });
try {
  const page = await application.firstWindow();
  page.setDefaultTimeout(20000);
  await page.waitForFunction(() => Boolean(window.storyOSAgent));
  const fixtures = await page.evaluate(async () => {
    const api = window.storyOSAgent;
    const result = [];
    const paragraph = "晚风穿过树林，山中的灯火照亮回家的路。读者在书页之间，找到新的故事。".repeat(4).slice(0, 100);
    const body = JSON.stringify({ schemaVersion: 1, document: { type: "doc", content:
      Array.from({ length: 50 }, () => ({ type: "paragraph", content: [{ type: "text", text: paragraph }] })) } });
    for (const count of [20, 200]) {
      const project = await api.createProject({ name: `长书验证${count}`, parentPath: "/preview", createAgentsFile: false });
      const projectId = project.projects.activeProjectId;
      await api.createBook({ projectId, title: `长书${count}`, synopsis: "", status: "writing" });
      const volume = await api.createBookVolume({ projectId, title: "正文" });
      for (let i = 0; i < count; i++) {
        const book = await api.createBookChapter({ projectId, volumeId: volume.volumes[0].id, title: `第${i + 1}章` });
        await api.saveBookChapterContent({ projectId, chapterId: book.chapters.at(-1).id, content: body, expectedCurrentRevisionId: null });
      }
      const book = (await api.getBookshelfBooks()).find(b => b.title === `长书${count}`);
      result.push({ bookId: book.bookId, characters: count * 5000, chapters: count });
    }
    window.readerReadCount = 0;
    const original = api.readBookReaderChapter;
    api.readBookReaderChapter = request => { window.readerReadCount++; return original(request); };
    window.location.hash = "/bookshelf";
    return result;
  });
  const results = [];
  for (const fixture of fixtures) {
    const samples = [];
    for (let attempt = 0; attempt < 3; attempt++) {
      await page.evaluate(bookId => { window.readerReadCount = 0; window.location.hash = `/bookshelf/${bookId}/read`; }, fixture.bookId);
      const started = performance.now();
      await page.waitForFunction(() => document.querySelector(".reader-stage") && !document.querySelector(".reader-loading"));
      const readableMs = Math.round(performance.now() - started);
      const readsAtReady = await page.evaluate(() => window.readerReadCount);
      assert.ok(readsAtReady < 5, "first readable chapter must not wait for the whole book");
      await page.waitForFunction(() => document.querySelector('.reader-stage')?.getAttribute('data-phase') === 'reading');
      assert.equal(await page.getByRole("button", { name: "文本模式 · 选择文字", exact: true }).count(), 1);
      samples.push({ attempt, readableMs, openedMs: Math.round(performance.now() - started), readsAtReady });
      await page.getByRole("button", { name: "返回书架", exact: true }).click();
      await page.waitForFunction(() => !document.querySelector(".reader-shell") && !document.querySelector(".reader-measure"));
    }
    results.push({ ...fixture, samples });
  }
  const environment = await application.evaluate(async ({ app }) => ({ versions: process.versions, gpu: await app.getGPUInfo("basic") }));
  const screen = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio }));
  const report = { date: new Date().toISOString(), environment, screen, note: "Three samples per size; first lazy-load vs warmed module, renderer/preview only. Not a statistical P95 or end-to-end SQLite benchmark.", results };
  await mkdir("test-results/reader", { recursive: true });
  await writeFile("test-results/reader/largebook.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(results, null, 2));
} finally { await application.close(); }
