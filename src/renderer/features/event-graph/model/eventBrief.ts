import { NODE_STATUS_LABEL, relationLabel } from "./document.ts";
import { narrativeJump, type SpineItem, type SpineJump } from "./spine.ts";

export type DetailRelation = {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly type: string;
  readonly description: string;
};

export type EventBrief = {
  readonly id: string;
  readonly title: string;
  readonly proposal: boolean;
  readonly statusLabel: string;
  readonly chapterLabel: string | null;
  readonly reading: number;
  readonly storyNumber: number;
  readonly jump: SpineJump | null;
  readonly change: {
    readonly before: string;
    readonly after: string;
  };
  readonly participants: readonly {
    readonly name: string;
    readonly role: string;
    readonly kind: string;
    readonly before: string;
    readonly after: string;
  }[];
  readonly constraints: readonly {
    readonly id: string;
    readonly direction: "in" | "out";
    readonly typeLabel: string;
    readonly otherTitle: string;
    readonly description: string;
  }[];
  readonly next: { readonly title: string; readonly changeAfter: string } | null;
};

export function buildEventBrief(
  item: SpineItem & { readonly reading: number },
  cards: readonly (SpineItem & { readonly reading: number })[],
  relations: readonly DetailRelation[],
  titles: ReadonlyMap<string, string>,
  chapterLabel: string | null,
): EventBrief {
  const previous = cards.find((card) => card.reading === item.reading - 1);
  const next = cards.find((card) => card.reading === item.reading + 1);
  return {
    id: item.id,
    title: item.title,
    proposal: item.proposal,
    statusLabel: NODE_STATUS_LABEL[item.status],
    chapterLabel,
    reading: item.reading,
    storyNumber: item.storyOrder + 1,
    jump: narrativeJump(previous ? previous.storyOrder : null, item.storyOrder),
    change: {
      before: item.changeBefore,
      after: item.changeAfter,
    },
    participants: item.participants
      .filter((person) => person.name.trim() !== "")
      .map((person) => ({
        name: person.name,
        role: person.role,
        kind: person.kind,
        before: person.stateBefore,
        after: person.stateAfter,
      })),
    constraints: relations.flatMap((relation): EventBrief["constraints"][number][] => {
      if (relation.from === item.id) {
        return [{
          id: relation.id,
          direction: "out" as const,
          typeLabel: relationLabel(relation.type),
          otherTitle: titles.get(relation.to) ?? relation.to,
          description: relation.description,
        }];
      }
      if (relation.to === item.id) {
        return [{
          id: relation.id,
          direction: "in" as const,
          typeLabel: relationLabel(relation.type),
          otherTitle: titles.get(relation.from) ?? relation.from,
          description: relation.description,
        }];
      }
      return [];
    }),
    next: next ? { title: next.title, changeAfter: next.changeAfter } : null,
  };
}
