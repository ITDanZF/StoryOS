import assert from 'node:assert/strict';
import { build } from 'esbuild';
const result = await build({ entryPoints: ['src/renderer/pages/reader/bookPresentation.ts'], bundle: true, platform: 'node', format: 'esm', write: false });
const { createBookIndex, frontLeaves, prepareBookSpread, neighborCursor } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
for (const counts of [[1], [2], [3], [1, 2, 3], [2, 2, 2], [3, 1, 4]]) {
  const chapters = counts.map((count, i) => ({ id: `c${i}`, title: `第${i + 1}章`, volumeId: null, characterCount: count * 100 }));
  const manifest = { book: { title: '测试' }, volumes: [], chapters };
  const pageCounts = Object.fromEntries(chapters.map((c, i) => [c.id, counts[i]]));
  const index = createBookIndex(manifest, chapters, pageCounts);
  const front = frontLeaves('测试', index.entries, { width: 480, height: 640 });
  const loadChapter = async id => ({ chapterId: id, pages: Array.from({ length: pageCounts[id] }, (_, i) => ({ id: `${id}:${i}`, index: i, text: '正文' })) });
  for (const double of [false, true]) {
    const context = { title: '测试', chapters, entries: index.entries, front, double, loadChapter };
    let cursor = { kind: 'cover', pageIndex: 0 }, steps = 0;
    const seen = new Set(), texts = [], forward = [];
    let lastSpread;
    while (cursor) {
      const spread = await prepareBookSpread(cursor, context);
      assert.ok(!seen.has(spread.key), `duplicate spread: ${JSON.stringify({ counts, double, cursor })}`);
      seen.add(spread.key);
      forward.push(spread.key); lastSpread = spread;
      for (const leaf of spread.leaves) if (leaf.page) texts.push(leaf.page.id);
      cursor = neighborCursor(spread, 1, chapters, front, double);
      assert.ok(++steps < 100, 'navigation must terminate');
    }
    assert.deepEqual(texts, chapters.flatMap(c => Array.from({ length: pageCounts[c.id] }, (_, i) => `${c.id}:${i}`)), 'each body page appears once, in chapter order');
    for (let i = 1; i < chapters.length; i++) {
      const jump = await prepareBookSpread({ kind: 'chapter', chapterId: chapters[i].id, pageIndex: 0 }, context);
      if (double) assert.ok(!jump.leaves.some(l => l.kind === 'blank'), 'chapter jumps must not introduce blank pages');
      const unindexed = await prepareBookSpread({ kind: 'chapter', chapterId: chapters[i].id, pageIndex: 0 }, { ...context, entries: createBookIndex(manifest, chapters, {}).entries });
      assert.equal(unindexed.key, jump.key, 'direct jumps before indexing must use the same physical spread');
    }
    const backward = [lastSpread.key];
    let previous = neighborCursor(lastSpread, -1);
    while (previous) {
      lastSpread = await prepareBookSpread(previous, context);
      backward.push(lastSpread.key); previous = neighborCursor(lastSpread, -1);
      assert.ok(backward.length < 100, 'reverse navigation must terminate');
    }
    assert.deepEqual(backward, forward.reverse(), 'backward traversal must exactly invert forward traversal');
  }
  assert.equal(index.total, counts.reduce((sum, count) => sum + count, 0));
}
const chapters = Array.from({ length: 1000 }, (_, i) => ({ id: `c${i}`, title: `章节${i}`, volumeId: null, characterCount: 100 }));
const partial = createBookIndex({ volumes: [] }, chapters, { c0: 3 });
assert.equal(partial.total, null); assert.equal(partial.entries[1].folio, 4); assert.equal(partial.entries[2].folio, null);
const printed = frontLeaves('长篇', partial.entries, { width: 360, height: 440 });
assert.equal(printed.flatMap(page => page.entries ?? []).length, 1000);
console.log('Book index passed: odd/even chapters, single/double navigation, complete 1000-chapter TOC, unknown prefixes and continuous chapter folios.');
const volumeChapters = [{ id: 'v0', volumeId: 'a', title: '一', characterCount: 1 }, { id: 'v1', volumeId: 'b', title: '二', characterCount: 1 }];
const volumeIndex = createBookIndex({ volumes: [{ id: 'a', title: '卷一' }, { id: 'b', title: '卷二' }] }, volumeChapters, { v0: 1, v1: 2 });
assert.deepEqual(volumeIndex.entries.map(e => [e.volumeFolio, e.folio]), [[1, 3], [4, 6]]);
assert.equal(volumeIndex.total, 7);
const volumeFront = frontLeaves('分卷测试', volumeIndex.entries, { width: 480, height: 640 });
for (const double of [true, false]) {
  const context = { title: '分卷测试', chapters: volumeChapters, entries: volumeIndex.entries, front: volumeFront, double, loadChapter: async id => ({ chapterId: id, pages: Array.from({ length: id === 'v0' ? 1 : 2 }, (_, index) => ({ id: `${id}:${index}`, index })) }) };
  const clamped = await prepareBookSpread({ kind: 'chapter', chapterId: 'v0', pageIndex: 1 }, context);
  assert.equal(clamped.cursor.pageIndex, 0, 'chapter cursors clamp to real text, never padding');
  let cursor = { kind: 'cover', pageIndex: 0 }; const kinds = new Set();
  while (cursor) { const spread = await prepareBookSpread(cursor, context); spread.leaves.forEach(l => kinds.add(l.kind)); cursor = neighborCursor(spread, 1); }
  assert.ok(kinds.has('volume') && kinds.has('end') && kinds.has('back'));
}
console.log('Generated volume pages, real-page clamping, end/back cover and reverse traversal passed.');

