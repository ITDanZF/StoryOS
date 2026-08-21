import AgentActivityTimeline from "../../../features/agent/components/AgentActivityTimeline.tsx";
import ChatViewport from "../../../features/agent/components/ChatViewport.tsx";
import type {
  MessageView,
  PendingToolApprovalView,
  ResolveToolApproval,
  ToolActivityView,
} from "../../../features/agent/types.ts";

type ConversationViewProps = {
  readonly messages: readonly MessageView[];
  readonly loading: boolean;
  readonly pendingApprovals: readonly PendingToolApprovalView[];
  readonly toolActivities: readonly ToolActivityView[];
  readonly onResolveApproval: ResolveToolApproval;
};

const globalSuggestions = [
  "帮我规划今天要做的任务",
  "把这个想法拆成可执行步骤",
  "检查当前方案的风险点",
];

function getRunIdFromMessageId(messageId: string): string | null {
  if (messageId.startsWith("answer-")) return messageId.slice("answer-".length);
  if (messageId.startsWith("draft-")) return messageId.slice("draft-".length);
  return null;
}

export default function ConversationView({
  messages,
  loading,
  pendingApprovals,
  toolActivities,
  onResolveApproval,
}: ConversationViewProps) {
  const messageRunIds = new Set(messages.map((message) => getRunIdFromMessageId(message.id)).filter((runId): runId is string => Boolean(runId)));
  const orphanApprovals = pendingApprovals.filter((approval) => !messageRunIds.has(approval.runId));
  const orphanActivities = toolActivities.filter((activity) => !messageRunIds.has(activity.runId));

  return (
    <ChatViewport
      emptyDescription="这里适合做全局问题拆解、项目规划和跨上下文讨论。长回复、代码块和列表会自动优化展示。"
      emptyTitle="开始一段新对话"
      footer={(orphanApprovals.length > 0 || orphanActivities.length > 0) && (
        <AgentActivityTimeline
          approvals={orphanApprovals}
          activities={orphanActivities}
          defaultOpen={orphanApprovals.length > 0 || orphanActivities.some((activity) => activity.status === "started")}
          title="当前执行过程"
          onResolveApproval={onResolveApproval}
        />
      )}
      loading={loading}
      messages={messages}
      renderMessageFooter={(message) => {
        const runId = getRunIdFromMessageId(message.id);
        if (!runId) return null;
        const messageApprovals = pendingApprovals.filter((approval) => approval.runId === runId);
        const messageActivities = toolActivities.filter((activity) => activity.runId === runId);
        if (messageApprovals.length === 0 && messageActivities.length === 0) return null;
        return (
          <AgentActivityTimeline
            approvals={messageApprovals}
            activities={messageActivities}
            defaultOpen={message.streaming || messageApprovals.length > 0 || messageActivities.some((activity) => activity.status === "started")}
            title={message.streaming ? "正在执行" : "本次执行过程"}
            onResolveApproval={onResolveApproval}
          />
        );
      }}
      suggestions={globalSuggestions}
    />
  );
}
