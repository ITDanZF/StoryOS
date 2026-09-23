# 叙事事件后端执行方案

> 文档状态：后端阶段 1–5 已写入代码，尚未接渲染进程  
> 生成日期：2026-09-23  
> 进度：2026-09-23，阶段 1–5 后端已落地。没有主线时返回 `choice`，不创建 `chapter-writer` 运行；`generate-events` 只做一次 `outline:propose` 并返回候选，不落库、不启动 event-graph 运行；`continue` 先写入放弃记录，再以 `waived` 写作。主 Agent 的 `delegate_task` 不能直接委派 `chapter-writer`。验证：`npx tsc --noEmit -p tsconfig.backend.json` 通过；`node scripts/verify-agent-boundary.cjs` 通过；改动范围内 eslint 通过；`npx vitest run` 覆盖 `src/main/story/application/outline`、`SqliteOutlineStore.test.ts`、`OutlineIpcController.test.ts`、`IpcRegistrar.test.ts`、`outlineTools.test.ts`、`delegateTask.test.ts`、`ChapterGenerationService.outline.test.ts`，10 个文件、32 个测试通过。未覆盖：真实 Electron 窗口里的不可信 frame、真实模型的语义检查与覆盖判断、带模型的端到端专员运行、渲染进程页面。  
> 本轮范围：只做后端。依据 `docs/architecture/narrative-event-backend.md`。  
> 关联文档：  
> - `docs/architecture/narrative-event-backend.md`（本轮步骤的来源）  
> - `docs/architecture/narrative-event-model.md`（上下文包与流水线）  
> - `docs/todo/outline-module-design-analysis.md` 第 6–10 节（字段与检查）  
> - `docs/architecture/narrative-event-frontend-prototype.md`（不进入本轮）

本文只排列主进程、共享契约、桌面 IPC、preload 桥和产品运行时 Skill 的实现步骤。渲染进程的页面、顶栏模式和对话框留到单独的前端轮次，不作为本轮完成标准。

产品行为以后端架构为准。交接结果的形状以本文第 2.1 节为准：后端架构第 7 节末句「只有交接成功才允许写作子 Agent 运行」与用户可放弃主线冲突，本轮按第 2.1 节实现。询问用户的界面不在本轮；本轮把这次选择做成可调用的用例返回值。

## 1. 执行结论

按后端架构第 14 节的顺序做，不要跳：

```text
契约、迁移 101、存储和 patch 事务
  → 大纲工具和 event-graph Skill
  → 确定性检查和候选预览
  → loadEventGraphHandoff 与 chapter-writer Skill
  → 语义检查和覆盖判断
```

本轮改动落在这些位置：

```text
src/shared/contracts/outline/
src/main/story/application/outline/
src/main/story/storage/book/
src/main/story/integration/tools/outline/
src/main/story/resources/prompts/outlineReview.prompt.ts
src/main/desktop/ipc/OutlineIpcController.ts
src/preload/agentApi.ts          只增加 outline 通道
skills/event-graph/SKILL.md
skills/chapter-writer/SKILL.md
```

不改 `src/renderer/`。不把大纲节点、承诺或章节映射类型放进 `src/main/agent`。主 Agent 仍是现有书籍对话。第一步只有两个子 Agent：`event-graph` 和 `chapter-writer`。只有主 Agent 持有 `delegate_task`。

字段仍用大纲设计稿里的 `Outline`、`OutlineNode`、关系、章节映射、参与者和 `NarrativePromise`。

## 2. 实现前已经收口的决定

这些决定补上后端架构里还不能直接编码的缺口。它们仍然是后端契约，不依赖界面。

### 2.1 交接是结构化结果

`loadEventGraphHandoff` 放在 `src/main/story/application/outline/`。故事侧委派 `chapter-writer` 之前调用它。主 Agent 不靠在 `delegate_task` 的自由文本里写「有主线」或 `mainlineWaived`。

