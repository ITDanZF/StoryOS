# StoryOS 大纲模块详细设计分析

> 文档状态：方案建议稿  
> 生成日期：2026-08-25  
> 任务分类：新功能的产品与技术设计文档；本文不包含代码实施  
> 推荐结论：将“大纲”建设为独立于“卷—章目录”的一级创作模块，以层级事件树为核心，以章节映射、叙事承诺和一致性检查为增强能力；首版不做自由图画布、多分支版本树和全自动多智能体写书。

## 1. 结论先行

StoryOS 当前已经有书籍、分卷、章节、章节正文和 AI 工具，但现有的“目录”本质上是稿件容器结构，不是叙事规划结构。当前 `get_book_outline` 读取的也是书籍资料、分卷与章节列表，并没有事件、因果、角色状态、场景、伏笔或章节目标。

推荐新增一个独立的“大纲工作区”，核心模型为：

```text
书籍创作意图
  └─ 故事弧 / 大纲组（Arc）
      └─ 情节节点（Beat）
          └─ 场景 / 事件（Scene / Event）
              ├─ 映射到一个章节
              ├─ 参与角色与地点
              ├─ 因果依赖与时间顺序
              ├─ 叙事目标、冲突、结果
              └─ 伏笔 / 触发 / 兑现承诺
```

产品上采用“树形总览 + 顺序时间线 + 右侧详情检查器”的三栏结构。用户可以从粗粒度故事弧逐步展开到可写作的场景事件，再将叶子事件分配到章节。AI 生成必须先产生候选草案，由用户审阅后提交；正文生成时只读取“全书约束 + 当前故事弧 + 当前章节事件 + 相邻事件 + 活跃叙事承诺”，避免把整本大纲无差别塞进上下文。

最重要的边界是：

- 目录回答“稿件放在哪里”：卷、章、页面、正文。
- 大纲回答“故事为什么这样发展”：事件、因果、节奏、角色变化、承诺与兑现。
- 二者通过章节映射关联，但不能共用同一个实体或互相隐式覆盖。
- AI 可以提议结构变化，不能在未预览和确认时批量改写用户大纲。

## 2. 项目现状与问题定义

### 2.1 当前能力

从现有实现看，StoryOS 已具备以下基础：

- Electron + React + TypeScript 桌面工作区。
- SQLite 本地项目数据库及递增迁移机制，目前迁移版本到 6。
- 单项目单书籍模型，书籍下有分卷、章节和章节修订。
- 章节目录、页面视图、富文本正文编辑、章节搜索和统计。
- `NovelApplication` / `NovelPersistence` 的应用层与存储层边界。
- preload + IPC + shared contracts 的桌面调用链。
- Agent 已能读取书籍结构、章节正文，创建或修改卷章，生成和编辑正文。
- 现有书籍页已经模块化出 `BookCatalogPanel`、`BookProfilePanel`、`ChapterEditorPanel` 和分页子模块。

这些能力足以支撑首版大纲模块，无需另起一套存储或页面框架。

### 2.2 当前“outline”概念的歧义

代码中已有两种与 outline 相关的概念，但都不是本文所设计的叙事大纲：

1. `ChapterStatus = "outline" | "draft" | "revising" | "completed"` 中的 `outline` 是章节生命周期状态。
2. Agent 工具 `get_book_outline` 返回书籍、分卷和章节，是目录快照。

如果直接在现有字段上追加内容，会产生以下问题：

- 章节状态与叙事结构混为一谈。
- 无法表达一个章节包含多个事件，或一个事件跨越多个章节。
- 无法表达因果顺序和叙述顺序的差异。
- 无法追踪伏笔是否触发、是否兑现。
- AI 修改章节标题时可能被误认为修改了大纲。
- 后续图视图、版本、分析和一致性检查缺少稳定领域模型。

因此，建议在代码和产品文案中使用更明确的领域名：

- UI 中文：大纲、故事弧、情节节点、场景事件、叙事承诺。
- 代码英文：`Outline`、`StoryArc`、`OutlineNode`、`NarrativePromise`。
- 现有工具 `get_book_outline` 后续建议兼容保留，但重命名语义为目录读取；新增 `get_narrative_outline`。

### 2.3 要解决的用户问题

大纲模块的目标不是“让 AI 多生成一段摘要”，而是解决长篇写作的五个持续问题：

1. **全局不可见**：作者看见了章节列表，却看不出主线、支线、高潮和节奏分布。
2. **计划粒度不够**：只有书籍简介和章节标题，真正写作时仍需临场拼接情节。
3. **长程一致性弱**：角色状态、地点、目标、悬念和伏笔容易在跨章后失联。
4. **计划与正文脱节**：AI 生成的正文可能遗漏计划事件，或提前泄露未来事件。
5. **修改影响难判断**：移动或删除一个事件后，用户不知道哪些章节、因果链和承诺受影响。

## 3. 论文调研综合

本节仅提炼对 StoryOS 产品设计有直接价值的结论，不照搬论文中的训练或实验架构。

### 3.1 DOC：详细大纲控制

来源：[Improving Long Story Coherence With Detailed Outline Control](<../pdf/Improving_Long_Story_Coherence_With_Detailed_Outline_Control_中文翻译.md>)

可用结论：

- 将短大纲递归扩展成层级树，能把创作负担从临场起草前移到规划阶段。
- 叶子节点应落到具体事件，并显式标注场景与角色。
- 大纲细节越多，正文对大纲的遵循越难，不能只靠一次性长提示。
- 正文生成应围绕当前事件分段进行，并在事件完成时切换到下一个节点。
- 当前事件可读取有限的未来上下文来改善过渡，但必须防止提前生成未来情节。
- 控制强度过低会跑题，过高会重复并损失创造力。

