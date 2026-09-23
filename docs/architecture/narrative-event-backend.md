# 叙事事件后端架构

> v0.1 · 2026-09-23 · 架构设计，不含实现  
> 依据：`docs/architecture/narrative-event-model.md` 的流水线、上下文包和首版边界。  
> 节点、关系、映射、承诺和 patch 的字段以 `docs/todo/outline-module-design-analysis.md` 第 6–10 节为准。本文规定这些能力放在哪一层、怎样接上现有书籍和章节生成。  
> 大纲设计稿第 8.1 节曾把应用层写在 `main/agent/application/outline`。该路径与现行引擎边界冲突，以本文目录为准。

## 1. 架构结论

叙事事件是书籍规划资产。存储、用例和工具实现放在 `src/main/story`。通用引擎不出现大纲节点、承诺或章节映射类型。

多 Agent 的第一步是两个专员，中间有一次不可跳过的交接。事件图 Agent 负责主线：故事弧、叶子事件、因果关系和已触发的承诺。写作 Agent 负责按这条主线写正文。书籍对话是协调者，用已有的 `delegate_task` 分别委派它们。

启用写作 Agent 之前，主 Agent 必须先读取事件图 Agent 已经提交并被作者接受的结果。这份结果是写作的主线。事件图没有结果，或用户还没有生成事件图时，不代替用户做决定：先询问。用户确认先生成事件图，主 Agent 就委派事件图子 Agent；用户选择继续，才启用写作子 Agent，并在任务里标明本次没有事件主线。写作 Agent 不改事件图，事件图 Agent 不写正文。

```text
主 Agent：书籍对话
  只有它持有 delegate_task
  ├─ 子 Agent event-graph
  │     产出并维护事件图，结果写入大纲
  └─ 启用 chapter-writer 之前
        loadEventGraphHandoff
          主动读取事件图已确认的主线
          没有结果时询问用户
          ├─ 先生成 → delegate_task(event-graph)
          └─ 继续写 → delegate_task(chapter-writer)，标明主线已放弃

渲染进程的手动编辑仍走 IPC → OutlineApplication。
事件图工具和写作工具都在 src/main/story，不进入 src/main/agent。
```

后续子 Agent 仍由这个主 Agent 委派，例如覆盖检查。子 Agent 之间不互相委派。第一步先落地事件图和写作这两个子 Agent，以及它们之间的主线交接。

## 2. 模块

```text
src/shared/contracts/outline/
  outlineContracts.ts       DTO、枚举、patch、上下文包
  channels.ts               IPC 通道名

src/main/story/application/outline/
  OutlineApplication.ts
  outlinePorts.ts           存储端口
  OutlineContextBuilder.ts
  outlineChecks.ts
  outlinePatch.ts           内存模拟与校验

src/main/story/storage/book/
  SqliteOutlineStore.ts
  outlineSchema.ts          仅新表 DDL

src/main/story/integration/tools/outline/
  readOutline.ts
  proposeOutlinePatch.ts
  checkOutline.ts

skills/event-graph/SKILL.md     编译为事件图子 Agent
skills/chapter-writer/SKILL.md  编译为写作子 Agent

src/main/story/resources/prompts/
  outlineReview.prompt.ts   语义检查与覆盖判断

src/main/desktop/ipc/OutlineIpcController.ts
```

`OutlineApplication` 与 `BookWorkspaceApplication` 同级，由桌面装配构造，经 `DesktopController` 转给 IPC。不新增 DI 容器。

共享契约放在 `src/shared/contracts/outline/`。现有书籍通道历史地集中在 `src/shared/agent/contracts.ts`，大纲通道不再继续写入该文件，也不进入 `src/shared/engine/`。preload 仍挂在 `window.storyOSAgent`，因为书籍工作区已经从这条桥读取项目和章节。

## 3. 存储

表创建在 `BookDatabase` 的下一次迁移。当前书籍迁移版本是 100，只包含既有 `BOOK_SCHEMA`。大纲表使用版本 101，不修改 `books`、`volumes`、`chapters`、`chapter_revisions` 的列语义。