```ts
type EventGraphHandoff =
  | {
      status: "ready";
      outlineRevision: number;
      chapterId: string;
      instruction: string;
      nodeIds: readonly string[];
    }
  | {
      status: "missing";
      reason: "no-outline" | "no-accepted-leaf";
      chapterId: string;
    }
  | {
      status: "waived";
      chapterId: string;
      instruction: string;
      waivedAtOutlineRevision: number | null;
    }
  | {
      status: "too-large";
      chapterId: string;
    };
```

- `ready`：至少一条已确认且映射到该章的叶子。`instruction` 由 `OutlineContextBuilder` 生成，不超过 4000 字。
- `missing`：大纲不存在，或该章没有已接受的叶子。这对应后端架构里的 `WritingMainlineMissing`，但本轮不把它实现成抛错。
- `waived`：调用方已经记录「仍然写作」。`instruction` 写明本次没有事件主线。记录挂在当前大纲 revision 上；revision 变化后，下次交接回到 `missing`。
- `too-large`：硬约束本身超过 4000 字。不启用写作子 Agent。

放弃记录放在书库，由大纲用例读写，不放进会话库、向量库或 `src/main/agent`。本轮提供读取交接和写入放弃记录的用例。谁在屏幕上点「先生成事件图」或「仍然写作」，由后续前端调用这些用例，不在本轮做。

状态不是 `ready` 或 `waived` 时，故事侧不创建 `chapter-writer` 运行。写作子 Agent 收到的生成指令等于 `instruction`，中间不再改写。

### 2.2 谁可以启动子 Agent

| 入口 | 本轮行为 |
|---|---|
| `outline:propose` 与检查通道 | 直接跑 `event-graph`，返回候选 patch，不落库 |
| 写作相关用例 | 先 `loadEventGraphHandoff`，再按第 2.1 节决定是否创建 `chapter-writer` 运行 |
| 书籍对话里的情节请求 | 主 Agent `delegate_task`，`subagent_type` 为 `event-graph` |

大纲写入工具只注册给 `event-graph`。主 Agent 不直接改大纲。写作子 Agent 不读取、不修改大纲。界面按钮不在本轮。

### 2.3 Skill 正文

`skills/event-graph/SKILL.md` 和 `skills/chapter-writer/SKILL.md` 放在现有 bundled skill 根目录，目录名等于 manifest `id`。正文只写操作规则，控制在编译器保留的长度内（当前默认约 5000 字符）。论文对照留在后端架构第 12 节，不贴进 Skill。

事件图 Skill 按第 12 节的顺序写短规则：事件含时间、地点、参与者、目标、冲突、结果；不改已有节点原文；一次只展开一层且不超过 8 条；叶子才进入写作交接；下一叶子只作过渡；承诺不自动标成已兑现；参与者写事件前状态和事件后变化。

写作 Skill 必须写清：有 `ready` 交接时按叶子写，不另起情节；有 `waived` 时不得声称情节来自事件图。

新增 Skill 时，其 `agent.tools` 里的工具名必须已经出现在 Skill 校验使用的已知工具名单里。先登记工具，再放入 `SKILL.md`，否则启动时 bundled skill 校验会失败。`REQUIRED_BUNDLED_SKILL_IDS` 仍只要求 `create-skill`，这两个 Skill 作为额外 bundled skill 被目录扫描加载。

## 3. 后端阶段

### 阶段 1：契约、存储和 patch 事务

目标：一本书可以经用例和 IPC 建立、修改、排序事件树，并映射到现有章节。此阶段没有模型，也没有界面。

步骤：