对 StoryOS 的转化：

- 使用层级节点，而不是只有章节摘要的平面表单。
- 首版允许“展开一层”而不是一键无限递归扩写。
- 叶子事件包含角色、地点、目标、冲突和结果。
- 章节生成采用节点级上下文包，并回写事件覆盖状态。
- AI 生成结果先进入候选预览，不直接覆盖大纲。

### 3.2 GraphStory：事件图和多层级编辑

来源：[Collaborative Story Writing through Event-Based Narrative Editing](<../pdf/Collaborative Story Writing through Event-Based_中文翻译.md>)

可用结论：

- 事件图是用户意图和 AI 文本之间透明、可编辑的中间层。
- 宏观节点和微观事件应支持不同粒度的查看与编辑。
- 图表示能帮助作者发现缺口、理解影响范围，并避免重读大量正文。
- 线性聊天不适合管理多个叙事方向；需要显式版本或候选管理。
- 图到正文会出现遗漏、合并和擅自新增，必须做对齐检查。

对 StoryOS 的转化：

- 首版不必做昂贵的自由图画布，但领域模型应允许跨节点关系。
- UI 先以树和时间线提供宏观/微观切换，后续再添加图视图。
- AI 候选必须支持逐项接受、拒绝和编辑。
- 正文与事件之间保留显式来源映射，以支持“正文是否覆盖事件”的诊断。

### 3.3 STORYWRITER：事件图、章节规划和动态历史压缩

来源：[STORYWRITER：面向长故事生成的多智能体框架](<../pdf/StoryWriter_中文精译版.md>)

可用结论：

- 大纲不是描述性句子列表，而应包含事件及事件关系。
- 事件先被细化为子事件，再从全局角度分配到章节。
- “故事发生顺序”与“文本叙述顺序”可以不同，倒叙和预叙需要显式表示。
- 写作上下文不应机械包含全部历史，而应根据当前事件动态选择相关事件和人物。
- 生成与校验是两个职责，不能把生成结果天然视为正确。

对 StoryOS 的转化：

- 节点同时保存 `storyOrder` 和 `narrativeOrder` 的扩展空间；首版 UI 默认只编辑叙述顺序。
- 章节是事件的承载容器，不是事件本身。
- 上下文构建器成为独立服务，并提供“为什么选中这些上下文”的可解释信息。
- 一致性检查独立于生成动作，可随时运行。

### 3.4 CFPG：伏笔—触发—兑现

来源：[Codified Foreshadowing-Payoff Text Generation](<../pdf/Codified Foreshadowing-Payoff Text Generation_中文翻译.md>)

可用结论：

- 长篇一致性不仅是角色属性不变，还包括早期叙事承诺在合适时机被兑现。
- 伏笔应被表示为显式的 `(F, T, P)`：铺设内容、触发条件、兑现要求。
- 系统应维护“待决承诺池”，触发条件满足后才把相关承诺加入当前生成上下文。
- 单纯把所有伏笔以自然语言塞进提示，既浪费上下文，也无法验证状态。

对 StoryOS 的转化：

- 将叙事承诺作为独立实体，而不是节点详情里的普通备注。
- 首版用人工状态 + AI 建议，不尝试完全自动判定触发。
- 承诺状态至少包含：计划、已铺设、可兑现、已兑现、放弃。
- 删除或移动关联节点时生成结构告警。

### 3.5 BiT-MCTS：高潮锚点和双向规划

来源：[BiT-MCTS：一种基于主题的双向 MCTS 中文小说生成方法](<../pdf/A Theme-based Bidirectional MCTS Approach to Chinese_中文翻译.md>)

可用结论：

- 顺序式从开头一路生成大纲容易公式化，也容易在后段失去方向。
- 先确定核心冲突和高潮，再向前规划后果、向后规划升级路径，能提供更稳定的结构锚点。
- 粗略大纲仍需要全局自检，通过重排、插入、删除修复逻辑与节奏问题。

对 StoryOS 的转化：

- 新建大纲向导应支持“高潮优先”模式，而不只有“从开头生成”。
- 节点可标记结构角色：开端、激励事件、上升、转折、危机、高潮、下降、结局。
- MCTS 搜索本身不适合首版；先实现多候选与评分界面，未来再替换候选生成策略。

### 3.6 EVOSPARK：活状态与记忆巩固

来源：[EVOSPARK：面向统一长程叙事演化的内生交互式智能体社会](<../pdf/Endogenous Interactive Agent Societies for_中文翻译.md>)

可用结论：

- 长篇记忆不能只是不断追加旧信息，否则冲突状态会同时残留。
- 全局事实、事件溯源和当前角色认知应分层保存。
- 角色—地点—情节必须对齐，不能让不在场的角色执行当前事件。
- 新角色从临时提及升级为正式角色，需要显式落地过程。

对 StoryOS 的转化：

- 首版节点保存“事件前状态/事件后变化”或至少“状态变化摘要”。
- 一致性检查要覆盖角色在场、地点转换和角色状态冲突。
- 暂不建设完整角色社会模拟；为未来角色卡与世界观模块预留外部实体引用。

### 3.7 从提示到成书：粗到细规划脚手架

来源：[迈向人类水平的写书能力](<../pdf/Towards Human-Level Book-Writing Capability_中文翻译.md>)

可用结论：

- 长篇规划适合采用全书级、章节级、场景级的由粗到细脚手架。
- 场景不仅需要“发生什么”，还需要叙事功能，例如动作、对话、说明、世界构建和节奏。
- 章节是带有结构作用、风格和角色动态的单元，不应只是场景摘要拼接。
- 短要点比稠密散文更适合作为可聚合、可重组的计划表示。

