import { z } from "zod";

const nonEmptyText = z.string().trim().min(1);
const taskId = z.string().regex(/^[a-z][a-z0-9_-]*$/);

export const plannedTaskSchema = z.object({
  id: taskId,
  title: nonEmptyText,
  objective: nonEmptyText,
  agentType: taskId,
  dependsOn: z.array(taskId).max(6),
  required: z.boolean(),
  expectedOutput: nonEmptyText,
  acceptanceCriteria: z.array(nonEmptyText).min(1).max(6),
  sideEffect: z.literal("none"),
  timeoutMs: z.number().int().min(1_000).max(60_000),
  maxAttempts: z.number().int().min(1).max(2),
}).strict();

const directPlanDraftSchema = z.object({
  version: z.literal(1),
  mode: z.literal("direct"),
  goal: nonEmptyText,
}).strict();

const plannedPlanDraftSchema = z.object({
  version: z.literal(1),
  mode: z.literal("planned"),
  goal: nonEmptyText,
  tasks: z.array(plannedTaskSchema).min(1).max(6),
  finalAcceptanceCriteria: z.array(nonEmptyText).min(1).max(8),
}).strict();

export const executionPlanDraftSchema = z.discriminatedUnion("mode", [
  directPlanDraftSchema,
  plannedPlanDraftSchema,
]);

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
