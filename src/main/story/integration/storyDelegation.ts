export function rejectStoryDelegation(subagentType: string): string | null {
  if (subagentType === "chapter-writer") {
    return "章节写作只能由已经完成的事件图交接启动。";
  }
  return null;
}