表与约束沿用大纲设计稿第 7 节：

- `outlines`
- `outline_nodes`
- `outline_node_relations`
- `outline_node_chapters`
- `outline_node_participants`
- `narrative_promises`
- `outline_issues`

一本书至多一行 `status = 'active'` 的大纲。`outline_nodes.parent_id` 同一大纲内引用，应用层拒绝成环。叶子首版对 `outline_node_chapters.node_id` 唯一。关系对 `(source_node_id, target_node_id, type)` 唯一。排序用稀疏整数。

删除章节时，存储层删除映射行，节点保留。删除节点时，关系与映射级联删除；承诺上的节点外键改为空，并写一条 `outline_issues` 警告，不连带删除承诺。删除节点不调用章节删除。

这些表属于书库 `book.sqlite`。会话库和向量库不保存大纲正文。导入导出若尚未认识这些表，实现阶段再扩展 `storyos` 包；在此之前，原型不承诺跨项目带走大纲。

人物、地点的正式实体仍然不建。参与者只有 `participant_name` 和状态文本。

## 4. 用例

`OutlineApplication` 的写方法都接收 `projectId` 和 `expectedRevision`。`projectId` 解析到当前项目唯一的书，请求体里的 `bookId` 若出现则拒绝。读方法返回快照：

```ts
type OutlineSnapshot = {
  outline: Outline;
  nodes: readonly OutlineNode[];
  relations: readonly OutlineNodeRelation[];
  mappings: readonly ChapterOutlineMapping[];
  participants: readonly OutlineNodeParticipant[];
  promises: readonly NarrativePromise[];
  issues: readonly OutlineIssue[];
};
```

字段定义见大纲设计稿第 6 节。快照一次读完，前端不逐表拼。

| 用例 | 行为 |
|---|---|
| `getOutlineSnapshot` | 无大纲时返回 `null`，不创建空行 |
| `createOutline` | 插入大纲和可选根节点，revision 从 1 开始 |
| `updateOutlineProfile` | 只改前提、主题、冲突、高潮、结局 |
| `applyOutlinePatch` | 第 5 节 |
| `mapNodeToChapter` / `unmapNodeFromChapter` | 校验章节属于本书 |
| `upsertNarrativePromise` | 关联节点必须属于同一大纲 |
| `runOutlineChecks` | 先规则，语义检查仅在 `includeSemantic: true` 时调用模型 |
| `buildChapterContext` | 第 6 节，不写大纲 |
| `markNodesPendingVerification` | 章节修订提交成功后，把本次勾选的叶子从已确认改为待核验 |

候选生成不在 `OutlineApplication` 里直接落库。`proposeOutline` 调用模型，返回 `OutlinePatch` 草稿和人可读摘要。渲染进程确认后才调用 `applyOutlinePatch`。模型失败把提供方错误抛出，不返回空 patch 充当成功。

展开一层的提示只包含：全书硬约束、选中节点的祖先、同级标题、紧邻叶子的摘要。不把整棵树和全部承诺送进规划模型。返回条数上限 8。校验失败时返回可修复错误，列出缺标题或非法父节点的项。

高潮优先只是 `proposeOutline` 的 `planningMode: "climax-first" | "sequential"`。它改变规划提示的顺序要求，不运行搜索。

## 5. Patch 与并发

`OutlinePatch` 的操作类型沿用设计稿：`create_node`、`update_node`、`move_node`、`delete_node`、`upsert_relation`、`upsert_promise`。临时 id 只在这一批内有效，落库前换成系统 id。模型不能指定最终 id。

应用顺序：

1. 读取当前 revision。不匹配则抛出 `OutlineRevisionConflict`，包含当前 revision，不写库。
2. 在内存快照上按序模拟。任一操作失败则整批放弃，包括枚举非法、父节点成环、自环关系、承诺跨大纲、叶子重复映射。
3. 模拟结果跑确定性错误级检查。存在错误级问题时整批放弃。警告不阻止提交。
4. 单个事务写入，大纲 `revision + 1`，返回新快照和受影响节点 id。

