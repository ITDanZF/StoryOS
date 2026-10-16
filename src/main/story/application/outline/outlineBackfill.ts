import { z } from "zod";
import { OUTLINE_RELATION_TYPES, type BackfillCandidate, type BackfillEvidence, type OutlinePatchOperation, type OutlineSnapshot } from "../../../../shared/contracts/outline/outlineContracts.ts";
import type { StoredChapter } from "../../storage/book/SqliteOutlineStore.ts";
import { OutlineModelError } from "./outlineErrors.ts";

export const BACKFILL_EXTRACTOR_VERSION = "event-graph-1";
const CHUNK_SIZE = 5_000;
const CHUNK_OVERLAP = 250;
const CATALOG_LIMIT = 80;

const eventSchema = z.object({
  title: z.string().trim().min(1).max(160),
  summary: z.string().max(1_200),
  goal: z.string().max(600),
  conflict: z.string().max(600),
  outcome: z.string().max(600),
  excerpt: z.string().trim().min(2).max(800),
  matchedNodeId: z.string().nullable(),
  uncertain: z.boolean(),
  segmentIntent: z.string().trim().min(1).max(600),
  expectedLocalChange: z.string().trim().min(1).max(600),
  explanation: z.string().trim().min(1).max(600),
  relations: z.array(z.object({
    targetNodeId: z.string().min(1),
    type: z.enum(OUTLINE_RELATION_TYPES),
    direction: z.enum(["to", "from"]),
    description: z.string().trim().min(1).max(600),
    evidenceExcerpt: z.string().trim().min(2).max(800),
  })).max(8).optional(),
});
const resultSchema = z.object({ events: z.array(eventSchema).max(12) });
type ExtractedEvent = z.infer<typeof eventSchema>;

export function backfillChunks(text: string): readonly { readonly start: number; readonly text: string }[] {
  const points = Array.from(text);
  const chunks: { start: number; text: string }[] = [];
  for (let start = 0; start < points.length; start += CHUNK_SIZE - CHUNK_OVERLAP) {
    chunks.push({ start, text: points.slice(start, start + CHUNK_SIZE).join("") });
    if (start + CHUNK_SIZE >= points.length) break;
  }
  return chunks;
}

export function backfillPrompt(snapshot: OutlineSnapshot, chapter: StoredChapter, chunk: string): string {
  const mapped = new Set(snapshot.mappings.filter((mapping) => mapping.chapterId === chapter.id).map((mapping) => mapping.nodeId));
  const catalog = snapshot.nodes
    .filter((node) => node.kind === "event")
    .map((node) => ({ node, score: (chunk.includes(node.title) ? 2 : 0) + (mapped.has(node.id) ? 1 : 0) }))
    .sort((left, right) => right.score - left.score || right.node.storyOrder - left.node.storyOrder)
    .slice(0, CATALOG_LIMIT)
    .map(({ node }) => ({ id: node.id, title: node.title, goal: node.goal, outcome: node.outcome }));
  return [
    "从以下小说正文中提取真实发生或明确揭示的关键事件。只输出 JSON：",
    '{"events":[{"title":"","summary":"","goal":"","conflict":"","outcome":"","excerpt":"正文中连续且逐字相同的短引文","matchedNodeId":null,"uncertain":false,"segmentIntent":"本章如何铺设或推进该事件","expectedLocalChange":"本章局部变化","explanation":"提取或匹配依据","relations":[]}]}',
    "没有事件时返回 events 空数组。人物猜测、谎言或回忆不可靠时 uncertain=true。未知目标、结果保留空字符串。",
    "excerpt 必须是输入正文中连续出现的原文；不要改写或拼接。章节相邻不构成因果。",
    "只有正文明确支持且指向已有节点时才填写 relations。targetNodeId 必须来自已有节点目录，evidenceExcerpt 必须逐字出现在本片段；direction=to 表示本事件指向目标事件，from 表示反向。不确定时留空数组。",
    `已有节点（matchedNodeId 只能取其中 ID）：${JSON.stringify(catalog)}`,
    `章节：${chapter.title}\n正文片段：\n${chunk}`,
  ].join("\n\n");
}