for (const size of [{ width: 230, height: 320 }, { width: 360, height: 440 }, { width: 540, height: 752 }, { width: 672, height: 932 }]) {
  const entries = partial.entries.map((entry, i) => ({ ...entry, title: `第${i + 1}章 · 很长的章节标题也需要留出足够的空间避免相邻目录发生重叠`, volumeTitle: `第${Math.floor(i / 10) + 1}卷 · 山间来信` }));
  const pages = frontLeaves('目录排版验证', entries, size).filter(leaf => leaf.kind === 'toc');
  assert.equal(pages.flatMap(leaf => leaf.entries).length, 1000);
  for (const leaf of pages) {
    let previousBottom = 0;
    for (const row of leaf.tocRows) {
      assert.ok(row.top >= previousBottom, 'directory rows must not overlap');
      previousBottom = row.top + row.height;
    }
    assert.ok(previousBottom <= size.height - Math.max(48, Math.round(size.height * .11)), 'directory rows must fit the paper margins');
    assert.equal(leaf.tocRows.at(-1).kind, 'chapter', 'volume heading must stay with a chapter');
  }
}
console.log('Printed TOC layout passed: long titles, volume headings, 1000 chapters and compact/large page bounds.');

const stackBuild = await build({ entryPoints: ['src/renderer/pages/reader/scene/pageStackMotion.ts'], bundle: true, platform: 'node', format: 'esm', write: false });
const { pageStackCount, stackLeafProgress } = await import(`data:text/javascript;base64,${Buffer.from(stackBuild.outputFiles[0].text).toString('base64')}`);
for (const double of [false, true]) for (const distance of [1, 2, 3, 10, 100]) for (const direction of [-1, 1]) {
  const count = pageStackCount(201, 201 + direction * distance * (double ? 2 : 1), double);
  assert.equal(count, Math.min(8, distance));
  for (let layer = 0; layer < count; layer++) {
    assert.equal(stackLeafProgress(0, layer, count), 0);
    assert.equal(stackLeafProgress(1, layer, count), 1);
    let previous = 0;
    for (let frame = 1; frame < 100; frame++) {
      const progress = stackLeafProgress(frame / 100, layer, count);
      assert.ok(progress > previous && progress < 1, 'all leaves move together, monotonically, through one gesture'); previous = progress;
    }
  }
  if (count > 1) assert.ok(stackLeafProgress(.5, 0, count) < stackLeafProgress(.5, count - 1, count), 'packet fans visibly in midair');
}
console.log('Packet turn passed: simultaneous leaf motion, fan separation, shared endpoints and bounded geometry count.');
