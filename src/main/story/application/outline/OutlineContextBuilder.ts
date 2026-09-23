import {
  OUTLINE_INSTRUCTION_MAX_CHARS,
  outlineTextLength,
  type OutlineChapterContext,
  type OutlineEvidence,
  type OutlineNode,
  type OutlineSnapshot,
} from "../../../../shared/contracts/outline/outlineContracts.ts";
import { OutlineContextTooLarge } from "./outlineErrors.ts";
import { isLeaf } from "./outlineChecks.ts";

export const WAIVED_MAINLINE_INSTRUCTION = [
  "本次没有事件主线。",
  "作者已选择放弃事件图，仍然写作。",
  "正文不得声称情节来自事件图。",
].join("\n");

const NEXT_LEAF_MARKER = "只用于过渡，不得展开";

export type OutlineReadingChapter = {
  readonly id: string;
  readonly title: string;
  readonly index: number;
};

type Section = {
  id: string;
  text: string;
  detailed?: boolean;
};

export function acceptedChapterLeaves(snapshot: OutlineSnapshot, chapterId: string): OutlineNode[] {
  const mapped = new Set(
    snapshot.mappings.filter((mapping) => mapping.chapterId === chapterId).map((mapping) => mapping.nodeId),
  );
  return snapshot.nodes
    .filter((node) => node.status === "confirmed" && mapped.has(node.id) && isLeaf(snapshot, node.id))
    .sort((left, right) => left.narrativeOrder - right.narrativeOrder || left.id.localeCompare(right.id));
}

export function chosenChapterLeaves(
  snapshot: OutlineSnapshot,
  chapterId: string,
  selection: readonly string[],
): OutlineNode[] {
  const accepted = acceptedChapterLeaves(snapshot, chapterId);
  if (selection.length === 0) return accepted;
  const selected = new Set(selection);
  return accepted.filter((node) => selected.has(node.id));
}

export function buildChapterInstruction(input: {
  readonly snapshot: OutlineSnapshot;
  readonly chapterId: string;
  readonly selection: readonly string[];
  readonly chapters: readonly OutlineReadingChapter[];
  readonly evidence: readonly OutlineEvidence[];
}): OutlineChapterContext {
  const chosen = chosenChapterLeaves(input.snapshot, input.chapterId, input.selection);
  const hard = hardConstraints(input.snapshot, chosen);
  if (outlineTextLength(hard) > OUTLINE_INSTRUCTION_MAX_CHARS) {
    throw new OutlineContextTooLarge();
  }
  const sections: Section[] = [
    { id: "hard", text: hard },
    { id: "ancestors", text: ancestorSection(input.snapshot, chosen) },
    { id: "neighbors", text: neighborSection(input.snapshot, chosen) },
    { id: "chapter-leaves", text: otherLeafSection(input.snapshot, input.chapterId, chosen) },
    { id: "participant-state", text: participantStateSection(input.snapshot, chosen) },
    { id: "promises", text: promiseSection(input.snapshot, input.chapterId, input.chapters) },
    evidenceSection(input.evidence),
  ].filter((section) => section.text.trim() !== "");
  const omitted: string[] = [];
  const active = [...sections];
  while (outlineTextLength(render(active)) > OUTLINE_INSTRUCTION_MAX_CHARS) {
    const last = active.at(-1);
    if (!last || last.id === "hard") throw new OutlineContextTooLarge();
    if (last.id === "evidence" && last.detailed) {
      last.text = evidenceWithoutContent(input.evidence);
      last.detailed = false;
      omitted.push("evidence-content");
      if (last.text.trim() === "") active.pop();
      continue;
    }
    omitted.push(last.id);
    active.pop();
  }
  const instruction = render(active);
  return {
    usedCharacters: outlineTextLength(instruction),
    omittedSections: omitted,
    instruction,
  };
}

function render(sections: readonly Section[]): string {
  return sections
    .map((section) => section.text.trim())
    .filter((text) => text !== "")
    .join("\n\n");
}

function hardConstraints(snapshot: OutlineSnapshot, chosen: readonly OutlineNode[]): string {
  const lines = [
    "硬约束",
    `主题：${snapshot.outline.theme}`,
    `核心冲突：${snapshot.outline.coreConflict}`,
    `结局意图：${snapshot.outline.endingIntent}`,
  ];
  for (const node of chosen) {
    const participants = snapshot.participants.filter((participant) => participant.nodeId === node.id);
    lines.push(
      [
        `事件：${node.title}`,
        `目标：${node.goal}`,
        `冲突：${node.conflict}`,
        `结果：${node.outcome}`,
        `地点：${node.locationText}`,
        `时间：${node.timeText}`,
        `参与者：${participants
          .map(
            (participant) =>
              `${participant.participantName}（${participant.role}；事件前：${participant.stateBefore}；事件后：${participant.stateAfter}）`,
          )
          .join("、")}`,
      ].join("\n"),
    );
  }
  return lines.join("\n");
}

function ancestorSection(snapshot: OutlineSnapshot, chosen: readonly OutlineNode[]): string {
  const lines: string[] = [];
  const seen = new Set<string>();
  for (const node of chosen) {
    let parentId = node.parentId;
    const chain: OutlineNode[] = [];
    while (parentId) {
      const parent = snapshot.nodes.find((item) => item.id === parentId);
      if (!parent || seen.has(parent.id)) break;
      seen.add(parent.id);
      chain.push(parent);
      parentId = parent.parentId;
    }
    for (const ancestor of chain.reverse()) {
      lines.push(`${ancestor.title}：${ancestor.summary}`);
    }
  }
  return lines.length === 0 ? "" : ["祖先", ...lines].join("\n");
}

