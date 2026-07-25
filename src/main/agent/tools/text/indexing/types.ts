import type { TextPosition } from "../ranges.ts";

export type StructuralChunk = {
  readonly type: "heading" | "section";
  readonly content: string;
  readonly startOffset: number;
  readonly endOffset: number;
  readonly start: TextPosition;
  readonly end: TextPosition;
  readonly headingPath: readonly string[];
};

export type IndexedTextChunk = {
  readonly id: string;
  readonly path: string;
  readonly revision: string;
  readonly index: number;
  readonly type: StructuralChunk["type"];
  readonly content: string;
  readonly start: TextPosition;
  readonly end: TextPosition;
  readonly headingPath: readonly string[];
  readonly tokens: readonly string[];
};

export type IndexedTextFile = {
  readonly path: string;
  readonly revision: string;
  readonly chunks: readonly IndexedTextChunk[];
};

export type TextIndexSnapshot = {
  readonly version: 1;
  readonly updatedAt: string;
  readonly files: readonly IndexedTextFile[];
};

export type RankedTextHit = {
  readonly chunk: IndexedTextChunk;
  readonly score: number;
  readonly matchedTerms: readonly string[];
};
