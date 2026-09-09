import type {
  NovelMutation,
  NovelMutationKind,
} from "../../../../shared/contracts/books/novelEvents.ts";
export type {
  NovelMutation,
  NovelMutationKind,
} from "../../../../shared/contracts/books/novelEvents.ts";

export type NovelMutationHandler = (mutation: NovelMutation) => void;

export function createNovelMutation(
  kind: NovelMutationKind,
  references: Omit<NovelMutation, "id" | "kind">,
): NovelMutation {
  return Object.freeze({
    id: `book_change_${crypto.randomUUID()}`,
    kind,
    ...references,
  });
}
