# 模块 05：从事件图直接生成正文

> 依赖[模块 01](./01-data-and-mapping.md)的跨章映射与[模块 02](./02-writing-handoff.md)的局部交接。单节点和阶段范围都在事件图页面启动；生成结果仍是书籍工作区的正式章节修订。

## 1. 实现边界

现有 [`ChapterGenerationService.generate`](../../../src/main/story/application/books/ChapterGenerationService.ts) 接受**一个** `chapterId`、`append/rewrite` 和一段指令，流式输出，最后通过 `NovelApplication.saveRevision` 落库。它保存时检查当前修订和 `rowVersion`；书籍库 `chapter_revisions` 已有 `source_run_id`，`NovelApplication.saveRevision` 可透传 `sourceRunId`，但生成服务目前没有传入。现有 [`OutlineApplication.startChapterWriting`](../../../src/main/story/application/outline/OutlineApplication.ts) 完成单章交接与写作，属于可复用的核心路径。

图上生成**不新建正文表、不让事件图 Agent 写正文、不让 renderer 自己循环调用单章 API**。在 `src/main/story/application/` 新增图上写作编排用例，调用同一交接构造和同一单章生成服务。当前 `chapter-writer` Skill 可继续约束文风与执行纪律；事件图 Agent 负责规划图，不担任批量正文写手。

## 2. 范围转成章节步骤

### 2.1 单节点

选中已确认可写叶子后，列出它的全部章节映射，默认建议未 `verified` 的片段。作者可选一个章、连续几章或全部映射。每章使用自己的 `segmentIntent/expectedLocalChange`。节点未映射、映射片段不完整或章已删除时不能执行，预览显示需要补的具体项目。

### 2.2 阶段

从底部阶段括号进入，取该 `arc` 的后代中已确认的可写叶子；按章节映射分组。**同一章节包含多个所选节点时只生成一次**，交接里按映射顺序列出全部局部变化。若阶段还包含未入章节点或草稿节点，预览列出“本次跳过/必须先补”的明确清单，作者须确认执行范围；不暗中生成新章节。阶段本身不作为正文节点。限制一次计划的章节和节点上限，超过后提示缩小阶段范围或分批执行。

步骤顺序按书籍目录章节顺序，章内按映射 `sortOrder`；`narrativeOrder/storyOrder` 随交接说明倒叙和因果，不能仅因为故事时间早就把正文生成顺序倒过来。一个跨章节点的前章已经生成时，后章要从最新正式正文读取前情，避免重新书写前章片段。

## 3. 预览契约

```ts
type GraphWritingPlan = {
  planId: string;
  projectId: string;
  scope: { kind: "node" | "stage"; id: string };
  outlineRevision: number;
  status: "previewed" | "running" | "completed" | "partial" | "failed" | "cancelled";
  steps: Array<{
    stepId: string;
    chapterId: string;
    mappingKeys: Array<{ nodeId: string; chapterId: string }>;
    mode: "append" | "rewrite";
    expectedChapterRevisionId: string | null;
    expectedChapterRowVersion: number;
    handoffDigest: string;
    state: "pending" | "running" | "saved" | "failed" | "cancelled";
    savedRevisionId?: string;
    errorCode?: string;
  }>;
};
```

预览逐章展示：目标章节、选中节点与片段、现有正文是否为空、本次续写/改写、写作指令、预计模型调用次数、阻断问题与风险。已有正文默认 `append`；`rewrite` 对每个目标章都需要显式选择，不能用阶段按钮对所有章默认重写。作者可在预览中取消章节或节点，但变更后必须重算交接和计划摘要。

## 4. 执行与恢复算法

1. `previewGraphWritingPlan` 在后端冻结范围与每章基线。`startGraphWritingPlan` 根据 `planId + 预览摘要` 启动；检查书籍归属、计划未重复运行、映射仍合法、目标章节的当前修订与行版本未变。
2. 以**单章步骤串行**执行。每步开始前按当前图与前文重新构造交接；如果前一步只修改覆盖状态，不应造成伪冲突。如果作者在期间修改了后续章正文或主线内容，该步骤暂停并报告需要重新预览。
3. 调用 `ChapterGenerationService.generate` 时传 `sourceRunId = stepId`，并让结果返回保存的 `revisionId`。写入 Tiptap 修订后，将步骤置 `saved`，再把该步骤选中的映射标为 `drafted` 和待核验。模型预览页的临时文本不当作已保存正文。
4. 若进程在“正文已经保存、步骤状态尚未写入”之间中断，恢复时按 `sourceRunId/stepId` 在 `chapter_revisions` 找到已落库修订，补记 `saved`；**不得再次 append**。必要时对图上生成的 `sourceRunId` 建唯一约束或幂等查询，保证同一步最多保存一次。
5. 后续步骤失败时保留成功章，任务标 `partial`，记录每章原因。重试只处理剩余步骤，并以最新前文重算交接；重算结果若变化，要求作者确认。取消停止当前流和未开始步骤，不回滚已保存章节修订。
6. 同一目标章同时只能有一个写作任务；正在编辑且有未保存本地草稿时前端显著提示，正式修订乐观锁仍由后端最终把关。不能以旧预览覆盖作者新保存的正文。

生成服务的保存成功与状态标记分为两个事务，故返回值要能表示“正文已保存但覆盖状态待补”。UI 遇到这个结果应提供“打开已生成章节”和补标记重试，不提供会重复生成正文的普通重试按钮。

## 5. 持久化与事件

图上计划使用书籍库中的 `graph_writing_runs/graph_writing_steps` 或与项目现有任务存储一致的表：保存 scope、预览摘要、步骤顺序、状态、期望修订、`sourceRunId`、实际 `revisionId`、错误类别和时间。正文仍只在 `chapter_revisions/revision_documents`。步骤引用节点和映射时要考虑 [`SqliteOutlineStore.commit`](../../../src/main/story/storage/book/SqliteOutlineStore.ts) 的全量重建行为，避免任务历史被级联清掉。

复用已有 `chapter_generation_*` 流式事件，并在编排层附 `planId/stepId/chapterId` 关联；前端重开页面以持久化计划为准恢复状态，不能只靠进程内事件。日志不写正文或整段提示词。为单章生成增加 `sourceRunId` 应保持旧入口兼容：未带该值时继续沿用现有生成行为。

## 6. 预计改动与验收

| 步骤 | 工作 | 通过条件 |
|---|---|---|
| G1. 范围展开与计划预览 | 新的编排用例、shared 契约、IPC | 单节点多章、阶段多节点能得出正确的每章一次步骤；映射缺口可见 |
| G2. 保存来源与幂等 | `ChapterGenerationService`、`NovelApplication`、修订查询 | 每步修订记录来源；进程中断后能辨认已保存结果，重试不重复 append |
| G3. 串行执行与取消 | 计划存储、并发锁、逐章交接 | 前章写入后后章读到最新前情；取消不丢已保存章 |
| G4. 部分成功与恢复 | 任务状态、错误类型、恢复查询 | 第 2 章失败时第 1 章仍存在；重试只处理第 2 章及以后 |
| G5. 覆盖记录 | 映射状态与修订证据 | 只标已保存步骤的映射；AI 不自动标 `verified/covered` |

核心测试应覆盖：单章单节点、单章多节点、单节点多章、阶段多章、已有正文 append、显式 rewrite、章节并发编辑、图修订变化、取消、模型空响应、保存后任务状态失败与重启恢复。图上页面交互见[模块 06](./06-renderer-integration.md)。
