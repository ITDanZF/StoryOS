# 模块 02：事件图到章节的写作交接

> 依赖[模块 01](./01-data-and-mapping.md)。目标是让事件图页面与书籍工作区拿到同一份、精确到章节片段的主线指导。总设计见[上级文档](../event-graph-backend-integration-design.md)。

## 1. 当前代码的偏差

`OutlineContextBuilder.acceptedChapterLeaves` 只返回节点，不返回对应映射。`hardConstraints` 对每章都写入节点最终 `goal/conflict/outcome`；`neighborSection` 只查相邻叶子；`promiseSection` 对承诺触发节点用 `snapshot.mappings.find` 取第一章；`markNodesPendingVerification` 和后续 `updateOutlineNode` 把单章写作/确认映射到节点整体 `writing/covered`。这些都以“一个叶子只在一章”为前提。当前 `EventGraphHandoff` 只有 `nodeIds` 与整段 instruction，也无法表达“同一节点这次写哪一章的片段”。

现有入口包括 [`OutlineApplication.loadEventGraphHandoff/startChapterWriting`](../../../src/main/story/application/outline/OutlineApplication.ts)、[`OutlineContextBuilder.ts`](../../../src/main/story/application/outline/OutlineContextBuilder.ts)、事件图 [`ChapterHandoffDialog.tsx`](../../../src/renderer/features/event-graph/ChapterHandoffDialog.tsx) 和工作区 [`ChapterMainlineBar.tsx`](../../../src/renderer/features/book-workspace/mainline/ChapterMainlineBar.tsx)。新设计应复用一套构造函数和两个入口。

## 2. 交接输入与输出

### 2.1 明确选择

请求必须带 `chapterId` 与明确的 `mappingKeys: [{nodeId, chapterId}]`。页面的“全选本章”是前端把全部可写映射列出来，不再用空数组作为隐式全选；空数组等于**未选中，不能开始写作**。现有 `selection: nodeIds[]` 调用点直接同步改成映射键，无需为测试数据保留旧接口兼容层；图上单节点跨章生成和按阶段分章生成共用新契约。

进入交接的条件：节点已确认且为可写叶子；映射属于当前书的未删除章节；`segmentIntent` 与 `expectedLocalChange` 可用于写作；相关结构问题无阻断。节点若尚未完成叙事规划，返回可解释的缺口列表，不偷偷给空字段设默认值。

### 2.2 结构化交接

```ts
type ChapterGraphHandoff = {
  chapterId: string;
  outlineRevision: number;
  chapterRevisionId: string | null;
  chapterRowVersion: number;
  selectedMappings: Array<{ nodeId: string; chapterId: string }>;
  hardRequirements: Array<{
    nodeId: string;
    segmentIntent: string;
    expectedLocalChange: string;
  }>;
  contextSections: Array<{ kind: string; text: string; omitted: boolean }>;
  instruction: string;
  digest: string;
};
```

`instruction` 仍供现有 `ChapterGenerationService` 使用；结构化字段供预览、版本核对和覆盖记录使用。`digest` 取明确的映射键、片段文本、正式图叙事内容版本、章修订、指令文本的规范化摘要。图的纯状态字段变化不应改变写作摘要；节点/关系/片段正文变化必须改变。不能只按全局 outline revision 判定所有章节交接同时过期。

## 3. 指令拼装顺序

| 优先级 | 内容 | 写法与界限 |
|---|---|---|
| 1 | 本章必须完成的局部变化 | 每条映射的 `segmentIntent/expectedLocalChange`、本章人物状态与必要关系；绝不把跨章节点的最终结果当成当前章必须兑现 |
| 2 | 全局故事意图 | 全书主题、核心冲突、节点的总目标与最终结果；标明“全局终点，仅作方向”，完成片段除外 |
| 3 | 已有正文和前章变化 | 按当前正式章节修订检索少量证据，注明章节和修订；不让同一节点前章内容被重新生成 |
| 4 | 事件依赖与承诺 | 直接的因果/前置/揭示关系，当前片段应触发的承诺；跨章承诺查全部映射和实际触发章，不取第一条 |
| 5 | 后续边界 | 同节点之后的章节片段、下一可写事件；只用于过渡，不在当前章提前完成 |

先保留硬约束，再按相关性裁剪背景证据。`OUTLINE_INSTRUCTION_MAX_CHARS` 现为 4000，超过时优先缩短证据摘录和外围背景；硬约束仍超出时返回 `too-large` 和具体字段/映射来源，不截断 `expectedLocalChange`。多节点同章写作按映射 `sortOrder`，并说明与 `storyOrder/narrativeOrder` 不同的倒叙关系。

## 4. 执行与覆盖更新

1. 预览时生成交接结构，展示选中映射、每条局部变化、目标章现有正文状态和实际 `instruction`。
2. 执行前重新构造交接并比较 `digest`、目标章节 `currentRevisionId/rowVersion`。不一致则拒绝本次写入、保留作者当前选择并要求重新预览。
3. 调用现有单章生成服务，写入成功后读取**保存后的章节修订 ID**，仅将本次 selectedMappings 的覆盖状态更新为 `drafted`/待核验。现有 `ChapterGenerationService` 结果只有修订号，必要时扩展返回修订 ID 或可靠地再读取当前修订，不能猜测。
4. 写作保存成功、映射状态更新失败时，返回“正文已保存、覆盖标记待重试”的部分成功结果，并提供可幂等的补标记用例；不能向 UI 报整体失败后让用户再次续写同一段。
5. `reviewChapterCoverage` 按映射片段核对该章实际变化与证据；作者确认一条映射后再推导节点整体覆盖。正文修订改变使相应映射证据过期。

无图或无映射时沿用现有 `missing/waived` 语义，但事件图页面主动生成正文应要求 ready 交接；“放弃主线继续写”只由作者在明确的无主线流程中选择，不能作为图上生成的静默回退。

## 5. 改动清单

- **Shared/IPC**：扩展 `EventGraphHandoff` 或增设 V2；请求选择改为映射键；定义 `missing/too-large/stale/ready/waived` 的可展示原因；同步 `OutlineIpcController` 严格 schema。
- **业务**：`acceptedChapterLeaves` 改为可写映射集合；重写 `hardConstraints`、`neighborSection`、`promiseSection`；`OutlineApplication` 标记单章覆盖并处理部分成功；检查修订有效性。
- **书籍工作区**：主线条按节点分组显示本章片段，不把节点最终结果误写成当前章目标；两个页面调同一预览接口。
- **测试**：`OutlineContextBuilder.test.ts`、`outlineHandoff.test.ts`、`ChapterGenerationService.outline.test.ts` 与前端 `chapterMainline.test.ts`。

## 6. 验收场景

| 场景 | 必须成立的结果 |
|---|---|
| 同一节点入第 3、7 章 | 第 3 章只写怀疑，第 7 章才确认；两份交接的映射键、硬约束不同 |
| 同章两个节点，仅选其中一个 | 预览和执行只展开所选节点；另一个只作为背景，不因空选择自动全选 |
| 改第 7 章局部要求 | 第 7 章原交接失效；第 3 章若未受影响不因纯状态修订被迫重做 |
| 生成成功后标记失败 | 正文修订仍存在，界面显示部分成功；重试补状态不追加第二遍正文 |
| 改写旧章节正文 | 该章覆盖证据待复核，其它章有效覆盖不被清空 |