export function readBackfillEvents(raw: string): readonly ExtractedEvent[] {
  const fenced = raw.trim().match(/```(?:json)?\s*([\s\S]*?)```/);
  let value: unknown;
  try {
    value = JSON.parse(fenced?.[1] ?? raw.trim());
  } catch {
    throw new OutlineModelError("正文事件提取未返回有效 JSON");
  }
  const parsed = resultSchema.safeParse(value);
  if (!parsed.success) throw new OutlineModelError("正文事件提取结构不完整");
  return parsed.data.events;
}

export function extractedCandidate(
  snapshot: OutlineSnapshot,
  chapter: StoredChapter,
  start: number,
  chunk: string,
  event: ExtractedEvent,
): BackfillCandidate | null {
  if (!chapter.currentRevisionId) return null;
  const local = Array.from(chunk);
  const excerpt = Array.from(event.excerpt);
  const index = local.join("").indexOf(event.excerpt);
  if (index < 0) throw new OutlineModelError("模型给出的证据不在章节原文中");
  const localOffset = Array.from(local.join("").slice(0, index)).length;
  const evidence: BackfillEvidence = {
    chapterId: chapter.id,
    revisionId: chapter.currentRevisionId,
    startOffset: start + localOffset,
    endOffset: start + localOffset + excerpt.length,
    excerpt: event.excerpt,
  };
  const matched = event.matchedNodeId
    ? snapshot.nodes.find((node) => node.id === event.matchedNodeId && node.kind === "event")
    : snapshot.nodes.find((node) => node.kind === "event" && event.outcome.trim() !== "" &&
      node.title.trim() === event.title && node.goal.trim() === event.goal.trim() && node.outcome.trim() === event.outcome.trim());
  const tempId = `backfill_${crypto.randomUUID()}`;
  const nodeRef = matched?.id ?? tempId;
  const suggestedChanges = matched ? {
    ...(event.summary.trim() && event.summary !== matched.summary ? { summary: event.summary } : {}),
    ...(event.goal.trim() && event.goal !== matched.goal ? { goal: event.goal } : {}),
    ...(event.conflict.trim() && event.conflict !== matched.conflict ? { conflict: event.conflict } : {}),
    ...(event.outcome.trim() && event.outcome !== matched.outcome ? { outcome: event.outcome } : {}),
  } : {};
  const suggestsUpdate = Object.keys(suggestedChanges).length > 0;
  const fieldDiff: BackfillCandidate["fieldDiff"] = matched
    ? (["summary", "goal", "conflict", "outcome"] as const).filter((field) => field in suggestedChanges)
      .map((field) => ({ field, before: matched[field], after: event[field] }))
    : [];
  const relationOperations: OutlinePatchOperation[] = [];
  const relationEvidence: BackfillEvidence[] = [];
  let omittedRelation = false;
  for (const relation of event.relations ?? []) {
    const target = snapshot.nodes.find((node) => node.id === relation.targetNodeId && node.kind === "event");
    const relationIndex = chunk.indexOf(relation.evidenceExcerpt);
    if (!target || target.id === nodeRef || relationIndex < 0) { omittedRelation = true; continue; }
    const sourceNodeId = relation.direction === "to" ? nodeRef : target.id;
    const targetNodeId = relation.direction === "to" ? target.id : nodeRef;
    if (snapshot.relations.some((existing) => existing.sourceNodeId === sourceNodeId && existing.targetNodeId === targetNodeId && existing.type === relation.type)) continue;
    const relationStart = start + Array.from(chunk.slice(0, relationIndex)).length;
    relationEvidence.push({ chapterId: chapter.id, revisionId: chapter.currentRevisionId,
      startOffset: relationStart, endOffset: relationStart + Array.from(relation.evidenceExcerpt).length,
      excerpt: relation.evidenceExcerpt });
    relationOperations.push({ type: "upsert_relation", value: {
      sourceNodeId, targetNodeId,
      type: relation.type, description: relation.description, orderException: false,
    } });
  }
  const nodeOperations: OutlinePatchOperation[] = matched
    ? suggestsUpdate && !event.uncertain ? [{ type: "update_node", nodeId: matched.id, changes: suggestedChanges }] : []
    : [{
      type: "create_node", tempId, value: {
        parentId: null, kind: "event", title: event.title, summary: event.summary,
        structuralRole: "custom", narrativeFunction: "mixed", goal: event.goal,
        conflict: event.conflict, outcome: event.outcome, locationText: "", timeText: "",
        storyOrder: snapshot.nodes.length, narrativeOrder: snapshot.nodes.length,
        status: "draft", notes: "", participants: [],
      },
    }];
  return {
    candidateId: `candidate_${crypto.randomUUID()}`,
    disposition: event.uncertain || event.matchedNodeId && !matched ? "uncertain" : matched ? suggestsUpdate ? "update-suggested" : "matched" : "new",
    displayTitle: event.title,
    fieldDiff,
    ...(matched ? { matchedNodeId: matched.id } : {}),
    patchOperations: [...nodeOperations, ...relationOperations],
    mappingChanges: [{
      nodeRef,
      chapterId: chapter.id,
      segmentIntent: event.segmentIntent,
      expectedLocalChange: event.expectedLocalChange,
    }],
    evidence: [evidence, ...relationEvidence].filter((item, position, all) =>
      all.findIndex((candidate) => candidate.chapterId === item.chapterId && candidate.startOffset === item.startOffset && candidate.endOffset === item.endOffset) === position),
    explanation: omittedRelation ? `${event.explanation}；缺少可靠证据或目标的关系未加入候选` : event.explanation,
  };
}