删除操作的预览由 `previewOutlinePatch` 在不写库的情况下返回影响清单：子节点、关系、映射、承诺。IPC 的删除确认必须先拿到这份清单；前端不能只凭本地树猜测。

承诺状态迁到 `paid_off` 或 `eligible` 时，patch 必须带非空 `reason`。没有 reason 的操作在模拟阶段失败。应用层不根据正文自动做这两次迁移。

## 6. 上下文包

`OutlineContextBuilder.buildChapterContext(projectId, chapterId, selection)` 是纯组装。`selection` 是作者在确认层勾选的叶子 id。未勾选的草拟叶子不进入包。

组装顺序与事件模型第 10 节相同：

1. 硬约束：大纲主题、核心冲突、结局意图，以及每个选中叶子的目标、冲突、结果、地点、时间、参与者。
2. 祖先短要点。
3. 前一叶子、因果前置、紧邻的下一叶子。下一叶子带固定标记「只用于过渡，不得展开」。
4. 本章其他已映射叶子的标题和状态。
5. 选中叶子参与者在本书叙述顺序上最近一条更早的 `stateAfter`。
6. 状态为 `eligible`、且触发节点映射在当前章或更早章的承诺。
7. 调用方传入的检索证据。本构建器不调用向量查询。

预算沿用写作器已经接受的 4000 字。超出时从第 7 项向前丢弃，丢弃证据时保留章节、修订和偏移。第 1 项放不下则返回 `OutlineContextTooLarge`，不截断目标句后继续生成。返回值包含 `usedCharacters`、`omittedSections` 和最终 `instruction` 文本。

检索由调用 `buildChapterContext` 的 story 用例负责，复用 `searchNovelFragments` 的现有错误：索引不存在、不可用、正在重建。这三类错误不改写成空列表。空列表表示没有通过核对的命中，上下文包照常返回，证据节写明没有命中。

`loadEventGraphHandoff(projectId, chapterId, selection)` 在创建写作子 Agent 运行之前调用本构建器。它读取的是事件图 Agent 已提交、并经作者接受的大纲，不是临时再生成一份情节。返回的 `instruction` 就是写作主线。

没有至少一条已确认、且映射到该章的叶子时，返回 `WritingMainlineMissing`。这不是失败终态。调用方把选择交给用户，并带上原因：大纲不存在，或存在但该章没有已接受的叶子。用户确认先生成事件图时，主 Agent 委派 `event-graph`，候选被接受后重新调用交接。用户选择继续写作时，交接结果改为 `mainlineWaived: true`，写作子 Agent 可以启动。未经这个选择，不得委派 `chapter-writer`。硬约束超过 4000 字时返回 `OutlineContextTooLarge`，此时不启用写作子 Agent，因为主线放不进指令。

## 7. 与写作子 Agent 的交接

现有生成入口：

```ts
type GenerateChapterInput = {
  projectId: string;
  chapterId: string;
  mode: ChapterGenerationMode;
  instruction: string;
  signal?: AbortSignal;
};
```

写作子 Agent 不自己决定要不要看事件图。主 Agent 或界面在启用它之前先拿到交接结果，再把这份主线写进委派提示。桌面用例：

```text
loadEventGraphHandoff
  → 已有主线：delegate_task(chapter-writer)，提示含 instruction 与大纲 revision
  → 没有主线：把 WritingMainlineMissing 交给用户
        先生成事件图 → delegate_task(event-graph) → 接受后重新交接
        仍然写作 → delegate_task(chapter-writer)，提示含 mainlineWaived
        → 写作子 Agent 按主线或按放弃标记生成正文
        → 流式事件仍走现有章节生成通道
        → saveRevision 成功
        → 有主线时 markNodesPendingVerification(选中的叶子, revisionId)
```

`ChapterGenerationService` 仍接收一条指令且内部无工具。区别是这条指令现在来自事件图交接，并且只有交接成功才允许写作子 Agent 运行。写作子 Agent 的工具列表不含大纲写入，也不能调用 `delegate_task`。

