import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { Selection } from "@tiptap/pm/state";
import type {
  EditorTargetSelector,
  EditorTextQuery,
  EditorTextRange,
} from "../../../../../main/agent/tools/editor/contracts.ts";

export type EditorTextMatch = EditorTextRange & {
  readonly index: number;
  readonly preview: string;
};

export type EditorTextInspection = {
  readonly text: string;
  readonly caseSensitive: boolean;
  readonly count: number;
  readonly matches: readonly EditorTextMatch[];
};

type SearchableDocument = {
  readonly text: string;
  readonly positions: readonly number[];
};

function buildSearchableDocument(document: ProseMirrorNode): SearchableDocument {
  let text = "";
  const positions: number[] = [];
  let previousTextEnd: number | null = null;
  document.descendants((node, position) => {
    if (!node.isText || !node.text) return true;
    if (previousTextEnd !== null && previousTextEnd !== position) {
      text += "\n";
      positions.push(-1);
    }
    text += node.text;
    for (let index = 0; index < node.text.length; index += 1) {
      positions.push(position + index);
    }
    previousTextEnd = position + node.text.length;
    return false;
  });
  return { text, positions };
}

function previewMatch(text: string, from: number, to: number): string {
  return text
    .slice(Math.max(0, from - 24), Math.min(text.length, to + 24))
    .replace(/\n+/g, " ↵ ")
    .trim();
}

export function findEditorTextMatches(
  document: ProseMirrorNode,
  query: EditorTextQuery,
): readonly EditorTextMatch[] {
  if (!query.text) return [];
  const searchable = buildSearchableDocument(document);
  const matches: EditorTextMatch[] = [];
  let offset = 0;
  const collator = query.caseSensitive
    ? null
    : new Intl.Collator("zh-CN", { usage: "search", sensitivity: "accent" });
  while (offset <= searchable.text.length - query.text.length) {
    let index = -1;
    if (query.caseSensitive) {
      index = searchable.text.indexOf(query.text, offset);
    } else {
      for (
        let candidate = offset;
        candidate <= searchable.text.length - query.text.length;
        candidate += 1
      ) {
        if (collator?.compare(
          searchable.text.slice(candidate, candidate + query.text.length),
          query.text,
        ) === 0) {
          index = candidate;
          break;
        }
      }
    }
    if (index < 0) break;
    const from = searchable.positions[index];
    const endPosition = searchable.positions[index + query.text.length - 1];
    if (from >= 0 && endPosition >= from) {
      matches.push({
        index: matches.length,
        from,
        to: endPosition + 1,
        expectedText: document.textBetween(from, endPosition + 1, "\n", "\n"),
        preview: previewMatch(searchable.text, index, index + query.text.length),
      });
    }
    offset = index + Math.max(1, query.text.length);
  }
  return matches;
}

export function inspectEditorText(
  document: ProseMirrorNode,
  queries: readonly EditorTextQuery[],
): readonly EditorTextInspection[] {
  return queries.map((query) => {
    const matches = findEditorTextMatches(document, query);
    return {
      text: query.text,
      caseSensitive: query.caseSensitive,
      count: matches.length,
      matches,
    };
  });
}

function validateRange(
  document: ProseMirrorNode,
  range: EditorTextRange,
): EditorTextRange {
  const maximum = document.content.size;
  if (range.from < 0 || range.to <= range.from || range.to > maximum) {
    throw new Error(
      `Invalid editor target range: ${range.from}-${range.to} (max ${maximum}).`,
    );
  }
  const actualText = document.textBetween(range.from, range.to, "\n", "\n");
  if (actualText !== range.expectedText) {
    throw new Error(
      `Editor target text changed at ${range.from}-${range.to}: expected "${range.expectedText}", found "${actualText}".`,
    );
  }
  return range;
}

export function resolveEditorTargetSelector(
  document: ProseMirrorNode,
  selection: Selection,
  selector: EditorTargetSelector,
): readonly EditorTextRange[] {
  if (selector.kind === "ranges") {
    return selector.ranges.map((range) => validateRange(document, range));
  }
  if (selector.kind === "selection") {
    if (selection.empty) throw new Error("The active editor selection is empty.");
    return [validateRange(document, {
      from: selection.from,
      to: selection.to,
      expectedText: selector.expectedText,
    })];
  }

  const matches = findEditorTextMatches(document, {
    text: selector.text,
    caseSensitive: selector.caseSensitive,
  });
  if (matches.length !== selector.expectedCount) {
    throw new Error(
      `Editor match count changed for "${selector.text}": expected ${selector.expectedCount}, found ${matches.length}.`,
    );
  }
  if (selector.occurrences.kind === "all") return matches;

  const indices = [...new Set(selector.occurrences.indices)];
  return indices.map((index) => {
    const match = matches[index];
    if (!match) {
      throw new Error(
        `Editor match index ${index} is out of range for "${selector.text}" (${matches.length} matches).`,
      );
    }
    return match;
  });
}
