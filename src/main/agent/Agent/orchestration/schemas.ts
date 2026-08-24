import { z } from "zod";

const nonEmptyText = z.string().trim().min(1);
const taskId = z.string().regex(/^[a-z][a-z0-9_-]*$/);

export const executionRequirementsSchema = z.object({
  capabilities: z.array(z.enum([
    "conversation.respond",
    "workspace.read",
    "workspace.write",
    "text.inspect",
    "text.search",
    "text.rewrite",
    "text.review",
    "book.read",
    "book.write",
    "editor.read",
    "editor.write",
    "skill.write",
  ])).min(1),
  effects: z.array(z.enum([
    "workspace.write",
    "book.write",
    "editor.write",
    "skill.write",
  ])),
  contextKinds: z.array(z.enum(["global", "book-editor"])).min(1),
  outputKind: z.literal("text"),
  decomposition: z.enum(["forbidden", "optional", "required"]),
}).strict();

export const proposedTaskSchema = z.object({
  id: taskId,
  title: nonEmptyText,
  objective: nonEmptyText,
  dependsOn: z.array(taskId).max(6),
  required: z.boolean(),
  expectedOutput: nonEmptyText,
  acceptanceCriteria: z.array(nonEmptyText).min(1).max(6),
  requirements: executionRequirementsSchema,
  timeoutMs: z.number().int().min(1_000).max(60_000),
  maxAttempts: z.number().int().min(1).max(2),
}).strict();

export const proposedPlanDraftSchema = z.object({
  version: z.literal(2),
  mode: z.literal("planned"),
  goal: nonEmptyText,
  tasks: z.array(proposedTaskSchema).min(1).max(6),
  finalAcceptanceCriteria: z.array(nonEmptyText).min(1).max(8),
}).strict();

export const reviewResultSchema = z.object({
  decision: z.enum(["pass", "retry", "fail"]),
  score: z.number().min(0).max(1),
  findings: z.array(z.object({
    criterion: nonEmptyText,
    passed: z.boolean(),
    severity: z.enum(["info", "warning", "error"]),
    message: nonEmptyText,
  }).strict()).max(12),
  retryInstruction: nonEmptyText.optional(),
}).strict().superRefine((review, context) => {
  if (review.decision === "retry" && !review.retryInstruction) {
    context.addIssue({
      code: "custom",
      message: "retryInstruction is required when decision is retry.",
      path: ["retryInstruction"],
    });
  }
});