export function mergeBackfillCandidates(candidates: readonly BackfillCandidate[]): readonly BackfillCandidate[] {
  const merged: BackfillCandidate[] = [];
  const keyOf = (candidate: BackfillCandidate) => {
    if (candidate.matchedNodeId) return `node:${candidate.matchedNodeId}`;
    const create = candidate.patchOperations.find((operation) => operation.type === "create_node");
    if (!create || !create.value.outcome.trim()) return candidate.candidateId;
    return `new:${create.value.title.trim().toLowerCase()}|${create.value.goal.trim().toLowerCase()}|${create.value.outcome.trim().toLowerCase()}`;
  };
  for (const candidate of candidates) {
    const key = keyOf(candidate);
    const index = merged.findIndex((item) => keyOf(item) === key && item.disposition === candidate.disposition);
    if (index < 0) { merged.push(candidate); continue; }
    const prior = merged[index];
    if (!prior) continue;
    const nodeRef = prior.matchedNodeId ?? prior.patchOperations.find((operation) => operation.type === "create_node")?.tempId;
    const candidateRef = candidate.matchedNodeId ?? candidate.patchOperations.find((operation) => operation.type === "create_node")?.tempId;
    const relationOperations = candidate.patchOperations.filter((operation) => operation.type === "upsert_relation").map((operation) => ({
      ...operation,
      value: {
        ...operation.value,
        sourceNodeId: operation.value.sourceNodeId === candidateRef ? nodeRef ?? operation.value.sourceNodeId : operation.value.sourceNodeId,
        targetNodeId: operation.value.targetNodeId === candidateRef ? nodeRef ?? operation.value.targetNodeId : operation.value.targetNodeId,
      },
    }));
    const relations = [...prior.patchOperations, ...relationOperations].filter((operation, position, all) => operation.type !== "upsert_relation" ||
      all.findIndex((item) => item.type === "upsert_relation" && item.value.sourceNodeId === operation.value.sourceNodeId &&
        item.value.targetNodeId === operation.value.targetNodeId && item.value.type === operation.value.type) === position);
    merged[index] = {
      ...prior,
      patchOperations: relations,
      mappingChanges: [...prior.mappingChanges, ...candidate.mappingChanges.map((mapping) => ({ ...mapping, nodeRef: nodeRef ?? mapping.nodeRef }))]
        .filter((mapping, position, all) => all.findIndex((item) => item.chapterId === mapping.chapterId) === position),
      evidence: [...prior.evidence, ...candidate.evidence].filter((evidence, position, all) =>
        all.findIndex((item) => item.chapterId === evidence.chapterId && item.startOffset === evidence.startOffset) === position),
      explanation: `${prior.explanation}；${candidate.explanation}`,
    };
  }
  return merged;
}
