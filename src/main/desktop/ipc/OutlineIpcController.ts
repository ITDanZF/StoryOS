import { z } from "zod";
import { OUTLINE_IPC_CHANNELS } from "../../../shared/contracts/outline/channels.ts";
import {
  OUTLINE_LIMITS,
  OUTLINE_NARRATIVE_FUNCTIONS,
  OUTLINE_NODE_KINDS,
  OUTLINE_NODE_STATUSES,
  OUTLINE_PARTICIPANT_ROLES,
  OUTLINE_PLANNING_MODES,
  OUTLINE_PROMISE_STATUSES,
  OUTLINE_RELATION_TYPES,
  OUTLINE_STRUCTURAL_ROLES,
  type ApplyOutlinePatchRequest,
  type OutlinePatch,
  type OutlinePlanningScope,
  type PreviewGraphWritingRequest,
  rejectOutlineBookId,
} from "../../../shared/contracts/outline/outlineContracts.ts";
import type DesktopController from "../DesktopController.ts";
import type IpcRegistrar from "./IpcRegistrar.ts";

const id = z.string().trim().min(1).max(OUTLINE_LIMITS.id);
const text = (max: number) => z.string().max(max);
const backfillAcceptanceSchema = z.object({
  projectId: id, scanId: id, candidateIds: z.array(id).min(1).max(300),
  confirmedUncertainIds: z.array(id).max(300).optional(),
  applySuggestedUpdatesFor: z.array(id).max(300).optional(),
}).strict();
const planningScopeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("book") }).strict(),
  z.object({ kind: z.literal("stage"), stageId: id }).strict(),
  z.object({ kind: z.literal("node"), nodeId: id }).strict(),
  z.object({ kind: z.literal("relation"), sourceNodeId: id, targetNodeId: id }).strict(),
  z.object({ kind: z.literal("field"), nodeId: id, field: z.enum(["title", "summary", "goal", "conflict", "outcome", "locationText", "timeText", "notes"]) }).strict(),
]);

const profileSchema = z
  .object({
    projectId: id,
    title: text(OUTLINE_LIMITS.title),
    premise: text(OUTLINE_LIMITS.premise),
    theme: text(OUTLINE_LIMITS.theme),
    coreConflict: text(OUTLINE_LIMITS.coreConflict),
    climaxSummary: text(OUTLINE_LIMITS.climaxSummary),
    endingIntent: text(OUTLINE_LIMITS.endingIntent),
  })
  .strict();

const participantSchema = z
  .object({
    participantName: text(OUTLINE_LIMITS.participantName),
    role: z.enum(OUTLINE_PARTICIPANT_ROLES),
    stateBefore: text(OUTLINE_LIMITS.participantState),
    stateAfter: text(OUTLINE_LIMITS.participantState),
  })
  .strict();

const createValueSchema = z
  .object({
    parentId: id.nullable(),
    kind: z.enum(OUTLINE_NODE_KINDS),
    title: text(OUTLINE_LIMITS.nodeTitle),
    summary: text(OUTLINE_LIMITS.summary),
    structuralRole: z.enum(OUTLINE_STRUCTURAL_ROLES),
    narrativeFunction: z.enum(OUTLINE_NARRATIVE_FUNCTIONS),
    goal: text(OUTLINE_LIMITS.goal),
    conflict: text(OUTLINE_LIMITS.conflict),
    outcome: text(OUTLINE_LIMITS.outcome),
    locationText: text(OUTLINE_LIMITS.locationText),
    timeText: text(OUTLINE_LIMITS.timeText),
    storyOrder: z.number().int(),
    narrativeOrder: z.number().int(),
    status: z.enum(OUTLINE_NODE_STATUSES),
    notes: text(OUTLINE_LIMITS.notes),
    participants: z.array(participantSchema),
  })
  .strict();