`markNodesPendingVerification` 记录这次生成所依据的大纲 revision 和章节 revision。覆盖检查比较的是这一对版本。其后正文或叶子被修改，则 issue 按 fingerprint 失效，节点可标为需修订，不能继续显示已覆盖。

覆盖检查是单独用例 `reviewChapterCoverage`。它读取该章当前修订的纯文本和当时的叶子列表，请模型按叶子判断：写到、疑似合并、未出现、提前写出下一叶子。判断结果是 `OutlineIssue`，`source = "ai"`。它不改正文，也不把节点标成已覆盖。标成已覆盖只有 `updateOutlineNode` 这一条作者操作。

分页事件、空响应和空闲超时仍由 `ChapterGenerationService` 定义。大纲层不包装这些错误。

## 8. IPC

通道名放在 `shared/contracts/outline/channels.ts`，前缀 `outline:`。

| 通道 | 方法 |
|---|---|
| `outline:snapshot` | `getOutlineSnapshot` |
| `outline:create` | `createOutline` |
| `outline:propose` | `proposeOutline` |
| `outline:preview-patch` | `previewOutlinePatch` |
| `outline:apply-patch` | `applyOutlinePatch` |
| `outline:check` | `runOutlineChecks` |
| `outline:chapter-context` | `buildChapterContext` |
| `outline:mark-pending` | `markNodesPendingVerification` |
| `outline:review-coverage` | `reviewChapterCoverage` |

`OutlineIpcController` 用 Zod 校验枚举、id 和文本上限。摘要、目标、冲突、结果、承诺说明沿用书籍 IPC 的有界字符串做法，具体上限在契约里写成常量，不在控制器里另设一套更宽的默认值。缺字段抛出校验错误。

所有通道走现有 `IpcRegistrar`：不可信 frame 拒绝，业务请求进入 `RequestContext`。不新增绕过门禁的 `ipcMain.handle`。

## 9. 主 Agent、子 Agent、Skill 与工具

书籍对话是主 Agent。它面对用户，并用已有的 `delegate_task` 把任务交给子 Agent。子 Agent 由 Skill 编译而来，工具列表里没有 `delegate_task`，所以不能再往下委派，也不能互相调用。

第一步的子 Agent 有两个：

| 子 Agent | 职责 | 启用条件 |
|---|---|---|
| `event-graph` | 维护事件图，产出主线 | 用户要规划、展开或检查情节 |
| `chapter-writer` | 按主线写本章正文；用户放弃主线时仍可写 | 交接已有主线，或用户已选择继续写作 |

这是解决 AI 写小说缺少主线的一步：写作不是从空白提示开始，而是从事件图 Agent 已经留下的结果开始。以后增加的子 Agent，例如覆盖检查，仍挂在同一个主 Agent 下面。

### 9.1 事件图 Skill

产品运行时 Skill，不是开发工具 Skill。路径为 `skills/event-graph/SKILL.md`，格式与 `skills/create-skill/SKILL.md` 相同。安装后由现有 `SkillAgentCompiler` 编译成 `AgentDefinition`，并在 `createAgentOrchestrator` 同步 Skill Agent 时注册。不把该定义写进 `src/main/agent/runtime/builtInAgents.ts`。

```yaml
id: event-graph
name: 事件图
version: 1
description: 为当前书籍维护叙事事件图，生成候选节点、关系和承诺，并在作者确认后写入大纲。
triggers:
  - 生成大纲
  - 展开事件
  - 编排章节事件
  - 检查伏笔
agent:
  enabled: true
  id: event-graph
  name: 事件图
  maxTurns: 8
```

`agent.tools` 只列第 9.3 节的大纲工具。Skill 正文写工作规则：一次只展开一层，新增不超过 8 条；不改写作者已有事件原文；高潮优先只改变候选顺序；承诺不能自行标成已兑现；输出必须是 `OutlinePatch` 或检查问题，不能直接改章节正文。编译器会把这段正文放进该 Agent 的系统提示。正文超过编译器默认 5000 字符时会被截断，因此规则保持短，细节放在工具返回值里。

