import assert from "node:assert/strict";
import { _electron as electron } from "playwright";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { startReaderRecording } from './reader-recording.mjs';
const require = createRequire(import.meta.url);
const root = path.resolve("test-results/reader-packaged", crypto.randomUUID());
await mkdir(root, { recursive: true });
await writeFile(path.join(root, "config.json"), JSON.stringify({ MODEL_PROVIDER: "openai", MODEL_NAME: "reader-test",
  MODEL_BASE_URL: "https://example.invalid/v1", MODEL_API_KEY: "local-reader-test", AGENT_WORKSPACE: path.join(root, "workspace"), LOG_LEVEL: "error" }));
const asar = path.resolve(process.env.STORYOS_READER_ASAR ?? ".tmp-visual-check/reader-package/StoryOS-win32-x64/resources/app.asar");
let application;
const errors = [];
const launch = async () => {
  application = await electron.launch({ executablePath: require("electron"), args: [path.resolve("scripts/electron-reader-packaged.cjs")],
    env: { ...process.env, MINI_AGENT_HOME: root, STORYOS_READER_ASAR: asar } });
  application.process().stderr?.on("data", data => process.stderr.write(data));
  const page = await application.firstWindow();
  page.on("console", entry => { if (entry.type() === "error") console.error(entry.text()); });
  page.on("pageerror", error => { errors.push(String(error)); console.error(error); });
  console.log("Packaged reader URL:", page.url());
  await page.waitForFunction(() => Boolean(window.storyOSAgent), undefined, { timeout: 10000 }).catch(async error => {
    console.log(await page.evaluate(() => ({ ready: document.readyState, text: document.body.innerText.slice(0, 1200), keys: Object.keys(window).filter(k => /story|electron/i.test(k)) })));
    throw error;
  });
  // Packaged resources use file://; every network request is rejected during the reading checks.
  await page.route(/^https?:/, route => route.abort());
  return page;
};
try {
  let page = await launch();
  const result = await page.evaluate(async () => {
    const api = window.storyOSAgent;
    const shelf = await api.createBookshelfBook({ title: "离线阅读验证", synopsis: "" });
    const created = await api.createProject({ name: "reader-fixture", createAgentsFile: false, bookId: shelf.bookId });
    const projectId = created.projects.activeProjectId;
    let book = await api.createBookVolume({ projectId, title: "第一卷" });
    book = await api.createBookChapter({ projectId, volumeId: book.volumes[0].id, title: "灯下" });
    const chapterId = book.chapters[0].id;
    const content = JSON.stringify({ schemaVersion: 1, document: { type: "doc", content: Array.from({ length: 100 }, (_, i) => ({ type: "paragraph", content: [{ type: "text", text: `第${i + 1}段。山中的灯火照亮回家的路。晚风穿过树林，读者在书页之间，找到新的故事。` }] })) } });
    const saved = await api.saveBookChapterContent({ projectId, chapterId, content, expectedCurrentRevisionId: null });
    const standalone = await api.createBookshelfBook({ title: "独立书籍", synopsis: "" });
    const standaloneSnapshot = await api.openBookReader(standalone.bookId);
    if (standaloneSnapshot.book.title !== "独立书籍") throw new Error("standalone reader failed");
    await api.closeBookReader(standaloneSnapshot.snapshotId);
    const snapshot = await api.openBookReader(shelf.bookId);
    const read = await api.readBookReaderChapter({ snapshotId: snapshot.snapshotId, chapterId });
    const unlinked = (await api.getBookshelfBooks()).find(b => b.bookId === shelf.bookId);
    if (unlinked.linkedProjectId !== projectId) throw new Error("reading changed the project binding");
    await api.closeBookReader(snapshot.snapshotId);
    window.location.hash = '/bookshelf';
    return { bookId: shelf.bookId, chapterId, revisionId: saved.revision.id, content: read.content };
  });
  assert.ok(result.content.includes("晚风"));
  const stopRecording = await startReaderRecording(page, path.resolve('test-results/reader-v2/packaged-recording'));
  await page.locator(`[data-reader-entry="card-${result.bookId}"]`).click();
  await page.waitForFunction(() => !document.querySelector(".reader-loading") && document.querySelector(".reader-stage"), undefined, { timeout: 10000 }).catch(async error => {
    console.log("Reader UI:", await page.locator("body").innerText()); throw error;
  });
  await page.waitForFunction(() => document.querySelector('.reader-stage')?.getAttribute('data-phase') === 'reading' && !document.querySelector('.reader-entry-layer'));
  assert.equal(await page.locator('.reader-stage').getAttribute('data-renderer'), 'webgl');
  await page.getByRole("button", { name: "下一页", exact: true }).last().click();
  await page.waitForFunction(() => document.querySelector('.reader-stage')?.getAttribute('data-phase') === 'reading' && document.querySelector('.reader-accessible-pages [aria-label="正文第 4 页"]'));
  await page.getByRole('button', { name: '目录', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.reader-stage')?.getAttribute('data-phase') === 'reading');
  await page.getByRole('button', { name: '阅读灯下', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.reader-stage')?.getAttribute('data-phase') === 'reading');
  await page.getByRole('button', { name: '下一页', exact: true }).last().click();
  await page.waitForFunction(() => document.querySelector('.reader-stage')?.getAttribute('data-phase') === 'reading' && document.querySelector('.reader-accessible-pages [aria-label="正文第 4 页"]'));
  const settle = () => page.waitForFunction(() => document.querySelector('.reader-stage')?.dataset.phase === 'reading');
  const jumpTo = async folio => {
    await page.getByRole('button', { name: '章节导航', exact: true }).click();
    await page.getByLabel('跳转正文页码').fill(String(folio));
    await page.getByRole('button', { name: '前往', exact: true }).click();
  };
  await page.evaluate(() => {
    window.packagedJumpFrames = [];
    const stage = document.querySelector('.reader-stage');
    window.packagedJumpObserver = new MutationObserver(() => {
      if (stage.dataset.phase === 'turning' && stage.dataset.jump === 'true') window.packagedJumpFrames.push({ key: stage.dataset.pageKey, direction: stage.dataset.jumpDirection, sheets: Number(stage.dataset.jumpSheets) });
    });
    window.packagedJumpObserver.observe(stage, { attributes: true });
  });
  await jumpTo(10); await settle();
  assert.equal(await page.locator('.reader-accessible-pages [aria-label="正文第 10 页"]').count(), 1);
  await jumpTo(4); await settle();
  assert.equal(await page.locator('.reader-accessible-pages [aria-label="正文第 4 页"]').count(), 1);
  const animated = await page.evaluate(() => { window.packagedJumpObserver.disconnect(); return window.packagedJumpFrames; });
  for (const direction of ['1', '-1']) {
    const frames = animated.filter(frame => frame.direction === direction);
    assert.ok(frames.length > 0 && frames.every(frame => frame.sheets > 1), 'both directions must turn a packet');
    assert.equal(new Set(frames.map(frame => frame.key)).size, 1, 'packet turns never commit intermediate reading pages');
  }
  await jumpTo(10);
  await page.waitForFunction(() => document.querySelector('.reader-stage')?.dataset.phase === 'turning');
  await page.getByRole('button', { name: '目录', exact: true }).click(); await settle();
  await page.waitForTimeout(350);
  assert.equal(await page.getByRole('button', { name: '阅读灯下', exact: true }).count(), 1, 'a new destination cancels the old jump sequence');
  await jumpTo(4); await settle();
  for (let i = 0; i < 2; i++) {
    await page.getByRole('button', { name: '回到封面', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.reader-stage')?.getAttribute('data-phase') === 'reading' && document.querySelector('.reader-stage')?.getAttribute('data-page-kind') === 'cover');
    await page.getByRole('button', { name: '继续阅读', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.reader-stage')?.getAttribute('data-phase') === 'reading' && document.querySelector('.reader-accessible-pages [aria-label="正文第 4 页"]'));
  }
  // Exit on the cover while the latest text-position autosave can still be pending.
  await page.getByRole('button', { name: '回到封面', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.reader-stage')?.getAttribute('data-phase') === 'reading' && document.querySelector('.reader-stage')?.getAttribute('data-page-kind') === 'cover');
  console.log('Actual offline recording:', await stopRecording());
  await page.getByRole("button", { name: "返回书架", exact: true }).click();
  await page.locator(`[data-reader-entry="card-${result.bookId}"]`).waitFor();
  await page.waitForTimeout(250);
  await application.close(); application = null;
  page = await launch();
  await page.evaluate(bookId => { window.location.hash = `/bookshelf/${bookId}/read`; }, result.bookId);
  await page.waitForFunction(() => document.querySelector('.reader-stage')?.getAttribute('data-phase') === 'reading' && document.querySelector('.reader-accessible-pages [aria-label="正文第 4 页"]'));
  assert.equal(await page.locator('.reader-book-dom').count(), 0);
  assert.equal(await page.getByRole("button", { name: "文本模式 · 选择文字", exact: true }).count(), 1);
  assert.deepEqual(errors, []);
  console.log("Packaged reader passed: actual IPC, independent book, offline 3D rendering, SQLite progress after application restart.");
} finally { await application?.close(); }