对 StoryOS 的转化：

- 节点摘要采用短要点，详情字段承载约束，避免大段散文式大纲。
- 场景节点可设置叙事功能与节奏强度。
- 全书、故事弧、章节和场景上下文分层组装。

## 4. 产品定位与范围

### 4.1 产品定位

大纲模块是 StoryOS 的“叙事控制台”，位于构思与正文之间：

```text
用户意图 / 灵感
        ↓
结构化大纲（可检查、可编辑、可版本化）
        ↓
章节计划与上下文包
        ↓
正文生成 / 人工写作
        ↓
覆盖度与一致性反馈
        └────────────→ 回到大纲修订
```

它既不是聊天记录，也不是章节目录，更不是正文摘要集合。

### 4.2 MVP 必须包含

- 独立的大纲入口和工作区。
- 故事弧—情节节点—场景事件的层级树。
- 节点创建、编辑、删除、折叠、拖动排序和移动父级。
- 节点详情：摘要、结构角色、叙事功能、状态、角色、地点、目标、冲突、结果、备注。
- 节点映射到章节；一个章节可映射多个节点。
- 简单关系：前置/因果/揭示/对照，首版可只读列表和选择器，不必画连线。
- 叙事承诺的创建、状态更新和节点关联。
- 基础一致性检查与结构告警。
- AI 从书籍简介生成候选大纲、展开选中节点、检查大纲。
- 所有批量 AI 变更都有 diff 预览与逐项接受。
- Agent 可读取和变更大纲，但高影响操作走现有审批机制。

### 4.3 MVP 明确不做

- 无限画布、自动布局、复杂边编辑器。
- 多条正式剧情分支同时发布。
- Git 式节点版本树与合并。
- MCTS 搜索引擎。
- 多智能体实时角色社会模拟。
- 自动从正文持续重写大纲。
- 完整角色卡、世界观百科和地点数据库。
- 训练专用控制器或自定义模型。

这些能力有价值，但会显著增加交互、数据一致性和回滚成本。首版应先验证“结构化计划是否真正改善创作流程”。

## 5. 信息架构与交互设计

### 5.1 入口设计

推荐在书籍工作区顶部增加一级模式切换：

```text
[正文] [大纲] [资料（未来）]
```

- “正文”保留现有目录、页面与章节编辑体验。
- “大纲”进入独立布局，但共享当前书籍和 AI 助手。
- 不建议把大纲作为 `BookCatalogPanel` 的第三个小标签。现有目录面板宽度仅 216–360px，无法容纳节点详情、关系和检查结果。

### 5.2 推荐布局

```text
┌──────────────┬────────────────────────────────┬──────────────────┐
│ 大纲树        │ 时间线 / 卡片工作区              │ 节点详情检查器     │
│              │                                │                  │
│ 全书          │ [筛选] [结构视图] [检查] [AI]    │ 摘要              │
│ ├─ 第一故事弧  │                                │ 结构角色 / 功能    │
│ │  ├─ 节点 1  │  01 → 02 → 03 → 04             │ 角色 / 地点        │
│ │  └─ 节点 2  │  节点卡片、章节标签、告警         │ 目标 / 冲突 / 结果 │
│ └─ 第二故事弧  │                                │ 关系 / 承诺        │
└──────────────┴────────────────────────────────┴──────────────────┘
```

响应式策略：

- ≥ 1280px：三栏同时显示。
- 900–1279px：左树 + 主区，详情为抽屉。
- < 900px：单栏主区，树和详情均为抽屉。

### 5.3 三种视图

#### A. 结构视图（MVP 默认）

- 用缩进卡片显示层级。
- 支持拖放排序、拖入父节点、批量折叠。
- 最适合由粗到细展开和快速扫描。

#### B. 时间线视图（MVP）

- 按叙述顺序横向或纵向排列叶子事件。
- 节点显示所属故事弧、章节、结构角色、状态和告警。
- 可筛选角色、地点、故事线和未映射事件。

#### C. 关系图视图（后续）

- 展示跨层级因果、揭示、对照和伏笔关系。
- 仅在用户确实需要处理非线性结构后加入。
- 领域模型从首版起支持关系，但不让可视化复杂度阻塞 MVP。

### 5.4 节点卡片最小信息

每张卡片只显示：

- 顺序号和标题。
- 一行摘要。
- 结构角色或叙事功能图标。
- 章节标签。
- 角色数量 / 地点。
- 告警数量。
- 状态：草拟、已确认、写作中、已覆盖、需修订。

复杂字段放到右侧详情，避免卡片变成表单。

### 5.5 关键用户流程

#### 流程 1：从简介创建大纲

1. 用户进入空大纲页。
2. 选择“手动创建”或“AI 辅助创建”。
3. AI 模式要求确认故事主题、核心冲突、期望规模、叙述方式和结局偏好。
4. 可选择“顺序规划”或“高潮优先”。
5. AI 生成 2–3 个顶层候选，只显示短摘要与差异。
6. 用户选择一个或组合候选。
7. 系统创建草拟状态的大纲；用户再逐层展开。

#### 流程 2：展开节点

1. 用户选择某个故事弧或情节节点。
2. 点击“展开一层”。
3. AI 读取祖先、同级、相邻节点和全书约束。
4. 返回 2–3 组子节点方案以及结构风险说明。
5. 用户逐项接受、编辑或重新生成。
6. 提交后重新运行局部检查。

#### 流程 3：分配到章节