带写入效果的工具会使编译结果的 `executionModes` 只有 `direct`。这与现有规划器拒绝副作用计划的行为一致：事件图 Agent 不进入 `planned`。

### 9.2 事件图子 Agent

| 项 | 值 |
|---|---|
| id | `event-graph` |
| 来源 | Skill 编译，`metadata.source = skill` |
| 上下文 | `book-editor`，由工具清单的 `requiredContexts` 决定 |
| 能力 | `outline.read`；写入工具另外提供效果 `outline.write` |
| 轮次 | 8 |
| 委派 | 只接受主 Agent 的 `delegate_task`；自己不能委派 |

界面上的「按简介生成」「展开一层」「检查」直接指定 `agentType: event-graph` 跑一轮，不经过书籍对话的自由规划。聊天里的同类请求由书籍对话委派到同一个 Agent。两条路的补丁都进候选预览，确认后才 `apply_outline_patch`。

书籍编号仍取当前项目。委派提示里不包含 `bookId` 或本机路径。

### 9.3 工具

实现放在 `src/main/story/integration/tools/outline/`，在 `StoryToolManifest` 登记。效果 `outline.write` 不加入 `SAFE_BOOK_EDITOR_WRITE_TOOLS`，因此不能靠书籍上下文自动放行，必须走审批。

| 工具 | 效果 | 审批 | 谁可以调用 |
|---|---|---|---|
| `get_narrative_outline` | 只读 | allow | 事件图 Agent |
| `get_chapter_outline_context` | 只读 | allow | 事件图 Agent |
| `list_narrative_promises` | 只读 | allow | 事件图 Agent |
| `check_narrative_outline` | 只读 | allow | 事件图 Agent |
| `propose_outline_patch` | 无写入，返回 patch | allow | 事件图 Agent |
| `apply_outline_patch` | `outline.write` | ask | 事件图 Agent，审批通过后 |
| `map_outline_nodes_to_chapter` | `outline.write` | ask | 事件图 Agent，预览后 |

这些工具不放进主 Agent 的默认工具列表，也不给写作子 Agent。主 Agent 只通过委派使用事件图。`get_book_outline` 继续只返回卷章目录。

`apply_outline_patch` 与 IPC 共用 `OutlineApplication`。审批预览调用 `previewOutlinePatch`，展示将删除的节点和承诺。手动编辑大纲仍然走界面 IPC，不强制经过 Agent。作者接受后的大纲就是事件图 Agent 的工作结果，写作交接读的是这份结果。

### 9.4 写作子 Agent

路径为 `skills/chapter-writer/SKILL.md`。编译出的 id 是 `chapter-writer`。

```yaml
id: chapter-writer
name: 章节写作
version: 1
description: 根据事件图已确认的主线撰写当前章节。用户明确放弃主线后，才允许没有事件图继续写。
triggers:
  - 按大纲写作
  - 按事件写本章
agent:
  enabled: true
  id: chapter-writer
  name: 章节写作
  maxTurns: 4
```

Skill 正文要求：委派提示里要么有事件图交接，要么有用户放弃主线的标记。有交接时，按选中叶子的目标、冲突和结果写；下一叶子只作过渡；已触发承诺按交接中的兑现要求处理；不新增、不删除、不重排事件。放弃主线时，正文不得假装这些情节来自事件图。它不持有大纲写入工具，也不持有 `delegate_task`。

主 Agent 先取得 `loadEventGraphHandoff` 的结果。已有主线时，把 `instruction`、大纲 revision 和章节 id 写进 `delegate_task` 的 `prompt`。结果是 `WritingMainlineMissing` 时，先把选择交给用户，不立即委派写作。用户确认生成事件图后委派 `event-graph`；用户选择继续后，提示里写入 `mainlineWaived`。两种标记都没有时，运行时拒绝这次委派。

写作子 Agent 调用现有章节生成来落正文。生成内部仍然是单轮、无工具；主线或放弃标记已经在启用前放进指令。

## 10. 确定性检查

实现放在 `outlineChecks.ts`，输入是内存快照，输出是 `OutlineIssue`。规则与大纲设计稿第 10.1 节相同，这里只固定级别：

