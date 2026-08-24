import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { _electron as electron } from "playwright";

const require = createRequire(import.meta.url);
const workspace = path.resolve(import.meta.dirname, "..");
const port = 4317;
const url = `http://127.0.0.1:${port}/?preview=1`;
const server = spawn(
  process.execPath,
  [path.join(workspace, "node_modules/vite/bin/vite.js"), "--config", "vite.renderer.config.ts", "--host", "127.0.0.1", "--port", String(port)],
  { cwd: workspace, stdio: "pipe" },
);

async function waitForServer() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Vite has not started yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Timed out waiting for the pagination preview server.");
}

let application;
try {
  await waitForServer();
  application = await electron.launch({
    executablePath: require("electron"),
    args: [path.join(workspace, "scripts/electron-pagination-preview.cjs")],
    env: { ...process.env, STORYOS_TEST_URL: url },
  });
  const page = await application.firstWindow();
  await page.waitForLoadState("domcontentloaded");
  await page.getByRole("button", { name: "项目操作" }).click();
  await page.getByRole("button", { name: "新建空白项目" }).click();
  await page.getByLabel("项目名称").fill("分页测试项目");
  await page.getByRole("button", { name: "创建项目" }).click();
  await page.waitForTimeout(100);
  await page.getByRole("button", { name: /书籍工作区/ }).click();
  await page.waitForTimeout(100);
  await page.getByRole("textbox", { name: "书籍名称" }).fill("分页测试书");
  await page.getByRole("textbox", { name: "书籍简介" }).fill("验证分页内核");
  await page.waitForTimeout(1_500);
  await page.getByRole("button", { name: "新建分卷" }).click();
  await page.getByRole("button", { name: "在“第一卷”下新建章节" }).click();
  await page.waitForTimeout(100);

  const paragraphs = Array.from({ length: 48 }, (_, index) =>
    `第${index + 1}段，夜色沿着旧城墙缓慢铺开，风从河面带来潮湿的气息。人物停下脚步，重新确认远处那盏微弱却始终没有熄灭的灯。`);
  const editor = page.locator('[contenteditable="true"][aria-label="章节正文"]');
  await page.evaluate(() => {
    const trace = {
      failedStatuses: 0,
      maxPageCount: 0,
      maxStageHeight: 0,
      visibleInternalStatuses: 0,
    };
    const sample = () => {
      const stage = document.querySelector(".chapter-pagination-stage");
      const status = document.querySelector("[data-pagination-status]");
      trace.maxPageCount = Math.max(
        trace.maxPageCount,
        document.querySelectorAll(".chapter-pagination-sheet").length,
      );
      if (stage instanceof HTMLElement) {
        trace.maxStageHeight = Math.max(trace.maxStageHeight, stage.offsetHeight);
      }
      if (status instanceof HTMLElement) {
        if (status.dataset.paginationStatus === "failed") {
          trace.failedStatuses += 1;
        }
        if (/正在排版|排版失败/.test(status.innerText)) {
          trace.visibleInternalStatuses += 1;
        }
      }
    };
    new MutationObserver(sample).observe(document.body, {
      attributes: true,
      childList: true,
      subtree: true,
    });
    window.__paginationTrace = trace;
    sample();
  });
  const streamContentViolations = [];
  for (let count = 1; count <= paragraphs.length; count += 1) {
    await editor.fill(paragraphs.slice(0, count).join("\n\n"));
    await page.waitForTimeout(20);
    const layoutState = await page.evaluate(() => {
      const editorRoot = document.querySelector(".chapter-rich-text");
      const stage = document.querySelector(".chapter-pagination-stage");
      if (!(editorRoot instanceof HTMLElement) ||
          !(stage instanceof HTMLElement)) {
        return { overflow: Number.POSITIVE_INFINITY };
      }
      const contentHeight = editorRoot.lastElementChild instanceof HTMLElement
          ? editorRoot.lastElementChild.getBoundingClientRect().bottom -
            editorRoot.getBoundingClientRect().top +
            Number.parseFloat(getComputedStyle(editorRoot.lastElementChild).marginBottom) +
            Number.parseFloat(getComputedStyle(editorRoot).paddingBottom)
          : 0;
      return {
        contentOverflow: contentHeight - stage.offsetHeight,
        stageHeight: stage.offsetHeight,
        pageCount: document.querySelectorAll(".chapter-pagination-sheet").length,
      };
    });
    if (layoutState.contentOverflow > 1) {
      streamContentViolations.push({ count, ...layoutState });
    }
  }
  assert.deepEqual(streamContentViolations, []);

  const waitForStablePagination = async () => {
    await page.waitForFunction(() => {
      return document.querySelectorAll(".chapter-pagination-sheet").length >= 3 &&
        document.querySelector('[data-pagination-status="ready"]') !== null;
    }, undefined, { timeout: 15_000 });
  };
  const readGeometry = () => page.evaluate(() => {
    const editorRoot = document.querySelector(".chapter-rich-text");
    const stage = document.querySelector(".chapter-pagination-stage");
    const sheets = Array.from(document.querySelectorAll(".chapter-pagination-sheet"));
    const replica = document.querySelector(".book-pagination-rich-text");
    if (!(editorRoot instanceof HTMLElement) ||
        !(stage instanceof HTMLElement) ||
        !(replica instanceof HTMLElement) || sheets.length === 0) {
      throw new Error("Pagination geometry is not mounted.");
    }
    const editorStyle = getComputedStyle(editorRoot);
    const replicaStyle = getComputedStyle(replica);
    const lastParagraph = editorRoot.querySelector("p:last-of-type");
    const lastSheet = sheets[sheets.length - 1];
    const footer = lastSheet.querySelector(".chapter-pagination-footer");
    return {
      pageCount: sheets.length,
      editorScrollHeight: editorRoot.scrollHeight,
      stageHeight: stage.offsetHeight,
      fontSize: editorStyle.fontSize,
      replicaFontSize: replicaStyle.fontSize,
      lineHeight: editorStyle.lineHeight,
      replicaLineHeight: replicaStyle.lineHeight,
      lastContentBottom: lastParagraph?.getBoundingClientRect().bottom ?? 0,
      footerTop: footer?.getBoundingClientRect().top ?? 0,
    };
  });

  await waitForStablePagination();
  const wide = await readGeometry();
  assert.equal(wide.fontSize, wide.replicaFontSize);
  assert.equal(wide.lineHeight, wide.replicaLineHeight);
  assert.ok(wide.editorScrollHeight <= wide.stageHeight + 1);
  assert.ok(wide.lastContentBottom <= wide.footerTop + 1);
  const trace = await page.evaluate(() => window.__paginationTrace);
  assert.equal(trace.failedStatuses, 0);
  assert.equal(trace.visibleInternalStatuses, 0);
  assert.ok(trace.maxPageCount <= wide.pageCount + 1);
  assert.ok(trace.maxStageHeight <= wide.stageHeight + 988);

  await page.setViewportSize({ width: 700, height: 900 });
  await waitForStablePagination();
  const narrow = await readGeometry();
  assert.equal(narrow.pageCount, wide.pageCount);
  assert.equal(narrow.fontSize, wide.fontSize);
  assert.ok(narrow.editorScrollHeight <= narrow.stageHeight + 1);
  assert.ok(narrow.lastContentBottom <= narrow.footerTop + 1);

  console.log(JSON.stringify({ trace, wide, narrow }, null, 2));
} finally {
  await application?.close();
  server.kill();
}
