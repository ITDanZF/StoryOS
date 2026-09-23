import type {
  ApplyOutlinePatchRequest,
  BuildChapterContextRequest,
  ChapterWritingResult,
  CreateOutlineRequest,
  EventGraphHandoff,
  LoadHandoffRequest,
  MapOutlineNodesRequest,
  MarkNodesPendingRequest,
  OutlineChapterContext,
  OutlinePatchPreview,
  OutlinePatchResult,
  OutlineProposal,
  OutlineSnapshot,
  ProposeOutlineRequest,
  ReviewCoverageRequest,
  RunOutlineChecksRequest,
  StartChapterWritingRequest,
  UnmapOutlineNodeRequest,
  UpdateOutlineNodeRequest,
  UpdateOutlineProfileRequest,
  WaiveMainlineRequest,
} from "./outlineContracts.ts";

export type OutlineDesktopApi = {
  getOutlineSnapshot(projectId: string): Promise<OutlineSnapshot | null>;
  createOutline(request: CreateOutlineRequest): Promise<OutlineSnapshot>;
  updateOutlineProfile(request: UpdateOutlineProfileRequest): Promise<OutlineSnapshot>;
  updateOutlineNode(request: UpdateOutlineNodeRequest): Promise<OutlinePatchResult>;
  proposeOutline(request: ProposeOutlineRequest): Promise<OutlineProposal>;
  previewOutlinePatch(request: ApplyOutlinePatchRequest): Promise<OutlinePatchPreview>;
  applyOutlinePatch(request: ApplyOutlinePatchRequest): Promise<OutlinePatchResult>;
  runOutlineChecks(request: RunOutlineChecksRequest): Promise<OutlineSnapshot>;
  buildChapterContext(request: BuildChapterContextRequest): Promise<OutlineChapterContext>;
  markNodesPendingVerification(request: MarkNodesPendingRequest): Promise<OutlineSnapshot>;
  reviewChapterCoverage(request: ReviewCoverageRequest): Promise<OutlineSnapshot>;
  loadEventGraphHandoff(request: LoadHandoffRequest): Promise<EventGraphHandoff>;
  waiveChapterMainline(request: WaiveMainlineRequest): Promise<EventGraphHandoff>;
  startChapterWriting(request: StartChapterWritingRequest): Promise<ChapterWritingResult>;
  mapOutlineNodes(request: MapOutlineNodesRequest): Promise<OutlineSnapshot>;
  unmapOutlineNode(request: UnmapOutlineNodeRequest): Promise<OutlineSnapshot>;
};