| 规则 | 级别 |
|---|---|
| 父子成环、关系自环、引用不存在、承诺跨大纲 | 错误 |
| `requires` / `causes` 在叙述顺序上颠倒且未标记倒叙例外 | 警告 |
| 已确认叶子没有目标也没有冲突 | 警告 |
| 已确认叶子未映射 | 提示 |
| 主动参与者缺少事件前状态，或与上一地点冲突且无说明 | 警告 |
| 兑现节点早于铺设节点 | 警告 |
| 已铺设承诺没有兑现节点 | 提示 |
| 覆盖所依据的章节修订已不是当前修订 | 警告 |

错误级问题使 `applyOutlinePatch` 失败。警告和提示写入 `outline_issues`，并随快照返回。节点 revision 变化后，旧 issue 的 `checkedRevision` 不再等于节点 revision，读快照时标为过期，不继续当成当前事实。

CFPG 的六类失败不各写一个自动判定器。过早兑现和顺序错误用上表的警告表达。主题混淆、过度保守和间接关联留给 `includeSemantic` 的建议，文案里保留这三类名称，便于作者识别。

## 11. 错误

这些错误消息稳定，前端直接展示，不改写成空数据：

| 错误 | 条件 |
|---|---|
| `OutlineRevisionConflict` | `expectedRevision` 不匹配 |
| `OutlineNotFound` | 项目没有大纲，写操作仍被调用 |
| `WritingMainlineMissing` | 大纲不存在，或该章没有已接受的叶子。交给用户选择，不是终态失败 |
| `OutlineContextTooLarge` | 硬约束本身超过 4000 字 |
| 现有向量错误原文 | 索引不存在、不可用、正在重建 |
| Zod / 应用校验错误 | 非法枚举、成环、空参与者名字、承诺缺少 reason |

`getOutlineSnapshot` 在没有大纲时返回 `null`。这是合法空态，不是 `OutlineNotFound`。`OutlineNotFound` 只用于明确要改某一大纲的请求。

## 12. 事件图 Skill：按论文理论写

事件图子 Agent 只有一份产品运行时 Skill：`skills/event-graph/SKILL.md`。它不是开发工具 Skill，也不放进 `src/main/agent/prompts/`。编译器默认只保留正文约 5000 字符，所以 Skill 正文写操作规则，不复述论文。下面每条规则都对应 `docs/pdf` 里已经采纳的理论，实现时按这个顺序写进正文。

写作子 Agent 的主线规则仍在 `skills/chapter-writer/SKILL.md`。有交接时把主线当作本章必须完成的事件；`mainlineWaived` 时不得声称情节来自事件图。

### 12.1 事件是元组，不是摘要句

来源：STORYWRITER 的 EventSeed。每个新增事件必须带标题、短摘要、时间、地点、参与者名字、目标、冲突和结果。缺目标且缺冲突的候选不能进入 patch。摘要用短要点，不用成段散文。这与成书论文里“计划用短要点、场景要有叙事功能”一致，叙事功能取动作、对话、说明、世界构建、关系、悬念、过渡或混合。

### 12.2 先提议，再校验，不改已有事件

来源：STORYWRITER 的 EventValidator，以及 GraphStory 的人机协同。生成后先用 `check_narrative_outline` 看结构问题，再把新事件放进 `propose_outline_patch`。已有节点的原文保持不动。一次新增不超过 8 条，并且只展开一层。DOC 说明大纲越细越容易在起草时漏掉低层事件，也说明叶子过细会让正文变窄，所以 Skill 禁止递归把整棵树一次扩完。

校验至少覆盖：关系不能指向自己；因果和前置默认符合叙述顺序；参与者名字不能为空。语义问题只作为建议，不能写成结构已损坏。

### 12.3 子事件再映射到章

来源：STORYWRITER 的 SubTasker 与 Weaver，以及热奈特对故事顺序和叙述顺序的区分。高层事件先拆成子事件，再建议每个叶子落入哪一章。`storyOrder` 是故事里发生的顺序，`narrativeOrder` 是读者读到的顺序，两者可以不同，但因果边必须还在。映射使用 `map_outline_nodes_to_chapter`，不改章节标题，不把目录当成事件。

