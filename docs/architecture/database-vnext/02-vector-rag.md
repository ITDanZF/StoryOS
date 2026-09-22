# 第二部分：小说与专业资料的向量数据库及 Agent RAG

> v0.2 · 2026-09-09 · 设计评审稿  
> 本部分是本次明确要求的设计范围，包含真正的向量存储、检索与索引生命周期。  
> 依赖第一部分提供稳定业务来源；不要求先实现人物、大纲、伏笔等未来功能。没有安装向量数据库或修改运行代码。  
> 小说正文这一步的目录、表和实现顺序见 [小说向量库落地架构](./05-novel-vector-store.md)。该文件把向量放进现有书籍目录，不再使用下面示意图里的全局 `rag/novels/` 路径。专业资料库仍按本文件。

## 1. 目标与两类知识源

Agent 需要同时回答两类问题：**这本小说已经写了什么**，以及**相关专业资料建议如何处理这个问题**。

两类来源分别管理、分别检索，再按任务组合上下文。专业方法论不能被当作小说已发生事实，小说中的虚构设定也不能被当作外部专业知识。

| 维度 | 小说自身知识 | 专业方法论与参考资料 |
|---|---|---|
| 典型内容 | 当前小说正文；未来可加入已确认设定和摘要 | 写作方法、叙事理论、行业知识、研究文章、用户整理的资料 |
| 权威来源 | 第一部分的 book.sqlite / 当前章节修订 | 独立资料库 knowledge.sqlite + 托管原始文件 |
| 更新方式 | 章节保存、删除、恢复、目录调整驱动 | 导入、新版上传、重新解析、停用和移除驱动 |
| 隔离边界 | 默认只查询当前书籍 | 查询本书或本项目显式启用的资料集 |
| 引用位置 | 书籍 / 章 / 修订 / 原文偏移 | 文档 / 版本 / 页码或章节 / 提取块位置 |
| 对生成的作用 | 连贯性与已有情节依据 | 方法建议、背景知识和可引用资料 |
| 删除行为 | 书籍失效后立即禁止检索，后台清缓存 | 从资料集移除不等于删除原文；全局停用后所有查询立即排除 |

现有项目文件检索继续作为第三种来源适配器，保留路径、行列和标题定位；不强迫用户把所有工作文件导入资料库。

## 2. 架构与技术选择

![Agent RAG 架构](./rag-architecture.png)

[查看可缩放图](./rag-architecture.svg)

**推荐方案：SQLite 管理资料、检索元数据和全文索引；LanceDB 管理本地向量及向量索引。** 两者通过来源版本、分块集合与发布清单关联。