1. 用户选择一个或多个叶子事件。
2. 分配到已有章节，或建议新建章节。
3. 系统只创建映射，不自动移动或改名章节。
4. 一个章节的事件可手动排序。
5. 未映射事件和无事件章节都显示为诊断项，不直接判定为错误。

#### 流程 4：从大纲生成正文

1. 在章节编辑器点击“按大纲写作”。
2. 展示本章将使用的事件、活跃承诺和相关角色状态。
3. 用户可临时排除某个节点或调整顺序。
4. AI 生成预览，标注每段主要覆盖哪个事件。
5. 用户接受后写入章节修订。
6. 系统把相关节点标为“待核验”，而不是直接标为“已覆盖”。
7. 覆盖检查通过或用户确认后，节点变为“已覆盖”。

#### 流程 5：结构检查

1. 用户运行“检查当前弧”或“检查全书”。
2. 先执行确定性规则，再按需执行 AI 语义检查。
3. 结果按严重级别分组，并定位到节点。
4. 修复建议以候选补丁呈现。
5. 用户决定忽略、稍后处理、手动修复或接受建议。

## 6. 领域模型建议

### 6.1 Outline

每本书首版只维护一个当前大纲：

```ts
type Outline = {
  id: string;
  novelId: string;
  title: string;
  premise: string;
  theme: string;
  coreConflict: string;
  climaxSummary: string;
  endingIntent: string;
  status: "draft" | "active" | "archived";
  revision: number;
  createdAt: string;
  updatedAt: string;
};
```

说明：

- `revision` 用于乐观并发和 AI 补丁基线，不替代完整历史版本。
- `climaxSummary` 与 `endingIntent` 可为空，以支持自由探索。
- 首版单大纲避免分支合并；未来可以增加 `outline_variants`。

### 6.2 OutlineNode

统一用节点表表达故事弧、情节节点和场景事件：

```ts
type OutlineNode = {
  id: string;
  outlineId: string;
  parentId: string | null;
  kind: "arc" | "beat" | "scene" | "event";
  title: string;
  summary: string;
  structuralRole:
    | "setup"
    | "inciting_incident"
    | "rising_action"
    | "turning_point"
    | "crisis"
    | "climax"
    | "falling_action"
    | "resolution"
    | "custom";
  narrativeFunction:
    | "action"
    | "dialogue"
    | "exposition"
    | "worldbuilding"
    | "relationship"
    | "mystery"
    | "transition"
    | "mixed";
  goal: string;
  conflict: string;
  outcome: string;
  locationText: string;
  timeText: string;
  storyOrder: number;
  narrativeOrder: number;
  status: "draft" | "confirmed" | "writing" | "covered" | "needs_revision";
  notes: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
};
```

设计判断：

- 统一节点表比为 Arc/Beat/Scene 各建一张表更适合当前项目规模，能减少重复 CRUD 和拖拽逻辑。
- `kind` 限制交互层级，但不要强制固定三层；有的作者只需要弧—场景两层。
- `storyOrder` 表示故事世界中的发生顺序，`narrativeOrder` 表示读者看到的顺序。MVP 可以默认相同，只在高级设置中显示前者。
- 角色和章节映射应使用关联表，不能存逗号分隔 ID。
- 地点首版使用文本，因为项目还没有正式地点实体；未来可追加 `locationId`。

### 6.3 OutlineNodeRelation

```ts
type OutlineNodeRelation = {
  id: string;
  outlineId: string;
  sourceNodeId: string;
  targetNodeId: string;
  type: "causes" | "requires" | "reveals" | "foreshadows" | "contrasts";
  description: string;
  createdAt: string;
};
```

规则：

- 不允许自环。
- `requires` 和 `causes` 默认要求源节点叙述顺序早于目标节点；倒叙情况允许用户明确忽略。
- 删除节点时关系级联删除，但删除预览必须列出受影响关系。

### 6.4 ChapterOutlineMapping

```ts
type ChapterOutlineMapping = {
  chapterId: string;
  nodeId: string;
  sortOrder: number;
  coverageStatus: "planned" | "drafted" | "verified" | "deviated";
  coverageNote: string;
};
```

规则：

- 一个章节可映射多个叶子节点。
- 一个节点首版最多映射一个章节，跨章事件应拆成父节点 + 多个子事件。
- 删除章节时映射删除，但大纲节点保留并变为未映射。
- 删除大纲节点不删除章节或正文。

### 6.5 OutlineNodeParticipant

项目当前没有正式角色实体，因此建议分两步：

- MVP：保存 `participantName`、`role`、`stateBefore`、`stateAfter`。
- 角色模块上线后：增加可空的 `characterId` 并做实体解析。

```ts
type OutlineNodeParticipant = {
  nodeId: string;
  participantName: string;
  role: "focus" | "active" | "supporting" | "mentioned";
  stateBefore: string;
  stateAfter: string;
};
```

### 6.6 NarrativePromise

```ts
type NarrativePromise = {
  id: string;
  outlineId: string;
  title: string;
  setup: string;
  triggerCondition: string;
  payoffRequirement: string;
  status: "planned" | "seeded" | "eligible" | "paid_off" | "abandoned";
  setupNodeId: string | null;
  triggerNodeId: string | null;
  payoffNodeId: string | null;
  notes: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
};
```

首版状态主要由用户维护，AI 可以建议状态变化，但不能自动把承诺标记为已兑现。

### 6.7 检查结果不应作为永久真相

一致性检查结果建议保存为可重算的快照：

```ts
type OutlineIssue = {
  id: string;
  outlineId: string;
  nodeId: string | null;
  ruleCode: string;
  severity: "info" | "warning" | "error";
  source: "rule" | "ai";
  message: string;
  fingerprint: string;
  status: "open" | "ignored" | "resolved";
  checkedRevision: number;
};
```

