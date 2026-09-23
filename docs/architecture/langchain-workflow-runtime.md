# LangChain 工作流运行时

> v0.1 · 2026-09-23 · 设计稿，不含实现  
> 目的：在现有通用 Agent 引擎之外，用 LangGraph 官方图 API 增加一层可注册的工作流。这一层承接 Agentic RAG，并为后续检索策略、第二知识源、过程评估和性能优化留出稳定接口。  
> 依赖已经落地的小说向量查询、书籍工具和 `createAgent` 对话循环。不替换它们，也不把书籍检索写进 `src/main/agent`。

## 1. 要解决的问题

书籍对话今天每次都通过 `LangChainModelGateway.createRuntimeAgent` 调用 LangChain 的 `createAgent`。模型自行决定是否调用 `search_novel_passages`、`find_similar_passages` 或 `search_book_chapters`。章节生成是另一次模型调用，`maxTurns` 为 1，`tools` 为空。

这条路径适合开放式对话。它不适合作为后续高级检索的扩展点：

- 检索、打分、改写和生成没有固定节点，无法单独替换某一段，也无法单独计时。
- 带 `book.write` 的请求被 `ExecutionRouter` 固定为 `direct`，`TaskPlanner` 拒绝带副作用的计划。续写的多步行为无法靠现有规划图表达。
- `ModelGateway` 只暴露整段 `stream` / `invokeText`。自定义图需要的 `bindTools` 和 `withStructuredOutput` 没有出口。
- 向量查询、混合召回、重排和以后的资料库如果都堆进同一次工具列表，模型调用次数和上下文会一起涨，又没有节点级预算。

本设计增加的是**图运行时**，不是第二套 Agent 编排器。`createAgent` 继续负责自由对话。需要可控检索循环的任务，改为运行一张已编译的 `StateGraph`。

## 2. 依据

