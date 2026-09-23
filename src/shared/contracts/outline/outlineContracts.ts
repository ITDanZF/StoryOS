export const OUTLINE_LIMITS = Object.freeze({
  title: 200,
  premise: 4_000,
  theme: 2_000,
  coreConflict: 4_000,
  climaxSummary: 4_000,
  endingIntent: 4_000,
  nodeTitle: 200,
  summary: 1_000,
  goal: 2_000,
  conflict: 2_000,
  outcome: 2_000,
  locationText: 500,
  timeText: 500,
  notes: 4_000,
  relationDescription: 2_000,
  participantName: 80,
  participantState: 2_000,
  promiseTitle: 200,
  promiseField: 4_000,
  promiseNotes: 4_000,
  reason: 2_000,
  issueMessage: 2_000,
  id: 200,
  operations: 200,
  instruction: 4_000,
});

export const OUTLINE_INSTRUCTION_MAX_CHARS = OUTLINE_LIMITS.instruction;
export const OUTLINE_PROPOSAL_MAX_NEW_NODES = 8;

export const OUTLINE_STATUSES = ["draft", "active", "archived"] as const;
export const OUTLINE_NODE_KINDS = ["arc", "beat", "scene", "event"] as const;
export const OUTLINE_STRUCTURAL_ROLES = [
  "setup",
  "inciting_incident",
  "rising_action",
  "turning_point",
  "crisis",
  "climax",
  "falling_action",
  "resolution",
  "custom",
] as const;
export const OUTLINE_NARRATIVE_FUNCTIONS = [
  "action",
  "dialogue",
  "exposition",
  "worldbuilding",
  "relationship",
  "mystery",
  "transition",
  "mixed",
] as const;
export const OUTLINE_NODE_STATUSES = [
  "draft",
  "confirmed",
  "writing",
  "covered",
  "needs_revision",
] as const;
export const OUTLINE_RELATION_TYPES = [
  "causes",
  "requires",
  "reveals",
  "foreshadows",
  "contrasts",
] as const;
export const OUTLINE_COVERAGE_STATUSES = ["planned", "drafted", "verified", "deviated"] as const;
export const OUTLINE_PARTICIPANT_ROLES = ["focus", "active", "supporting", "mentioned"] as const;
export const OUTLINE_PROMISE_STATUSES = [
  "planned",
  "seeded",
  "eligible",
  "paid_off",
  "abandoned",
] as const;
export const OUTLINE_ISSUE_SEVERITIES = ["info", "warning", "error"] as const;
export const OUTLINE_ISSUE_SOURCES = ["rule", "ai"] as const;
export const OUTLINE_ISSUE_STATUSES = ["open", "ignored", "resolved"] as const;
export const OUTLINE_PLANNING_MODES = ["climax-first", "sequential"] as const;

export type OutlineStatus = (typeof OUTLINE_STATUSES)[number];
export type OutlineNodeKind = (typeof OUTLINE_NODE_KINDS)[number];
export type OutlineStructuralRole = (typeof OUTLINE_STRUCTURAL_ROLES)[number];
export type OutlineNarrativeFunction = (typeof OUTLINE_NARRATIVE_FUNCTIONS)[number];
export type OutlineNodeStatus = (typeof OUTLINE_NODE_STATUSES)[number];
export type OutlineRelationType = (typeof OUTLINE_RELATION_TYPES)[number];
export type OutlineCoverageStatus = (typeof OUTLINE_COVERAGE_STATUSES)[number];
export type OutlineParticipantRole = (typeof OUTLINE_PARTICIPANT_ROLES)[number];
export type OutlinePromiseStatus = (typeof OUTLINE_PROMISE_STATUSES)[number];
export type OutlineIssueSeverity = (typeof OUTLINE_ISSUE_SEVERITIES)[number];
export type OutlineIssueSource = (typeof OUTLINE_ISSUE_SOURCES)[number];
export type OutlineIssueStatus = (typeof OUTLINE_ISSUE_STATUSES)[number];
export type OutlinePlanningMode = (typeof OUTLINE_PLANNING_MODES)[number];

