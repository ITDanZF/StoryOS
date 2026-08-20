import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import {
  Plugin,
  PluginKey,
  TextSelection,
  type EditorState,
} from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export type ChapterSearchMatch = {
  readonly from: number;
  readonly to: number;
};

export type ChapterSearchState = {
  readonly query: string;
  readonly matches: readonly ChapterSearchMatch[];
  readonly activeIndex: number;
};

type SearchMeta =
  | { readonly kind: "query"; readonly query: string }
  | { readonly kind: "active"; readonly activeIndex: number }
  | { readonly kind: "clear" };

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    chapterFindReplace: {
      setChapterSearchQuery: (query: string) => ReturnType;
      findNextChapterMatch: () => ReturnType;
      findPreviousChapterMatch: () => ReturnType;
      replaceCurrentChapterMatch: (replacement: string) => ReturnType;
      replaceAllChapterMatches: (replacement: string) => ReturnType;
      clearChapterSearch: () => ReturnType;
    };
  }
}

export const chapterFindReplacePluginKey = new PluginKey<ChapterSearchState>(
  "chapterFindReplace",
);

const EMPTY_SEARCH_STATE: ChapterSearchState = Object.freeze({
  query: "",
  matches: Object.freeze([]),
  activeIndex: -1,
});

export function findChapterSearchMatches(
  document: ProseMirrorNode,
  query: string,
): readonly ChapterSearchMatch[] {
  if (!query) return [];
  let searchable = "";
  const positions: number[] = [];
  let previousTextEnd: number | null = null;
  document.descendants((node, position) => {
    if (!node.isText || !node.text) return true;
    if (previousTextEnd !== null && previousTextEnd !== position) {
      searchable += "\n";
      positions.push(-1);
    }
    searchable += node.text;
    for (let index = 0; index < node.text.length; index += 1) {
      positions.push(position + index);
    }
    previousTextEnd = position + node.text.length;
    return false;
  });

  const haystack = searchable.toLocaleLowerCase("zh-CN");
  const needle = query.toLocaleLowerCase("zh-CN");
  const matches: ChapterSearchMatch[] = [];
  let offset = 0;
  while (offset <= haystack.length - needle.length) {
    const index = haystack.indexOf(needle, offset);
    if (index < 0) break;
    const start = positions[index];
    const endPosition = positions[index + needle.length - 1];
    if (start >= 0 && endPosition >= start) {
      matches.push({ from: start, to: endPosition + 1 });
    }
    offset = index + Math.max(1, needle.length);
  }
  return matches;
}

function nextSearchState(
  document: ProseMirrorNode,
  previous: ChapterSearchState,
  meta: SearchMeta | undefined,
  documentChanged: boolean,
): ChapterSearchState {
  if (meta?.kind === "clear") return EMPTY_SEARCH_STATE;
  const query = meta?.kind === "query" ? meta.query : previous.query;
  const matches = documentChanged || meta?.kind === "query"
    ? findChapterSearchMatches(document, query)
    : previous.matches;
  const requestedIndex = meta?.kind === "active"
    ? meta.activeIndex
    : previous.activeIndex;
  const activeIndex = matches.length === 0
    ? -1
    : Math.max(0, Math.min(requestedIndex < 0 ? 0 : requestedIndex, matches.length - 1));
  return { query, matches, activeIndex };
}

export function getChapterSearchState(
  state: EditorState,
): ChapterSearchState {
  return chapterFindReplacePluginKey.getState(state) ?? EMPTY_SEARCH_STATE;
}

const FindReplaceExtension = Extension.create({
  name: "chapterFindReplace",

  addCommands() {
    return {
      setChapterSearchQuery:
        (query: string) =>
        ({ tr, dispatch }) => {
          dispatch?.(tr.setMeta(chapterFindReplacePluginKey, {
            kind: "query",
            query,
          } satisfies SearchMeta));
          return true;
        },
      findNextChapterMatch:
        () =>
        ({ state, tr, dispatch }) => {
          const search = getChapterSearchState(state);
          if (search.matches.length === 0) return false;
          const activeIndex = (search.activeIndex + 1) % search.matches.length;
          const match = search.matches[activeIndex];
          dispatch?.(
            tr.setSelection(TextSelection.create(tr.doc, match.from, match.to))
              .setMeta(chapterFindReplacePluginKey, {
              kind: "active",
              activeIndex,
            } satisfies SearchMeta).scrollIntoView(),
          );
          return true;
        },
      findPreviousChapterMatch:
        () =>
        ({ state, tr, dispatch }) => {
          const search = getChapterSearchState(state);
          if (search.matches.length === 0) return false;
          const activeIndex = (search.activeIndex - 1 + search.matches.length) %
            search.matches.length;
          const match = search.matches[activeIndex];
          dispatch?.(
            tr.setSelection(TextSelection.create(tr.doc, match.from, match.to))
              .setMeta(chapterFindReplacePluginKey, {
              kind: "active",
              activeIndex,
            } satisfies SearchMeta).scrollIntoView(),
          );
          return true;
        },
      replaceCurrentChapterMatch:
        (replacement: string) =>
        ({ state, tr, dispatch }) => {
          const search = getChapterSearchState(state);
          const match = search.matches[search.activeIndex];
          if (!match) return false;
          dispatch?.(
            tr.insertText(replacement, match.from, match.to)
              .setMeta(chapterFindReplacePluginKey, {
                kind: "query",
                query: search.query,
              } satisfies SearchMeta),
          );
          return true;
        },
      replaceAllChapterMatches:
        (replacement: string) =>
        ({ state, tr, dispatch }) => {
          const search = getChapterSearchState(state);
          if (search.matches.length === 0) return false;
          [...search.matches].reverse().forEach((match) => {
            tr.insertText(replacement, match.from, match.to);
          });
          dispatch?.(
            tr.setMeta(chapterFindReplacePluginKey, {
              kind: "query",
              query: search.query,
            } satisfies SearchMeta),
          );
          return true;
        },
      clearChapterSearch:
        () =>
        ({ tr, dispatch }) => {
          dispatch?.(tr.setMeta(chapterFindReplacePluginKey, {
            kind: "clear",
          } satisfies SearchMeta));
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    return [new Plugin<ChapterSearchState>({
      key: chapterFindReplacePluginKey,
      state: {
        init: () => EMPTY_SEARCH_STATE,
        apply: (transaction, previous) => nextSearchState(
          transaction.doc,
          previous,
          transaction.getMeta(chapterFindReplacePluginKey) as SearchMeta | undefined,
          transaction.docChanged,
        ),
      },
      props: {
        decorations: (state) => {
          const search = getChapterSearchState(state);
          if (search.matches.length === 0) return null;
          return DecorationSet.create(
            state.doc,
            search.matches.map((match, index) => Decoration.inline(
              match.from,
              match.to,
              {
                class: index === search.activeIndex
                  ? "chapter-find-match chapter-find-match-active"
                  : "chapter-find-match",
              },
            )),
          );
        },
      },
    })];
  },
});

export default FindReplaceExtension;
