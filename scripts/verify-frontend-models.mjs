import assert from "node:assert/strict";
import { createServer } from "vite";

const server = await createServer({ configFile: false, cacheDir: "node_modules/.vite-frontend-models", server: { middlewareMode: true }, appType: "custom" });
try {
  const theme = await server.ssrLoadModule("/src/renderer/app/theme/themeModel.ts");
  assert.deepEqual(theme.parseThemePreference("invalid"), theme.DEFAULT_THEME);
  assert.deepEqual(theme.parseThemePreference('{"version":9,"appearance":"dark"}'), theme.DEFAULT_THEME);
  const repaired = theme.parseThemePreference('{"version":1,"appearance":"dark","paletteId":"missing"}');
  assert.equal(repaired.appearance, "dark"); assert.equal(repaired.paletteId, "default");
  assert.equal(theme.resolveTheme(theme.DEFAULT_THEME, true).appearance, "dark");
  assert.equal(theme.resolveTheme({ ...theme.DEFAULT_THEME, appearance: "light" }, true).appearance, "light");
  for (const item of theme.THEMES) assert.deepEqual(Object.keys(item.schemes.light).sort(), Object.keys(item.schemes.dark).sort());

  const { ChapterSaveSession } = await server.ssrLoadModule("/src/renderer/features/book-workspace/editor/ChapterSaveSession.ts");
  const writes = []; const states = []; const releases = [];
  const session = new ChapterSaveSession("original", "r0", null, {
    save: async (content, revision) => {
      writes.push({ content, revision });
      await new Promise(resolve => releases.push(resolve));
      return { revision: { id: `r${writes.length}` } };
    }, onState: state => states.push(state),
  });
  session.schedule("first"); const first = session.flush();
  await new Promise(resolve => setImmediate(resolve));
  session.schedule("second"); const second = session.flush();
  assert.equal(writes.length, 1, "writes must remain serial");
  releases.shift()(); await first;
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(writes[1], { content: "second", revision: "r1" }, "queued write uses the resolved revision");
  assert.equal(session.pendingContent, "second", "older completion cannot clear newer input");
  releases.shift()(); await second;
  assert.equal(session.pendingContent, null); assert.equal(states.at(-1), "saved");
  await session.flush(); assert.equal(writes.length, 2, "unmount flush cannot duplicate a completed write");

  let fail = true;
  const retry = new ChapterSaveSession("original", "r0", null, {
    save: async () => { if (fail) throw new Error("offline"); return { revision: { id: "r1" } }; }, onState: () => {},
  });
  retry.schedule("draft"); await assert.rejects(retry.flush(), /offline/);
  assert.equal(retry.hasUnsavedChanges, true); fail = false; await retry.flush(); assert.equal(retry.hasUnsavedChanges, false);
  const recovered = new ChapterSaveSession("original", "r0", { baseRevisionId: "r0", content: "draft" }, { save: async () => ({ revision: { id: "r1" } }), onState: () => {} });
  assert.equal(recovered.recoveredContent, "draft"); await recovered.flush();
  const conflict = new ChapterSaveSession("new", "r2", { baseRevisionId: "r0", content: "draft" }, recovered.handlers);
  assert.equal(conflict.pendingContent, null, "stale drafts must not silently replace a newer revision");
  console.log("Frontend model checks passed: theme validation and resolution, token completeness, serial revisions, pending input, retries, draft recovery and conflict protection.");
} finally { await server.close(); }
