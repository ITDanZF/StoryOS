export type TiptapNode = {
  readonly type: string;
  readonly text?: string;
  readonly content?: readonly TiptapNode[];
  readonly [key: string]: unknown;
};

export type TiptapDocument = TiptapNode & {
  readonly type: "doc";
};

export const EMPTY_TIPTAP_DOCUMENT: TiptapDocument = Object.freeze({
  type: "doc",
  content: Object.freeze([{ type: "paragraph" }]),
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireNode(value: unknown, path: string): TiptapNode {
  if (!isRecord(value) || typeof value.type !== "string" || !value.type) {
    throw new Error(`Invalid Tiptap node at ${path}.`);
  }
  if (value.text !== undefined && typeof value.text !== "string") {
    throw new Error(`Invalid Tiptap text at ${path}.`);
  }
  if (value.type === "text" && typeof value.text !== "string") {
    throw new Error(`Tiptap text node is missing text at ${path}.`);
  }
  if (value.content !== undefined) {
    if (!Array.isArray(value.content)) {
      throw new Error(`Invalid Tiptap content at ${path}.`);
    }
    value.content.forEach((child, index) => {
      requireNode(child, `${path}.content[${index}]`);
    });
  }
  return value as TiptapNode;
}

export function requireTiptapDocument(value: unknown): TiptapDocument {
  const document = requireNode(value, "document");
  if (document.type !== "doc") {
    throw new Error("Tiptap document root must have type \"doc\".");
  }
  return document as TiptapDocument;
}

export function serializeTiptapDocument(value: unknown): string {
  const document = requireTiptapDocument(value);
  const serialized = JSON.stringify(document);
  if (serialized === undefined) {
    throw new Error("Tiptap document cannot be serialized.");
  }
  return serialized;
}

export function parseTiptapDocument(serialized: string): TiptapDocument {
  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch {
    throw new Error("Chapter content must be valid Tiptap JSON.");
  }
  return requireTiptapDocument(value);
}

export function plainTextToTiptapDocument(value: string): TiptapDocument {
  const normalized = value.replace(/\r\n?/g, "\n");
  if (!normalized) return EMPTY_TIPTAP_DOCUMENT;
  const paragraphs = normalized.split(/\n{2,}/).map((paragraph) => {
    const lines = paragraph.split("\n");
    const content: TiptapNode[] = [];
    lines.forEach((line, index) => {
      if (index > 0) content.push({ type: "hardBreak" });
      if (line) content.push({ type: "text", text: line });
    });
    return content.length > 0
      ? { type: "paragraph", content }
      : { type: "paragraph" };
  });
  return {
    type: "doc",
    content: paragraphs,
  };
}

export function decodeStoredChapterContent(
  stored: string,
): TiptapDocument {
  if (!stored) return EMPTY_TIPTAP_DOCUMENT;
  try {
    return parseTiptapDocument(stored);
  } catch {
    return plainTextToTiptapDocument(stored);
  }
}

export function extractTiptapText(document: TiptapDocument): string {
  const readNode = (node: TiptapNode): string => {
    if (node.type === "text") return node.text ?? "";
    if (node.type === "hardBreak") return "\n";
    const children = node.content?.map(readNode).join("") ?? "";
    return node.type === "paragraph" || node.type === "blockquote"
      ? `${children}\n`
      : children;
  };
  return readNode(document).trimEnd();
}

export function countTiptapCharacters(document: TiptapDocument): number {
  return Array.from(extractTiptapText(document).replace(/\s/g, "")).length;
}

