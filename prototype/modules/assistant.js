export function agentProcessMarkup() {
  return `<section class="agent-process"><header><span>✦ Agent 执行过程</span><small>已完成</small></header><ol><li class="done"><i>✓</i><div><b>读取章节上下文</b><small>已读取当前章节与书籍简介</small></div></li><li class="done"><i>✓</i><div><b>分析叙事节奏</b><small>识别出 3 个可强化节点</small></div></li><li class="done"><i>✓</i><div><b>生成修改建议</b><small>等待你决定是否应用</small></div></li></ol><footer><button data-action="reject-agent-change">暂不应用</button><button class="primary" data-action="approve-agent-change">批准修改</button></footer></section>`;
}

export function assistantReply(scope, chapterTitle) {
  return scope === "global"
    ? "这是一个全局对话，我不会自动读取任何项目或书籍内容。可以继续讨论写作方法、灵感或创作计划。"
    : `我已结合《${chapterTitle}》当前内容完成分析。建议把人物的具体目标提前，并让环境异常直接阻碍这个目标。`;
}