LanceDB 支持 TypeScript SDK 和嵌入式本地目录存储，符合当前 Electron / TypeScript 项目的集成方向。[官方快速开始](https://docs.lancedb.com/quickstart)

这是设计推荐，尚未在本项目完成兼容性验证。实施前需要锁定具体 SDK 版本，验证 Windows/Electron 打包、原生依赖、目标 CPU、目录锁与异常退出恢复；测试结果不达标时再评审替代后端。

| 方案 | 适合本项目的地方 | 本次判断 |
|---|---|---|
| SQLite + 嵌入式 LanceDB | 业务元数据沿用 SQLite，向量具备独立查询与索引能力 | 推荐作为设计基线；承担跨存储发布与回收协议 |
| SQLite + sqlite-vec | 向量距离与 KNN 查询贴近已有 SQLite 数据层 | 备选；需对目标数据规模、查询过滤和扩展打包做专项验证 |
| 独立向量服务 | 未来集中托管、大量客户端共享时可以重新评估 | 当前不引入额外常驻服务作为桌面端必需组件 |

sqlite-vec 的文档提供 KNN 查询及向量距离功能；本稿不把普通 BLOB 字段等同于已经具备向量检索能力。[sqlite-vec KNN](https://alexgarcia.xyz/sqlite-vec/features/knn.html)

### 2.1 物理与逻辑隔离

| 位置（示意） | 内容 | 生命周期 |
|---|---|---|
| knowledge / knowledge.sqlite | 资料集、文档、不可变文件版本、分类与变更日志 | 用户资料资产，需备份 |
| knowledge / assets / 内容哈希 | 托管原始 PDF、DOCX、Markdown、文本等 | 随资料资产备份，引用计数和延迟回收 |
| rag / rag.sqlite | 作用域登记、模型空间、检索配置、后台任务 | 配置需备份；派生任务状态可恢复 |
| rag / novels / book_id / metadata.sqlite | 当前小说来源版本、分块、FTS、发布清单 | 可重建 |
| rag / novels / book_id / vectors / space_id | 该书该向量空间的 LanceDB 数据表与索引 | 可重建；不同书籍物理分开 |
| rag / knowledge / metadata.sqlite | 专业资料的来源版本、分块、FTS、发布清单 | 全资料库一份，按文档去重 |
| rag / knowledge / vectors / space_id | 专业资料共享向量表 | 按资料集和文档范围过滤 |
| rag / files / workspace_id / … | 原有项目文件的检索元数据与可选向量 | 项目作用域隔离 |

一个专业文档可以属于多个资料集，但同一文档版本和同一向量空间只向量化一次。资料集是逻辑集合，不是为每本引用它的小说重复复制一套向量。

即使物理分库，所有检索记录仍携带作用域 ID。物理路径隔离是辅助措施，真正可查询范围由服务端业务入口根据当前请求解析，不能接受 Agent 任意指定数据库路径。

## 3. 专业资料的业务表：保存原始知识资产

这些是 RAG 新增业务表，与第一部分的现有业务重设计分开评审。

### 3.1 knowledge.sqlite

| 表 | 职责与主要字段 | 关系、索引与约束 |
|---|---|---|
| knowledge_collections | id、name、description、kind、row_version、created_at、updated_at、deleted_at | PK id；kind 如 methodology/domain/reference；分类只用于使用意图，不代表真实性 |
| knowledge_documents | id、title、author?、source_uri?、language、current_revision_id?、status、row_version、created_at、updated_at、deleted_at | 当前版本必须属于本文档；status 为 active/disabled；标题 + 状态查询 |
| knowledge_assets | id、relative_path、content_hash、media_type、byte_size、created_at | 内容哈希唯一；相对路径受控；原文实际托管，移动外部文件不破坏已导入资料 |
| knowledge_document_revisions | id、document_id、revision_number、parent_revision_id?、asset_id、source_hash、imported_at、metadata_snapshot | 文档 + 版本号唯一；不可变；外部来源信息按版本固定 |
| collection_documents | collection_id、document_id、added_at | 组合 PK；双向索引；移除关系不删除被其他资料集引用的文档 |
| knowledge_changes | local_sequence、event_id、operation_id、entity_type、entity_id、entity_version、action、payload_version、payload、created_at | 与文档、版本或集合关系变更同事务记录；消费者可重放 |

原始文件版本是权威来源；解析出的文本和 OCR 结果属于带解析器版本的派生产物。用户若手工修正文档内容，应生成新的知识文档版本，而不是只改一个即将被重建覆盖的检索片段。

同一个 document_id 在多个资料集中的引用只索引一次。重复导入同哈希文件时默认提示复用已有文档；若用户明确创建独立文档身份，原始资产仍可去重，但各身份的状态和引用必须独立，不能为节省向量计算而隐式合并业务身份。

PDF 扫描件不能因文件已导入就标记“可检索”。解析、OCR、分块和向量化分别有状态；图片解析失败时保留原文件并显示具体失败阶段。

### 3.2 资料绑定与检索配置

| 所在库 / 表 | 主要字段 | 规则 |
|---|---|---|
| book.sqlite / book_knowledge_bindings | collection_id、enabled、priority、row_version、updated_at | 随书保留对外部资料集的逻辑引用；导入到没有该资料集的设备时显示缺失，不自动匹配同名资料集 |
| project.sqlite / project_knowledge_bindings | collection_id、enabled、priority、row_version、updated_at | 只在该项目上下文可用；全局会话也必须显式选定来源 |
| rag.sqlite / retrieval_profiles | id、name、version、novel_space_id、knowledge_space_id、per_source_k、reranker_key?、token_budget、scope_policy、config | 查询策略版本化；固定字段保存预算与选择，扩展配置按版本验证 |

请求的实际资料范围来自当前书籍绑定、当前项目绑定和用户本次显式选择，合并去重后与有效资料集取交集。禁用和删除状态优先。不能因为资料库在本机就默认把全部资料提供给每个 Agent。

绑定只表示使用范围，不等于云端账户授权。未来多人协作需额外实现成员和服务端权限判断。

## 4. 向量空间与检索控制表

### 4.1 rag.sqlite：模型、作用域与任务

| 表 | 主要字段 | 关键约束 |
|---|---|---|
| embedding_spaces | id、provider_kind、model_key、model_revision、dimensions、metric、normalization、query_template_version、document_template_version、tokenizer_key、max_input_tokens、config_hash | 配置不可原地改变；版本、维度、归一化和输入模板一起定义向量空间 |
| rag_scopes | id、kind、source_owner_id、source_generation、metadata_path、state、created_at、updated_at | kind 为 novel/knowledge/files；owner + kind 唯一；source_generation 区分整库替换 |
| scope_embedding_spaces | scope_id、space_id、role、vector_path、table_name、index_type、index_config_version、state | scope + space 唯一；role 为 active/building/retired；同一用途一个活动空间 |
| retrieval_profiles | 见上节 | 配置改动新增版本，运行记录引用实际版本 |
| ingestion_jobs | id、idempotency_key、scope_id、source_id、desired_version、space_id、pipeline_version、stage、status、attempt、lease_owner?、lease_token?、lease_expires_at?、next_retry_at?、last_error、created_at、updated_at | 幂等键唯一；状态 + 重试时间；租约抢占使用 CAS 和 fencing token，旧任务不得发布结果 |

Embedding 模型和生成模型分开配置。切换聊天模型不必重算向量；切换 embedding 空间必须重新生成该空间下的文档向量，并使用对应空间生成查询向量。

本地优先的默认路线是本地 embedding 推理工作进程。具体模型需按中文小说、中文专业文献和设备资源评测后确定；模型标识、许可证与权重来源在实施选型时固定。若用户另行选择远端 embedding，需明确原文片段会发往该服务。

### 4.2 每个 metadata.sqlite：来源、分块、发布

| 表 | 主要字段 | 键与职责 |
|---|---|---|
| retrieval_sources | id、source_kind、source_entity_id、desired_version、state、title、locator、observed_at | 来源类型 + 源实体唯一；记录当前期望版本；小说源映射章节，资料源映射文档 |
| source_versions | id、source_id、version_key、content_hash、extractor_version、source_locator、extracted_artifact_path、extracted_hash、parse_status、created_at | source + version_key + extractor 唯一；固定原文版本及其解析产物 |
| chunk_sets | id、source_version_id、chunker_version、tokenizer_key、pipeline_hash、chunk_count、checksum、state、created_at | 源版本 + pipeline 唯一；一个可发布的完整分块集合 |
| retrieval_chunks | id、chunk_set_id、ordinal、parent_ordinal?、heading、content、content_hash、token_count、locator、search_tokens | chunk_set + ordinal 唯一；稳定片段身份；正文坐标与专业文档坐标使用不同 locator schema |
| retrieval_chunks_fts | search_tokens、heading_tokens 与 chunk 行映射 | 与分块更新同 SQLite 事务；中文查询和分词采用同一管线版本 |
| source_publications | source_id、space_id、active_chunk_set_id、source_version_id、vector_table_version、publication_version、published_at | source + space 唯一；只允许指向已验证完整的向量批次和 FTS 集合 |
| source_cursors | consumer、source_generation、last_sequence、updated_at | 在来源观察/分块提交事务中更新；丢失游标或日志截断时重新扫描当前权威清单 |

这些表中的关联在同一个 metadata.sqlite 内可以使用外键。来源所属书库或知识库的 ID 是跨库逻辑引用，必须由服务校验。

原始文件大小、mtime、规范化路径以及起止行列继续存入 files 来源的版本化 locator；不能因统一模型而丢失现有文件搜索定位能力。mtime 只是增量检测线索，版本身份仍由内容哈希等明确证据确认。

### 4.3 LanceDB 向量表：实际检索的数据

每个 scope / space 目录保存一张 `vectors` 表，列结构一致，向量维度由 space 固定。小说与专业资料的表结构相同，但物理位置和来源权限独立。

| 列 | 类型方向 | 用途 |
|---|---|---|
| vector_id | String | 确定性 ID：作用域 + 分块 ID + 向量空间；用于幂等写入 |
| scope_id / scope_kind | String | 识别所属书籍、专业资料库或项目文件作用域 |
| source_id / source_kind | String | 对应 metadata 的来源身份 |
| source_version_id | String | 防止把不同原文版本的结果混用 |
| chunk_set_id / chunk_id | String | 关联发布批次和精确片段 |
| embedding_space_id | String | 校验模型、维度、距离与输入模板 |
| vector | 固定维度 Float32 数组 | 实际向量距离查询与 ANN 索引输入 |
| content_hash | String | 校验向量对应的片段内容 |
| language / source_category | String | 受控辅助过滤和检索策略选择 |
| created_at | Int64 | 构建诊断与回收依据 |

全文正文和完整引文优先保存在 metadata 分块中，向量表只放查询必要的标量与向量，避免大量正文重复存储。维度固定、元素有限、归一化和距离一致性在写入时校验。

**向量表的 ID 列不能被当作关系数据库强制唯一键。** 写入采用按确定性 ID 合并与去重，发布前验证数量和校验和；任务重试不能追加重复行。LanceDB 文档明确普通写入不会强制主键唯一。[更新与合并文档](https://docs.lancedb.com/tables/update)

### 4.4 查询索引

- 为高频过滤的 source_id、chunk_set_id 和幂等合并键评估标量索引；是否保留由查询计划与写入成本决定。
- 小数据集先采用精确向量查询作为质量基线；向量库从 RAG 首版就参与检索，不降级为“仅预留字段”。
- 规模增大时建立 ANN 索引，评估不量化与量化方案的召回、内存、磁盘和延迟。索引类型和参数记录在 scope_embedding_spaces，不硬编码到业务表。
- ANN 索引更新期间必须覆盖新写入向量，不能为了快速查询而漏掉最新章节。LanceDB 普通检索会处理尚未进入索引的记录，而只查询已建索引数据的快速模式可能跳过它们；具体 SDK 行为要纳入验收。[向量索引文档](https://docs.lancedb.com/indexing/vector-index)
- 建库不等于建好索引，也不等于召回达标。记录索引状态、未索引行数和重建成本。

容量示例仅供规划：10 万个 1024 维 Float32 向量的原始数值约 390.6 MiB，不含标量、正文缓存、索引和历史版本；切换模型双写期间还需要额外空间。模型维度必须结合设备预算评测。

## 5. 两类语料的分块与定位

| 项目 | 小说 | 专业资料 |
|---|---|---|
| 一级边界 | 章节，未来可识别场景 | 文档版本、标题节、页与段落 |
| 基本分块 | 按段落边界组合，保留小范围相邻上下文 | 按结构节组合，避免混合无关小节；表格保留标题、列头与来源 |
| 建议评测起点 | 约 400–800 token，必要时少量重叠 | 约 500–1000 token，方法步骤可组合父节 |
| 位置 | book_id、chapter_id、revision_id、UTF-16 起止偏移 | document_id、revision_id、page_index、page_label?、section_path、block_id、局部偏移 |
| 长内容处理 | 单段过长时按 token 上限安全切分 | 长表格、长节与扫描页按内容类型处理 |
| 去重 | 同一章节版本片段不重复；重复回忆仍保留不同出处 | 同文档多资料集只建一份；相同文件哈希复用资产 |

以上 token 范围是起始实验参数，不是验收结论；以 embedding 模型输入限制为上限。不可静默截断整页或超长段落。

页码必须来自解析/OCR 映射。一个 chunk 跨页时 locator 保存多个片段位置；没有真实页码的 Markdown 使用标题和行号，不能伪造页码。解析文本与原始文档的对齐质量应单独评测。

未保存草稿通常直接放入本次上下文，记录草稿版本，不把每次键入都转换为长期向量。小说正文索引默认只发布当前已保存版本；历史检索是显式模式。

## 6. 增量更新与跨存储发布协议

SQLite 与 LanceDB 不共享事务。设计采用“准备 → 验证 → 发布”，读者只使用已发布集合。

桌面首版由每个作用域唯一的发布协调器串行提交发布和回收，耗时解析及 embedding 可以并行准备。协调器统一核验任务租约，避免把 rag.sqlite 中的租约检查与 metadata.sqlite 中的发布误当作跨库原子操作；协调器实例接管须取得该作用域的独占本机锁，过期实例不能继续写发布状态。

### 6.1 新版构建

1. 观察 book_changes 或 knowledge_changes，并复核权威来源的当前版本。为该 source / desired_version / space / pipeline 创建幂等任务。
2. 固定源版本，解析并生成新的 source_version 与 chunk_set；它们处于 building 状态，查询不可见。
3. 在 metadata.sqlite 写入完整分块及 FTS 数据；重复重试使用稳定身份，不覆盖其他版本。
4. 在对应 LanceDB 向量表按 vector_id 合并写入，并记录提交后的表版本。校验维度、数量、片段哈希和可读性。
5. 发布前重新验证任务租约与 fencing token、源当前版本和删除状态；过期任务只能结束或重试，不能覆盖较新发布。
6. 在一个 metadata.sqlite 事务中把 source_publications 切到完整 chunk_set。完成发布后更新任务结果。
7. 旧批次在没有活动查询引用后延迟回收。未发布残留由后台回收器清理。

向量已提交而发布未完成时，只留下不可见孤儿，不影响正在使用的版本；SQLite 发布完成后任务状态尚未更新时，重试先核对已发布版本，避免重复发布。

### 6.2 查询期间的一致性

- 先从权威业务状态解析当前书籍、最新章节清单和允许的专业文档版本，再读取该范围内的发布清单。
- FTS 与向量查询使用同一份活动 chunk_set 白名单；向量查询同时限定 allowed source IDs，构建中的向量不能进入候选。
- 过滤在候选生成前执行，不能先全库 top-k 再过滤出少量当前书籍结果。LanceDB 提供元数据预过滤；其默认与 SDK 版本语义需在集成时核对。[过滤文档](https://docs.lancedb.com/search/filtering)
- 资料集成员关系以 knowledge.sqlite 为准。向量里的分类标签不能代替当前有效的资料范围判断。
- 取回片段后复核权威当前版本和删除状态；组装提示前发现变化则重新取有效片段或明确报告待更新。
- 更新期间不默认回退到已经过期的小说内容。可直接读取少量最新章节作为补充，或标记该来源暂时不可向量检索。
- 查询固定一次 metadata 发布视图与可读的向量表视图，回收任务必须避开活动查询和所有当前发布批次。vector_table_version 是可读性与诊断凭证，不是业务修订 ID。

### 6.3 删除、恢复和模型切换

删除或停用首先改变权威可查询范围，立即阻止新请求采用该来源；清理向量和 FTS 随后进行。引用已经进入历史聊天的片段遵循会话保留策略，删除知识文档不等于自动抹去用户已有聊天记录。

整书恢复使 source_generation 改变，旧游标失效并重新对账。单章恢复产生新 revision，按普通更新管线处理。

切换 embedding 模型创建新 space，在后台完整构建、评测后切换检索配置。旧空间保留到在途请求结束再回收；两种不同空间的向量距离不直接混排。

## 7. Agent RAG 如何使用这套结构

### 7.1 工具边界（设计接口，无代码）

| 能力 | 输入边界 | 返回内容 |
|---|---|---|
| 搜索当前小说 | 当前 book_id、问题、允许章节范围、返回预算 | 原文片段、章与修订、命中方式和来源 |
| 搜索专业资料 | 经业务解析的资料集、问题、资料类别、返回预算 | 资料片段、文档版本、页/节位置、来源角色 |
| 读取引用上下文 | 检索返回的受控引用 ID | 经版本与范围校验的相邻原文 |
| 组装写作上下文 | 当前任务、章节基线、检索配置、总预算 | 分区上下文与完整清单 |

工具不接受任意本机目录和未经校验的全库 scope。检索到的资料是数据，不自动获得修改权限，也不能因为文档写着“忽略要求”就改变 Agent 的执行规则。

### 7.2 混合召回与生成

1. 根据任务确定来源配额。例如续写优先当前稿件与小说证据，方法咨询优先专业资料；配额由 retrieval_profile 配置。
2. 分别对小说和专业资料执行关键词与向量召回，所有分支使用相同来源边界。
3. 同一语料内按名次融合（如 RRF），按来源去重并扩展必要相邻片段；不直接相加 BM25 与余弦原始分数。
4. 可选 reranker 处理候选相关性，记录模型与版本；排名不能改变小说/方法论的来源身份和可信边界。
5. 全局编排按照配额选择两类证据。不同语料采用不同 embedding 空间时，使用各自查询向量和各自排名，跨语料通过配额或统一重排合并。
6. 当前正文和用户约束优先保留；历史、系统提示、工具定义、包装文字、检索片段都计入完整请求预算。
7. 上下文明确分为“小说已写内容”“外部方法与资料”“本次任务要求”。没有依据时说明缺口，而不拼接一条看似完整的虚构引用。
8. 生成后通过第一部分的基线校验提交；RAG 不能直接覆盖章节表。

“截至当前章节”按最新目录顺序解析。未来若有倒叙事件、读者知晓范围或摘要，需要额外校验这些条目的覆盖章节；本期不依赖尚不存在的人物事实表才能检索正文。

### 7.3 运行记录：新增到工作区库

| 表 | 字段重点 | 用途 |
|---|---|---|
| rag_requests | id、run_id、request_number、query、profile_id、profile_version、scope_snapshot、novel_space_id、knowledge_space_id、timings、status、error | 记录这一次检索查了哪些来源和空间；查询文本按会话保留策略处理 |
| context_manifests | id、run_id、model_request_number、rag_request_id?、policy_version、tokenizer_key、input_budget、input_tokens、tokens_are_estimated、output_reserve、prompt_hash、scope_snapshot、created_at | 每次实际模型请求都有独立预算清单 |
| context_sources | manifest_id、ordinal、source_role、source_kind、scope_id、source_id、source_version、chunk_id?、locator、excerpt、excerpt_hash、token_count、retrieval_method、rank? | 保存真正发送的片段；source_role 区分 novel/methodology/reference/current_draft |

context_sources 不只保留可能被清理的向量或 chunk ID。它保存实际片段和源版本，可解释“这次续写为什么使用了这条资料”。查原始文档时若旧文件版本已移除，应显示来源不可用，不编造定位。

专业资料和 RAG 配置需进入对应知识库备份；派生向量可重建但可能耗时，应显示重建进度。普通小说导出不自动附带用户整套专业资料、聊天或模型凭据。

## 8. 验收与选型验证

| 类别 | 必测情形 |
|---|---|
| 现有业务独立性 | 向量库未启动、损坏或正在重建时，创建编辑阅读导出仍可用 |
| 小说语义检索 | 同义表达、人物别名、跨章事件；命中能回到真实章与修订 |
| 专业资料检索 | PDF 页码、Markdown 节标题、表格/OCR；一个文档多资料集不重复向量化 |
| 来源隔离 | A 书不能检索 B 书；未绑定资料集不进入召回；移除绑定立即生效 |
| 版本与恢复 | 新章版本上线、删除、恢复、重排；旧任务不能发布旧内容 |
| 跨存储故障 | 向量写完前后、SQLite 发布前后、任务状态写入前后分别中断并恢复 |
| 混合检索 | 与关键词单路、向量单路比较 Recall@k / nDCG；评测来源配额与重复片段 |
| ANN | 与精确向量检索基线比较召回损失；新写入但尚未建索引的内容仍能检索 |
| 资源 | 冷启动、embedding 吞吐、批量导入、P95 查询延迟、内存、磁盘与 UI 响应 |
| 模型切换 | 维度/模板不同的新空间完整重建，切换后不使用旧查询向量 |
| 可追溯性 | 生成清单等于实际发送片段，引用位置和版本可核验 |

建议固定一套真实小说与专业资料问题集，保留答案证据和相关性标注，分别评估召回、引用准确性与生成效果。不得只用“接口成功返回向量”作为完成标准。

## 9. 与后续业务的接口

未来人物、大纲、事件、伏笔和已确认摘要可以加入 novel scope 的新 source_kind，沿用 source_version、chunk_set、向量空间和发布协议。它们的权威表仍属于书库，由各自业务模块确认后提供内容。

本次已经完整设计向量库与 Agent RAG 支撑层；人物知识图谱、实时多人协作和云端向量托管另见[后续业务边界](./03-future-business.md)，不作为本次现有业务重设计的前提。
