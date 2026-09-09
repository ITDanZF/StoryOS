import { Editor, type Content } from "@tiptap/core";
import type { ReaderChapterContent, ReaderPreferences } from "../../../shared/book/reader.ts";
import { decodeStoredChapterContent, type TiptapNode } from "../../../shared/book/richText.ts";
import { createChapterContentExtensions } from "../book/editor/chapterContentExtensions.ts";
import { measurePaginationFragments } from "../book/pagination/domPaginationMeasurer.ts";
import { paginateFragments } from "../book/pagination/paginationEngine.ts";
import { DEFAULT_PAGE_SIZE, type PageSize } from "./bookPresentation.ts";
import type { MeasuredChapter, ReaderBlock } from "./readerModel.ts";
import { bookPageLayout } from "./bookPageLayout.ts";

export const READER_WIDTH = 480;
export const READER_HEIGHT = 640;
export const READER_CONTENT_HEIGHT = 536;
export const READER_FONT = '"Source Han Serif SC", "Noto Serif CJK SC", "Songti SC", STSong, SimSun, serif';
const nodes = new Set(["doc", "paragraph", "text", "hardBreak", "heading", "bulletList", "orderedList", "listItem", "blockquote", "pageBreak"]);
const marks = new Set(["bold", "italic", "underline", "strike", "code", "textStyle", "link"]);
const lengths = new Set(["firstLineIndent", "indentLeft", "indentRight", "spaceBefore", "spaceAfter"]);

/** Only schema-owned attributes reach DOM; imported JSON never supplies raw styles or URLs. */
export function sanitizeReaderDocument(node: TiptapNode): TiptapNode {
  if (!nodes.has(node.type)) throw new Error(`阅读器暂不支持正文节点：${node.type}`);
  const attrs: Record<string, unknown> = {};
  const raw = node.attrs as Record<string, unknown> | undefined;
  for (const [key, value] of Object.entries(raw ?? {})) {
    if (lengths.has(key) && typeof value === "string" && /^-?\d{1,3}(\.\d+)?(px|em|pt|%)$/.test(value) && Math.abs(parseFloat(value)) <= 160) attrs[key] = value;
    if (key === "textAlign" && ["left", "center", "right", "justify"].includes(String(value))) attrs[key] = value;
    if (key === "level" && [2, 3].includes(Number(value))) attrs[key] = value;
    if (key === "start" && Number.isInteger(value) && Number(value) > 0 && Number(value) < 1_000_000) attrs[key] = value;
  }
  const rawMarks = (node.marks ?? []) as { type: string; attrs?: Record<string, unknown> }[];
  if (!Array.isArray(rawMarks)) throw new Error("正文标记格式错误。");
  const safeMarks = rawMarks.map(mark => {
    if (!marks.has(mark.type)) throw new Error(`阅读器暂不支持正文格式：${mark.type}`);
    const safe: Record<string, unknown> = {};
    if (mark.type === "textStyle") for (const key of ["color", "backgroundColor"]) {
      const color = mark.attrs?.[key];
      if (typeof color === "string" && /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|[a-z]{1,20})$/i.test(color)) safe[key] = color;
    }
    if (mark.type === "link") safe.href = "#";
    return { type: mark.type, attrs: safe };
  });
  return { type: node.type, ...(node.text !== undefined ? { text: node.text } : {}), attrs,
    ...(safeMarks.length ? { marks: safeMarks } : {}), ...(node.content ? { content: node.content.map(sanitizeReaderDocument) } : {}) };
}

// DOM measuring is serialized, including across canceled page instances.
let measurementQueue: Promise<unknown> = Promise.resolve();
export function measureReaderChapter(chapterId: string, source: ReaderChapterContent, preferences: ReaderPreferences, signal: AbortSignal, size: PageSize = DEFAULT_PAGE_SIZE): Promise<MeasuredChapter> {
  const work = measurementQueue.catch((): void => undefined).then(() => measure(chapterId, source, preferences, signal, size));
  measurementQueue = work.catch((): void => undefined);
  return work;
}