节点修改后，旧结果必须标记过期或按 fingerprint 失效，不能继续显示为当前事实。

## 7. SQLite 数据设计

建议新增独立迁移版本，不修改已有 `novels`、`volumes`、`chapters` 和 `chapter_revisions` 的语义。

建议表：

- `outlines`
- `outline_nodes`
- `outline_node_relations`
- `outline_node_chapters`
- `outline_node_participants`
- `narrative_promises`
- `outline_issues`

关键约束：

- 所有表通过外键关联并启用合适的 `ON DELETE`。
- `outline_nodes(parent_id)` 同一大纲内引用；应用层额外检查不能形成环。
- `outline_nodes(outline_id, parent_id, narrative_order)` 建索引。
- 章节映射对 `(chapter_id, node_id)` 唯一。
- 若采用“一个节点最多一个章节”，对 `node_id` 建唯一索引。
- 关系对 `(source_node_id, target_node_id, type)` 唯一。
- 承诺关联节点必须属于同一个大纲，SQLite 难以用简单外键完全表达，需应用层事务校验。
- 排序使用稀疏整数（如 1000、2000、3000），降低拖动时批量更新成本；必要时再归一化。
- 所有批量结构变更在单个事务内完成。

不建议把整棵大纲存为单个 JSON：

- 拖动一个节点会重写整份文档。
- 难以用外键约束章节映射和节点关系。
- AI patch 和乐观并发的冲突粒度过大。
- 查询“某角色参与的全部事件”“未兑现承诺”会变复杂。
- 后续图视图和诊断无法高效索引。

## 8. 应用层、IPC 与 Agent 设计

### 8.1 模块边界

大纲功能复杂度已经达到需要拆分的程度。它同时包含层级结构、排序、关系、章节映射、检查、AI 候选和批量审批，不应继续塞进现有 29KB 的 `BookWorkspacePage.tsx` 或 19KB 的 `BookCatalogPanel.tsx`。

推荐边界：

```text
shared/outline
  contracts.ts          DTO、请求和枚举
  validation.ts         无副作用领域校验

main/agent/application/outline
  OutlineApplication.ts 用例编排、事务边界、权限与并发
  outlinePorts.ts       持久化端口
  outlineChecks.ts      确定性检查规则
  contextBuilder.ts     AI 写作上下文组装

main/agent/storage/project
  SqliteOutlineStore.ts SQLite 实现

main/agent/tools/outline
  readOutline.ts
  mutateOutline.ts
  analyzeOutline.ts

renderer/pages/book/outline
  OutlineWorkspace.tsx
  useOutlineWorkspace.ts
  model/
  components/
  checks/
```

### 8.2 推荐应用服务用例

- `getOutlineSnapshot(projectId)`
- `createOutline(request)`
- `updateOutlineProfile(request)`
- `createOutlineNode(request)`
- `updateOutlineNode(request)`
- `moveOutlineNode(request)`
- `deleteOutlineNode(request)`
- `replaceOutlineSubtree(request)`
- `upsertNodeRelation(request)`
- `mapNodeToChapter(request)`
- `unmapNodeFromChapter(request)`
- `upsertNarrativePromise(request)`
- `runOutlineChecks(request)`
- `applyOutlinePatch(request)`

批量 AI 结果不要转成连续多次 IPC CRUD。应使用带基线 revision 的 `applyOutlinePatch`，在主进程中验证并以单事务提交，否则中途失败会留下半棵大纲。

### 8.3 Patch 模型

```ts
type OutlinePatch = {
  outlineId: string;
  expectedRevision: number;
  operations: readonly (
    | { type: "create_node"; tempId: string; value: CreateNodeInput }
    | { type: "update_node"; nodeId: string; changes: UpdateNodeInput }
    | { type: "move_node"; nodeId: string; parentId: string | null; order: number }
    | { type: "delete_node"; nodeId: string }
    | { type: "upsert_relation"; value: RelationInput }
    | { type: "upsert_promise"; value: PromiseInput }
  )[];
};
```

要求：

- 先在内存中模拟应用并完整校验，再开启写事务。
- 任一操作失败则整批回滚。
- 返回新 revision 和规范化后的受影响子树。
- 冲突时返回明确错误，不做静默 last-write-wins。
- 删除操作必须在预览中展示受影响子节点、关系、映射和承诺。

### 8.4 Agent 工具建议

只读工具：

- `get_narrative_outline`：按层级或筛选读取大纲。
- `get_outline_node`：读取单节点及关系、章节映射和承诺。
- `get_chapter_outline_context`：读取写作某章所需上下文包。
- `list_narrative_promises`：按状态筛选承诺。
- `check_narrative_outline`：运行规则或语义检查。

变更工具：

- `create_outline_draft`：创建候选大纲草案。
- `expand_outline_node`：返回候选 patch，不直接提交。
- `apply_outline_patch`：高影响、需审批。
- `map_outline_nodes_to_chapter`：需预览映射变化。
- `update_narrative_promise`：状态变更需记录原因。

不要让 Agent 继续通过 `create_book_chapter` 假装在创建大纲。目录 CRUD 与大纲 CRUD 必须语义分离。

## 9. AI 生成与上下文策略

### 9.1 AI 不是单次提示，而是一条可观察流水线

推荐流水线：

```text
意图解析
  → 结构方案候选
  → 节点展开
  → 确定性校验
  → AI 自检
  → 用户预览
  → 事务提交
```

每一步返回结构化数据，不把自然语言 Markdown 当作唯一中间格式。

### 9.2 上下文包分层