### 12.4 叶子才是写作单位，未来只露下一件

来源：DOC。交给写作交接的是已确认叶子，不是整棵大纲。当前叶子写全目标、冲突、结果、地点、时间和参与者。紧邻的下一个叶子只标成“只用于过渡，不得展开”。控制过宽会跑题，过死会重复，所以 Skill 不把全书每一条约束都写进同一次提案。

可选的高潮优先来自 BiT-MCTS：用户指定时，先给出高潮叶子，再补上升和下降，仍然只输出一层。不运行搜索。

### 12.5 承诺是伏笔、触发、兑现

来源：CFPG。铺设、触发条件和兑现要求分成三个字段，并关联节点。状态只有计划、已铺设、可兑现、已兑现、放弃。Skill 可以建议把状态改为可兑现或已兑现，但 patch 必须带理由，且默认不勾选。未经作者接受，不得把承诺标成已兑现。写作交接只纳入已经可兑现、且触发落在当前章或更早章节的承诺。

### 12.6 事件要留下状态，人必须在场

来源：EVOSPARK 里对事件前后状态和角色在场的判断，不采用它的角色社会模拟。参与者写事件前状态和事件后变化。主动参与者若接不上上一事件的状态，或地点突变且没有说明，检查应给出警告。新出现的名字先作为被提及，不自动升成正式角色。

语义检查和覆盖判断仍放在 `outlineReview.prompt.ts`。输出是 issue 列表，每条带节点 id 或「无节点」以及证据短句。该提示禁止把建议写成确定性结构错误，禁止建议直接修改正文。

## 13. 测试

实现时按这个范围验证，不把向量重建或阅读器包进来：

- `outlinePatch`：成环、修订冲突、删除影响、承诺 reason、临时 id 替换、整批回滚。
- `outlineChecks`：顺序颠倒、未映射、过期 fingerprint。
- `OutlineContextBuilder`：下一叶子带过渡标记、未触发承诺不出现、超预算时保留硬约束、向量错误原样抛出。
- `SqliteOutlineStore`：迁移 101 不改已有卷章行；删除章节只删映射。
- IPC：不可信 frame 拒绝；缺字段失败。
- 工具清单：`get_book_outline` 的返回形状不变；大纲工具不在书籍对话的默认列表里；`apply_outline_patch` 需要审批。
- Skill 编译：`event-graph` 与 `chapter-writer` 都出现在 registry；两者都不含 `delegate_task`。
- 委派：没有主线时先返回用户选择。用户确认后才委派 `event-graph`；用户选择继续后，`chapter-writer` 的提示含 `mainlineWaived`。两种标记都没有时委派被拒绝。
- 交接：有主线时，叶子来自已接受的大纲 revision。放弃主线时，指令含放弃标记，且不调用 `markNodesPendingVerification`。

章节生成测试断言：有主线时写作子 Agent 收到的指令等于交接文本；用户放弃主线时指令含放弃标记。两种情况的 `ChapterGenerationService` 内部工具列表仍为空。未经用户选择时，该服务不被调用。

## 14. 实施顺序

1. 契约、迁移 101、存储和 patch 事务。用手动建立大纲打通快照。
2. 大纲工具和 `skills/event-graph/SKILL.md`。主 Agent 用 `delegate_task` 委派事件图子 Agent。
3. 确定性检查和候选预览。事件图结果经作者接受后成为可读取的主线。
4. `loadEventGraphHandoff` 与 `skills/chapter-writer/SKILL.md`。没有主线时询问用户：确认则回到事件图子 Agent，放弃则带标记启用写作子 Agent。
5. 语义检查和覆盖判断。再增加子 Agent 时仍由主 Agent 委派。

事件类型不进入 `src/main/agent`。检索和大纲读取不放进 `ChapterGenerationService` 的内部循环。主线在启用写作子 Agent 之前装进指令。
