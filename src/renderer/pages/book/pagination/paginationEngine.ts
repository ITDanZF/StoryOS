import type {
  ChapterPage,
  PaginationFragment,
} from "./paginationModel.ts";

type PaginateFragmentsInput = {
  readonly fragments: readonly PaginationFragment[];
  readonly contentHeight: number;
  readonly documentStart: number;
  readonly documentEnd: number;
};

type MutablePage = {
  from: number;
  to: number;
  usedHeight: number;
  overflow: boolean;
  hasContent: boolean;
};

function requirePaginationInput(input: PaginateFragmentsInput): void {
  if (!Number.isFinite(input.contentHeight) || input.contentHeight <= 0) {
    throw new Error("Pagination content height must be positive.");
  }
  if (input.documentStart < 0 || input.documentEnd < input.documentStart) {
    throw new Error("Pagination document range is invalid.");
  }
  let previousPosition = input.documentStart;
  for (const fragment of input.fragments) {
    if (fragment.from < previousPosition || fragment.to < fragment.from) {
      throw new Error(`Pagination fragment ${fragment.key} is out of order.`);
    }
    if (!Number.isFinite(fragment.height) || fragment.height < 0) {
      throw new Error(`Pagination fragment ${fragment.key} has invalid height.`);
    }
    previousPosition = fragment.to;
  }
}

export function paginateFragments(
  input: PaginateFragmentsInput,
): readonly ChapterPage[] {
  requirePaginationInput(input);
  const pages: ChapterPage[] = [];
  let current: MutablePage = {
    from: input.documentStart,
    to: input.documentStart,
    usedHeight: 0,
    overflow: false,
    hasContent: false,
  };

  const finishPage = (
    to: number,
    breakReason: ChapterPage["breakReason"],
  ) => {
    pages.push({
      index: pages.length,
      from: current.from,
      to,
      usedHeight: current.usedHeight,
      breakReason,
      overflow: current.overflow,
    });
    current = {
      from: to,
      to,
      usedHeight: 0,
      overflow: false,
      hasContent: false,
    };
  };

  for (let index = 0; index < input.fragments.length; index += 1) {
    const fragment = input.fragments[index];
    if (fragment.kind === "manual-break") {
      finishPage(fragment.from, "manual");
      current.from = fragment.to;
      current.to = fragment.to;
      continue;
    }

    const next = input.fragments[index + 1];
    const keepHeight = fragment.keepWithNext && next &&
        next.kind !== "manual-break"
      ? fragment.height + next.height
      : fragment.height;
    if (
      current.hasContent &&
      current.usedHeight + keepHeight > input.contentHeight
    ) {
      finishPage(fragment.from, "automatic");
    }

    if (
      current.hasContent &&
      current.usedHeight + fragment.height > input.contentHeight
    ) {
      finishPage(fragment.from, "automatic");
    }

    current.hasContent = true;
    current.to = fragment.to;
    current.usedHeight += fragment.height;
    if (fragment.height > input.contentHeight) current.overflow = true;
  }

  pages.push({
    index: pages.length,
    from: current.from,
    to: input.documentEnd,
    usedHeight: current.usedHeight,
    breakReason: "document-end",
    overflow: current.overflow,
  });
  return pages;
}
