# 模块 04：已有正文反向补充事件图

> 依赖[模块 01](./01-data-and-mapping.md)的跨章映射及原子提交，复用[模块 03](./03-agent-planning.md)的事件图 Agent 与理论 Skill。目标是识别现有章节中的关键事件，给作者**可核对的候选**，不自动改正文或正式图。

## 1. 事实来源和扫描范围

主输入是当前书籍中未软删除章节的**当前正式修订**，由书籍存储读 `chapter.current_revision_id` 和 `revision_documents.plain_text`。当前 [`SqliteOutlineStore.listReadingChapters`](../../../src/main/story/storage/book/SqliteOutlineStore.ts) 已能按阅读顺序返回章与纯文本，但新扫描应使用分页/逐章读取及修订 ID 清单，避免一次把长篇全书载入提示词。向量检索可辅助找相关上下文，**不能代替逐章覆盖扫描**：索引缺失或尚未更新时也不能把已有正文判为空白。未保存的本地草稿不纳入默认扫描；作者要纳入时先保存为正式修订。

扫描范围允许全书、卷、选中章节；入口默认建议有正文但未充分映射的章节。开始时固定 `outlineRevision + 每章 revisionId + 提取器版本`。中途正文改变可以完成已在运行的提取，但该章候选必须标“基线已变”，接受前重新扫描或重新定位证据。

## 2. 提取与对齐流水线

1. **切段**：按段落/场景边界分块，保留全章规范化纯文本的起止偏移；相邻块有小范围上下文。偏移单位固定为 Unicode 码点或与现有检索 `OutlineEvidence` 一致的规则，并写入契约测试；不能让 JS UTF-16 下标和正文定位混用。
2. **块内提取**：同一个事件图 Agent 以理论 Skill 识别“有人为目标行动、遇阻、发生结果或重要揭示”的候选；逐项输出证据、文本中的陈述者/视角与确定程度。时间、动机、人物信念不明时置为未知，不臆造。
3. **章内合并**：重复描写同一次事件的多个片段合并，保留多个证据范围；对互相矛盾的叙述保留冲突提示，不强行合并事实。
4. **图内对齐**：与现有节点比较行动、参与者、结果和时间，分 `matched / update-suggested / new / uncertain`。标题相似仅是检索线索，不是去重依据；匹配结果必须指向稳定节点 ID。
5. **跨章合并**：多个章节描写同一连续事件时生成一个候选节点和多条 `(nodeId, chapterId)` 局部片段。若每章其实有独立结果，建议拆成多个节点，并展示理由。
6. **关系建议**：只对有明确文本依据的因果、前置、揭示、伏笔、对照建候选边；章节相邻仅给 `narrativeOrder` 建议，不造因果。
7. **预览**：作者逐项看“新增节点 / 补充已有节点 / 只补映射与证据 / 无法确认”，并可打开证据所在章节修订。对“人物说谎”“回忆有误”类内容，默认标 `uncertain`。

候选的非必填事实若缺证据，可保存为 `draft` 节点；不能为了通过正式图校验填入虚假时间/地点/结果。已匹配节点的既有字段只在作者明确选择时更新，默认更保守地补映射和证据。

## 3. 候选与证据契约

```ts
type BackfillScan = {
  scanId: string;
  projectId: string;
  outlineRevision: number;
  extractorVersion: string;
  chapterInputs: Array<{ chapterId: string; revisionId: string }>;
  candidates: BackfillCandidate[];
  status: "scanning" | "ready" | "failed" | "stale";
};

type BackfillCandidate = {
  candidateId: string;
  disposition: "matched" | "update-suggested" | "new" | "uncertain";
  matchedNodeId?: string;
  patchOperations: OutlinePatchOperation[];
  mappingChanges: Array<{
    nodeRef: string; // 既有 nodeId 或本提案 tempId
    chapterId: string;
    segmentIntent: string;
    expectedLocalChange: string;
  }>;
  evidence: Array<{
    chapterId: string;
    revisionId: string;
    startOffset: number;
    endOffset: number;
    excerpt: string;
  }>;
  explanation: string;
};
```

证据保存原修订 ID 与偏移；当前章已换修订时仍可读旧证据，但 UI 必须标“来自旧修订”。证据与 `OutlineMapping` 的引用生命周期按模块 01 的存储策略实现。摘录不作为自动改写章节的输入，避免旧修订内容覆盖新正文。

## 4. 审阅与原子接受

新增 `previewBackfillAcceptance(scanId, candidateIds, edits)`：先解析被选择的候选依赖，展示最终图 patch、映射变化、关系变化、正文证据及冲突。若候选 A 新建节点、B 给 A 建关系，取消 A 后 B 必须标依赖失效，不能只裁剪操作继续提交。

接受使用**一个应用用例、一个图事务**提交 `OutlinePatch + mappingChanges + evidence`：

- 重新核对 `outlineRevision`、节点是否仍存在、目标章节是否仍属当前书、每条证据修订是否仍是该章当前修订；任何失败都不写部分图。
- 用现有 `simulateOutlinePatch` 分配真实节点 ID，再把映射 `nodeRef` 的 tempId 映射到最终 ID；按范围和唯一键校验。
- 作者确认后写正式节点、关系、映射和证据；正文修订不变。写入成功后保存 `candidateId → nodeId` 接受记录，重复调用返回既有结果。
- 关闭或拒绝候选不改变正式图。失败时保留扫描结果和作者勾选，便于重新预览。

`OutlinePatch` 当前无映射操作，不能从 renderer 顺序调用 `applyOutlinePatch` 与 `mapOutlineNodes` 完成接受：第二步失败会留下半成品。解决方式在模块 01 中定为扩展 patch 操作或新增复合提交命令，并按 `SqliteOutlineStore.commit` 的全量重建行为验证证据不会丢失。

## 5. 幂等、性能与错误

扫描缓存键是 `(chapterId, revisionId, extractorVersion)`；**对齐结果**还依赖当前 `outlineRevision`，图改变后要重做对齐，不能直接复用旧的 matched/new 判断。长书分章顺序处理，每章可取消、重试；全书结果分页展示。模型返回无证据、偏移越界、引用外书节点、空结果字段时对应候选进入可修复状态，不进入正式 patch。日志只写扫描 ID、章/修订 ID、耗时和错误类别，不输出整章文本。

## 6. 预计改动和实施顺序

| 步骤 | 位置与工作 | 验收 |
|---|---|---|
| B1. 建立读取端口 | `src/main/story/application/books/` 与 `SqliteOutlineStore` 附近的只读章节接口 | 能按范围列出完整当前正文及修订；索引缺失不影响扫描 |
| B2. 提取/合并/对齐 | `src/main/story/application/outline/` 新增独立用例或小模块，复用事件图 Skill | 同一事件跨两章合成一个节点两条映射；猜测不当作事实 |
| B3. 保存候选与证据 | 新测试书库建表定义、存储查询与 shared 契约 | 重开页面能继续审阅；同一书内较早章节修订的证据可识别过期 |
| B4. 预览与原子接受 | `OutlineApplication`、`SqliteOutlineStore`、IPC | 成功一次性落节点/关系/映射；模拟失败后图和正文均不变 |
| B5. 定向测试 | 新扫描/接受测试、SQLite 重开测试 | 重扫不重复造节点；章节编辑后拒绝旧候选；证据定位正确 |

前端呈现见[模块 06](./06-renderer-integration.md)，完整闭环见[模块 07](./07-integration-acceptance.md)。