const patchSchema = z
  .object({
    outlineId: id,
    expectedRevision: z.number().int().positive(),
    operations: z
      .array(
        z.discriminatedUnion("type", [
          z.object({ type: z.literal("create_node"), tempId: id, value: createValueSchema }).strict(),
          z
            .object({
              type: z.literal("update_node"),
              nodeId: id,
              changes: createValueSchema.partial(),
            })
            .strict(),
          z
            .object({
              type: z.literal("move_node"),
              nodeId: id,
              parentId: id.nullable(),
              order: z.number().int(),
            })
            .strict(),
          z.object({ type: z.literal("delete_node"), nodeId: id }).strict(),
          z.object({ type: z.literal("delete_relation"), relationId: id }).strict(),
          z
            .object({
              type: z.literal("upsert_relation"),
              value: z
                .object({
                  id: id.optional(),
                  sourceNodeId: id,
                  targetNodeId: id,
                  type: z.enum(OUTLINE_RELATION_TYPES),
                  description: text(OUTLINE_LIMITS.relationDescription),
                  orderException: z.boolean(),
                })
                .strict(),
            })
            .strict(),
          z
            .object({
              type: z.literal("upsert_promise"),
              value: z
                .object({
                  id: id.optional(),
                  title: text(OUTLINE_LIMITS.promiseTitle),
                  setup: text(OUTLINE_LIMITS.promiseField),
                  triggerCondition: text(OUTLINE_LIMITS.promiseField),
                  payoffRequirement: text(OUTLINE_LIMITS.promiseField),
                  status: z.enum(OUTLINE_PROMISE_STATUSES),
                  setupNodeId: id.nullable(),
                  triggerNodeId: id.nullable(),
                  payoffNodeId: id.nullable(),
                  notes: text(OUTLINE_LIMITS.promiseNotes),
                  reason: text(OUTLINE_LIMITS.reason),
                })
                .strict(),
            })
            .strict(),
        ]),
      )
      .max(OUTLINE_LIMITS.operations),
  })
  .strict();

const projectSchema = z.object({ projectId: id }).strict();

export type OutlineIpcHandlers = Pick<
  DesktopController,
  | "getOutlineSnapshot"
  | "createOutline"
  | "updateOutlineProfile"
  | "updateOutlineNode"
  | "proposeOutline"
  | "previewOutlinePatch"
  | "applyOutlinePatch"
  | "runOutlineChecks"
  | "buildChapterContext"
  | "markNodesPendingVerification"
  | "reviewChapterCoverage"
  | "loadEventGraphHandoff"
  | "waiveChapterMainline"
  | "startChapterWriting"
  | "mapOutlineNodes"
  | "unmapOutlineNode"
  | "getLatestBackfillScan"
  | "scanBackfill"
  | "previewBackfillAcceptance"
  | "acceptBackfill"
  | "getNodeBackfillEvidence"
  | "cancelBackfillScan"
  | "getLatestGraphWritingPlan"
  | "previewGraphWritingPlan"
  | "startGraphWritingPlan"
  | "cancelGraphWritingPlan"
>;