| 来源 | 采用的部分 |
|---|---|
| [Build a custom RAG agent with LangGraph](https://docs.langchain.com/oss/javascript/langgraph/agentic-rag) | Agentic RAG 的控制流：决定是否检索、检索、相关性条件边、改写后回到决策、通过后才生成 |
| [Workflows and agents](https://docs.langchain.com/oss/javascript/langgraph/workflows-agents) | 工作流路径由代码预定；智能体由模型决定工具。路由、循环、评估器是可单独编译的流程 |
| [Custom workflow](https://docs.langchain.com/oss/javascript/langchain/multi-agent/custom-workflow) | 一个节点可以是普通函数、一次模型调用，或嵌在节点里的 `createAgent`。检索节点可以不调用模型 |
| [Subgraphs](https://docs.langchain.com/oss/javascript/langgraph/use-subgraphs) | 状态不同的子图在父节点内 `invoke`，并做输入输出映射。每张子图使用稳定节点名，避免检查点串线 |
| [Graph API](https://docs.langchain.com/oss/javascript/langgraph/graph-api) | `StateGraph`、条件边、`Command`、`Send`。并行与动态工作者留到有第二个独立知识源之后 |
| 《Agentic RAG 综述》`docs/pdf/10_Agentic_RAG_Survey_2025_中文翻译.md` 第 5.1、10.1、10.3、10.4 节 | 先做单路由器；检索质量先于更多智能体；自主性要有步数和工具边界 |
| `docs/architecture/backend-agent-engine-boundary.md` | 通用引擎不认识书籍、章节和编辑器 |
| `docs/todo/novel-writing-recall.md`、`docs/architecture/database-vnext/02-vector-rag.md` | 证据由外层检索；写作器不检索；小说正文与专业资料分区 |

安装版本为 `@langchain/langgraph` 1.4.8、`langchain` 1.5.3。该版本同时导出 `Annotation` / `MessagesAnnotation` 和 `StateSchema` / `MessagesValue` / `GraphNode`。新图使用 `StateSchema`。官方 Agentic RAG 教程仍使用 `MessagesAnnotation`，控制流与状态 API 无关，可以照搬控制流。

## 3. 保持不变的行为

这些是当前代码里的事实。图运行时接在外面，不改写它们的契约。

- 自由对话仍走 `createAgent`。工具清单、审批和 `book-editor` 上下文保持 `StoryToolManifest` 的规则。
- `generate_book_chapter_content` 内部仍是单轮、无工具。图只负责把短证据写进既有写作指令，不在生成流里插入检索环。
- 书籍编号来自当前项目。检索端口不接受模型传入的 `bookId` 或本机路径。
- 小说向量查询的三类失败原样向上传递：索引不存在、不可用、正在重建。空列表表示没有通过核对的命中。图不得把失败改写成空列表。
- 草稿不入向量索引。正式修订在 `NovelApplication.saveRevision` 提交新修订后入队。
- 带写入效果的请求继续不进入 `planned` 模式。写作图是显式代码路径，不是规划器拆出来的任务。
- `src/main/agent` 仍只依赖自身、`shared/engine`、Node 和第三方库。书籍图放在 `src/main/story`。

## 4. 目标结构

```text
src/main/agent/model/
  GraphModelPort.ts          从现有连接取出可 bindTools / withStructuredOutput 的聊天模型
src/main/agent/workflows/
  WorkflowHost.ts            编译、运行、取消、预算和检查点命名空间
  WorkflowTrace.ts           节点级耗时与结果摘要的通用事件
src/main/story/workflows/
  registry.ts                注册 answer / recall / draft
  recallGraph.ts             本书 Agentic RAG 环
  draftGraph.ts              检索证据交给章节生成
  sources/                   检索源适配器
```

`agent/workflows` 只处理图的生命周期和追踪事件，状态字段使用调用方传入的 schema，不出现 `bookId`、章节或向量类型。`story/workflows` 拥有书籍状态 schema、检索源和与章节生成的交接。

父图只有一个职责：用一次结构化输出选择子图。子图状态互不共享。父节点负责映射，这与官方「不同状态的子图在节点内调用」一致。

```text
父路由
  ├─ answer   不检索，一次模型回答
  ├─ recall   决策 → 检索 → 打分 →（改写后再决策）→ 证据
  └─ draft    调用 recall → 拼指令 → 现有章节生成
```

`draft` 调用 `recall` 时使用独立 `thread_id` 后缀，例如 `${conversationThreadId}:recall`。检索消息不写入书籍对话的检查点通道。现有 `SqliteSaver` 继续使用，不新增检查点表。

## 5. 扩展接口

接口按端口描述。实现时放在上表目录中，类型进入调用方模块，不放进 `shared/engine`，除非渲染进程需要展示同一份追踪。当前不需要渲染进程契约。

### 5.1 图模型端口

`ModelGateway` 保持「整段运行」语义。图节点需要的是底层聊天模型。

```ts
interface GraphModelPort {
  chatModel(): ChatModel;
}
```

`ChatModel` 指当前连接上已经具备 `invoke`、`bindTools` 和 `withStructuredOutput` 的 LangChain 聊天模型。端口从 `LiveModelConnection` 读取，与 `createAgent` 使用同一连接和同一快照。更换对话模型时，图和自由对话一起换；更换 embedding 模型不经过这个端口。

节点不得自己 new 一套模型客户端，也不得在图内读取环境变量。

### 5.2 工作流注册

```ts
interface WorkflowDefinition<State> {
  readonly id: string;
  compile(deps: WorkflowDependencies): CompiledWorkflow<State>;
}

interface WorkflowDependencies {
  readonly model: GraphModelPort;
  readonly sources: readonly RetrievalSource[];
  readonly grade: GradePolicy;
  readonly trace: WorkflowTraceSink;
  readonly limits: WorkflowLimits;
}

interface CompiledWorkflow<State> {
  invoke(input: State, run: WorkflowRun): Promise<State>;
  stream?(input: State, run: WorkflowRun): AsyncIterable<WorkflowUpdate<State>>;
}
```

注册表按 `id` 唯一。后注册的同名定义直接失败，不静默覆盖。`answer`、`recall`、`draft` 是首批标识。新流程追加标识，不修改这三张图的状态字段含义。

`WorkflowHost.run(id, input, run)` 是唯一入口。它负责：

- 未知 `id` 抛错。
- 把 `run.signal` 传给图的 `invoke` / `stream`。
- 设置 `recursionLimit`。缺省算法与 `LangChainModelGateway` 相同：`maxTurns * 2 + 1`。
- 设置 `thread_id` 为 `${run.threadId}:${id}`。
- 在每个节点开始和结束时调用 `trace`。节点实现通过 LangGraph 的流式更新或包装函数上报，不在业务节点里散落计时逻辑。

### 5.3 运行预算

```ts
interface WorkflowLimits {
  readonly maxTurns: number;
  readonly maxRewrites: number;
  readonly timeoutMs: number;
  readonly retrievalLimit: number;
}
```

`maxRewrites` 是 Agentic RAG 改写环的产品停止条件。官方教程的 `rewrite → generateQueryOrRespond` 没有次数上限。达到上限后，`recall` 以「证据不足」结束，并带上最后一次检索错误或空命中，不继续调用模型。

`retrievalLimit` 是单次检索条数上限，由工作流传入现有查询函数的 `limit`。查询函数本身仍不替调用方决定条数。

`timeoutMs` 与现有 `RunBudget` 对齐，取消使用同一个 `AbortSignal`。超时是失败，不是空证据。

### 5.4 检索源

```ts
interface RetrievalQuery {
  readonly text: string;
  readonly limit: number;
  readonly scope: RetrievalScope;
}

interface RetrievalHit {
  readonly sourceId: string;
  readonly locator: string;
  readonly title: string;
  readonly content: string;
  readonly revisionId?: string;
}

interface RetrievalSource {
  readonly id: string;
  readonly kind: "novel" | "literal" | "knowledge";
  search(query: RetrievalQuery): Promise<readonly RetrievalHit[]>;
}
```

`novel` 适配 `NovelVectorPassageQuery`。`locator` 保存 `chapterId` 与起止偏移，`revisionId` 保存修订。`literal` 适配 `search_book_chapters`，只在向量源抛出既有三类错误时由条件边调用。`knowledge` 本阶段不注册；专业资料库落地后追加一个 `RetrievalSource`，不改 `recall` 的边。

命中是数据。源实现不得执行命中文本中的指令，也不得扩大工具权限。这与向量 RAG 设计第 7.1 节一致。

后续替换发生在源内部，图的边保持不变：

| 后续能力 | 替换点 |
|---|---|
| 关键词与向量融合、RRF | `novel` 源内部。图仍只看到一组 `RetrievalHit` |
| 重排 | 源返回前的可选步骤，或独立的 `GradePolicy` 之前的纯函数。不新增模型节点，除非评测证明有必要 |
| ANN | 源内部。对外仍返回核对过修订的命中 |
| 查询向量缓存 | 源内部。缓存键包含 embedding 空间标识和查询文本 |
| 第二个知识源并行 | 父图使用 LangGraph `Send`，各源独立状态，汇总节点按来源配额合并。小说与资料的原始分数不相加 |

### 5.5 打分策略

```ts
interface GradePolicy {
  grade(input: {
    readonly question: string;
    readonly hits: readonly RetrievalHit[];
  }): Promise<"accept" | "rewrite">;
}
```

首版实现对应官方 `gradeDocuments`：一次 `withStructuredOutput`，只允许 `yes` / `no`，映射为 `accept` / `rewrite`。提示要求把命中正文当数据。结构化解析失败按 `rewrite` 处理，并计入 `maxRewrites`。

打分策略可替换为更小的模型或规则，而不改图。策略不改写命中，不调用检索。

### 5.6 追踪

```ts
interface WorkflowTraceEvent {
  readonly runId: string;
  readonly workflowId: string;
  readonly node: string;
  readonly phase: "start" | "end" | "fail";
  readonly at: string;
  readonly durationMs?: number;
  readonly detail?: Readonly<Record<string, string | number | boolean>>;
}

interface WorkflowTraceSink {
  record(event: WorkflowTraceEvent): void;
}
```

`detail` 只放可聚合的摘要：检索源 `id`、命中条数、改写次数、打分结论、是否走了字面搜索。不放正文、提示词全文和模型密钥。

这个端口是性能优化和过程评估的基础。后续可以把事件写入 `02-vector-rag.md` 里的 `rag_requests` / `context_manifests`，或接到桌面诊断。首版允许内存实现，测试可以收集事件。没有接收方时使用空实现，图仍运行。

官方文档建议用 LangSmith 查看节点轨迹。本应用默认不开启外发追踪。若以后配置 LangSmith，它观察同一张图，不替代 `WorkflowTraceSink`。

### 5.7 父路由

```ts
interface RouteDecision {
  readonly workflowId: "answer" | "recall" | "draft";
}
```

路由使用 `withStructuredOutput` 和这个枚举，对应官方 Routing 流程。路由只看用户请求和当前是否处于可写章节上下文：

- 不依赖本书已写内容的问答走 `answer`。
- 查找旧情节、约定、物件或近重复走 `recall`。
- 用户要求创作、续写或大幅扩写，且任务依赖已写正文时走 `draft`。

路由失败时走 `answer`，并在追踪里记下 `route_fallback`。不在路由失败时自动检索全书。

后续新增流程时扩展枚举和注册表。未注册的枚举值视为路由失败。

## 6. 首批图

### 6.1 `recall`

状态使用 `StateSchema`，字段固定为：

| 字段 | 含义 |
|---|---|
| `question` | 用户问题或待查正文。空白在进入图之前失败 |
| `query` | 当前检索文本。首次等于 `question`，改写后替换 |
| `rewriteCount` | 已改写次数，从 0 开始 |
| `hits` | 最近一次检索命中 |
| `sourceError` | 向量源的原始错误消息；没有错误则不设置 |
| `decision` | `accept`、`rewrite` 或 `insufficient` |
| `evidence` | 通过打分的命中。不足时为空，并保留 `sourceError` 或空命中事实 |

边与官方 Agentic RAG 教程对应：

```text
START → decide
decide --需要检索--> retrieve
decide --可以直接回答--> END
retrieve → grade
grade --accept--> END
grade --rewrite 且未达上限--> rewrite → decide
grade --达到上限或字面搜索后仍不足--> END（decision = insufficient）
```

`decide` 是模型节点，绑定的工具只有当前已注册检索源的描述。`retrieve` 是确定性节点：先调用 `kind: "novel"` 的源；该源抛出索引不存在、不可用或正在重建时，改调 `kind: "literal"` 的源，并在 `sourceError` 保留向量错误。其他异常继续抛出。

`rewrite` 只根据 `question` 和上一次不足的事实生成下一条 `query`，不把命中正文写回成新的用户问题。改写结果替换 `query`，`rewriteCount` 加一。

相似度查重不另建图。调用方把 `question` 设为待查正文，并把检索源切到 `findSimilarPassages` 的适配器，同时传入 `excludeChapterId`。排除章节属于 `RetrievalScope`，由故事层在编译依赖时绑定，不进入模型可见的工具参数作为任意章节开关以外的能力。`upToChapterId` 同样由调用方绑定；省略表示整本已发布正文。

### 6.2 `draft`

`draft` 不包含第二套打分环。它在节点内调用已编译的 `recall`，把 `evidence` 压进现有写作指令，然后调用现有 `ChapterGenerationService`。

证据格式保持写作召回约定：短片段加上章节标识、标题、修订和偏移。超出指令预算时保留定位，不截断后假装片段完整。预算沿用章节生成已经接受的指令长度。

`recall` 结果为 `insufficient` 时，`draft` 仍可按用户指令生成，但指令中写明没有可用的本书证据，以及向量错误原文（若有）。不把失败说成「书中没有这段情节」。

章节生成的分页事件继续由现有生成服务发出。`draft` 图的流只额外发出检索阶段的 `WorkflowTraceEvent`。生成中的回答通道不改协议。

### 6.3 `answer`

单节点模型调用，不注册检索源。用于父路由判定为不依赖本书的请求。它不替代整段书籍对话；书籍对话里的自由工具循环仍是默认。父路由只在调用方明确要求「按工作流运行」时进入。

首版调用方是后续的写作前提取，而不是替换聊天框的每一轮。在检索图被实际用于续写之前，不把所有用户消息强制送进父路由。

## 7. 性能与后续功能怎么接

下列项都不需要改已编译图的边，除非表格写明要新增节点。

| 方向 | 接入方式 |
|---|---|
| 少调用模型 | 父路由把简单请求送到 `answer`。`recall` 的 `decide` 在问题已是明确检索语句时，允许调用方跳过 `decide`，直接从 `retrieve` 进入。跳过与否由输入标志表示，默认不跳过 |
| 控制延迟 | `maxRewrites` 默认 1。打分和改写使用同一次连接上的模型，不并行再起一个智能体 |
| 检索变慢 | 在 `RetrievalSource` 内换 ANN、缓存或批量嵌入。`WorkflowTraceSink` 已有 `retrieve` 的 `durationMs` 和命中条数，用来比较更换前后 |
| 混合召回与重排 | 源内部或打分前的纯函数。排名不改变命中的 `kind` 和 `revisionId` |
| 专业资料 | 新的 `RetrievalSource`，`kind: "knowledge"`。与小说命中在汇总节点按配额并列，提示分区为「已写正文」和「外部资料」 |
| 写完后的连贯性检查 | 新工作流 `review`，节点为：取新修订 → `recall` 的相似度源 → 一次只读评估。不放进 `draft` 的生成节点。评估对应官方评估器-优化器，停止条件使用 `WorkflowLimits` |
| 人物、事件、伏笔 | 新的检索源或在 `retrieve` 之后增加确定性扩展节点。权威数据仍在书库。图扩展使用 LangGraph 条件边，不引入独立智能体进程 |
| 多源并行 | 两个及以上独立源同时存在时，父图用 `Send` 把查询分到各源，再汇总。单源阶段不用 `Send` |
| 人在回路 | LangGraph `interrupt` 预留在 `draft` 把证据交给生成之前。首版不暂停。恢复时使用同一 `thread_id` |
| 过程评估 | 消费 `WorkflowTraceEvent`。指标至少包括：路由分布、平均改写次数、检索失败率、`retrieve` 耗时、从路由到证据的总耗时 |

默认值集中在 `WorkflowLimits` 和路由枚举，不散落在提示词里。调整默认值应能在不改节点函数的情况下完成。

## 8. 明确不做

- 不把 `createAgent` 对话循环改写成一张大图。
- 不在 `src/main/agent` 注册小说、资料或章节节点。
- 不让章节生成器在 `maxTurns = 1` 的内部调用检索工具。
- 不实现多智能体检索舰队、分层监督和网页检索。
- 不把专业资料向量和小说正文向量放进同一次 `RetrievalSource.search`。
- 不新增通用依赖注入容器、工作流脚本语言或可热插拔的远程图。
- 不把命中正文写入 `WorkflowTraceEvent` 或会话消息之外的新业务表。追溯表仍按 `02-vector-rag.md` 单独设计。

## 9. 实施顺序

1. 增加 `GraphModelPort`，用现有模型连接做一次结构化输出和一次 `bindTools` 的引擎级测试。不访问网络。
2. 增加 `WorkflowHost`、预算、检查点后缀和追踪事件。用一张无模型的两节点图验证取消、超时、未知 `id` 和 `recursionLimit`。
3. 在 `story/workflows` 实现 `recall`：小说源、字面源回退、一次改写上限、三类索引错误。测试使用假的 embedding 和临时目录。
4. 实现 `draft` 与现有章节生成的交接。断言写作器收到的工具列表仍为空，且证据中的修订标识来自检索命中。
5. 最后把父路由接到明确的写作前提取入口。自由对话保持 `createAgent`。

每一步都可以单独停。第 3 步完成之前，书籍对话继续使用现有 `search_novel_passages` 工具提示，不要求用户改操作。

## 10. 验收

- 自由对话的工具、审批和章节分页协议与接入前一致。
- `recall` 在向量索引失败时返回原始错误，并只在这三类错误上调用字面搜索。
- 改写次数到达 `maxRewrites` 后不再调用模型。
- `draft` 不在章节生成的模型调用上设置工具。
- 同一对话线程上连续运行 `recall` 与自由对话，检查点消息不混用。
- 追踪事件含 `decide`、`retrieve`、`grade`、`rewrite` 的起止，且 `detail` 不含正文。
- `npm run check:agent` 仍通过；书籍图的测试放在后端测试中，不把 `story` 导入引擎。