生成或检查某个节点时，按优先级组装：

1. **硬约束**：主题、核心冲突、结局意图、叙述视角、禁止项。
2. **全书摘要**：故事弧列表与关键角色/世界规则的短摘要。
3. **祖先路径**：当前节点的全部父级。
4. **局部邻域**：前后相邻节点、直接因果前置节点。
5. **当前章节**：本章其他节点及正文短摘要。
6. **活跃承诺**：触发条件相关的未兑现承诺。
7. **角色状态**：参与角色在当前节点前的最新有效状态。
8. **未来边界**：只提供紧邻后续节点的概要，明确禁止提前兑现。

禁止默认注入整本正文、整棵详细大纲和全部承诺。动态选取既节省 token，也降低无关信息干扰。

### 9.3 结构化输出校验

- 使用 Zod 对模型输出做严格 schema 校验。
- ID 由系统生成，模型只能引用允许的现有 ID 或临时 ID。
- 枚举不能容忍任意字符串并静默降级。
- 父节点、关系和章节 ID 必须存在并同属当前书籍。
- 模型输出不完整时返回可修复错误，不用空字符串或默认节点掩盖问题。
- 用户可看到模型失败原因并重试，不接受“看似成功、实际丢字段”。

### 9.4 候选与评分

首版生成 2–3 个候选即可，评分维度建议为：

- 与主题和核心冲突的相关性。
- 局部因果连贯性。
- 与相邻节点的重复度。
- 角色和地点可行性。
- 节奏与结构角色匹配。
- 对既有承诺的影响。
- 创造性/意外性。

评分是选择辅助，不要只展示一个总分。用户需要知道“方案 A 更稳，方案 B 更有意外性”。

## 10. 一致性与质量检查

### 10.1 确定性规则（优先实现）

这些规则成本低、结果稳定，应该先于 AI 检查：

- 孤立节点：非根节点没有有效父级。
- 层级环：节点父子关系形成循环。
- 关系环：`requires` / `causes` 形成明显循环。
- 顺序冲突：前置节点在叙述顺序上位于目标之后且未标记倒叙例外。
- 空节点：已确认节点缺少摘要、目标或结果。
- 未映射叶子：确认后的叶子事件没有章节。
- 空章节：进入写作状态的章节没有大纲节点。
- 角色在场冲突：主动参与者在场景前未被引入或状态显示不在场。
- 地点跳变：连续事件地点变化但无过渡节点或说明。
- 承诺悬空：已铺设承诺没有计划的兑现节点。
- 兑现顺序错误：兑现节点早于铺设节点。
- 删除影响：删除节点会破坏关系、映射或承诺。
- 覆盖漂移：章节正文已修改，但对应节点覆盖状态仍是旧 revision 验证结果。

### 10.2 AI 语义检查（按需运行）

- 事件是否真正推动目标或冲突。
- 角色动机是否支持当前行动。
- 转折是否有足够铺垫。
- 高潮是否兑现核心冲突。
- 相邻节点是否语义重复。
- 伏笔兑现是否有因果依据，而非只出现相似词。
- 节奏是否长时间停留在同一叙事功能。
- 正文是否遗漏、合并或擅自新增大纲事件。

AI 结果必须标记为“建议性判断”，附证据节点或正文片段，不能伪装成确定性错误。

### 10.3 严重级别

- Error：结构损坏、引用无效、事务不能提交。
- Warning：很可能影响连贯性或计划履行。
- Info：创作建议或可接受的风格偏好。

用户可忽略 Warning/Info，并填写原因；Error 只能先修复。

## 11. 与现有正文工作区的集成

### 11.1 低侵入集成原则

- 保留现有 `BookCatalogPanel` 的目录与页面行为。
- `BookWorkspacePage` 只负责选择当前工作模式和组合子模块。
- 大纲状态放入独立 `useOutlineWorkspace`，不塞进现有 `useBookWorkspace`。
- 章节编辑器只新增一个“本章大纲”轻量入口和生成上下文入口。
- 大纲删除永远不删除正文；章节删除也不删除大纲节点。
- 切换大纲映射不触发正文自动改写。

### 11.2 章节编辑器中的轻量面板

在正文模式右侧或工具栏提供“本章大纲”抽屉：

- 本章事件清单和覆盖状态。
- 当前活跃承诺。
- 角色与地点约束。
- “按选中事件生成”按钮。
- “检查正文覆盖”按钮。
- 跳转到完整大纲工作区。

不要把完整大纲编辑器嵌入正文页，否则会造成双重导航和状态同步负担。

### 11.3 正文覆盖度

覆盖度不要只用字符串相似度。建议组合：

- 用户手动确认。
- AI 输出时的事件来源标注。
- 正文保存后按事件目标、动作、结果进行语义核验。
- 章节 revision 变化后使旧核验过期。

显示方式以“已验证 3/5 个事件”比 60% 更可解释；点击可看到未覆盖项。

## 12. 状态、并发、撤销与版本

### 12.1 状态来源

- 服务端/主进程持久状态：大纲实体、节点、关系、映射、承诺。
- UI 临时状态：展开项、选择项、筛选、未提交表单、拖拽预览。
- AI 候选状态：独立草案，不进入正式快照直到用户提交。
- 检查状态：以 outline revision 为基线，可过期。

### 12.2 自动保存

- 普通字段编辑可延迟自动保存。
- 拖拽移动、批量生成、删除和关系变更使用显式事务提交。
- UI 显示保存中、已保存、冲突、失败，沿用现有章节保存体验。
- 网络并非主要风险，但 Agent 和用户可能同时改本地数据，因此仍要用 revision 做乐观并发。

### 12.3 撤销

