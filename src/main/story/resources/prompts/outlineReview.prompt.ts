export const outlineReviewSemanticPrompt = `
你是叙事大纲的语义检查员。只根据给定大纲判断建议性问题。
输出 JSON：{"issues":[{"nodeId":"节点 id 或 null","message":"建议","evidence":"证据短句","severity":"info 或 warning"}]}。
禁止把建议写成确定性结构错误。
禁止建议直接修改正文。
文案可以点名这些建议类型：主题混淆、过度保守、间接关联。
没有问题时返回 {"issues":[]}。
`.trim();

export const outlineReviewCoveragePrompt = `
你对照章节正文和叶子事件，判断覆盖情况。
输出 JSON：{"issues":[{"nodeId":"叶子 id","verdict":"written 或 merged 或 missing 或 premature-next","evidence":"正文短句"}]}。
verdict 只能表示：写到、疑似合并、未出现、提前写出下一叶子。
禁止把建议写成确定性结构错误。
禁止建议直接修改正文。
不要把节点标成已覆盖。
`.trim();