1. 增加 `src/shared/contracts/outline/outlineContracts.ts` 和 `channels.ts`。DTO、枚举、patch 和文本上限常量放在这里。通道前缀 `outline:`，名单以后端架构第 8 节为准。不把这些通道写入 `src/shared/agent/contracts.ts`，也不放入 `src/shared/engine/`。
2. 在 `BookDatabase` 增加迁移 101。当前版本是 100。`outlineSchema.ts` 只放新表 DDL：`outlines`、`outline_nodes`、`outline_node_relations`、`outline_node_chapters`、`outline_node_participants`、`narrative_promises`、`outline_issues`。不改 `books`、`volumes`、`chapters`、`chapter_revisions` 的列语义。
3. 实现 `SqliteOutlineStore`、`outlinePorts.ts`、`outlinePatch.ts` 和 `OutlineApplication`。写方法接收 `projectId` 和 `expectedRevision`。请求体里若出现 `bookId` 则拒绝。无大纲时 `getOutlineSnapshot` 返回 `null`，不插入空行。
4. `applyOutlinePatch` 按后端架构第 5 节执行：revision 不匹配抛出 `OutlineRevisionConflict` 且不写库；内存模拟任一失败则整批回滚；错误级检查失败则整批放弃；成功时单个事务写入并使 `revision + 1`。`previewOutlinePatch` 只返回影响清单，不写库。
5. 删除章节只删映射。删除节点不调用章节删除；关系与映射级联删除，承诺上的节点外键改为空并写一条 `outline_issues` 警告。
6. 增加 `OutlineIpcController`，用 Zod 校验枚举、id 和契约里的文本上限。注册进现有 `IpcRegistrar`，不可信 frame 拒绝，业务请求进入 `RequestContext`。`DesktopController` 按现有书籍控制器的方式装配 `OutlineApplication`。
7. 在 `src/preload/agentApi.ts` 的现有 `window.storyOSAgent` 上露出上述通道。不新增渲染页面。

完成标准：

- 无大纲时快照为 `null`。`OutlineNotFound` 只用于明确要改某一大纲的写请求。
- 修订冲突返回 `OutlineRevisionConflict`，包含当前 revision，不覆盖。
- 非法父节点、自环关系、承诺跨大纲、叶子重复映射整批回滚。
- 临时 id 只在一批内有效，落库前换成系统 id。模型不能指定最终 id。
- 承诺迁到 `paid_off` 或 `eligible` 时缺少 `reason`，模拟阶段失败。
- 迁移 101 不改已有卷章行。映射不改变章节标题。
- 不可信 frame 调用大纲通道被拒绝。缺字段抛出校验错误。

验证：`outlinePatch`、`SqliteOutlineStore` 和 `OutlineIpcController` 的 Vitest。命令用 `npm run check:backend` 中与这些测试对应的最窄范围，不跑全量 `npm run check`，不跑前端 lint。

本阶段不做：Skill、委派、模型、渲染进程。

### 阶段 2：大纲工具和事件图子 Agent

目标：`event-graph` 能读大纲、提出 patch，并在审批通过后写入阶段 1 的大纲。

步骤：

1. 在 `src/main/story/integration/tools/outline/` 实现后端架构第 9.3 节的工具，并登记进 `StoryToolManifest`。只读工具为 `get_narrative_outline`、`get_chapter_outline_context`、`list_narrative_promises`、`check_narrative_outline`、`propose_outline_patch`。写入工具 `apply_outline_patch`、`map_outline_nodes_to_chapter` 的效果为 `outline.write`，审批为 `ask`。
2. `outline.write` 不加入 `SAFE_BOOK_EDITOR_WRITE_TOOLS`。这些工具不进入书籍对话的默认工具列表，也不给写作子 Agent。`get_book_outline` 继续只返回卷章目录。
3. 把工具名加入 Skill 校验的已知名单，再添加 `skills/event-graph/SKILL.md`。manifest 与后端架构第 9.1 节一致：`agent.enabled` 为 true，`maxTurns` 为 8，`agent.tools` 只列第 9.3 节的工具，不含 `delegate_task`。
4. Skill 正文按后端架构第 12.1–12.6 节写成短操作规则。语义检查仍指向后续的 `outlineReview.prompt.ts`，本阶段可以先让 `check_narrative_outline` 只跑确定性规则。
5. `propose_outline_patch` 返回 `OutlinePatch` 草稿，不调用 `applyOutlinePatch`。一次新增超过 8 条，或展开超过一层，整份候选失败，不截断后当成完整结果。模型失败抛出提供方错误，不返回空 patch。
6. 书籍对话中的情节请求由主 Agent `delegate_task` 到 `event-graph`。`outline:propose` 直接指定该 Agent。两条路的补丁都停在候选，确认后才经 `apply_outline_patch` 或 `outline:apply-patch` 落库。委派提示不含 `bookId` 或本机路径。

