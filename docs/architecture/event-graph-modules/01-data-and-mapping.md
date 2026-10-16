# 模块 01：共享契约、存储与跨章映射

> 先实施。本文将“一个节点只能入一章”改为“一个可写节点可映射多章”；同时确定其余模块依赖的持久化与版本规则。当前书库均为测试数据，可删除后按新 schema 创建，不设计旧数据迁移。总设计见[上级文档](../event-graph-backend-integration-design.md)。

## 1. 当前代码与问题

| 当前实现 | 具体阻碍 |
|---|---|
| [`outlineSchema.ts`](../../../src/main/story/storage/book/outlineSchema.ts) 中 `outline_node_chapters.node_id UNIQUE` | SQLite 直接拒绝同一节点第二章映射 |
| [`OutlineApplication.mapOutlineNodes`](../../../src/main/story/application/outline/OutlineApplication.ts) 主动查找已映射的 `nodeId` 并拒绝跨章 | 仅删数据库约束不够；业务规则也须改 |
| `UnmapOutlineNodeRequest` 仅有 `nodeId` | 改成多章后会误删该节点的全部映射 |
| `ChapterOutlineMapping` 缺少本章局部内容 | 写作交接无法区别铺设、推进、完成 |
| [`SqliteOutlineStore.commit`](../../../src/main/story/storage/book/SqliteOutlineStore.ts) 删除并重建节点、关系、映射等子表 | 新的证据/任务表若直接外键指向映射或节点，必须先设计级联与提交顺序，防止正常更新时被删除 |
| [`BookDatabase`](../../../src/main/story/storage/book/BookDatabase.ts) 当前版本为 101；健康检查要求书库版本恰为最新 | 实施前清理现有测试书库，再按新版本创建书库 |

## 2. 目标契约

`ChapterOutlineMapping` 保留 `(nodeId, chapterId)` 为业务键，增加：

```ts
type ChapterOutlineMappingV2 = ChapterOutlineMapping & {
  segmentIntent: string;       // 这一章承担什么片段，包含明确边界
  expectedLocalChange: string; // 这一章结束时发生什么变化
};
```

同一节点的全局 `goal/conflict/outcome` 不因跨章而复制。章节片段各有独立 `coverageStatus`、证据与版本。映射新增时必须有非空的 `segmentIntent/expectedLocalChange` 才能进入写作交接；作者尚未补完的映射不能作为 AI 写作硬约束，不用空字符串伪装已完成。

`MapOutlineNodesRequest` 应换成逐条映射输入，传 `nodeId、chapterId、sortOrder、segmentIntent、expectedLocalChange、expectedRevision`；`UnmapOutlineNodeRequest` 增加 `chapterId`。节点/章节必须属于当前书，章不得为软删除，节点必须是已确认可写叶子。页面显式保存同一 `(nodeId, chapterId)` 时作为更新；内容或顺序变化必须清空该条映射的覆盖确认，完全相同的输入不增加图修订。同一请求中重复该键仍然拒绝。

**覆盖状态规则：** 一章生成成功只推进相应映射到 `drafted`；作者在当前正文修订上确认后成为 `verified`。节点整体 `covered` 由全部必需映射的有效验证及最终结果证据推导或严格校验后提交。单章 `verified` 不自动把跨章节点设为 `covered`。后续图内容修改或该章正文换修订，只使受影响映射的验证过期；单纯状态确认不使其他有效映射过期。

## 3. 数据库改造

### 3.1 新测试书库的建表工作项

1. 修改 `outlineSchema.ts` 的建表定义，移除 `outline_node_chapters.node_id UNIQUE`，保留 `(chapter_id,node_id)` 主键、两侧外键、覆盖字段和 `STRICT` 约束；新增 `segment_intent`、`expected_local_change` 和按节点查章的索引。证据与任务表也直接写入新的建表定义。
2. 将当前大纲建表步骤与 `OUTLINE_SCHEMA` 一起更新为新版本（例如 102）：全新书库仍先建书籍基础表，再直接建立新的事件图表。这里的版本号标识新建结构，不编写从现有 101 书库复制数据的步骤。
3. 在实施说明中明确列出需清理的 StoryOS 测试书库位置和重建入口，并在实际删除前核对目标路径。只删除本项目确认的测试数据，不清理项目代码、文档或无关文件；本轮编写文档时不执行删除。
4. 验证新建库的 `user_version`、表结构、索引、`foreign_key_check`，以及新书创建、章节修订和事件图初始化。数据测试均从空库开始。

如果证据/任务表在同轮增加，必须考虑 `SqliteOutlineStore.commit` 会全量重建 `outline_nodes` 和 `outline_node_chapters`：**不可直接把长期证据外键挂在这些会被删除的行上并启用级联删除。** 优先在该模块把存储提交改为按 ID 差量更新；若暂不改，则证据表只引用稳定的 `outlineId/chapterId/revisionId`，由应用层验证 nodeId，并在真实删除节点时显式清理。两种方案择一写入实施 PR 和测试；不能假设现有 `commit` 是增量更新。

### 3.2 读写与校验

- `SqliteOutlineStore.insertMapping/mappings` 往返新增字段；排序以**章内** `sortOrder` 为主，不把全书的最大 sortOrder 当章内顺序。
- `outlineChecks.ts` 检查重复映射键、跨书/已删章节、非叶子映射、片段缺失、同一跨章节点的章节顺序与最终变化冲突；建议级问题和阻断错误分开。
- `outlinePatch.ts` 删除/移动节点时预览受影响映射，正式图事务内保持映射合法。新候选若同时创建节点与映射，使用临时节点 ID 的一次性解析和提交。
- `SqliteNovelStore.deleteChapter` 目前显式删映射；增加证据和任务后也要定义清理或保留历史任务记录的规则，避免悬空引用。

## 4. 预计修改位置

- 共享：`src/shared/contracts/outline/outlineContracts.ts`、`desktopApi.ts`、`channels.ts`。
- 主进程：`BookDatabase.ts`、`outlineSchema.ts`、`SqliteOutlineStore.ts`、`OutlineApplication.ts`、`outlineChecks.ts`、IPC schema 与 `DesktopController.ts`。
- 测试：`SqliteOutlineStore.test.ts`、`outlineHandoff.test.ts`、`outlineChecks.test.ts`；覆盖新建书库结构与跨章映射，不做旧库升级测试。

## 5. 实施步骤与通过条件

| 步骤 | 工作 | 完成门槛 |
|---|---|---|
| D1 | 定义多章映射契约及片段完整性校验 | TS、IPC 和 SQL 字段一一对应；缺片段不能进入写作 |
| D2 | 更新新书库 schema、版本与测试数据重建步骤 | 清理确认的测试书库后能新建正确结构 |
| D3 | 改 map/unmap、读写和章节删除路径 | 同节点可映射两章；删除其中一章不影响另一章 |
| D4 | 改覆盖推导与有效性判断 | 第一章 `verified` 后节点仍待写；全部必需片段和结果证据满足才可整体覆盖 |
| D5 | 决定 `commit` 与证据表生命周期 | 普通更新节点不会意外删除证据，真删节点能明确处理证据 |

本模块完成后再开始依赖它的写作交接和图上正文生成。验收从新建测试书开始，检查节点与映射重开后仍在、章节修订可读和外键完整性。