MVP 至少支持本次会话内的操作撤销：

- 字段编辑撤销。
- 节点移动撤销。
- AI patch 整批撤销。
- 删除建议进入可恢复的短期撤销提示，而不是立即物理删除后无回路。

如果实现成本允许，可新增 `outline_change_sets` 保存最近 N 次 patch；这比一开始建设完整版本树更实用。

## 13. 预期文件变更

以下是进入实施阶段后可能新增或修改的文件，不是本次已经执行的代码变更。

### 13.1 新增文件

```text
src/shared/outline/contracts.ts
src/shared/outline/validation.ts

src/main/agent/application/outline/OutlineApplication.ts
src/main/agent/application/outline/outlinePorts.ts
src/main/agent/application/outline/outlineChecks.ts
src/main/agent/application/outline/contextBuilder.ts
src/main/agent/storage/project/SqliteOutlineStore.ts

src/main/agent/tools/outline/readOutline.ts
src/main/agent/tools/outline/mutateOutline.ts
src/main/agent/tools/outline/analyzeOutline.ts
src/main/agent/tools/outline/index.ts

src/renderer/pages/book/outline/OutlineWorkspace.tsx
src/renderer/pages/book/outline/useOutlineWorkspace.ts
src/renderer/pages/book/outline/model/outlineTree.ts
src/renderer/pages/book/outline/model/outlinePatch.ts
src/renderer/pages/book/outline/components/OutlineTreePanel.tsx
src/renderer/pages/book/outline/components/OutlineTimeline.tsx
src/renderer/pages/book/outline/components/OutlineNodeInspector.tsx
src/renderer/pages/book/outline/components/OutlineIssuePanel.tsx
src/renderer/pages/book/outline/components/OutlineAiPreview.tsx
src/renderer/pages/book/outline/components/NarrativePromisePanel.tsx
```

### 13.2 修改文件

```text
src/main/agent/storage/project/ProjectDatabase.ts
src/main/agent/electron/DesktopController.ts
src/main/agent/tools/ToolManifest.ts
src/main/ipc/agent.ts
src/preload/agentApi.ts
src/shared/agent/contracts.ts
src/renderer/pages/book/BookWorkspacePage.tsx
src/renderer/pages/book/components/ChapterEditorPanel.tsx
```

### 13.3 测试文件

```text
src/main/agent/application/outline/OutlineApplication.test.ts
src/main/agent/application/outline/outlineChecks.test.ts
src/main/agent/storage/project/SqliteOutlineStore.test.ts
src/renderer/pages/book/outline/model/outlineTree.test.ts
src/renderer/pages/book/outline/model/outlinePatch.test.ts
src/renderer/pages/book/outline/components/OutlineWorkspace.test.tsx
tests/agent/outline-tools.test.ts
```

具体命名应在实施前结合现有导出模式再确认，但模块边界建议保持不变。

## 14. 模块拆分评估

### 14.1 结论

需要拆分，原因不是追求文件数量，而是该功能已经包含至少六类独立职责：

1. 大纲领域数据与校验。
2. SQLite 持久化和事务。
3. 层级树操作与排序。
4. 大纲编辑 UI 与状态。
5. AI 候选、上下文和 patch 审批。
6. 一致性检查与正文映射。

### 14.2 过度集中的风险

- `BookWorkspacePage.tsx` 继续膨胀，正文分页和大纲逻辑互相影响。
- UI 直接拼接 IPC 请求，难以保证批量事务。
- 树移动、关系校验和 AI patch 无法独立测试。
- 大纲与章节生命周期概念继续混淆。
- 后续增加图视图时只能再次大规模重构。

### 14.3 过度拆分的风险

- 每个字段建一个 hook/service 会增加导航成本。
- MVP 阶段为 Arc/Beat/Scene 分别建完整仓储和应用服务会重复大量代码。
- 提前抽象通用图引擎、通用版本控制框架会拖慢验证。
- 为尚不存在的角色/世界观模块设计复杂跨模块总线，容易制造空架构。

因此推荐“统一节点领域模型 + 明确分层 + 少量按职责拆分”，暂不建立通用叙事平台内核。

## 15. 实施阶段建议

### 阶段 0：需求确认与原型（1 个迭代）

- 确认核心术语和字段。
- 做结构视图、时间线、详情检查器的静态交互原型。
- 用 2–3 个真实长篇项目验证层级是否足够。
- 决定首版是否展示 `storyOrder`。

退出标准：用户能在不看说明的情况下完成“创建节点—展开—映射章节—发现告警”。

### 阶段 1：本地结构化大纲 MVP

- 数据库迁移、领域模型和 CRUD。
- 树形编辑、拖拽排序、详情检查器。
- 章节映射。
- 确定性结构检查。
- 本章大纲轻量抽屉。

退出标准：完全不依赖 AI 也能规划并维护一本书的大纲。

### 阶段 2：AI 辅助规划

- 从简介生成候选大纲。
- 展开节点。
- patch diff 与批量审批。
- AI 语义检查。
- 动态上下文构建器。

退出标准：AI 不直接覆盖用户数据；失败可解释；批量提交原子化。

### 阶段 3：正文对齐

- 按章节大纲生成正文。
- 事件来源标注。
- 正文覆盖检查与 revision 失效机制。
- 活跃叙事承诺注入。

退出标准：用户能追踪每个计划事件是否被正文覆盖，并识别明显偏离。

### 阶段 4：高级叙事能力

- 关系图视图。
- 大纲候选分支与版本比较。
- 高潮优先和双向规划。
- 角色/地点正式实体集成。
- 更复杂的承诺触发和角色状态巩固。