function neighborSection(snapshot: OutlineSnapshot, chosen: readonly OutlineNode[]): string {
  if (chosen.length === 0) return "";
  const leaves = snapshot.nodes
    .filter((node) => isLeaf(snapshot, node.id))
    .sort((left, right) => left.narrativeOrder - right.narrativeOrder || left.id.localeCompare(right.id));
  const first = chosen[0];
  const last = chosen[chosen.length - 1];
  if (!first || !last) return "";
  const firstIndex = leaves.findIndex((node) => node.id === first.id);
  const lastIndex = leaves.findIndex((node) => node.id === last.id);
  const lines: string[] = ["相邻事件"];
  const previous = firstIndex > 0 ? leaves[firstIndex - 1] : undefined;
  if (previous) lines.push(`前一叶子：${previous.title}：${previous.summary}`);
  const chosenIds = new Set(chosen.map((node) => node.id));
  for (const relation of snapshot.relations) {
    if ((relation.type !== "requires" && relation.type !== "causes") || !chosenIds.has(relation.targetNodeId)) {
      continue;
    }
    if (chosenIds.has(relation.sourceNodeId)) continue;
    const source = snapshot.nodes.find((node) => node.id === relation.sourceNodeId);
    if (!source) continue;
    lines.push(`因果前置：${source.title}：${source.summary}`);
  }
  const next = lastIndex >= 0 ? leaves[lastIndex + 1] : undefined;
  if (next) lines.push(`下一叶子（${NEXT_LEAF_MARKER}）：${next.title}：${next.summary}`);
  return lines.length === 1 ? "" : lines.join("\n");
}

function otherLeafSection(
  snapshot: OutlineSnapshot,
  chapterId: string,
  chosen: readonly OutlineNode[],
): string {
  const chosenIds = new Set(chosen.map((node) => node.id));
  const mapped = new Set(
    snapshot.mappings.filter((mapping) => mapping.chapterId === chapterId).map((mapping) => mapping.nodeId),
  );
  const lines = snapshot.nodes
    .filter((node) => mapped.has(node.id) && isLeaf(snapshot, node.id) && !chosenIds.has(node.id))
    .map((node) => `${node.title}：${node.status}`);
  return lines.length === 0 ? "" : ["本章其他叶子", ...lines].join("\n");
}

function participantStateSection(snapshot: OutlineSnapshot, chosen: readonly OutlineNode[]): string {
  const lines: string[] = [];
  for (const node of chosen) {
    const participants = snapshot.participants.filter((participant) => participant.nodeId === node.id);
    for (const participant of participants) {
      const earlier = snapshot.nodes
        .filter((item) => item.narrativeOrder < node.narrativeOrder)
        .filter((item) =>
          snapshot.participants.some(
            (candidate) =>
              candidate.nodeId === item.id && candidate.participantName === participant.participantName,
          ),
        )
        .sort((left, right) => right.narrativeOrder - left.narrativeOrder || right.id.localeCompare(left.id));
      const prior = earlier[0];
      if (!prior) continue;
      const state = snapshot.participants.find(
        (candidate) => candidate.nodeId === prior.id && candidate.participantName === participant.participantName,
      );
      if (!state || state.stateAfter.trim() === "") continue;
      lines.push(`${participant.participantName} 在「${prior.title}」之后：${state.stateAfter}`);
    }
  }
  return lines.length === 0 ? "" : ["参与者状态", ...lines].join("\n");
}

function promiseSection(
  snapshot: OutlineSnapshot,
  chapterId: string,
  chapters: readonly OutlineReadingChapter[],
): string {
  const current = chapters.find((chapter) => chapter.id === chapterId);
  if (!current) return "";
  const lines: string[] = [];
  for (const promise of snapshot.promises) {
    if (promise.status !== "eligible" || promise.triggerNodeId === null) continue;
    const mapping = snapshot.mappings.find((item) => item.nodeId === promise.triggerNodeId);
    if (!mapping) continue;
    const triggerChapter = chapters.find((chapter) => chapter.id === mapping.chapterId);
    if (!triggerChapter || triggerChapter.index > current.index) continue;
    lines.push(`${promise.title}：${promise.payoffRequirement}`);
  }
  return lines.length === 0 ? "" : ["可兑现承诺", ...lines].join("\n");
}

function evidenceSection(evidence: readonly OutlineEvidence[]): Section {
  if (evidence.length === 0) {
    return { id: "evidence", text: "检索证据\n没有命中", detailed: false };
  }
  const lines = evidence.map(
    (item) =>
      `章节 ${item.chapterId}，修订 ${item.revisionId}，偏移 ${item.startOffset}-${item.endOffset}：${item.content}`,
  );
  return { id: "evidence", text: ["检索证据", ...lines].join("\n"), detailed: true };
}

function evidenceWithoutContent(evidence: readonly OutlineEvidence[]): string {
  if (evidence.length === 0) return "";
  const lines = evidence.map(
    (item) => `章节 ${item.chapterId}，修订 ${item.revisionId}，偏移 ${item.startOffset}-${item.endOffset}`,
  );
  return ["检索证据", ...lines].join("\n");
}
