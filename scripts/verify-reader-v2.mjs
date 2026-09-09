import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { _electron as electron } from "playwright";

const require = createRequire(import.meta.url);
const workspace = path.resolve(import.meta.dirname, "..");
const url = process.env.STORYOS_READER_TEST_URL ?? "http://127.0.0.1:4320/?preview=1";
const server = process.env.STORYOS_READER_TEST_URL ? null : spawn(process.execPath,
  ["node_modules/vite/bin/vite.js", "--config", "vite.renderer.config.ts", "--host", "127.0.0.1", "--port", "4320"],
  { cwd: workspace, stdio: "pipe", windowsHide: true });
let application;
try {
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(url)).ok) break; } catch { /* server startup */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  application = await electron.launch({ executablePath: require("electron"),
    args: [...(process.env.STORYOS_READER_DPR ? [`--force-device-scale-factor=${process.env.STORYOS_READER_DPR}`] : []), path.join(workspace, "scripts/electron-reader-preview.cjs")], env: { ...process.env, STORYOS_TEST_URL: url } });
  const page = await application.firstWindow();
  if (process.env.STORYOS_READER_DPR) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: Number(process.env.STORYOS_READER_DPR), mobile: false });
    assert.equal(await page.evaluate(() => devicePixelRatio), Number(process.env.STORYOS_READER_DPR));
  }
  page.setDefaultTimeout(30000);
  const errors = [];
  page.on("pageerror", error => { errors.push(String(error)); console.error(error.stack); });
  page.on("console", entry => { if (entry.type() === "error") console.error(entry.text()); });
  await page.waitForFunction(() => Boolean(window.storyOSAgent)).catch(async error => { console.log(await page.locator("body").innerText()); throw error; });
  const fixture = await page.evaluate(async () => {
    const api = window.storyOSAgent;
    const project = await api.createProject({ name: "阅读器验证", parentPath: "/preview", createAgentsFile: false });
    const projectId = project.projects.activeProjectId;
    await api.createBook({ projectId, title: "野外山村的小屋", synopsis: "风从山谷吹来，故事在灯下继续。", status: "writing" });
    const volume = await api.createBookVolume({ projectId, title: "第一卷 · 山间来信" });
    const volumeId = volume.volumes[0].id;
    const ids = [];
    for (let chapterIndex = 0; chapterIndex < 3; chapterIndex++) {
      const book = await api.createBookChapter({ projectId, volumeId, title: ["第一章 · 晚风", "第二章 · 旧信", "第三章 · 黎明"][chapterIndex] });
      const chapterId = book.chapters.at(-1).id;
      ids.push(chapterId);
      const content = { schemaVersion: 1, document: { type: "doc", content: [
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "灯火与归途" }] },
        ...Array.from({ length: 55 }, (_, index) => ({ type: "paragraph", content: [
          { type: "text", text: `第${index + 1}段，夜色沿着山路慢慢铺开。`, marks: index % 3 === 0 ? [{ type: "bold" }] : [] },
          { type: "text", text: "风从河面带来潮湿的气息，旅人停下脚步，望向远处那一盏始终没有熄灭的灯。\u{1F3E1} 她说：“明天还会来吗？” e\u0301，答案写在新的故事里。" },
        ] })),
        { type: "orderedList", attrs: { start: 4 }, content: Array.from({ length: 8 }, (_, i) => ({ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: `清单${i + 4}：窗前的花、旧信与归途。` }] }] })) },
        { type: "pageBreak" }, { type: "paragraph", attrs: { firstLineIndent: "0em" }, content: [{ type: "text", text: "手动分页之后，新的天光。", marks: [{ type: "underline" }] }] },
      ] } };
      const current = await api.getBookChapterContent({ projectId, chapterId });
      await api.saveBookChapterContent({ projectId, chapterId, content: JSON.stringify(content), expectedCurrentRevisionId: current.currentRevisionId, expectedRowVersion: current.rowVersion, expectedDraftVersion: current.draft?.draftVersion ?? 0 });
    }
    const books = await api.getBookshelfBooks();
    const bookId = books.find(b => b.title === "野外山村的小屋").bookId;
    const empty = await api.createBookshelfBook({ title: "尚未落笔", synopsis: "" });
    window.location.hash = "/bookshelf";
    return { bookId, projectId, ids, emptyBookId: empty.bookId };
  });

  await mkdir(path.join(workspace, "test-results/reader-v2"), { recursive: true });
  const shot = name => page.screenshot({ path: path.join(workspace, `test-results/reader-v2/${name}.png`) });
  const selectValue = async (label, value) => {
    await page.getByRole('combobox', { name: label, exact: true }).click();
    await page.getByRole('listbox', { name: label, exact: true }).locator(`[data-value="${value}"]`).click();
  };

  const settled = () => page.waitForFunction(() => document.querySelector('.reader-stage')?.getAttribute('data-phase') === 'reading' && !document.querySelector('.reader-entry-layer'), null, { timeout: 45000 }).catch(async error => {
    console.log('Unsettled reader:', await page.evaluate(() => ({ phase: document.querySelector('.reader-stage')?.getAttribute('data-phase'), dpr: devicePixelRatio, text: document.body.innerText, captures: document.querySelectorAll('.reader-capture .reader-sheet').length, animations: document.getAnimations().map(a => ({ state: a.playState, time: a.currentTime })) })));
    await shot('unsettled'); throw error;
  });
  await page.locator(`[data-reader-entry="card-${fixture.bookId}"]`).click();
  await shot('entry');
  await settled().catch(async error => { console.log(await page.locator('body').innerText()); await shot('failure'); throw error; });
  assert.equal(await page.locator('.reader-stage').getAttribute('data-renderer'), 'webgl');
  assert.equal(await page.locator('.reader-book-dom').count(), 0, '3D resting pages must never swap to DOM');
  assert.equal(await page.locator('.reader-bottom').count(), 0, 'bottom module is completely removed');
  await shot('reading');
  await page.getByRole('button', { name: '下一页', exact: true }).last().click();
  await settled();
  await shot('spread');
  const original = await page.locator('.reader-stage').getAttribute('data-page-key');
  const edge = await page.locator('.reader-drag-edge.right').boundingBox();
  await page.mouse.move(edge.x + 12, edge.y + edge.height * .65); await page.mouse.down();
  await page.mouse.move(edge.x - 50, edge.y + edge.height * .65, { steps: 6 });
  await page.waitForTimeout(150); await page.mouse.up(); await settled();
  assert.equal(await page.locator('.reader-stage').getAttribute('data-page-key'), original);
  await page.mouse.move(edge.x + 12, edge.y + edge.height * .65); await page.mouse.down();
  await page.mouse.move(edge.x - 240, edge.y + edge.height * .65, { steps: 18 });
  await page.waitForTimeout(300); await shot('curl'); await page.mouse.up(); await settled();
  assert.notEqual(await page.locator('.reader-stage').getAttribute('data-page-key'), original);
  await page.getByRole('button', { name: '目录', exact: true }).click();
  await settled();
  await shot('toc');
  assert.equal(await page.getByRole('button', { name: '阅读第二章 · 旧信', exact: true }).count(), 1);

  await page.evaluate(() => {
    window.readerJumpFrames = [];
    const stage = document.querySelector('.reader-stage');
    window.readerJumpObserver = new MutationObserver(() => {
      if (stage.dataset.phase === 'turning' && stage.dataset.jump === 'true') window.readerJumpFrames.push({ key: stage.dataset.pageKey, direction: stage.dataset.jumpDirection, sheets: Number(stage.dataset.jumpSheets) });
    });
    window.readerJumpObserver.observe(stage, { attributes: true });
  });
  await page.getByRole('button', { name: '阅读第二章 · 旧信', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.reader-stage')?.dataset.phase === 'turning' && document.querySelector('.reader-stage')?.dataset.jump === 'true');
  await page.waitForTimeout(180); await shot('multi-page-jump');
  await settled();
  const jumpFrames = await page.evaluate(() => { window.readerJumpObserver.disconnect(); return window.readerJumpFrames; });
  assert.equal(new Set(jumpFrames.map(frame => frame.key)).size, 1, 'packet turn must keep its source spread until the whole packet lands');
  assert.ok(jumpFrames.every(frame => frame.sheets > 1), 'multiple sheets turn during the same gesture');
  assert.ok(jumpFrames.every(frame => frame.direction === '1'), 'forward jumps turn in the reading direction');

  const chapterBoundary = await page.locator('.reader-stage').getAttribute('data-page-key');
  const boundaryFolios = await page.locator('.reader-accessible-pages section').evaluateAll(elements => elements.map(el => el.getAttribute('aria-label')));
  assert.equal(boundaryFolios.length, 2);
  assert.ok(boundaryFolios.every(label => /^正文第 \d+ 页$/.test(label)), 'chapter opening must display two real consecutive body pages');
  assert.equal(Number(boundaryFolios[1].match(/\d+/)[0]) - Number(boundaryFolios[0].match(/\d+/)[0]), 1);
  await shot('chapter-continuity');
  await page.getByRole('button', { name: '上一页', exact: true }).click(); await settled();
  await page.getByRole('button', { name: '下一页', exact: true }).click(); await settled();
  assert.equal(await page.locator('.reader-stage').getAttribute('data-page-key'), chapterBoundary, 'cross-chapter navigation must be reversible');

  await page.getByRole('button', { name: '章节导航', exact: true }).click();
  await page.getByLabel('跳转正文页码').fill('4'); await page.getByRole('button', { name: '前往', exact: true }).click(); await settled();
  assert.equal(await page.locator('.reader-accessible-pages [aria-label="正文第 4 页"]').count(), 1);
  const beforeCover = await page.locator('.reader-stage').getAttribute('data-page-key');
  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: '回到封面', exact: true }).click(); await settled();
    assert.equal(await page.locator('.reader-stage').getAttribute('data-page-kind'), 'cover');
    assert.ok(await page.getByRole('button', { name: '上一页', exact: true }).isDisabled());
    if (i === 1) await shot('cover-return');
    await page.getByRole('button', { name: '打开书籍', exact: true }).click(); await settled();
    assert.equal(await page.locator('.reader-stage').getAttribute('data-page-kind'), 'front');
    await page.getByRole('button', { name: '上一页', exact: true }).click(); await settled();
    assert.equal(await page.locator('.reader-stage').getAttribute('data-page-kind'), 'cover');
    await page.getByRole('button', { name: '继续阅读', exact: true }).click(); await settled();
    assert.equal(await page.locator('.reader-stage').getAttribute('data-page-key'), beforeCover);
  }
  await page.getByRole('button', { name: '文本模式 · 选择文字', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.reader-stage')?.getAttribute('data-renderer') === 'dom');
  assert.ok(await page.locator('.reader-book-dom .reader-document').count() > 0);
  const selection = await page.locator('.reader-plain-content').evaluate(el => { const range = document.createRange(); range.selectNodeContents(el); const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range); const text = selection.toString(); selection.removeAllRanges(); return text; });
  assert.ok(selection.includes('第1段') && selection.includes('手动分页之后'), 'continuous text mode retains the entire selectable chapter');
  const saved = await page.locator('.reader-stage').getAttribute('data-page-key');
  await page.getByRole('button', { name: '返回书架', exact: true }).click();
  await page.locator(`[data-reader-entry="card-${fixture.bookId}"]`).click(); await settled();
  assert.equal(await page.locator('.reader-stage').getAttribute('data-renderer'), 'webgl', 'explicit 3D entry is not overridden by a previous text session');
  assert.equal(await page.locator('.reader-stage').getAttribute('data-page-key'), saved);
  await page.getByLabel('阅读设置', { exact: true }).click();

  assert.equal(await page.locator('.reader-settings-panel select').count(), 0, 'settings use custom lightweight menus');
  assert.equal(await page.getByLabel('减少翻页动画').count(), 0, 'last settings item is removed');
  await page.getByRole('combobox', { name: '阅读字号', exact: true }).click();
  await page.getByRole('listbox').evaluate(async el => { await Promise.all(el.getAnimations().map(animation => animation.finished)); });
  await shot('settings-menu');
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('listbox').count(), 0);
  assert.equal(await page.locator('.reader-settings[open]').count(), 1, 'Escape dismisses the select before the settings panel');
  await page.getByRole('combobox', { name: '阅读字号', exact: true }).click();
  await page.locator('.reader-toolbar-title').click();
  assert.equal(await page.getByRole('listbox').count(), 0, 'outside clicks dismiss the select');
  await selectValue('阅读字号', '26'); await page.keyboard.press('Escape');
  await page.waitForTimeout(500); await settled();
  assert.equal(await page.locator('.reader-stage').getAttribute('data-renderer'), 'webgl');
  await page.getByLabel('阅读设置', { exact: true }).click();
  await selectValue('阅读字号', '18'); await page.keyboard.press('Escape');
  await page.waitForTimeout(500); await settled();
  await page.getByLabel('阅读设置', { exact: true }).click();
  for (const zoom of ['1.15', '0.9', '1']) {
    await selectValue('显示缩放', zoom); await page.waitForTimeout(500); await settled();
    assert.equal(await page.locator('.reader-stage').getAttribute('data-renderer'), 'webgl');
    assert.ok(await page.locator('.reader-viewport').evaluate(el => el.scrollHeight <= el.clientHeight + 1));
  }
  await selectValue('阅读主题', 'dark');
  await page.getByLabel('阅读设置', { exact: true }).click(); await settled(); await shot('dark');
  await page.setViewportSize({ width: 1920, height: 1080 });
  if (process.env.STORYOS_READER_DPR) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: Number(process.env.STORYOS_READER_DPR), mobile: false });
    assert.equal(await page.evaluate(() => devicePixelRatio), Number(process.env.STORYOS_READER_DPR));
  }
  await page.waitForTimeout(700); await settled();
  assert.equal(await page.locator('.reader-stage').getAttribute('data-renderer'), 'webgl', 'large books must fit the surface budget');
  const largeImage = await shot('large-book');
  const textContrast = await application.evaluate(({ nativeImage }, base64) => {
    const image = nativeImage.createFromBuffer(Buffer.from(base64, 'base64')), { width, height } = image.getSize(), pixels = image.toBitmap();
    let min = 765, max = 0;
    for (let y = Math.floor(height * .25); y < height * .8; y += 2) for (let x = Math.floor(width * .57); x < width * .78; x += 2) {
      const i = (y * width + x) * 4, luminance = pixels[i] + pixels[i + 1] + pixels[i + 2]; min = Math.min(min, luminance); max = Math.max(max, luminance);
    }
    return max - min;
  }, largeImage.toString('base64'));
  assert.ok(textContrast > 150, 'visible book text must not be occluded by the paper block');
  await page.setViewportSize({ width: 760, height: 700 }); await page.waitForTimeout(700); await settled(); await shot('single');
  assert.ok(await page.locator('.reader-viewport').evaluate(el => el.scrollHeight <= el.clientHeight + 1), 'compact page reflows to fit');
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.waitForTimeout(100);
  await page.getByRole('button', { name: '下一页', exact: true }).last().click(); await settled();
  assert.equal(await page.locator('.reader-book-dom').count(), 0, 'reduced motion still retains one rendering pipeline');
  await page.evaluate(() => document.querySelector('.reader-stage canvas').getContext('webgl2').getExtension('WEBGL_lose_context').loseContext());
  await page.waitForFunction(() => document.querySelector('.reader-stage')?.getAttribute('data-renderer') === 'dom');
  await page.setViewportSize({ width: 1280, height: 900 });
  for (let i = 0; i < 5; i++) {
    await page.getByRole('button', { name: '返回书架', exact: true }).click();
    await page.locator(`[data-reader-entry="card-${fixture.bookId}"]`).click(); await settled();
  }
  await page.getByRole('button', { name: '返回书架', exact: true }).click();
  await page.locator(`[data-reader-entry="card-${fixture.emptyBookId}"]`).click(); await settled();
  assert.ok(await page.getByRole('button', { name: '回到目录', exact: true }).count() > 0, 'empty book has a navigable completion state');
  await page.getByRole('button', { name: '下一页', exact: true }).last().click(); await settled();
  assert.match(await page.locator('.reader-stage').getAttribute('data-page-key'), /back/);
  await page.getByRole('button', { name: '上一页', exact: true }).last().click(); await settled();
  await page.locator('.reader-toolbar').getByRole('button', { name: '返回书架', exact: true }).click();
  await page.evaluate(() => {
    const api = window.storyOSAgent, open = api.openBookReader, close = api.closeBookReader;
    window.canceledReaderSessions = { opened: [], closed: [] };
    api.openBookReader = async bookId => { await new Promise(resolve => setTimeout(resolve, 3000)); const snapshot = await open(bookId); window.canceledReaderSessions.opened.push(snapshot.snapshotId); return snapshot; };
    api.closeBookReader = async id => { window.canceledReaderSessions.closed.push(id); return close(id); };
  });
  await page.locator(`[data-reader-entry="card-${fixture.bookId}"]`).click();
  await page.locator('.reader-entry-layer').getByRole('button', { name: '取消并返回书架' }).click();
  await page.waitForTimeout(1500);
  assert.equal(await page.locator('.reader-entry-layer').count(), 0);
  const canceled = await page.evaluate(() => window.canceledReaderSessions);
  assert.ok(canceled.opened.length > 0 && canceled.opened.every(id => canceled.closed.includes(id)), 'late sessions created after cancellation must close');
  assert.deepEqual(errors, []);
  console.log('V2 E2E passed: one-click entry/resume, persistent surfaces, drag revert/commit, printed TOC, global page jump, text mode, responsive reflow, reduced motion, context loss and repeated sessions.');
} finally { await application?.close(); server?.kill(); }




