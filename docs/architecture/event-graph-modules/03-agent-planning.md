# 模块 03：单个事件图 Agent 的范围规划

> 依赖[模块 01](./01-data-and-mapping.md)的稳定节点与映射契约。事件图只有一个规划 Agent，运行时 Skill 放在 [`skills/event-graph/SKILL.md`](../../../skills/event-graph/SKILL.md)；本设计不新增第二个事件图 Agent。总设计见[上级文档](../event-graph-backend-integration-design.md)。

## 1. 现有路径和要统一的地方

界面 [`useEventGraphSession.propose`](../../../src/renderer/features/event-graph/useEventGraphSession.ts) 当前调用 `window.storyOSAgent.proposeOutline`；`OutlineApplication.proposeOutline` 直接向 `ModelGateway` 发提示词，再经 `readProposalOperations/simulateOutlinePatch` 校验。运行时另有 `event-graph` Skill 及 `propose_outline_patch/apply_outline_patch` 工具。后者的 `propose_outline_patch` 又调用前述模型提案方法，若直接把页面接到 Agent 再调用此工具，会产生“Agent 再叫模型提案”的双层调用和不清楚的候选所有权。

实施时先固定**一条用户可见规划链路**：事件图 Agent 装载理论 Skill、读取允许范围内的正式图与章节证据、一次产出结构化候选；`OutlineApplication` 只做范围守卫、解析、模拟、预览和确认提交。若保留现有直接 `proposeOutline` 作为底层实现，应明确它由 Agent 用例调用一次且不再由 Agent 的提案工具递归触发模型。具体复用方式以当前 Agent 编译/工具机制最小改动为准，验收标准是一次用户规划请求只有一次主提案生成，失败重试另计。

## 2. 规划范围

| 范围 | 作者入口与默认行为 | 允许输出 | 禁止的隐式修改 |
|---|---|---|---|
| 全书 | 没有选中对象，点击“规划主线” | 下一层关键事件、必要直接关系、全书承诺建议 | 覆盖已有确认节点原文 |
| 阶段 | 点击底部阶段括号，选择“完善阶段” | 该阶段的事件、顺序、内部关系与阶段边界建议 | 移动别的阶段节点或改全书结局 |
| 节点 | 选中卡片，选择“完善这个事件” | 该节点字段、必要子事件及直接边 | 修改不相关节点 |
| 关系 | 选中边或两节点，选择“规划关系” | 两节点间的类型、方向和具体依据 | 把相邻顺序自动当因果 |
| 字段 | 右侧 Markdown 信息文档某字段旁“AI 完善” | 指定节点的指定字段新值及解释 | 全量提交参与者或其他节点字段 |

作者输入默认可为空；可选补充一句“希望保留的转折/选择”。系统自动附 `scope`、版本与事实材料。`planningMode` 等高级选项仅在需要时展开。没有主线时先按既有流程建立空大纲，候选不能依赖一个不存在的 `outlineId` 直接提交。

## 3. 统一请求与候选

请求使用总设计中的 `PlanningScope` 判别联合类型，带 `projectId、expectedOutlineRevision、instruction?`。返回候选包含 `scope、baseRevision、summary、OutlinePatch、受影响节点/关系/章节、解释、校验问题`。模型只允许提出临时节点 ID；正式 ID 由应用层分配。候选可在 UI 修改后重新模拟，再接受或丢弃。

**范围守卫在模型输出之后再校验**，具体规则：

1. `field` 范围只允许一条针对指定 nodeId、指定属性的 `update_node`；不允许模型用 `notes` 或 `participants` 数组携带其它事实变更。人物状态若要规划，另定义 `participant-field` 范围和单人键。
2. `relation` 范围只允许指定两节点之间的 `upsert_relation/delete_relation`；方向、类型、说明逐项审查；跨书节点拒绝。
3. `node` 范围允许该节点更新、在其下面创建**一层**子事件及与它直接相关的关系；创建子事件后若原节点已有章节映射，先给出映射转移影响预览，不直接让父节点映射失效。
4. `stage` 范围只允许阶段后代与内部关系；跨阶段边必须在候选中单列并由作者明确接受。
5. `book` 范围限制一次新建节点数、操作总数和模型上下文；采用逐层规划，不一次补完整本小说所有章节。

`simulateOutlinePatch` 负责图结构校验；再加范围校验与映射影响检查。结构错误阻断；“人物动机薄弱”“伏笔兑现偏弱”等语义判断作为建议。候选修改后重复这两级校验。预览应显示旧值与新值，明确关系为何成立。作者接受前正式图、写作交接和正文都不变化。

## 4. 事件图理论 Skill 的修订

Skill 的文本建议按下面五段维护，不把完整论文资料直接塞入每轮上下文：

1. **事件粒度**：事件要有行动/遭遇、意图或阻力、可观察变化；不要求每个节点再建叶子；跨章本身不触发拆分。
2. **关系理论**：因果、前提、揭示、伏笔、对照分别回答什么；阅读顺序和空间相邻不是因果证据。
3. **人物和信息**：目标、前后状态、谁知道何事；正文中的误导与人物猜测不能自动变成故事事实。
4. **章节片段**：同一节点可有铺设/推进/完成多个章节映射；对每章建议局部变化，禁止前章提前兑现最终结果。
5. **候选纪律**：范围外不改、证据不足保留待定、先提案后确认；正文由章节写作服务保存，规划 Agent 不直接写正文。

引用依据可指向[理论设计](../event-graph-theory-and-node-design.md)。Skill 是运行时提示词框架，不代替 `zod`、应用服务和数据库约束。

## 5. 文件与执行步骤

| 步骤 | 预计位置 | 通过条件 |
|---|---|---|
| A1. 统一入口和模型调用 | `OutlineApplication.ts`、`outlinePropose.ts`、`src/main/story/integration/tools/outline/`、Skill 编译接入 | 页面与 Agent 得到同一类候选；一次请求不双重调用提案模型 |
| A2. 设计范围契约与 IPC 校验 | `outlineContracts.ts`、`desktopApi.ts`、`channels.ts`、`OutlineIpcController.ts` | 五种范围严格解析；陌生字段和越界 ID 拒绝 |
| A3. 实施范围守卫与差异预览 | `outlinePatch.ts` 附近的应用校验，`EventGraphProposal.tsx` | 字段规划只改一字段；关系方向可审阅；越界 patch 不落库 |
| A4. 修订 Skill | `skills/event-graph/SKILL.md` 及对应 runtime Skill 测试 | 单 Agent 可规划跨章节点，不再强制高层节点拆叶子 |
| A5. 定向测试 | `outlinePropose.test.ts`、`outlinePatch.test.ts`、Agent 工具测试 | 拒绝候选/版本冲突不修改正式图；修复提示可重试 |

## 6. 验收样例

输入“完善事件 E 的冲突”时，候选只有 `E.conflict` 的差异；即使模型额外返回 `E.outcome`，后端也拒绝整份候选。选择 E 与 F 规划关系时，必须说明关系类型及哪项结果使另一事件成立。点击阶段规划时，既有其它阶段的节点和章节映射保持不变。作者拒绝、重试或关闭页面后，正式图修订号不增加。
