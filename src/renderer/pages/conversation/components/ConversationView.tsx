import ConversationViewport from "../../../features/agent/conversation/components/ConversationViewport.tsx";

type ConversationViewProps = {
  readonly loading: boolean;
};

const globalSuggestions = [
  "帮我规划今天要做的任务",
  "把这个想法拆成可执行步骤",
  "检查当前方案的风险点",
];

export default function ConversationView({
  loading,
}: ConversationViewProps) {
  return (
    <ConversationViewport
      emptyDescription="这里适合做全局问题拆解、项目规划和跨上下文讨论。"
      emptyTitle="开始一段新对话"
      loading={loading}
      suggestions={globalSuggestions}
    />
  );
}
