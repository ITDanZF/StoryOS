import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { _electron as electron } from "playwright";

const require = createRequire(import.meta.url);
const app = await electron.launch({
  executablePath: require("electron"),
  args: [path.resolve("scripts/electron-reader-preview.cjs")],
  env: { ...process.env, STORYOS_TEST_URL: process.env.STORYOS_READER_TEST_URL ?? "http://127.0.0.1:4319/?preview=1" },
});
try {
  const page = await app.firstWindow();
  page.setDefaultTimeout(20000);
  const errors = [];
  page.on("pageerror", error => { errors.push(String(error)); console.error(error.stack); });
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1600, 1000));
  await page.waitForFunction(() => Boolean(window.storyOSAgent));
  await page.evaluate(async () => {
    localStorage.removeItem("storyos:book-catalog-width");
    localStorage.removeItem("storyos:book-assistant-width");
    const { setThemePreference } = await import("/src/renderer/app/theme/themeStore.ts");
    setThemePreference({ version: 1, appearance: "light", paletteId: "default" });
  });
  await mkdir("test-results/book-workspace-ui", { recursive: true });
  await page.getByRole("button", { name: "项目操作", exact: true }).click();
  await page.getByRole("button", { name: "新建项目", exact: true }).click();
  await page.getByPlaceholder("例如：我的故事").fill("工作区回归");
  await page.getByRole("button", { name: "创建项目", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "detached" });
  const fixture = await page.evaluate(async () => {
    const api = window.storyOSAgent;
    const result = await api.getWorkspaceSnapshot();
    const projectId = result.projects.activeProjectId;
    await api.createBook({ projectId, title: "工作区验证", synopsis: "正文会话与主题独立", status: "writing" });
    const volume = await api.createBookVolume({ projectId, title: "验证分卷" });
    const book = await api.createBookChapter({ projectId, volumeId: volume.volumes[0].id, title: "验证章节" });
    location.hash = `/projects/${projectId}/book`;
    return { projectId, chapterId: book.chapters.at(-1).id };
  });
  await page.getByTitle("验证章节", { exact: true }).click().catch(async error => {
    console.log(await page.locator("body").innerText());
    await page.screenshot({ path: "test-results/book-workspace-ui/failure.png" });
    throw error;
  });
  const editor = page.locator('[contenteditable="true"][aria-label="章节正文"]');
  await editor.fill("第一段，主题切换前的正文。");
  await page.keyboard.press("End");
  await page.keyboard.type("Keep history.");
  const beforeTheme = await editor.innerText();
  await editor.evaluate(el => { window.editorBeforeTheme = el; });
  await page.evaluate(async () => {
    const { setThemePreference } = await import("/src/renderer/app/theme/themeStore.ts");
    setThemePreference({ version: 1, appearance: "dark", paletteId: "default" });
  });
  assert.equal(await editor.evaluate(el => el === window.editorBeforeTheme), true, "theme preserves editor identity");
  assert.equal(await editor.innerText(), beforeTheme);
  const undo = page.getByRole("button", { name: /^撤销 / });
  assert.equal(await undo.isEnabled(), true, "theme preserves undo history");
  await undo.click();
  assert.notEqual(await editor.innerText(), beforeTheme);
  await page.getByRole("button", { name: /^重做 / }).click();
  assert.equal(await editor.innerText(), beforeTheme);

  await editor.click();
  await page.keyboard.press("Control+a");
  const bold = page.getByRole("button", { name: /^加粗 / });
  await bold.focus();
  await page.keyboard.press("Enter");
  assert.ok(await editor.locator("strong").count() > 0, "toolbar works from keyboard");
  await page.getByRole("combobox", { name: "段落样式", exact: true }).click();
  await page.getByRole("listbox", { name: "段落样式", exact: true }).locator('[data-value="heading-2"]').click();
  assert.ok(await editor.locator("h2").count() > 0, "shared select preserves editor selection");

  const catalog = page.getByRole("separator", { name: "调整目录宽度" });
  const initialWidth = Number(await catalog.getAttribute("aria-valuenow"));
  await catalog.focus();
  await page.keyboard.press("ArrowRight");
  assert.equal(Number(await catalog.getAttribute("aria-valuenow")), initialWidth + 16);
  await page.keyboard.press("End");
  assert.equal(await catalog.getAttribute("aria-valuenow"), await catalog.getAttribute("aria-valuemax"));
  await page.getByRole("button", { name: "显示或隐藏目录", exact: true }).click();
  await page.getByRole("button", { name: "显示或隐藏目录", exact: true }).click();
  assert.equal(await catalog.getAttribute("aria-valuenow"), "360");
  assert.equal(await editor.evaluate(el => el === window.editorBeforeTheme), true, "layout preserves editor identity");
  await page.screenshot({ path: "test-results/book-workspace-ui/workspace-dark.png" });

  const beforeCancel = await editor.innerText();
  await page.getByRole("button", { name: "删除章节“验证章节”", exact: true }).click();
  await page.getByRole("alertdialog").waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("alertdialog").waitFor({ state: "detached" });
  assert.equal(await page.getByRole("button", { name: "删除章节“验证章节”", exact: true }).evaluate(el => el === document.activeElement), true);
  assert.equal(await editor.innerText(), beforeCancel);

  await editor.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.insertText("离开页面前新增。");
  const finalText = await editor.innerText();
  await page.evaluate(() => { location.hash = "/settings"; });
  await page.getByRole("combobox", { name: "界面模式" }).waitFor();
  const saved = await page.evaluate(async ({ projectId, chapterId }) => window.storyOSAgent.getBookChapterContent({ projectId, chapterId }), fixture);
  assert.ok(saved.content.includes("离开页面前新增。"), "route exit flushes pending content");
  await page.evaluate(projectId => { location.hash = `/projects/${projectId}/book`; }, fixture.projectId);
  await page.getByTitle("验证章节", { exact: true }).click();
  await editor.waitFor();
  assert.equal(await editor.innerText(), finalText, "reopened chapter restores saved content");
  assert.deepEqual(errors, []);
  console.log("Book workspace UI checks passed: stable editor/undo across themes and layout, keyboard toolbar, selection formatting, persisted width, delete-cancel focus and route save/restore.");
} finally {
  await app.close();
}
