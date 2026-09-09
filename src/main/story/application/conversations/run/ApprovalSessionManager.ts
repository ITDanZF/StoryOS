import type { ToolApprovalDecision, ToolApprovalRequest } from "../../../../agent/tools/security/ToolPolicy.ts";
import { createToolApprovalPreview } from "../../../integration/StoryToolPreview.ts";
import type { AgentRunner } from "../agentPorts.ts";
import ConversationEventAssembler from "./ConversationEventAssembler.ts";
import type { RunRecord } from "./RunStateStore.ts";
type PendingApproval = {
  readonly runId: string;
  readonly toolCallId: string;
  readonly resolve: (decision: ToolApprovalDecision) => void;
  resolving?: boolean;
};
export default class ApprovalSessionManager {
  constructor(
    private readonly runs: { get(id: string): RunRecord | undefined },
    private readonly runner: Pick<AgentRunner, "cancelRun">,
    private readonly assembler: Pick<ConversationEventAssembler, "emitConversation">,
  ) {}
  private readonly pendingApprovals = new Map<string, PendingApproval>();

  async resolveApproval(approvalId: string, decision: ToolApprovalDecision): Promise<boolean> {
    const pending = this.pendingApprovals.get(approvalId);
    if (!pending || pending.resolving) {
      return false;
    }

    pending.resolving = true;
    const run = this.runs.get(pending.runId);
    try {
      if (run) {
        await this.assembler.emitConversation(pending.runId, run.threadId, {
          type: "approval.resolved",
          payload: {
            approvalId,
            toolCallId: pending.toolCallId,
            decision,
          },
        });
      }
      const active =
        this.pendingApprovals.get(approvalId) === pending &&
        run &&
        !run.cancelError &&
        !run.settled;
      this.pendingApprovals.delete(approvalId);
      pending.resolve(active ? decision : "deny");
      return Boolean(active);
    } catch (error) {
      this.pendingApprovals.delete(approvalId);
      if (run && error instanceof Error) run.cancelError = error;
      pending.resolve("deny");
      this.runner.cancelRun(pending.runId, error);
      throw error;
    }
  }

  async requestApproval(
    runId: string,
    request: ToolApprovalRequest,
  ): Promise<ToolApprovalDecision> {
    const activeRun = this.runs.get(runId);
    if (!activeRun || activeRun.settled || activeRun.cancelError) return "deny";
    const approvalId = `approval_${crypto.randomUUID()}`;
    const decision = new Promise<ToolApprovalDecision>((resolve) => {
      this.pendingApprovals.set(approvalId, {
        runId,
        toolCallId: request.toolCallId,
        resolve,
      });
    });

    const run = this.runs.get(runId);
    const preview = createToolApprovalPreview(request);
    try {
      if (run) {
        await this.assembler.emitConversation(runId, run.threadId, {
          type: "approval.requested",
          payload: {
            approvalId,
            toolCallId: request.toolCallId,
            toolName: request.toolName,
            summary: request.summary,
            preview,
          },
        });
      }
    } catch (error) {
      this.pendingApprovals.delete(approvalId);
      throw error;
    }
    return decision;
  }

  rejectPendingApprovals(runId: string): void {
    for (const [approvalId, pending] of this.pendingApprovals) {
      if (pending.runId === runId) {
        this.pendingApprovals.delete(approvalId);
        pending.resolve("deny");
      }
    }
  }
  clear(): void {
    for (const pending of this.pendingApprovals.values()) pending.resolve("deny");
    this.pendingApprovals.clear();
  }
}
