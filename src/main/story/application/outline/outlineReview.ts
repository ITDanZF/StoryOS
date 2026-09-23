import { z } from "zod";
import {
  OUTLINE_LIMITS,
  type OutlineIssue,
  type OutlineSnapshot,
} from "../../../../shared/contracts/outline/outlineContracts.ts";
import {
  outlineReviewCoveragePrompt,
  outlineReviewSemanticPrompt,
} from "../../resources/prompts/outlineReview.prompt.ts";
import { OutlineModelError } from "./outlineErrors.ts";

const semanticSchema = z.object({
  issues: z.array(
    z.object({
      nodeId: z.string().nullable(),
      message: z.string().min(1).max(OUTLINE_LIMITS.issueMessage),
      evidence: z.string().min(1).max(OUTLINE_LIMITS.issueMessage),
      severity: z.enum(["info", "warning"]),
    }),
  ),
});

const coverageSchema = z.object({
  issues: z.array(
    z.object({
      nodeId: z.string().min(1),
      verdict: z.enum(["written", "merged", "missing", "premature-next"]),
      evidence: z.string().min(1).max(OUTLINE_LIMITS.issueMessage),
    }),
  ),
});

const VERDICTS = {
  written: ["coverage.written", "info", "写到"],
  merged: ["coverage.merged", "warning", "疑似合并"],
  missing: ["coverage.missing", "warning", "未出现"],
  "premature-next": ["coverage.premature_next", "warning", "提前写出下一叶子"],
} as const;

export function renderSemanticPrompt(snapshot: OutlineSnapshot): string {
  return `${outlineReviewSemanticPrompt}\n${JSON.stringify({
    theme: snapshot.outline.theme,
    coreConflict: snapshot.outline.coreConflict,
    endingIntent: snapshot.outline.endingIntent,
    nodes: snapshot.nodes.map((node) => ({
      id: node.id,
      title: node.title,
      summary: node.summary,
      goal: node.goal,
      conflict: node.conflict,
      outcome: node.outcome,
    })),
  })}`;
}

export function renderCoveragePrompt(
  snapshot: OutlineSnapshot,
  chapterText: string,
  leaves: readonly { readonly id: string; readonly title: string; readonly goal: string }[],
): string {
  return `${outlineReviewCoveragePrompt}\n${JSON.stringify({ chapterText, leaves })}`;
}

export function readSemanticIssues(
  text: string,
  snapshot: OutlineSnapshot,
  allocateId: (prefix: string) => string,
  chapterRevisionId: string,
): OutlineIssue[] {
  const parsed = parseJson(text, semanticSchema, "语义检查输出无法解析。");
  return parsed.issues.map((issue) => {
    if (issue.nodeId !== null && !snapshot.nodes.some((node) => node.id === issue.nodeId)) {
      throw new OutlineModelError("语义检查输出无法解析。");
    }
    const node = snapshot.nodes.find((item) => item.id === issue.nodeId);
    const checkedRevision = node?.revision ?? snapshot.outline.revision;
    return {
      id: allocateId("issue"),
      outlineId: snapshot.outline.id,
      nodeId: issue.nodeId,
      ruleCode: "semantic.suggestion",
      severity: issue.severity,
      source: "ai",
      message: `${issue.message} ${issue.evidence}`,
      fingerprint: [
        "semantic.suggestion",
        issue.nodeId ?? "",
        String(checkedRevision),
        String(snapshot.outline.revision),
        chapterRevisionId,
      ].join("\u001f"),
      status: "open",
      checkedRevision,
      stale: false,
    };
  });
}

export function readCoverageIssues(
  text: string,
  snapshot: OutlineSnapshot,
  chapterRevisionId: string,
  allocateId: (prefix: string) => string,
): OutlineIssue[] {
  const parsed = parseJson(text, coverageSchema, "覆盖检查输出无法解析。");
  return parsed.issues.map((issue) => {
    const node = snapshot.nodes.find((item) => item.id === issue.nodeId);
    if (!node) throw new OutlineModelError("覆盖检查输出无法解析。");
    const [ruleCode, severity, label] = VERDICTS[issue.verdict];
    return {
      id: allocateId("issue"),
      outlineId: snapshot.outline.id,
      nodeId: node.id,
      ruleCode,
      severity,
      source: "ai",
      message: `${label}：${issue.evidence}`,
      fingerprint: [
        ruleCode,
        node.id,
        String(node.revision),
        String(snapshot.outline.revision),
        chapterRevisionId,
      ].join("\u001f"),
      status: "open",
      checkedRevision: node.revision,
      stale: false,
    };
  });
}

function parseJson<T>(text: string, schema: z.ZodType<T>, message: string): T {
  let value: unknown;
  try {
    const trimmed = text.trim();
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
    value = JSON.parse(fenced?.[1]?.trim() || trimmed);
  } catch (error) {
    throw new OutlineModelError(error instanceof Error ? error.message : message);
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new OutlineModelError(message);
  return parsed.data;
}
