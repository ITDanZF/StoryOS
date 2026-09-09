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
    await api.createBookshelfBook({ title: "导出动效验证", synopsis: "验证状态转换与关闭生命周期。" });
    const originalPrepare = api.prepareBookshelfBookExport;
    const originalCommit = api.commitBookshelfBookExport;
    const test = window.exportMotionTest = { pending: {}, cancel: false, fail: false, revealFail: false, cancellations: 0 };
    const hold = key => new Promise(resolve => { test.pending[key] = () => { delete test.pending[key]; resolve(); }; });
    api.prepareBookshelfBookExport = async request => { await hold("prepare"); return originalPrepare(request); };
    window.storyOSWindow.saveFile = async () => { await hold("destination"); return test.cancel ? null : "/preview/导出动效验证.storyos-book"; };
    api.commitBookshelfBookExport = async request => {
      await hold("export");
      if (test.fail) throw new Error("验证用写入失败");
      return originalCommit(request);
    };
    api.cancelBookshelfBookExport = async () => { test.cancellations++; };
    window.storyOSWindow.revealFile = async () => { await hold("reveal"); if (test.revealFail) throw new Error("验证用文件夹打开失败"); };
    window.location.hash = "/bookshelf";
  });
  await mkdir("test-results/export-motion", { recursive: true });
  const panel = page.locator(".export-dialog-panel");
  const settle = () => panel.evaluate(async el => {
    await Promise.all(el.getAnimations({ subtree: true })
      .filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity)
      .map(animation => animation.finished.catch(() => {})));
  });
  const release = async key => {
    await page.waitForFunction(name => Boolean(window.exportMotionTest.pending[name]), key);
    await page.evaluate(name => window.exportMotionTest.pending[name](), key);
  };
  const open = async () => {
    await page.locator("[data-book-menu]").first().click();
    await page.getByRole("menuitem", { name: "导出书籍" }).click();
    await panel.waitFor();
    await settle();
  };
  const select = async () => {
    await page.getByRole("button", { name: /StoryOS 完整备份/ }).click();
    await page.getByText("正在准备导出快照", { exact: true }).waitFor();
    await settle();
  };
  const save = async () => {
    await release("prepare");
    await page.getByText("选择文件保存位置", { exact: true }).waitFor();
    await release("destination");
    await page.getByText("正在生成 StoryOS 完整备份", { exact: true }).waitFor();
    await release("export");
  };

  await open();
  await page.screenshot({ path: "test-results/export-motion/formats.png" });
  const chooseBounds = await panel.boundingBox();
  await select();
  const progressBounds = await panel.boundingBox();
  assert.ok(progressBounds.width < chooseBounds.width && progressBounds.height < chooseBounds.height);
  await page.evaluate(() => { window.exportMotionTest.spinner = document.querySelector(".export-progress-icon"); });
  await page.keyboard.press("Escape");
  assert.equal(await panel.count(), 1, "Busy export cannot be dismissed");
  await release("prepare");
  await page.getByText("选择文件保存位置", { exact: true }).waitFor();
  assert.ok(await page.evaluate(() => window.exportMotionTest.spinner === document.querySelector(".export-progress-icon")), "Progress stages retain their spinner");
  await settle();
  await page.screenshot({ path: "test-results/export-motion/progress.png" });
  await release("destination");
  await page.getByText("正在生成 StoryOS 完整备份", { exact: true }).waitFor();
  await release("export");
  await page.getByText("导出成功", { exact: true }).waitFor();
  await settle();
  assert.ok(await panel.evaluate(el => el.contains(document.activeElement)), "Step changes retain dialog focus");
  await page.screenshot({ path: "test-results/export-motion/success.png" });
  await page.evaluate(() => { window.exportMotionTest.revealFail = true; });
  await page.getByRole("button", { name: "在文件夹中显示" }).click();
  assert.ok(await page.getByRole("button", { name: "正在打开文件夹" }).isDisabled());
  await release("reveal");
  await page.getByRole("alert").waitFor();
  await page.getByRole("button", { name: "完成", exact: true }).click();
  assert.equal(await panel.getAttribute("data-closing"), "true", "Exit is animated before unmount");
  assert.ok(await panel.evaluate(el => el.inert), "Closing dialog cannot receive repeat actions");
  await panel.waitFor({ state: "detached" });
  assert.equal(await page.evaluate(() => document.activeElement?.hasAttribute("data-book-menu")), true);

  // Native save cancellation returns to the format grid and releases the prepared export.
  await open();
  await page.evaluate(() => { window.exportMotionTest.cancel = true; });
  await select(); await release("prepare"); await release("destination");
  await page.getByText("选择导出格式", { exact: true }).waitFor(); await settle();
  assert.equal(await page.evaluate(() => window.exportMotionTest.cancellations), 1);
  await page.evaluate(() => { window.exportMotionTest.cancel = false; window.exportMotionTest.fail = true; });
  await select(); await save();
  await page.getByText("无法完成导出", { exact: true }).waitFor(); await settle();
  await page.getByRole("button", { name: "重新选择格式" }).click();
  await page.getByText("选择导出格式", { exact: true }).waitFor(); await settle();
  await page.keyboard.press("Escape"); await panel.waitFor({ state: "detached" });

  // Narrow windows stay scrollable; reduced motion skips decorative movement.
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(390, 600));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open();
  assert.equal(await panel.evaluate(el => el.getAnimations({ subtree: true }).length), 0);
  await page.evaluate(() => { window.exportMotionTest.fail = false; });
  await select(); await save();
  await page.getByText("导出成功", { exact: true }).waitFor(); await settle();
  const bounds = await panel.boundingBox();
  assert.ok(bounds.x >= 11 && bounds.y >= 11 && bounds.x + bounds.width <= 379 && bounds.y + bounds.height <= 589);
  await page.screenshot({ path: "test-results/export-motion/success-narrow.png" });
  await page.getByRole("button", { name: "完成", exact: true }).click(); await panel.waitFor({ state: "detached" });
  assert.deepEqual(errors, []);
  console.log("Export motion passed: open/close, stable progress, success, reveal feedback, cancellation, retry, focus restoration, narrow viewport and reduced motion.");
} finally { await app.close(); }