export default class OutlineIpcController {
  constructor(
    registrar: IpcRegistrar,
    getController: () => OutlineIpcHandlers,
  ) {
    const handle = registrar.handle.bind(registrar) as IpcRegistrar["handle"];
    handle(OUTLINE_IPC_CHANNELS.snapshot, (projectId: string) =>
      getController().getOutlineSnapshot(z.string().trim().min(1).max(OUTLINE_LIMITS.id).parse(projectId)),
    );
    handle(OUTLINE_IPC_CHANNELS.latestBackfill, (projectId: string) =>
      getController().getLatestBackfillScan(id.parse(projectId)),
    );
    handle(OUTLINE_IPC_CHANNELS.scanBackfill, (request: unknown) =>
      getController().scanBackfill(z.object({ projectId: id, chapterIds: z.array(id).max(300).optional(), volumeId: id.optional() }).strict().parse(withoutBookId(request))),
    );
    handle(OUTLINE_IPC_CHANNELS.previewBackfillAcceptance, (request: unknown) =>
      getController().previewBackfillAcceptance(backfillAcceptanceSchema.parse(withoutBookId(request))),
    );
    handle(OUTLINE_IPC_CHANNELS.acceptBackfill, (request: unknown) =>
      getController().acceptBackfill(backfillAcceptanceSchema.parse(withoutBookId(request))),
    );
    handle(OUTLINE_IPC_CHANNELS.nodeBackfillEvidence, (projectId: string, nodeId: string) =>
      getController().getNodeBackfillEvidence(id.parse(projectId), id.parse(nodeId)),
    );
    handle(OUTLINE_IPC_CHANNELS.cancelBackfill, (request: unknown) =>
      getController().cancelBackfillScan(z.object({ projectId: id, scanId: id }).strict().parse(withoutBookId(request))),
    );
    handle(OUTLINE_IPC_CHANNELS.latestGraphWriting, (projectId: string) =>
      getController().getLatestGraphWritingPlan(id.parse(projectId)),
    );
    handle(OUTLINE_IPC_CHANNELS.previewGraphWriting, (request: unknown) =>
      getController().previewGraphWritingPlan(z.object({
        projectId: id,
        scope: z.discriminatedUnion("kind", [
          z.object({ kind: z.literal("node"), id }).strict(),
          z.object({ kind: z.literal("stage"), id }).strict(),
        ]),
        chapterIds: z.array(id).max(20).optional(),
        rewriteChapterIds: z.array(id).max(20).optional(),
      }).strict().parse(withoutBookId(request)) as PreviewGraphWritingRequest),
    );
    handle(OUTLINE_IPC_CHANNELS.startGraphWriting, (request: unknown) =>
      getController().startGraphWritingPlan(z.object({ projectId: id, planId: id, previewDigest: z.string().length(64) }).strict().parse(withoutBookId(request))),
    );
    handle(OUTLINE_IPC_CHANNELS.cancelGraphWriting, (request: unknown) =>
      getController().cancelGraphWritingPlan(z.object({ projectId: id, planId: id }).strict().parse(withoutBookId(request))),
    );
    handle(OUTLINE_IPC_CHANNELS.create, (request: unknown) =>
      getController().createOutline(
        profileSchema
          .extend({ rootTitle: text(OUTLINE_LIMITS.nodeTitle).optional() })
          .strict()
          .parse(withoutBookId(request)),
      ),
    );
    handle(OUTLINE_IPC_CHANNELS.updateProfile, (request: unknown) =>
      getController().updateOutlineProfile(
        profileSchema.extend({ expectedRevision: z.number().int().positive() }).strict().parse(withoutBookId(request)),
      ),
    );
    handle(OUTLINE_IPC_CHANNELS.updateNode, (request: unknown) =>
      getController().updateOutlineNode(
        z
          .object({
            projectId: id,
            expectedRevision: z.number().int().positive(),
            nodeId: id,
            changes: createValueSchema.partial(),
            coverageVerification: z.object({ chapterId: id, chapterRevisionId: id }).strict().optional(),
          })
          .strict()
          .parse(withoutBookId(request)),
      ),
    );
    handle(OUTLINE_IPC_CHANNELS.propose, (request: unknown) => {
      const parsed = z
        .object({
          projectId: id,
          planningMode: z.enum(OUTLINE_PLANNING_MODES),
          parentNodeId: id.nullable(),
          instruction: text(OUTLINE_LIMITS.instruction).optional(),
          focusNodeIds: z.array(id).max(OUTLINE_LIMITS.operations).optional(),
          scope: planningScopeSchema.optional(),
          expectedOutlineRevision: z.number().int().positive().optional(),
        })
        .strict()
        .parse(withoutBookId(request));
      return getController().proposeOutline({
        projectId: parsed.projectId,
        planningMode: parsed.planningMode,
        parentNodeId: parsed.parentNodeId ?? null,
        ...(parsed.instruction !== undefined ? { instruction: parsed.instruction } : {}),
        ...(parsed.focusNodeIds !== undefined ? { focusNodeIds: parsed.focusNodeIds } : {}),
        ...(parsed.scope !== undefined ? { scope: parsed.scope as OutlinePlanningScope } : {}),
        ...(parsed.expectedOutlineRevision !== undefined ? { expectedOutlineRevision: parsed.expectedOutlineRevision } : {}),
      });
    });
    handle(OUTLINE_IPC_CHANNELS.previewPatch, (request: unknown) =>
      getController().previewOutlinePatch(patchRequest(request)),
    );
    handle(OUTLINE_IPC_CHANNELS.applyPatch, (request: unknown) =>
      getController().applyOutlinePatch(patchRequest(request)),
    );
    handle(OUTLINE_IPC_CHANNELS.check, (request: unknown) =>
      getController().runOutlineChecks(
        projectSchema.extend({ includeSemantic: z.boolean() }).strict().parse(withoutBookId(request)),
      ),
    );
    handle(OUTLINE_IPC_CHANNELS.chapterContext, (request: unknown) =>
      getController().buildChapterContext(chapterSelectionSchema().parse(withoutBookId(request))),
    );
    handle(OUTLINE_IPC_CHANNELS.markPending, (request: unknown) =>
      getController().markNodesPendingVerification(
        z
          .object({
            projectId: id,
            expectedRevision: z.number().int().positive(),
            chapterId: id,
            nodeIds: z.array(id).max(OUTLINE_LIMITS.operations),
            chapterRevisionId: id,
          })
          .strict()
          .parse(withoutBookId(request)),
      ),
    );
    handle(OUTLINE_IPC_CHANNELS.reviewCoverage, (request: unknown) =>
      getController().reviewChapterCoverage(
        z.object({ projectId: id, chapterId: id }).strict().parse(withoutBookId(request)),
      ),
    );
    handle(OUTLINE_IPC_CHANNELS.handoff, (request: unknown) =>
      getController().loadEventGraphHandoff(chapterSelectionSchema().parse(withoutBookId(request))),
    );
    handle(OUTLINE_IPC_CHANNELS.waiveMainline, (request: unknown) =>
      getController().waiveChapterMainline(z.object({ projectId: id, chapterId: id }).strict().parse(withoutBookId(request))),
    );
    handle(OUTLINE_IPC_CHANNELS.writeChapter, (request: unknown) =>
      getController().startChapterWriting(
        chapterSelectionSchema()
          .extend({
            mode: z.enum(["append", "rewrite"]),
            decision: z.enum(["generate-events", "continue"]).optional(),
            expectedHandoff: z.discriminatedUnion("status", [
              z.object({
                status: z.literal("ready"),
                outlineRevision: z.number().int().positive(),
                chapterId: id,
                chapterRevisionId: z.union([id, z.literal(null)]),
                instruction: z.string(),
                nodeIds: z.array(id),
              }).strict().transform((value) => ({
                status: value.status,
                outlineRevision: value.outlineRevision,
                chapterId: value.chapterId,
                chapterRevisionId: value.chapterRevisionId as string | null,
                instruction: value.instruction,
                nodeIds: value.nodeIds,
              })),
              z.object({
                status: z.literal("waived"),
                chapterId: id,
                chapterRevisionId: z.union([id, z.literal(null)]),
                instruction: z.string(),
                waivedAtOutlineRevision: z.union([z.number().int().positive(), z.literal(null)]),
              }).strict().transform((value) => ({
                status: value.status,
                chapterId: value.chapterId,
                chapterRevisionId: value.chapterRevisionId,
                instruction: value.instruction,
                waivedAtOutlineRevision: value.waivedAtOutlineRevision,
              })),
            ]).optional(),
          })
          .strict()
          .parse(withoutBookId(request)),
      ),
    );
    handle(OUTLINE_IPC_CHANNELS.mapNodes, (request: unknown) =>
      getController().mapOutlineNodes(
        z
          .object({
            projectId: id,
            expectedRevision: z.number().int().positive(),
            chapterId: id,
            mappings: z.array(z.object({
              nodeId: id,
              segmentIntent: text(OUTLINE_LIMITS.mappingIntent),
              expectedLocalChange: text(OUTLINE_LIMITS.mappingChange),
              sortOrder: z.number().int().nonnegative().optional(),
            }).strict()).min(1).max(OUTLINE_LIMITS.operations),
          })
          .strict()
          .parse(withoutBookId(request)),
      ),
    );
    handle(OUTLINE_IPC_CHANNELS.unmapNode, (request: unknown) =>
      getController().unmapOutlineNode(
        z
          .object({
            projectId: id,
            expectedRevision: z.number().int().positive(),
            chapterId: id,
            nodeId: id,
          })
          .strict()
          .parse(withoutBookId(request)),
      ),
    );
  }
}

function withoutBookId(value: unknown): unknown {
  rejectOutlineBookId(value);
  return value;
}

function patchRequest(request: unknown): ApplyOutlinePatchRequest {
  const parsed = z.object({ projectId: id, patch: patchSchema, scope: planningScopeSchema.optional() }).strict().parse(withoutBookId(request));
  return { projectId: parsed.projectId, patch: parsed.patch as OutlinePatch, ...(parsed.scope ? { scope: parsed.scope as OutlinePlanningScope } : {}) };
}

function chapterSelectionSchema() {
  return z
    .object({
      projectId: id,
      chapterId: id,
      selection: z.array(id).max(OUTLINE_LIMITS.operations),
    })
    .strict();
}