完成标准：

- registry 中有 `event-graph`，来源为 skill，上下文为 `book-editor`，执行模式为 `direct`。
- 未接受的候选不出现在快照里。
- `get_book_outline` 的返回形状不变。
- 事件图 Agent 调用 `delegate_task` 时被拒绝。
- `apply_outline_patch` 未审批不能写入。

验证：Skill 编译测试、工具清单测试、审批测试、候选 patch 不落库测试。

本阶段不做：写作子 Agent、覆盖判断、候选对话框。

### 阶段 3：确定性检查和候选预览

目标：候选在写入前经过规则检查和删除影响预览。作者接受后的大纲才是后续写作可读的主线。

步骤：

1. 在 `outlineChecks.ts` 实现后端架构第 10 节的确定性规则。错误级问题使 `applyOutlinePatch` 失败。警告和提示写入 `outline_issues`，随快照返回。
2. 节点 revision 变化后，`checkedRevision` 不再等于节点 revision 的 issue 在读快照时标为过期。
3. `previewOutlinePatch` 在不写库时返回将受影响的子节点、关系、映射和承诺。IPC 删除确认必须先拿到这份清单。
4. `proposeOutline` 支持 `planningMode: "climax-first" | "sequential"`。它只改变规划提示的顺序，不运行搜索。展开一层的提示只包含全书硬约束、选中节点的祖先、同级标题和紧邻叶子摘要。

完成标准：

- 顺序颠倒、承诺早于铺设、未映射叶子、过期 fingerprint 有测试。
- 父子成环、关系自环、引用不存在、承诺跨大纲阻止提交。
- 警告和提示不阻止提交。
- 语义问题不能被标成结构损坏。CFPG 的主题混淆、过度保守和间接关联本阶段不自动判定。

验证：`outlineChecks` 与预览测试。

本阶段不做：调用模型做语义检查，不做覆盖判断，不做第三个子 Agent。

### 阶段 4：写作前交接和写作子 Agent

目标：只有 `ready` 或 `waived` 时才创建写作运行。生成指令原样进入现有章节生成。

步骤：

1. 实现 `OutlineContextBuilder.buildChapterContext`。组装顺序与后端架构第 6 节相同。下一叶子带「只用于过渡，不得展开」。未触发承诺不进入指令。本构建器不调用向量查询。
2. 调用方传入检索证据。检索复用 `searchNovelFragments` 的现有错误：索引不存在、不可用、正在重建，这三类原样抛出。空列表写成「没有命中」，不阻止已有主线的写作。硬约束放不下时返回 `OutlineContextTooLarge`，不截断目标句。
3. 实现 `loadEventGraphHandoff`，返回第 2.1 节的结构。增加按章节保存放弃记录的用例：写入当时的大纲 revision。revision 变化后记录失效。
4. 在故事侧委派 `chapter-writer` 的包装里读取同一次交接。状态不是 `ready` 或 `waived` 时不创建运行。`missing` 时返回选择结果，不抛出未捕获的 `WritingMainlineMissing`。
5. 添加 `skills/chapter-writer/SKILL.md`。manifest 与后端架构第 9.4 节一致，`maxTurns` 为 4。工具只保留现有章节生成所需的调用，不含大纲工具，不含 `delegate_task`。
6. 生成调用的 `instruction` 等于交接里的 `instruction`。写作子 Agent 不得改写这段文字；多出来的轮次只用于触发这一次生成和报告结果。
7. `ChapterGenerationService` 保持 `maxTurns: 1`、工具列表为空。流式、空响应和空闲超时仍由它定义。大纲层不包装这些错误。
8. 仅 `ready` 时，保存成功后 `markNodesPendingVerification`。叶子变为待核验，不变为已覆盖。`waived` 时不标记叶子。

