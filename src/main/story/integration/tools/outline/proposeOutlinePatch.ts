import { tool } from "langchain";
import { z } from "zod";
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
  type OutlinePatch,
} from "../../../../../shared/contracts/outline/outlineContracts.ts";
import type OutlineApplication from "../../../application/outline/OutlineApplication.ts";

function stringify(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

const participantSchema = z.object({
  participantName: z.string().max(OUTLINE_LIMITS.participantName),
  role: z.enum(OUTLINE_PARTICIPANT_ROLES),
  stateBefore: z.string().max(OUTLINE_LIMITS.participantState),
  stateAfter: z.string().max(OUTLINE_LIMITS.participantState),
});

const createValueSchema = z.object({
  parentId: z.string().nullable(),
  kind: z.enum(OUTLINE_NODE_KINDS),
  title: z.string().max(OUTLINE_LIMITS.nodeTitle),
  summary: z.string().max(OUTLINE_LIMITS.summary),
  structuralRole: z.enum(OUTLINE_STRUCTURAL_ROLES),
  narrativeFunction: z.enum(OUTLINE_NARRATIVE_FUNCTIONS),
  goal: z.string().max(OUTLINE_LIMITS.goal),
  conflict: z.string().max(OUTLINE_LIMITS.conflict),
  outcome: z.string().max(OUTLINE_LIMITS.outcome),
  locationText: z.string().max(OUTLINE_LIMITS.locationText),
  timeText: z.string().max(OUTLINE_LIMITS.timeText),
  storyOrder: z.number().int(),
  narrativeOrder: z.number().int(),
  status: z.enum(OUTLINE_NODE_STATUSES),
  notes: z.string().max(OUTLINE_LIMITS.notes),
  participants: z.array(participantSchema),
});

const patchSchema = z.object({
  outlineId: z.string().max(OUTLINE_LIMITS.id),
  expectedRevision: z.number().int().positive(),
  operations: z
    .array(
      z.discriminatedUnion("type", [
        z.object({ type: z.literal("create_node"), tempId: z.string().min(1).max(OUTLINE_LIMITS.id), value: createValueSchema }),
        z.object({ type: z.literal("update_node"), nodeId: z.string().min(1), changes: createValueSchema.partial() }),
        z.object({
          type: z.literal("move_node"),
          nodeId: z.string().min(1),
          parentId: z.string().nullable(),
          order: z.number().int(),
        }),
        z.object({ type: z.literal("delete_node"), nodeId: z.string().min(1) }),
        z.object({
          type: z.literal("upsert_relation"),
          value: z.object({
            id: z.string().min(1).optional(),
            sourceNodeId: z.string().min(1),
            targetNodeId: z.string().min(1),
            type: z.enum(OUTLINE_RELATION_TYPES),
            description: z.string().max(OUTLINE_LIMITS.relationDescription),
            orderException: z.boolean(),
          }),
        }),
        z.object({
          type: z.literal("upsert_promise"),
          value: z.object({
            id: z.string().min(1).optional(),
            title: z.string().max(OUTLINE_LIMITS.promiseTitle),
            setup: z.string().max(OUTLINE_LIMITS.promiseField),
            triggerCondition: z.string().max(OUTLINE_LIMITS.promiseField),
            payoffRequirement: z.string().max(OUTLINE_LIMITS.promiseField),
            status: z.enum(OUTLINE_PROMISE_STATUSES),
            setupNodeId: z.string().nullable(),
            triggerNodeId: z.string().nullable(),
            payoffNodeId: z.string().nullable(),
            notes: z.string().max(OUTLINE_LIMITS.promiseNotes),
            reason: z.string().max(OUTLINE_LIMITS.reason),
          }),
        }),
      ]),
    )
    .max(OUTLINE_LIMITS.operations),
});

export function createOutlineMutationTools(openOutline: () => OutlineApplication, projectId: string) {
  return [
    tool(
      async ({ planning_mode, parent_node_id }) =>
        stringify(
          await openOutline().proposeOutline({
            projectId,
            planningMode: planning_mode,
            parentNodeId: parent_node_id,
          }),
        ),
      {
        name: "propose_outline_patch",
        description: "Ask the model for an outline patch draft. The draft is not saved.",
        schema: z.object({
          planning_mode: z.enum(OUTLINE_PLANNING_MODES),
          parent_node_id: z.string().nullable(),
        }),
      },
    ),
    tool(
      async ({ patch }) => {
        const parsed = patchSchema.parse(patch) as OutlinePatch;
        return stringify(openOutline().applyOutlinePatch({ projectId, patch: parsed }));
      },
      {
        name: "apply_outline_patch",
        description: "Apply an accepted narrative outline patch. Requires approval and does not write until the revision matches.",
        schema: z.object({ patch: patchSchema }),
      },
    ),
    tool(
      async ({ chapter_id, node_ids, expected_revision }) =>
        stringify(
          openOutline().mapOutlineNodes({
            projectId,
            expectedRevision: expected_revision,
            chapterId: chapter_id,
            nodeIds: node_ids,
          }),
        ),
      {
        name: "map_outline_nodes_to_chapter",
        description: "Map outline leaf nodes onto one existing chapter. Requires approval and does not change the chapter title.",
        schema: z.object({
          chapter_id: z.string().min(1).max(OUTLINE_LIMITS.id),
          node_ids: z.array(z.string().min(1).max(OUTLINE_LIMITS.id)).min(1),
          expected_revision: z.number().int().positive(),
        }),
      },
    ),
  ];
}
