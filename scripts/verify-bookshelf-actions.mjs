import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { _electron as electron } from "playwright";

const require = createRequire(import.meta.url);
const application = await electron.launch({ executablePath: require("electron"),
  args: [path.resolve("scripts/electron-reader-preview.cjs")],
  env: { ...process.env, STORYOS_TEST_URL: process.env.STORYOS_READER_TEST_URL ?? "http://127.0.0.1:4319/?preview=1" } });
try {
  const page = await application.firstWindow(); page.setDefaultTimeout(12000);
  const errors = []; page.on("pageerror", error => errors.push(String(error)));
  await application.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0]; window.setContentSize(1536, 1000); window.webContents.setZoomFactor(1);
  });
  await page.waitForFunction(() => Boolean(window.storyOSAgent));
  const fixture = await page.evaluate(async () => {
    const api = window.storyOSAgent;
    const project = await api.createProject({ name: "书架菜单验证", parentPath: "/preview", createAgentsFile: false });
    await api.createBook({ projectId: project.projects.activeProjectId, title: "野外山村的小屋", synopsis: "晚风穿过树林，远处的灯火照亮了回家的路。", status: "planning" });
    const linked = (await api.getBookshelfBooks()).find(book => book.title === "野外山村的小屋");
    const standalone = [];
    for (const title of ["写给明天的信", "很长的书名需要两行展示也不应遮挡右侧管理入口或底部阅读按钮", "渡口", "静夜", "回家的旅人"]) {
      standalone.push(await api.createBookshelfBook({ title, synopsis: "一段尚未写完的故事，在新的书页上继续生长。" }));
    }
    window.location.hash = "/bookshelf";
    return { linked: linked.bookId, standalone: standalone[0].bookId };
  });
  const trigger = page.locator(`[data-book-menu="${fixture.linked}"]`);
  await trigger.waitFor(); await mkdir("test-results/bookshelf-actions", { recursive: true });
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector(".shelf-grid")).gridTemplateColumns.split(" ").length), 3);
  const settleMenu = () => page.getByRole('menu').evaluate(async el => { await Promise.all(el.getAnimations().map(animation => animation.finished.catch(() => {}))); });
  assert.equal(await trigger.evaluate(el => getComputedStyle(el).cursor), 'pointer');
  await trigger.click(); await settleMenu();
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('role')), 'menu', 'pointer opening must not highlight the first item');
  const anchored = await page.getByRole('menu').boundingBox(), anchor = await trigger.boundingBox();
  assert.ok(anchored.x >= anchor.x + anchor.width + 9, 'menu opens outside the trigger when there is room');
  await page.screenshot({ path: 'test-results/bookshelf-actions/pointer-menu.png' });
  const outside = page.locator('.shelf-section-heading').first();
  await outside.evaluate(el => el.addEventListener('pointerdown', event => event.stopPropagation(), { once: true }));
  await outside.click();
  await page.getByRole('menu').waitFor({ state: 'hidden' });
  await trigger.click(); await trigger.click();
  await page.getByRole('menu').waitFor({ state: 'hidden' });
  await page.waitForTimeout(150);
  await trigger.focus(); await page.keyboard.press("Enter");
  await page.getByRole("menu").waitFor();
  assert.equal(await page.locator('.shelf-action-menu [role="menuitem"]').count(), 3);
  assert.equal(await page.evaluate(() => document.activeElement?.textContent), "导出书籍");
  await page.keyboard.press("End");
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-disabled")), "true");
  await page.keyboard.press("Enter");
  assert.equal(await page.getByRole("menu").count(), 1, "disabled recycle must not execute");
  await settleMenu(); await page.screenshot({ path: "test-results/bookshelf-actions/grid-menu.png" });
  await page.keyboard.press("Home"); await page.keyboard.press("ArrowDown"); await page.keyboard.press("Enter");
  await page.getByRole("dialog").waitFor();
  assert.equal(await page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]'))), true);
  await page.keyboard.press("Escape");
  await page.waitForFunction(id => document.activeElement?.getAttribute("data-book-menu") === id, fixture.linked);
  await page.keyboard.press("ArrowDown"); await page.keyboard.press("Enter");
  await page.getByRole("dialog").waitFor(); await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
  await trigger.click(); await page.keyboard.press("Tab");
  assert.equal(await page.getByRole("menu").count(), 0);
  assert.ok(await page.evaluate(() => document.activeElement !== document.body), "Tab must retain keyboard position");
  await trigger.click(); await page.locator(`[data-book-menu="${fixture.standalone}"]`).click();
  assert.equal(await page.getByRole("menu").count(), 1);
  assert.equal(await page.getByRole("menuitem", { name: "移入回收站" }).getAttribute("aria-disabled"), "false");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "列表视图", exact: true }).click();
  await trigger.click(); await settleMenu(); await page.screenshot({ path: "test-results/bookshelf-actions/list-menu.png" });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "网格视图", exact: true }).click();
  for (const zoom of [1.25, 1.5, 2]) {
    await application.evaluate(({ BrowserWindow }, factor) => BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(factor), zoom);
    await trigger.scrollIntoViewIfNeeded(); await trigger.click();
    await settleMenu();
    const bounds = await page.getByRole("menu").boundingBox();
    const size = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, overflow: document.documentElement.scrollWidth > innerWidth }));
    assert.ok(bounds.x >= 11 && bounds.y >= 11 && bounds.x + bounds.width <= size.width - 11 && bounds.y + bounds.height <= size.height - 11, "menu must fit viewport");
    assert.equal(size.overflow, false, "zoom must not introduce page horizontal scrolling");
    // Native capture keeps the physical viewport intact when Electron page zoom changes.
    const capture = await application.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toDataURL());
    await writeFile(`test-results/bookshelf-actions/zoom-${zoom}.png`, Buffer.from(capture.split(",")[1], "base64"));
    console.log("Zoom layout", zoom, await page.evaluate(() => ({ width: innerWidth, height: innerHeight, columns: getComputedStyle(document.querySelector(".shelf-grid")).gridTemplateColumns })));
    await page.keyboard.press("Escape");
  }
  assert.deepEqual(errors, []);
  console.log("Bookshelf actions passed: keyboard menu, disabled recycle, single portal, dialog focus/return, grid/list, 125–200% application zoom and viewport bounds.");
} finally {
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.webContents.setZoomFactor(1)).catch(() => {});
  await application.close();
}

