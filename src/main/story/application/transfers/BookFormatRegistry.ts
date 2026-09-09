import type {
  BookTransferFormat,
  BookTransferFormatCapability,
  ExportBookOptions,
} from "./bookTransferContracts.ts";
import { exportDocxBook, importDocxBook } from "./formats/DocxBookAdapter.ts";
import { exportEpubBook } from "./formats/EpubBookAdapter.ts";
import { exportMarkdownBook, importMarkdownBook } from "./formats/MarkdownBookAdapter.ts";
import { exportPdfBook } from "./formats/PdfBookAdapter.ts";
import { exportTextBook, importTextBook } from "./formats/TextBookAdapter.ts";
import type { BookExportSnapshot, PortableBookDraft } from "./PortableBook.ts";
export interface PdfRenderer {
  render(html: string): Promise<Buffer>;
}
export type BookFormatStrategy = { readonly capability: BookTransferFormatCapability } & (
  | { readonly kind: "native" }
  | {
      readonly kind: "portable";
      readonly import?: (
        content: Buffer,
        fileName: string,
      ) => PortableBookDraft | Promise<PortableBookDraft>;
      readonly export: (
        snapshot: BookExportSnapshot,
        options: ExportBookOptions,
      ) => Buffer | Promise<Buffer>;
    }
);
function builtInFormats(pdf?: PdfRenderer): readonly BookFormatStrategy[] {
  return [
    {
      capability: Object.freeze({
        id: "storyos",
        label: "StoryOS 完整备份",
        description: "完整保留书籍结构、状态和全部修订历史，适合迁移与恢复。",
        extensions: Object.freeze(["storyos-book"]),
        canImport: true,
        canExport: true,
        preservesStructure: true,
        preservesRichText: true,
        preservesRevisions: true,
        outputKind: "file",
      }),
      kind: "native",
    },
    {
      capability: Object.freeze({
        id: "docx",
        label: "Word 文稿",
        description: "适合与编辑和出版社交换，保留卷章和段落，复杂排版会降级。",
        extensions: Object.freeze(["docx"]),
        canImport: true,
        canExport: true,
        preservesStructure: true,
        preservesRichText: false,
        preservesRevisions: false,
        outputKind: "file",
      }),
      kind: "portable",
      import: (c, f) => importDocxBook(c, f),
      export: (s, o) => exportDocxBook(s, o),
    },
    {
      capability: Object.freeze({
        id: "markdown",
        label: "Markdown",
        description: "开放、可读并适合版本管理，可导出单文件或结构化 ZIP。",
        extensions: Object.freeze(["md", "zip"]),
        canImport: true,
        canExport: true,
        preservesStructure: true,
        preservesRichText: false,
        preservesRevisions: false,
        outputKind: "archive",
      }),
      kind: "portable",
      import: importMarkdownBook,
      export: async (s, o) => (await exportMarkdownBook(s, o)).content,
    },
    {
      capability: Object.freeze({
        id: "text",
        label: "纯文本",
        description: "兼容性最高，根据卷章标题识别结构，只保留纯文本。",
        extensions: Object.freeze(["txt"]),
        canImport: true,
        canExport: true,
        preservesStructure: true,
        preservesRichText: false,
        preservesRevisions: false,
        outputKind: "file",
      }),
      kind: "portable",
      import: importTextBook,
      export: exportTextBook,
    },
    {
      capability: Object.freeze({
        id: "epub",
        label: "EPUB 电子书",
        description: "适合电子书阅读器和发布预览，仅支持导出。",
        extensions: Object.freeze(["epub"]),
        canImport: false,
        canExport: true,
        preservesStructure: true,
        preservesRichText: true,
        preservesRevisions: false,
        outputKind: "file",
      }),
      kind: "portable",
      export: exportEpubBook,
    },
    {
      capability: Object.freeze({
        id: "pdf",
        label: "PDF 阅读版",
        description: "适合打印、定稿与分享，仅支持导出。",
        extensions: Object.freeze(["pdf"]),
        canImport: false,
        canExport: true,
        preservesStructure: true,
        preservesRichText: true,
        preservesRevisions: false,
        outputKind: "file",
      }),
      kind: "portable",
      export: (s, o) => {
        if (!pdf) throw new Error("PDF renderer is not available.");
        return exportPdfBook(s, o, pdf);
      },
    },
  ];
}
export default class BookFormatRegistry {
  private readonly strategies = new Map<BookTransferFormat, BookFormatStrategy>();
  constructor(pdf?: PdfRenderer, definitions: readonly BookFormatStrategy[] = builtInFormats(pdf)) {
    for (const definition of definitions) {
      const { capability } = definition;
      if (this.strategies.has(capability.id)) throw new Error("Duplicate format: " + capability.id);
      if (
        definition.kind === "portable" &&
        (capability.canImport !== Boolean(definition.import) || !capability.canExport)
      )
        throw new Error("Book format capability mismatch: " + capability.id);
      this.strategies.set(capability.id, definition);
    }
  }
  list(): readonly BookTransferFormatCapability[] {
    return Object.freeze([...this.strategies.values()].map((s) => s.capability));
  }
  capability(format: BookTransferFormat): BookTransferFormatCapability {
    const definition = this.strategies.get(format);
    if (!definition) throw new Error("Unsupported book transfer format: " + format);
    return definition.capability;
  }
  detect(fileName: string): Exclude<BookTransferFormat, "epub" | "pdf"> {
    const extension = fileName.split(".").pop()?.toLocaleLowerCase("en-US") ?? "";
    const capability = this.list().find((c) => c.canImport && c.extensions.includes(extension));
    if (!capability || capability.id === "epub" || capability.id === "pdf")
      throw new Error("Unsupported book import extension: ." + extension);
    return capability.id;
  }
  async parse(
    format: BookTransferFormat,
    content: Buffer,
    fileName: string,
  ): Promise<PortableBookDraft> {
    const strategy = this.strategies.get(format);
    if (strategy?.kind !== "portable" || !strategy.import)
      throw new Error("Unsupported portable import format: " + format);
    return strategy.import(content, fileName);
  }
  async export(
    format: BookTransferFormat,
    snapshot: BookExportSnapshot,
    options: ExportBookOptions,
  ): Promise<Buffer> {
    const strategy = this.strategies.get(format);
    if (strategy?.kind !== "portable")
      throw new Error("Unsupported portable export format: " + format);
    return strategy.export(snapshot, options);
  }
}