async function measure(chapterId: string, source: ReaderChapterContent, preferences: ReaderPreferences, signal: AbortSignal, size: PageSize = DEFAULT_PAGE_SIZE): Promise<MeasuredChapter> {
  signal.throwIfAborted();
  await document.fonts.ready;
  await new Promise<void>(resolve => setTimeout(resolve, 0));
  signal.throwIfAborted();
  const host = document.createElement("div");
  const layout = bookPageLayout(size), contentHeight = size.height - layout.top - layout.bottom;
  host.className = "reader-measure reader-document";
  host.setAttribute("aria-hidden", "true"); host.inert = true;
  host.style.setProperty("--reader-content-width", `${layout.width}px`);
  host.style.setProperty("--reader-font-size", `${preferences.fontSize}px`);
  host.style.setProperty("--reader-line-height", String(preferences.lineHeight));
  document.body.append(host);
  let editor: Editor | null = null;
  try {
    editor = new Editor({ element: host, extensions: createChapterContentExtensions(), editable: false,
      content: sanitizeReaderDocument(decodeStoredChapterContent(source.content)) as Content,
      editorProps: { attributes: { class: "reader-document", "aria-hidden": "true" } } });
    const root = editor.view.dom;
    const fragments = measurePaginationFragments(editor.view);
    const pages = paginateFragments({ fragments: [{ key: "reader-chapter-heading", kind: "heading", from: 1, to: 1, height: layout.chapterHeading, keepWithNext: true }, ...fragments], contentHeight, documentStart: 1,
      documentEnd: Math.max(1, editor.state.doc.content.size - 1), continuousFlow: true });
    const rect = root.getBoundingClientRect();
    const blocks: ReaderBlock[] = Array.from(root.children).filter((node): node is HTMLElement => node instanceof HTMLElement && !node.hasAttribute("data-page-break")).map(node => {
      const bounds = node.getBoundingClientRect();
      const copy = node.cloneNode(true) as HTMLElement;
      // Keep original paragraph/list width and internal layout, but place its border box exactly.
      copy.style.marginTop = "0"; copy.style.marginBottom = "0";
      return { html: copy.outerHTML, top: bounds.top - rect.top, height: bounds.height };
    });
    let cursor = 0;
    const sourceBounds = fragments.map(f => { const top = cursor; cursor += f.height; return { from: f.from, to: f.to, top, bottom: cursor }; });
    let text = ""; const positions: number[] = [];
    editor.state.doc.descendants((node, pos) => {
      if (node.isTextblock && text.length) { text += "\n"; positions.push(pos); }
      if (node.isText) { text += node.text; for (let i = 0; i < node.text.length; i++) positions.push(pos + i); }
      if (node.type.name === "hardBreak") { text += "\n"; positions.push(pos); }
    });
    signal.throwIfAborted();
    return { chapterId, revisionId: source.revisionId, text, positions: Uint32Array.from(positions),
      bytes: text.length * 6 + blocks.reduce((sum, b) => sum + b.html.length * 2, 0),
      pages: pages.map((page, index) => {
        const bounds = sourceBounds.filter(b => b.to > page.from && b.from < page.to);
        const top = bounds[0]?.top ?? 0;
        const end = bounds.at(-1)?.bottom ?? top;
        if (end - top > contentHeight - (index === 0 ? layout.chapterHeading : 0) + 1) throw new Error("正文含超出单页高度的内容，请减小字号后重试。");
        return { id: `${chapterId}:${source.revisionId}:${preferences.fontSize}:${preferences.lineHeight}:${size.width}x${size.height}:${index}`,
          chapterId, index, from: page.from, to: page.to, top, height: end - top,
          text: editor.state.doc.textBetween(page.from, page.to, "\n", "\n"),
          blocks: blocks.filter(b => b.top + b.height > top && b.top < end) };
      }),
    };
  } finally { editor?.destroy(); host.remove(); }
}

