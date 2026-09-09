import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { _electron as electron } from "playwright";

const require = createRequire(import.meta.url);
const app = await electron.launch({ executablePath: require("electron"),
  args: [path.resolve("scripts/electron-reader-preview.cjs")],
  env: { ...process.env, STORYOS_TEST_URL: process.env.STORYOS_READER_TEST_URL ?? "http://127.0.0.1:4319/?preview=1" } });
try {
  const page = await app.firstWindow();
  page.setDefaultTimeout(12000);
  const errors = [];
  page.on("pageerror", error => errors.push(String(error)));
  await page.waitForFunction(() => Boolean(window.storyOSAgent));
  await page.evaluate(async () => {
    const api = window.storyOSAgent;
    await api.createProject({ name: "公共动效验证", parentPath: "/preview", createAgentsFile: false });
    await api.createBookshelfBook({ title: "公共动效测试作品", synopsis: "不会写入真实书库。" });
    const rename = api.renameProject;
    window.sharedMotionTest = { renamed: 0, release: null };
    api.renameProject = async request => {
      window.sharedMotionTest.renamed++;
      await new Promise(resolve => { window.sharedMotionTest.release = resolve; });
      return rename(request);
    };
    window.location.hash = "/bookshelf";
  });
  await mkdir("test-results/shared-motion", { recursive: true });
  const animatedPage = page.locator(".motion-page");
  const settlePage = () => animatedPage.evaluate(async el => { await Promise.all(el.getAnimations().map(animation => animation.finished.catch(() => {}))); });
  const panel = page.locator(".motion-dialog");
  const settlePanel = () => panel.evaluate(async el => { await Promise.all(el.getAnimations({ subtree: true }).map(animation => animation.finished.catch(() => {}))); });
  await page.getByRole("searchbox", { name: "搜索书籍" }).fill("保留搜索值");
  await settlePage();
  await page.evaluate(() => {
    window.sharedMotionTest.shelf = document.querySelector(".shelf-page");
    window.location.hash = "/bookshelf?motion-check=1";
  });
  await page.waitForURL(/motion-check=1/);
  assert.equal(await page.getByRole("searchbox", { name: "搜索书籍" }).inputValue(), "保留搜索值");
  assert.ok(await page.evaluate(() => document.querySelector(".shelf-page") === window.sharedMotionTest.shelf));
  assert.equal(await animatedPage.evaluate(el => el.getAnimations().length), 0, "Query-only changes must not replay page motion");

  const openRename = async name => {
    await page.getByRole("button", { name: `${name} 项目操作`, exact: true }).click();
    await page.getByRole("menuitem", { name: "重命名", exact: true }).click();
    await panel.waitFor(); await settlePanel();
  };
  await openRename("公共动效验证");
  assert.ok(await panel.evaluate(el => el.closest(".motion-dialog-overlay").parentElement === document.body), "Dialogs use a body portal");
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")), "新的项目名称", "Autofocus is preserved");
  await page.getByRole("textbox", { name: "新的项目名称" }).fill("公共动效已验证");
  await page.getByRole("button", { name: "确认重命名" }).focus();
  await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")), "关闭重命名项目弹窗");
  await page.keyboard.press("Shift+Tab");
  assert.equal(await page.evaluate(() => document.activeElement?.textContent), "确认重命名");
  await page.screenshot({ path: "test-results/shared-motion/rename.png" });
  await page.keyboard.press("Escape");
  assert.equal(await panel.getAttribute("data-closing"), "true");
  await panel.waitFor({ state: "detached" });
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")), "公共动效验证 项目操作");

  await openRename("公共动效验证");
  await page.getByRole("textbox", { name: "新的项目名称" }).fill("公共动效已验证");
  await page.getByRole("button", { name: "确认重命名" }).click();
  await page.waitForFunction(() => Boolean(window.sharedMotionTest.release));
  await page.keyboard.press("Escape");
  assert.equal(await panel.getAttribute("data-closing"), "false", "Busy form cannot be dismissed");
  await page.evaluate(() => window.sharedMotionTest.release());
  await panel.waitFor({ state: "detached" });
  assert.equal(await page.evaluate(() => window.sharedMotionTest.renamed), 1);
  await page.getByRole("button", { name: "公共动效已验证 项目操作", exact: true }).waitFor();

  // Pause a route transition, then navigate again: cancellation must not leave invisible content.
  await page.evaluate(() => { window.location.hash = "/about"; });
  await page.getByRole("heading", { name: "关于我们", exact: true }).waitFor();
  await animatedPage.evaluate(el => { el.getAnimations().forEach(animation => { animation.pause(); animation.currentTime = 50; }); });
  await page.evaluate(() => { window.location.hash = "/bookshelf"; });
  await page.getByRole("searchbox", { name: "搜索书籍" }).waitFor(); await settlePage();
  assert.equal(await animatedPage.evaluate(el => getComputedStyle(el).opacity), "1");
  assert.equal(await animatedPage.evaluate(el => getComputedStyle(el).transform), "none");

  await openRename("公共动效已验证");
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(390, 600));
  const bounds = await panel.boundingBox();
  assert.ok(bounds.x >= 11 && bounds.y >= 11 && bounds.x + bounds.width <= 379 && bounds.y + bounds.height <= 589);
  await page.screenshot({ path: "test-results/shared-motion/rename-narrow.png" });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "取消", exact: true }).click(); await panel.waitFor({ state: "detached" });
  await page.evaluate(() => { window.location.hash = "/about"; });
  await page.getByRole("heading", { name: "关于我们", exact: true }).waitFor(); await settlePage();
  assert.equal(await animatedPage.evaluate(el => el.getAnimations().length), 0);
  assert.deepEqual(errors, []);
  console.log("Shared motion passed: route state retention, interrupted transitions, ordinary modal, autofocus, Tab trap, busy guard, submit/close, focus restore, narrow viewport and reduced motion.");
} finally { await app.close(); }