完成标准：

- 无大纲、有大纲但本章无已确认叶子，都得到 `missing`，且 `reason` 不同。
- 未经选择时不存在 `chapter-writer` 运行，生成服务不被调用。
- 写入放弃记录后得到 `waived`；大纲 revision 一变就回到 `missing`。
- 有主线时，生成服务收到的指令与交接指令相同。
- 放弃主线时，指令含放弃说明，且不更新叶子覆盖状态。
- 两种情况下 `ChapterGenerationService` 内部工具列表仍为空。
- registry 中有 `chapter-writer`，且不含 `delegate_task`。

验证：`OutlineContextBuilder`、交接和章节生成测试。章节生成测试只断言指令和工具列表。不把向量重建或阅读器包进来。

本阶段不做：写作确认层界面。不让写作子 Agent 自己决定要不要读事件图。

### 阶段 5：语义检查和覆盖判断

目标：规则之外的语义问题和正文覆盖结果变成可失效的 `OutlineIssue`。

步骤：

1. 增加 `src/main/story/resources/prompts/outlineReview.prompt.ts`。它只负责语义检查和覆盖判断。输出是 issue 列表，每条带节点 id 或「无节点」以及证据短句。禁止把建议写成确定性结构错误，禁止建议直接修改正文。
2. `runOutlineChecks` 仅在 `includeSemantic: true` 时调用模型。结果 `source` 为 `ai`。模型失败抛出提供方错误，不返回空问题列表充当成功。
3. `reviewChapterCoverage` 读取该章当前修订纯文本和当时的叶子列表，判断写到、疑似合并、未出现、提前写出下一叶子。它不改正文，也不把节点标成已覆盖。标成已覆盖只有作者的 `updateOutlineNode`。
4. 覆盖检查比较 `markNodesPendingVerification` 记下的大纲 revision 和章节 revision。任一版本变化后，issue 按 fingerprint 失效。

完成标准：

- 语义建议与结构错误可以区分。
- 覆盖结果能定位到叶子。
- 过期 fingerprint 不再被当成当前事实。

验证：检查用例测试。提示测试只断言输出约束，不把模型质量当成通过条件。

本阶段不做：新的检查子 Agent。检查仍是用例和提示。

## 4. 本轮明确不做的前端

下列界面在 `docs/architecture/narrative-event-frontend-prototype.md` 里，依赖本轮用例，但不属于本轮步骤，也不作为本轮完成标准：

- 书籍工作区顶栏「正文 / 大纲」。
- `src/renderer/features/narrative-outline/` 的树、详情、时间线、承诺和检查。
- 候选对话框里的逐项留下或放弃。
- `WritingContextSheet`，以及「先生成事件图」「仍然写作」两个按钮。
- 渲染进程组件测试，以及 `src/renderer/AGENTS.md` 里的界面验收。

本轮把这些界面需要的快照、预览、交接和放弃记录做成 IPC 可调用的结果。前端轮次再消费它们。

## 5. 不要提前做的事

- 自由画布、多条正式剧情分支、节点版本树。
- MCTS、角色社会模拟、逐 token 控制器、模型微调。
- 事件图或承诺进入向量索引。
- 从正文自动重写大纲。
- 在 `ChapterGenerationService` 内部检索或读取大纲。
- 把 `WritingMainlineMissing` 实现成未捕获异常。
- 在 `src/main/agent` 新增编排器或书籍类型。
- 把第三个子 Agent 提前做成覆盖检查专员。

## 6. 完成一批后的记录

每阶段结束时在本文顶部补一行进度：阶段编号、日期、验证命令和未覆盖的风险。不要把后一阶段或前端轮次的行为写成已经可用。