export type Outline = {
  readonly id: string;
  readonly novelId: string;
  readonly title: string;
  readonly premise: string;
  readonly theme: string;
  readonly coreConflict: string;
  readonly climaxSummary: string;
  readonly endingIntent: string;
  readonly status: OutlineStatus;
  readonly revision: number;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type OutlineNode = {
  readonly id: string;
  readonly outlineId: string;
  readonly parentId: string | null;
  readonly kind: OutlineNodeKind;
  readonly title: string;
  readonly summary: string;
  readonly structuralRole: OutlineStructuralRole;
  readonly narrativeFunction: OutlineNarrativeFunction;
  readonly goal: string;
  readonly conflict: string;
  readonly outcome: string;
  readonly locationText: string;
  readonly timeText: string;
  readonly storyOrder: number;
  readonly narrativeOrder: number;
  readonly status: OutlineNodeStatus;
  readonly notes: string;
  readonly revision: number;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type OutlineNodeRelation = {
  readonly id: string;
  readonly outlineId: string;
  readonly sourceNodeId: string;
  readonly targetNodeId: string;
  readonly type: OutlineRelationType;
  readonly description: string;
  readonly orderException: boolean;
  readonly createdAt: string;
};

export type ChapterOutlineMapping = {
  readonly chapterId: string;
  readonly nodeId: string;
  readonly sortOrder: number;
  readonly coverageStatus: OutlineCoverageStatus;
  readonly coverageNote: string;
  readonly verificationOutlineRevision: number | null;
  readonly verificationChapterRevisionId: string | null;
};

export type OutlineNodeParticipant = {
  readonly nodeId: string;
  readonly participantName: string;
  readonly role: OutlineParticipantRole;
  readonly stateBefore: string;
  readonly stateAfter: string;
};

export type NarrativePromise = {
  readonly id: string;
  readonly outlineId: string;
  readonly title: string;
  readonly setup: string;
  readonly triggerCondition: string;
  readonly payoffRequirement: string;
  readonly status: OutlinePromiseStatus;
  readonly setupNodeId: string | null;
  readonly triggerNodeId: string | null;
  readonly payoffNodeId: string | null;
  readonly notes: string;
  readonly statusReason: string;
  readonly revision: number;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type OutlineIssue = {
  readonly id: string;
  readonly outlineId: string;
  readonly nodeId: string | null;
  readonly ruleCode: string;
  readonly severity: OutlineIssueSeverity;
  readonly source: OutlineIssueSource;
  readonly message: string;
  readonly fingerprint: string;
  readonly status: OutlineIssueStatus;
  readonly checkedRevision: number;
  readonly stale: boolean;
};

export type OutlineSnapshot = {
  readonly outline: Outline;
  readonly nodes: readonly OutlineNode[];
  readonly relations: readonly OutlineNodeRelation[];
  readonly mappings: readonly ChapterOutlineMapping[];
  readonly participants: readonly OutlineNodeParticipant[];
  readonly promises: readonly NarrativePromise[];
  readonly issues: readonly OutlineIssue[];
};

export type OutlineParticipantInput = {
  readonly participantName: string;
  readonly role: OutlineParticipantRole;
  readonly stateBefore: string;
  readonly stateAfter: string;
};

export type CreateNodeInput = {
  readonly parentId: string | null;
  readonly kind: OutlineNodeKind;
  readonly title: string;
  readonly summary: string;
  readonly structuralRole: OutlineStructuralRole;
  readonly narrativeFunction: OutlineNarrativeFunction;
  readonly goal: string;
  readonly conflict: string;
  readonly outcome: string;
  readonly locationText: string;
  readonly timeText: string;
  readonly storyOrder: number;
  readonly narrativeOrder: number;
  readonly status: OutlineNodeStatus;
  readonly notes: string;
  readonly participants: readonly OutlineParticipantInput[];
};

export type UpdateNodeInput = {
  readonly parentId?: string | null;
  readonly kind?: OutlineNodeKind;
  readonly title?: string;
  readonly summary?: string;
  readonly structuralRole?: OutlineStructuralRole;
  readonly narrativeFunction?: OutlineNarrativeFunction;
  readonly goal?: string;
  readonly conflict?: string;
  readonly outcome?: string;
  readonly locationText?: string;
  readonly timeText?: string;
  readonly storyOrder?: number;
  readonly narrativeOrder?: number;
  readonly status?: OutlineNodeStatus;
  readonly notes?: string;
  readonly participants?: readonly OutlineParticipantInput[];
};

export type RelationInput = {
  readonly id?: string;
  readonly sourceNodeId: string;
  readonly targetNodeId: string;
  readonly type: OutlineRelationType;
  readonly description: string;
  readonly orderException: boolean;
};

export type PromiseInput = {
  readonly id?: string;
  readonly title: string;
  readonly setup: string;
  readonly triggerCondition: string;
  readonly payoffRequirement: string;
  readonly status: OutlinePromiseStatus;
  readonly setupNodeId: string | null;
  readonly triggerNodeId: string | null;
  readonly payoffNodeId: string | null;
  readonly notes: string;
  readonly reason: string;
};

export type OutlinePatchOperation =
  | { readonly type: "create_node"; readonly tempId: string; readonly value: CreateNodeInput }
  | { readonly type: "update_node"; readonly nodeId: string; readonly changes: UpdateNodeInput }
  | {
      readonly type: "move_node";
      readonly nodeId: string;
      readonly parentId: string | null;
      readonly order: number;
    }
  | { readonly type: "delete_node"; readonly nodeId: string }
  | { readonly type: "upsert_relation"; readonly value: RelationInput }
  | { readonly type: "upsert_promise"; readonly value: PromiseInput };

export type OutlinePatch = {
  readonly outlineId: string;
  readonly expectedRevision: number;
  readonly operations: readonly OutlinePatchOperation[];
};

export type OutlinePatchPreview = {
  readonly childNodeIds: readonly string[];
  readonly relationIds: readonly string[];
  readonly mappings: readonly { readonly nodeId: string; readonly chapterId: string }[];
  readonly promiseIds: readonly string[];
};

export type OutlinePatchResult = {
  readonly snapshot: OutlineSnapshot;
  readonly affectedNodeIds: readonly string[];
};

export type OutlineEvidence = {
  readonly chapterId: string;
  readonly revisionId: string;
  readonly startOffset: number;
  readonly endOffset: number;
  readonly content: string;
};

export type OutlineChapterContext = {
  readonly usedCharacters: number;
  readonly omittedSections: readonly string[];
  readonly instruction: string;
};

export type OutlineProposalProblem = {
  readonly tempId: string | null;
  readonly message: string;
};

export type OutlineProposal =
  | { readonly status: "draft"; readonly patch: OutlinePatch; readonly summary: string }
  | { readonly status: "repairable"; readonly problems: readonly OutlineProposalProblem[] };

export type EventGraphHandoff =
  | {
      readonly status: "ready";
      readonly outlineRevision: number;
      readonly chapterId: string;
      readonly instruction: string;
      readonly nodeIds: readonly string[];
    }
  | {
      readonly status: "missing";
      readonly reason: "no-outline" | "no-accepted-leaf";
      readonly chapterId: string;
    }
  | {
      readonly status: "waived";
      readonly chapterId: string;
      readonly instruction: string;
      readonly waivedAtOutlineRevision: number | null;
    }
  | { readonly status: "too-large"; readonly chapterId: string };

export type ChapterWritingResult =
  | {
      readonly status: "choice";
      readonly reason: "no-outline" | "no-accepted-leaf";
      readonly chapterId: string;
    }
  | { readonly status: "too-large"; readonly chapterId: string }
  | { readonly status: "event-graph"; readonly chapterId: string; readonly proposal: OutlineProposal }
  | {
      readonly status: "written";
      readonly handoff: Extract<EventGraphHandoff, { status: "ready" | "waived" }>;
      readonly result: {
        readonly generationId: string;
        readonly chapterId: string;
        readonly revisionNumber: number;
        readonly characterCount: number;
        readonly generatedCharacterCount: number;
      };
    };

export type CreateOutlineRequest = {
  readonly projectId: string;
  readonly title: string;
  readonly premise: string;
  readonly theme: string;
  readonly coreConflict: string;
  readonly climaxSummary: string;
  readonly endingIntent: string;
  readonly rootTitle?: string;
};

export type UpdateOutlineProfileRequest = {
  readonly projectId: string;
  readonly expectedRevision: number;
  readonly title: string;
  readonly premise: string;
  readonly theme: string;
  readonly coreConflict: string;
  readonly climaxSummary: string;
  readonly endingIntent: string;
};

export type ProposeOutlineRequest = {
  readonly projectId: string;
  readonly planningMode: OutlinePlanningMode;
  readonly parentNodeId: string | null;
};

export type ApplyOutlinePatchRequest = {
  readonly projectId: string;
  readonly patch: OutlinePatch;
};

export type RunOutlineChecksRequest = {
  readonly projectId: string;
  readonly includeSemantic: boolean;
};

export type BuildChapterContextRequest = {
  readonly projectId: string;
  readonly chapterId: string;
  readonly selection: readonly string[];
};

export type MarkNodesPendingRequest = {
  readonly projectId: string;
  readonly expectedRevision: number;
  readonly chapterId: string;
  readonly nodeIds: readonly string[];
  readonly chapterRevisionId: string;
};

export type ReviewCoverageRequest = {
  readonly projectId: string;
  readonly chapterId: string;
};

export type LoadHandoffRequest = {
  readonly projectId: string;
  readonly chapterId: string;
  readonly selection: readonly string[];
};

export type WaiveMainlineRequest = {
  readonly projectId: string;
  readonly chapterId: string;
};

export type StartChapterWritingRequest = {
  readonly projectId: string;
  readonly chapterId: string;
  readonly selection: readonly string[];
  readonly mode: "append" | "rewrite";
  readonly decision?: "generate-events" | "continue";
};

export type UpdateOutlineNodeRequest = {
  readonly projectId: string;
  readonly expectedRevision: number;
  readonly nodeId: string;
  readonly changes: UpdateNodeInput;
};

export type MapOutlineNodesRequest = {
  readonly projectId: string;
  readonly expectedRevision: number;
  readonly chapterId: string;
  readonly nodeIds: readonly string[];
};

export type UnmapOutlineNodeRequest = {
  readonly projectId: string;
  readonly expectedRevision: number;
  readonly nodeId: string;
};

export function outlineTextLength(value: string): number {
  return Array.from(value).length;
}

export function rejectOutlineBookId(value: unknown): void {
  if (value !== null && typeof value === "object" && "bookId" in value) {
    throw new Error("bookId is not accepted.");
  }
}
