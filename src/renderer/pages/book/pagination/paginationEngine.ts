import type {
  ChapterPage,
  PaginationFragment,
} from "./paginationModel.ts";

type PaginateFragmentsInput = {
  readonly fragments: readonly PaginationFragment[];
  readonly contentHeight: number;
  readonly documentStart: number;
  readonly documentEnd: number;
  readonly orphanLines?: number;
  readonly widowLines?: number;
};

type MutablePage = {
  from: number;
  to: number;
  usedHeight: number;
  overflow: boolean;
  hasContent: boolean;
};

const LAYOUT_EPSILON = 0.25;

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

function sumHeight(fragments: readonly PaginationFragment[]): number {
  return fragments.reduce((total, fragment) => total + fragment.height, 0);
}

function fragmentGroups(
  fragments: readonly PaginationFragment[],
): readonly (readonly PaginationFragment[])[] {
  const groups: PaginationFragment[][] = [];
  for (const fragment of fragments) {
    const previous = groups[groups.length - 1];
    if (
      fragment.kind !== "manual-break" && fragment.blockKey &&
      previous?.[0]?.blockKey === fragment.blockKey
    ) {
      previous.push(fragment);
    } else {
      groups.push([fragment]);
    }
  }
  return groups;
}

export function paginateFragments(
  input: PaginateFragmentsInput,
): readonly ChapterPage[] {
  requirePaginationInput(input);
  const orphanLines = Math.max(1, input.orphanLines ?? 2);
  const widowLines = Math.max(1, input.widowLines ?? 2);
  const groups = fragmentGroups(input.fragments);
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

  const addFragment = (fragment: PaginationFragment) => {
    current.hasContent = true;
    current.to = fragment.to;
    current.usedHeight += fragment.height;
    if (fragment.height > input.contentHeight + LAYOUT_EPSILON) {
      current.overflow = true;
    }
  };

  for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
    const group = groups[groupIndex];
    const first = group[0];
    if (first.kind === "manual-break") {
      finishPage(first.from, "manual");
      current.from = first.to;
      current.to = first.to;
      continue;
    }

    const groupHeight = sumHeight(group);
    const nextGroup = groups[groupIndex + 1];
    const keepWithNextHeight = group.some((item) => item.keepWithNext) &&
        nextGroup?.[0]?.kind !== "manual-break"
      ? sumHeight(nextGroup.slice(0, Math.max(1, widowLines)))
      : 0;
    if (
      current.hasContent &&
      current.usedHeight + groupHeight + keepWithNextHeight >
        input.contentHeight + LAYOUT_EPSILON &&
      groupHeight + keepWithNextHeight <=
        input.contentHeight + LAYOUT_EPSILON
    ) {
      finishPage(first.from, "automatic");
    }

    if (groupHeight <= input.contentHeight + LAYOUT_EPSILON) {
      if (
        current.hasContent &&
        current.usedHeight + groupHeight >
          input.contentHeight + LAYOUT_EPSILON
      ) {
        finishPage(first.from, "automatic");
      }
      group.forEach(addFragment);
      continue;
    }

    let lineIndex = 0;
    while (lineIndex < group.length) {
      let fitCount = 0;
      let fitHeight = 0;
      while (lineIndex + fitCount < group.length) {
        const candidate = group[lineIndex + fitCount];
        if (
          current.usedHeight + fitHeight + candidate.height >
            input.contentHeight + LAYOUT_EPSILON
        ) break;
        fitHeight += candidate.height;
        fitCount += 1;
      }

      const remainingCount = group.length - lineIndex;
      if (
        current.hasContent && fitCount < Math.min(orphanLines, remainingCount)
      ) {
        finishPage(group[lineIndex].from, "automatic");
        continue;
      }
      if (fitCount === 0) fitCount = 1;
      const afterCount = remainingCount - fitCount;
      if (
        afterCount > 0 && afterCount < widowLines && fitCount > orphanLines
      ) {
        fitCount -= widowLines - afterCount;
      }

      for (let offset = 0; offset < fitCount; offset += 1) {
        addFragment(group[lineIndex + offset]);
      }
      lineIndex += fitCount;
      if (lineIndex < group.length) {
        finishPage(group[lineIndex].from, "automatic");
      }
    }
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
