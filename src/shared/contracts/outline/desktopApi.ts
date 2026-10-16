import type {
  ApplyOutlinePatchRequest,
  AcceptBackfillRequest,
  BackfillScan,
  BackfillAcceptancePreview,
  CancelGraphWritingRequest,
  CancelBackfillRequest,
  GraphWritingPlan,
  NodeBackfillEvidence,
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
  PreviewGraphWritingRequest,
  ReviewCoverageRequest,
  RunOutlineChecksRequest,
  ScanBackfillRequest,
  StartChapterWritingRequest,
  StartGraphWritingRequest,
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
  getLatestBackfillScan(projectId: string): Promise<BackfillScan | null>;
  scanBackfill(request: ScanBackfillRequest): Promise<BackfillScan>;
  previewBackfillAcceptance(request: AcceptBackfillRequest): Promise<BackfillAcceptancePreview>;
  acceptBackfill(request: AcceptBackfillRequest): Promise<OutlineSnapshot>;
  getNodeBackfillEvidence(projectId: string, nodeId: string): Promise<readonly NodeBackfillEvidence[]>;
  cancelBackfillScan(request: CancelBackfillRequest): Promise<BackfillScan>;
  getLatestGraphWritingPlan(projectId: string): Promise<GraphWritingPlan | null>;
  previewGraphWritingPlan(request: PreviewGraphWritingRequest): Promise<GraphWritingPlan>;
  startGraphWritingPlan(request: StartGraphWritingRequest): Promise<GraphWritingPlan>;
  cancelGraphWritingPlan(request: CancelGraphWritingRequest): Promise<GraphWritingPlan>;
};
