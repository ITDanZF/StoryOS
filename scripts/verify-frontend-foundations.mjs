import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { _electron as electron } from "playwright";

const require = createRequire(import.meta.url);
const app = await electron.launch({ executablePath: require("electron"), args: [path.resolve("scripts/electron-reader-preview.cjs")],
  env: { ...process.env, STORYOS_TEST_URL: process.env.STORYOS_READER_TEST_URL ?? "http://127.0.0.1:4319/?preview=1" } });
try {
  const page = await app.firstWindow(); page.setDefaultTimeout(15000);
  const errors = []; page.on("pageerror", error => errors.push(String(error)));
  page.on("dialog", dialog => { errors.push(`Unexpected native dialog: ${dialog.type()}`); void dialog.dismiss().catch(() => {}); });
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1440, 1000));
  await page.waitForFunction(() => Boolean(window.storyOSAgent));
  await mkdir("test-results/frontend-foundations", { recursive: true });
  await page.evaluate(async () => {
    await window.storyOSAgent.createBookshelfBook({ title: "主题回归作品", synopsis: "主题切换不会改变封面和正文。" });
    location.hash = "/settings";
  });
  const appearance = page.getByRole("combobox", { name: "界面模式" });
  const selectValue = async (label, value) => {
    await page.getByRole("combobox", { name: label, exact: true }).click();
    await page.getByRole("listbox", { name: label, exact: true }).locator(`[data-value="${value}"]`).click();
  };
  await selectValue("界面模式", "light");
  assert.equal(await page.locator("select").count(), 0, "settings use custom dropdowns");
  await page.locator("label").filter({ hasText: /^界面模式$/ }).click();
  await page.getByRole("listbox", { name: "界面模式", exact: true }).waitFor();
  await page.screenshot({ path: "test-results/frontend-foundations/settings-dropdown-light.png" });
  await page.keyboard.press("Escape");
  assert.equal(await appearance.evaluate(el => el === document.activeElement), true);
  await selectValue("模型服务", "qwen");
  assert.equal(await page.getByLabel("模型名称", { exact: true }).inputValue(), "qwen-plus");
  assert.equal(await page.getByLabel("接口地址 Base URL", { exact: true }).inputValue(), "https://dashscope.aliyuncs.com/compatible-mode/v1");
  await page.getByRole("button", { name: "撤销修改", exact: true }).click();
  await page.getByLabel("模型名称", { exact: true }).fill("unsaved-model");
  await appearance.focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  assert.equal(await page.getByLabel("模型名称", { exact: true }).inputValue(), "unsaved-model");
  assert.equal(await page.evaluate(() => document.documentElement.dataset.appearance), "dark");
  await page.waitForFunction(() => getComputedStyle(document.querySelector('input[name="modelName"]')).backgroundColor === "rgb(32, 33, 36)");
  await page.screenshot({ path: "test-results/frontend-foundations/settings-dark.png" });
  await appearance.click();
  assert.equal(await page.getByRole("listbox", { name: "界面模式", exact: true }).evaluate(el => getComputedStyle(el).backgroundColor), "rgb(43, 44, 49)");
  await page.screenshot({ path: "test-results/frontend-foundations/settings-dropdown-dark.png" });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "返回工作区", exact: true }).click();
  await page.getByRole("dialog").waitFor();
  await page.getByRole("button", { name: "继续编辑", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "detached" });
  assert.equal(await page.getByLabel("模型名称", { exact: true }).inputValue(), "unsaved-model");
  await page.getByRole("button", { name: "撤销修改", exact: true }).click();
  await page.waitForFunction(() => Array.from(document.querySelectorAll("button")).find(el => el.textContent === "撤销修改")?.disabled);
  await page.reload(); await appearance.waitFor();
  assert.equal((await appearance.innerText()).trim(), "深色", "theme survives restart");
  await page.evaluate(async () => {
    // Preview business data is intentionally in-memory; reload only preserves UI preferences.
    await window.storyOSAgent.createBookshelfBook({ title: "主题回归作品", synopsis: "主题切换不会改变封面和正文。" });
    location.hash = "/bookshelf";
  });
  await page.getByRole("searchbox", { name: "搜索书籍" }).waitFor();
  const coverColor = await page.locator(".book-cover-art").first().evaluate(el => getComputedStyle(el).color);
  await page.screenshot({ path: "test-results/frontend-foundations/bookshelf-dark.png" });
  await page.getByRole("button", { name: "新建书籍", exact: true }).first().click();
  const dialog = page.getByRole("dialog"); await dialog.waitFor();
  assert.equal(await dialog.evaluate(el => getComputedStyle(el).backgroundColor), "rgb(36, 37, 41)");
  await page.getByRole("textbox", { name: "书籍名称", exact: true }).fill("连续弹窗验证");
  await page.getByRole("button", { name: "创建书籍", exact: true }).click();
  await page.getByRole("heading", { name: /为《连续弹窗验证》创建写作项目/ }).waitFor();
  assert.equal(await page.getByRole("dialog").count(), 1, "next dialog waits for previous exit");
  await page.keyboard.press("Escape"); await page.getByRole("dialog").waitFor({ state: "detached" });
  await page.evaluate(async () => {
    const { setThemePreference } = await import("/src/renderer/app/theme/themeStore.ts");
    setThemePreference({ version: 1, appearance: "light", paletteId: "default" });
  });
  assert.equal(await page.locator(".book-cover-art").first().evaluate(el => getComputedStyle(el).color), coverColor, "application mode must not recolor cover text");
  await page.screenshot({ path: "test-results/frontend-foundations/bookshelf-light.png" });
  await page.evaluate(async () => {
    const { setThemePreference } = await import("/src/renderer/app/theme/themeStore.ts");
    setThemePreference({ version: 1, appearance: "system", paletteId: "default" });
  });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.waitForFunction(() => document.documentElement.dataset.appearance === "dark");
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.waitForFunction(() => document.documentElement.dataset.appearance === "light");
  await page.getByRole("button", { name: "导入书籍", exact: true }).first().click();
  await page.getByRole("dialog").waitFor();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(390, 600));
  const bounds = await page.getByRole("dialog").boundingBox();
  assert.ok(bounds.x >= 11 && bounds.y >= 11 && bounds.x + bounds.width <= 379 && bounds.y + bounds.height <= 589);
  await page.screenshot({ path: "test-results/frontend-foundations/import-narrow.png" });
  await page.keyboard.press("Escape"); await page.getByRole("dialog").waitFor({ state: "detached" });
  assert.deepEqual(errors, []);
  console.log("Frontend UI checks passed: theme persistence/system mode, unsaved configuration, portaled dialog theme, chained dialogs, cover independence, narrow import and reduced motion.");
} finally { await app.close(); }