仅当 MVP 使用数据证明需求后进入。

## 16. 测试与验收

### 16.1 单元测试

- 创建、移动、重排和删除节点。
- 防止父子环。
- 稀疏排序与归一化。
- 关系校验和级联影响预览。
- 章节映射约束。
- 承诺状态机。
- outline revision 冲突。
- patch 临时 ID 解析和事务回滚。
- 检查结果过期。
- 上下文选择的相关性与最大预算。

### 16.2 集成测试

- SQLite 迁移从现有数据库版本升级，旧书籍正常打开。
- 创建大纲后重启应用数据完整。
- 删除章节后节点保留且映射清理。
- 删除节点不影响正文。
- AI patch 中途失败时数据库无部分写入。
- 两个并发 revision 的后提交者收到冲突。
- Agent 高影响工具触发现有审批流程。

### 16.3 UI 测试

- 键盘选择、折叠、重命名和移动。
- 拖放后的焦点与屏幕阅读器提示。
- 小窗口抽屉布局。
- 100、500、1000 个节点下的滚动与渲染性能。
- 未保存状态和冲突恢复。
- AI 候选逐项接受、拒绝和撤销。
- 告警定位和筛选。

### 16.4 产品验收场景

至少用以下三类作品验证：

1. 线性单主角故事：检查基础流程是否足够简单。
2. 多角色、多支线故事：检查筛选、章节映射和因果关系。
3. 悬疑故事：检查叙事顺序、隐藏信息和伏笔兑现。

## 17. 成功指标

首版不要用“AI 生成字数”衡量成功，建议观察：

- 从书籍简介到可写第一章计划的完成时间。
- 用户手动修改 AI 候选的比例及修改类型。
- 进入写作状态的章节中，有明确事件映射的比例。
- 未映射叶子节点和空章节数量。
- 用户采纳的一致性建议比例。
- 正文生成后事件覆盖率。
- 跨章角色/地点/承诺告警的发现与解决数量。
- 大纲编辑后的撤销率和冲突率。
- 在 500+ 节点项目中的操作延迟。

一个关键反指标：如果用户大量在节点 `notes` 中写长篇散文，而结构字段长期为空，说明模型或交互设计过于僵硬，用户正在绕过系统。

## 18. 风险与应对

### 风险 1：结构字段太多，创作被表单化

应对：默认只要求标题和摘要；目标、冲突、结果等字段按节点层级渐进展示；允许自由备注，但诊断基于明确字段。

### 风险 2：大纲与目录重复维护

应对：明确二者职责；章节映射只建立引用；提供“从章节标题初始化草稿节点”，但后续不做双向自动同步。

### 风险 3：AI 生成的大纲看似完整但高度同质

应对：提供多个候选，显示差异维度；支持高潮优先；把创造性与连贯性拆分评分；用户控制展开层级。

### 风险 4：AI 修改造成大范围数据破坏

应对：patch 预览、revision 基线、事务提交、高影响审批、整批撤销和影响分析。

### 风险 5：大纲过细导致正文僵化

应对：节点区分硬约束与建议；生成时允许用户调节遵循强度；正文可以标记“有意偏离”，再决定更新大纲还是正文。

### 风险 6：承诺系统成为繁重台账

应对：承诺只用于真正需要跨较长距离兑现的内容；普通因果关系使用节点关系；AI 只建议新增承诺，用户确认后入池。

### 风险 7：图视图过早消耗开发资源

应对：首版先用树 + 时间线验证领域模型；关系以列表维护；达到真实跨线编辑需求后再做图。

### 风险 8：未来角色/世界观模块重复建模

应对：MVP 参与者和地点采用可迁移的文本引用；关联表设计允许未来增加实体 ID，不在当前阶段虚构尚不存在的模块 API。

## 19. 需要产品侧确认的决策

进入代码实施前，建议确认以下事项：

1. 大纲入口是否采用书籍页一级模式“正文 / 大纲”，推荐是。
2. MVP 是否允许一个节点跨多个章节，推荐否，要求拆子事件。
3. 是否在 MVP 展示故事发生顺序与叙述顺序，推荐默认隐藏故事顺序，在高级设置开放。
4. AI 大纲生成是否必须多候选，推荐至少 2 个，不提供无预览的一键生成。
5. 是否加入叙事承诺，推荐 MVP 加入轻量版，因为它是长篇区别于普通思维导图的重要价值。
6. 是否加入自由关系图，推荐延后。
7. 是否保存完整大纲变更历史，推荐先保存最近 patch 以支持撤销，完整版本树延后。
8. 章节目录与大纲是否自动双向同步，推荐否，只同步显式映射与删除影响。

## 20. 最终推荐方案

综合论文、现有代码和实施风险，建议采用以下组合：

- **骨架**：DOC 的粗到细层级大纲。
- **核心表示**：GraphStory / STORYWRITER 的事件节点与关系。
- **创建方式**：BiT-MCTS 启发的高潮优先可选模式。
- **长程约束**：CFPG 的轻量叙事承诺池。
- **上下文**：STORYWRITER 的动态相关历史压缩。
- **状态一致性**：EVOSPARK 启发的角色、地点和事件后状态更新。
- **粒度**：全书—故事弧—章节—场景的规划脚手架，但不强制固定层数。
- **交互**：树 + 时间线 + 详情检查器，图视图延后。
- **数据**：关系型 SQLite 表 + 原子 patch，不使用单 JSON 大纲。
- **治理**：AI 候选、预览、审批、revision 冲突和可撤销变更。

这套方案能够在不过度工程化的前提下，让 StoryOS 的大纲真正成为正文生成与长程一致性的控制层，而不是另一个章节标题列表。
