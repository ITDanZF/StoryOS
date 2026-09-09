# 第一部分：现有业务的表结构重设计

> v0.3 · 2026-09-09 · 设计基线与实施对照
> 先覆盖现有功能，再实施 RAG 扩展。本文保留目标设计；版本 100 的实际实现、验证与差异见[实施记录](./04-phase-a-implementation.md)。

## 1. 范围与设计次序

本部分重设计当前已经存在的项目、书架、书籍、卷章、修订、阅读、导入导出、归档恢复、回收站、会话、Agent 运行与技能绑定。

现有业务功能必须先有完整的数据归属和状态约束。新增正文草稿、摘要投影、事件消费日志用于改善这些已有流程；不把尚未开发的人物、大纲、伏笔等业务当成当前业务的必要前提。

向量库及专业资料库的完整设计见[第二部分](./02-vector-rag.md)。这里仅定义现有业务向检索层提供的稳定来源、版本和变更通知。

## 2. 现有业务覆盖清单

| 现有业务 | 当前实现来源 | 重设计后必须保留的行为 |
|---|---|---|
| 创建、链接、打开、重命名项目 | ProjectApplication / ApplicationDatabase | 项目身份稳定，本机路径唯一，信任与最近打开状态可恢复 |
| 独立书架、创建书籍、项目绑定 | BookshelfApplication / ProjectBookBindingService | 书籍独立于项目，当前一项目一主书、一书最多一个可写项目 |
| 卷章编辑、排序、章节修订 | NovelApplication / SqliteNovelStore | 无卷章节、卷内排序、完整历史、基线冲突保护 |
| 书籍搜索与统计 | 书籍工具 / BookCatalogReader | 章名、字数、更新时间和正文检索来源一致 |
| 阅读器与阅读进度 | BookReaderApplication | 固定阅读视图、旧窗口不能覆盖新状态、引用能校验到修订 |
| 导入预览、确认导入、多格式导出 | BookTransferService | 预览和确认关联同一输入；导出读取固定内容；格式能力不倒退 |
| 项目归档与恢复 | ProjectArchiveService / RecoveryService | 区分快照书籍与当前书籍恢复策略，可从中断阶段恢复 |
| 书籍回收站、恢复、永久清理 | BookLifecycleService | 回收与物理清理分开，清理失败可重试，已绑定书籍遵循解绑限制 |
| 会话、流式输出、工具调用与确认 | ThreadApplication / ConversationEventStore | 事件顺序可恢复，工具与确认记录保留，会话列表可分页 |
| Agent 执行与错误恢复 | RunStore / LangGraph 检查点 | 状态、失败阶段与可重试信息可查，框架检查点独立管理 |
| 技能安装与会话技能绑定 | skills / thread_skills | 技能内容继续由文件包管理，绑定不成为技能内容的第二来源 |
| 本地项目文本检索 | indexed_files / text_chunks / FTS | 路径、行列位置、标题和版本信息保留，后续并入 RAG 检索层 |
| 开发者数据库查看 | DeveloperDatabaseService | 按库识别新表与 schema 版本，派生库可单独查看 |

代码依据：[应用库](../../../src/main/agent/storage/global/ApplicationDatabase.ts)、[书库](../../../src/main/agent/storage/book/BookDatabase.ts)、[项目库](../../../src/main/agent/storage/project/ProjectDatabase.ts)、[阅读器](../../../src/main/agent/application/BookReaderApplication.ts)、[导入导出](../../../src/main/agent/application/BookTransferService.ts)、[归档恢复](../../../src/main/agent/application/ProjectArchiveRecoveryService.ts)。

## 3. 数据所有权与物理边界

| 边界 | 权威数据 | 派生 / 本机数据 | 事务边界 |
|---|---|---|---|
| app.sqlite | 项目登记、书籍本机登记、归档和操作记录 | 本机路径、阅读偏好、书架摘要 | 一次登记或恢复阶段提交 |
| 每书 book.sqlite | 书籍资料、卷章、正文修订、恢复草稿 | 可重放的业务变更通知 | 一次正文或目录修改 |
| 每工作区 project.sqlite | 会话与运行事件、技能绑定 | 消息列表投影、活动会话 | 一次事件追加及投影更新 |
| 检索层（第二部分） | 无正文所有权 | 项目文件 / 小说分块、全文索引和向量 | 独立构建和发布 |
| 检查点与技能文件 | 各自框架 / 文件格式管理的内容 | 可另行生成发现索引 | 沿用各自协议 |

沿用 project.sqlite 文件名，避免仅为命名而引入切换。书库独立身份与目录结构也保留。缓存故障不应阻止保存正文；正文保存成功后，派生摘要和索引可以稍后追上。

阶段 A 继续保留现有项目全文索引的可用路径；阶段 B 完成统一来源与检索接口后再切换 indexed_files / text_chunks / FTS 的职责。不能在新检索层尚不可用时先移除旧搜索功能。向量暂不可用时，服务可显式使用全文检索并记录召回方式，不能把它标记成已执行向量检索。

## 4. 从旧表到新表：逐项映射

这里是设计职责映射；用户允许舍弃旧数据，不代表需要编写旧数据迁移程序。

| 现有库 / 表 | 目标表或位置 | 处理与原因 |
|---|---|---|
| app / projects | projects | 保留身份、路径、信任与打开时间，增加版本控制 |
| app / books | book_registry | 明确它登记的是本机书库位置，书籍资料仍在 book.sqlite |
| app / project_books | project_books | 先保留现有一对一可写绑定，不借重构扩展为多书项目 |
| app / app_state | app_state | 保留当前项目，补本机设备标识和有版本的偏好 |
| app / book_reading_states | reading_states | 显式区分进度版本和偏好版本，保存时保留会话防旧写机制 |
| app / book_trash_entries | book_registry + book_catalog | 回收时间归登记，回收站标题来自最后一次摘要，删除业务不再多处维护状态 |
| app / book_deletion_log | storage_operations + book_cleanup_details | 通用操作状态与物理清理细节分开，清理记录必须在登记删除后仍可用 |
| app / project_archives | archives | 保留源项目、关联书籍、格式版本、哈希与恢复入口 |
| app / project_archive_operations | storage_operations + archive_restore_details | 保留阶段、目标目录和 snapshot/current 策略，不丢恢复能力 |
| book / novels | books | 统一业务术语；仍一库一本书 |
| book / volumes | volumes | 保留分卷，改进排序位置与版本检查 |
| book / chapters | chapters | 保留状态和当前修订指针，约束修订必须属于本章 |
| book / chapter_revisions | chapter_revisions + revision_documents | 元数据与大正文分开；历史列表和统计不读取正文 |
| project / threads | threads | 保留会话身份与排序，记录会话的书籍关联 |
| project / workspace_state | workspace_state | 保留工作区活动会话，补稳定工作区 ID |
| project / thread_skills | thread_skills | 保留技能绑定，技能内容继续为文件包 |
| project / messages | message_views | 消息成为可重建投影，避免两套独立消息写入路径 |
| project / conversation_events | conversation_events | 确定为会话权威记录，增加跨 run 的会话内顺序 |
| project / agent_runs | agent_runs | 保留运行状态、错误码、失败阶段与重试语义 |
| project / indexed_files | RAG / retrieval_sources + source_versions | 项目文件依然作为独立来源，记录路径、大小、修改时间与内容哈希 |
| project / text_chunks、text_chunks_fts | RAG / retrieval_chunks + FTS | 保留行列与标题定位，复用统一检索入口 |
| checkpoint / checkpoints、writes | 原检查点库 | 不重写第三方运行恢复格式，不当作故事知识表 |

新增的 book_catalog、projection_cursors、chapter_drafts、book_changes 是现有业务的读写优化和恢复机制。它们不依赖大纲、人物或向量模块才能工作。

## 5. 字段与约束约定

- ID：应用生成稳定的全局唯一 ID。现有带类型前缀的 UUID 形式可以保留，不能以本机路径充当业务 ID。
- 时间：UTC 毫秒；时间戳用于展示和过滤，不承担唯一顺序或分布式因果关系。
- row_version：当前记录的乐观锁版本；保存请求必须携带读到的版本。
- JSON：只承载版本化编辑器文档、消息块、偏好等结构变化较大的载荷。关系、排序、状态、版本和常用过滤字段独立成列。
- 正文哈希：规范化文档哈希与纯文本哈希分开，提取器版本记录在修订上。
- 约束：主键、唯一、状态值和同库关系由数据库保证；跨库、文件系统、JSON 语义与循环依赖由事务服务校验。
- 软删除：仅用于用户有恢复需求的对象；本机消息投影、索引等派生内容可以直接重建。

### 5.1 应用库目标表

| 表 | 主要字段 | 键、索引与约束 |
|---|---|---|
| projects | id、name、local_path、path_key、location_type、trusted、row_version、created_at、updated_at、last_opened_at | PK id；path_key 唯一；最近打开时间 + id 索引 |
| book_registry | book_id、local_path、path_key、state、source_generation、created_at、updated_at、last_opened_at、trashed_at | PK book_id；path_key 唯一；state + 最近打开时间；回收态与回收时间对应 |
| project_books | project_id、book_id、attached_at | PK project_id；book_id 唯一；两个登记外键；保持现有可写绑定规则 |
| app_state | singleton、active_project_id、device_id、local_profile_id、preferences_version、preferences | singleton 唯一；活动项目删除后置空；偏好结构独立校验 |
| book_catalog | book_id、title、synopsis、writing_status、volume_count、chapter_count、character_count、content_updated_at、source_generation、source_sequence、refreshed_at | PK/FK book_id；更新时间 + id；状态 + 更新时间；只由投影服务维护 |
| reading_states | book_id、profile_id、device_id、state_version、anchor_version、anchor、preferences_version、preferences、updated_at | 组合 PK；阅读锚点含 chapter_id、revision_id、位置、引文；状态 CAS 防止并发覆盖 |
| archives | id、kind、source_project_id?、source_book_id?、local_path、path_key、format_version、manifest_hash、state、created_at、last_restored_at? | PK id；path_key 唯一；源对象 + 创建时间；源 ID 不因源删除而级联删除 |
| storage_operations | id、idempotency_key、kind、state、phase、book_id?、project_id?、archive_id?、attempt、error_code?、error_message?、created_at、updated_at | 幂等键唯一；待处理状态 + 更新时间；对象 + 时间；操作存在期间引用的归档禁止删除 |
| archive_restore_details | operation_id、archive_id、target_path、book_strategy、restored_book_id?、published_marker、details_version | PK/FK operation_id；book_strategy 为 snapshot/current；目标归属凭证用于恢复与补偿 |
| book_cleanup_details | operation_id、book_id、staging_path、cleanup_state、cleanup_updated_at、ownership_marker | PK/FK operation_id；book_id 为保留的逻辑身份，不能依赖已经删除的 registry 行 |
| projection_cursors | consumer、book_id、source_generation、last_sequence、updated_at | consumer + book_id 唯一；与该消费者更新的 app 投影同事务提交 |

source_generation 是本机对某次书库实例的代号。整库恢复、替换或重新登记时重新分配，避免旧消费游标误认新书库已经处理完成；它不是书籍业务 ID，也不随书作为云端版本同步。

### 5.2 独立书库目标表

| 表 | 主要字段 | 键、索引与约束 |
|---|---|---|
| books | id、title、synopsis、status、row_version、created_at、updated_at | PK id；一库一行；ID 与登记相同 |
| volumes | id、book_id、title、summary、position、row_version、created_at、updated_at、deleted_at? | 同书同级有效位置唯一；book_id + position；删除卷必须明确处理子章节 |
| chapters | id、book_id、volume_id?、title、status、position、current_revision_id?、row_version、created_at、updated_at、deleted_at? | 卷内与无卷位置分别唯一；卷必须同书；current_revision 必须属于本章 |
| chapter_revisions | id、chapter_id、revision_number、parent_revision_id?、document_hash、text_hash、extractor_version、character_count、origin、device_id、source_run_id?、restored_from_revision_id?、change_summary、created_at | chapter_id + revision_number 唯一；父版本、恢复源均属本章；历史元数据不可原地改写 |
| revision_documents | revision_id、document_schema_version、document_json、plain_text | PK/FK revision_id；与修订一对一，同事务保存；历史正文不可更新 |
| chapter_drafts | chapter_id、device_id、base_revision_id?、draft_version、document_schema_version、document_json、updated_at | chapter_id + device_id 唯一；基线属本章；CAS 更新；同设备多窗口不允许静默覆盖 |
| book_changes | local_sequence、event_id、operation_id、entity_type、entity_id、entity_version、action、payload_version、payload、created_at | 本机递增序列；event_id 唯一；操作 + 实体去重；与业务变更同事务写入 |

书库每次变更都通过同一写入口维护版本和变更日志。直接开发者改库属于维护操作，完成后必须触发校验与投影重建，不假定任意手写 SQL 都能自动维护所有业务约束。

revision_number 仅是本地历史序号。恢复历史时创建新修订：parent 指向提交前当前版本，restored_from 指向选中的旧内容版本，避免丢失恢复行为的两种来源。

### 5.3 工作区目标表

| 表 | 主要字段 | 键、索引与约束 |
|---|---|---|
| threads | id、title、book_id?、row_version、created_at、updated_at、archived_at? | PK；活动会话按更新时间 + id 分页；book_id 是跨库逻辑引用 |
| workspace_state | singleton、workspace_id、active_thread_id?、updated_at | 单行；workspace_id 稳定；删除活动会话后置空 |
| thread_skills | thread_id、skill_id、status | 组合 PK；会话外键；技能 ID 由文件包注册表校验 |
| agent_runs | id、thread_id、parent_run_id?、book_id?、chapter_id?、base_revision_id?、operation、status、provider_key、model_key、started_at?、completed_at?、duration_ms?、output?、error_name?、error_code?、error_phase?、error_message?、error_retryable?、created_at | 会话 + 创建时间；未结束状态；父 run；保留现有取消、超时与失败状态 |
| conversation_events | local_sequence、event_id、thread_id、thread_sequence、run_id?、run_sequence?、type、schema_version、step_id?、block_id?、payload、created_at | event_id 唯一；会话内顺序唯一；run 内顺序唯一；有 run 的事件必须属同一会话 |
| message_views | id、thread_id、first_sequence、last_sequence、role、status、blocks、updated_at | 会话 + first_sequence 唯一；分页读取；完全从权威事件重建 |

agent_runs.output 若保留，仅作兼容的运行摘要缓存，不能成为第三套消息权威记录。最终消息与可重放事件是同一来源。

RAG 的 context_manifests / context_sources 属于第二部分新增能力，不混进现有业务表替换的必要前置条件。

## 6. 关键业务重新走一遍

### 6.1 编辑与保存

1. 输入期间合并写入设备草稿，按 draft_version 校验。
2. 正式保存带 current_revision_id 和 chapter.row_version。
3. 同一书库事务中校验基线、插入修订与正文、更新当前版本指针、写 book_changes。
4. 冲突时保留草稿，返回冲突信息；不把保存冲突误判为请求成功。
5. 应用库摘要、全文检索和向量更新在提交后消费，不阻塞正文事务。

AI 续写、改写和人工编辑共用这个提交路径。修订与正文的一对一完整性由事务服务在提交前验证，单侧外键本身不能保证正文行一定存在。

### 6.2 目录与书架

书架仅查询登记和摘要。摘要首次缺失时按需重建，不能以零字数伪装已完成统计。大规模列表按游标分页。

目录只读取卷章元信息和小型修订元数据。位置使用留有间距的整数，普通移动只改目标行；间距不足时重平衡同级组。唯一位置变更需两阶段临时位置或等价事务方案，不能假设 SQL 更新顺序能避免冲突。

目录重排也写变更日志。读取“截至某章”的顺序由最新目录清单计算，不把 position 误当稳定章节 ID。

### 6.3 阅读与导出

阅读会话和短时导出预览继续可以留在内存，不因表结构重设计就全部持久化。

- 阅读会话拥有窗口标识、会话 ID 和递增请求序号；旧会话或过期序号不能写阅读状态。
- 固定阅读清单指向各章节修订；定位失效时用引文辅助重定位，并明确是否已重新定位。
- 导出预览固定卷章顺序、标题、修订与格式选项；确认时沿用该快照，不能重新读取不断变化的当前内容。
- 短会话存活期间，所引用的修订由运行时保护，不能被后台保留策略删除。
- 只有确需跨重启继续的后台导出，才在 storage_operations 中保存可恢复的快照清单；不提前引入“作品里程碑”新业务。

### 6.4 归档与恢复

storage_operations 统一记录 queued/running/completed/failed/cancelled；phase 由 operation.kind 限定，恢复仍包含 preparing、files_published、registered 等可恢复阶段。

archive_restore_details 保留 snapshot/current 策略、目标目录、恢复后的书籍 ID 和文件发布凭证。补偿删除前必须核验目标确由本次操作创建，不能只凭同名路径决定归属。

完整归档通过 SQLite 备份机制或受控一致性流程获得文件，不直接复制一个可能仍依赖 WAL 的主库文件。项目与书库跨文件的整体一致性由应用固定快照和操作日志组织；不能假定它们共享数据库事务。[SQLite WAL](https://www.sqlite.org/wal.html)

### 6.5 回收与永久清理

回收：遵循现有解绑限制，登记进入 trashed，并保留最后有效标题与字数摘要。

永久清理：先记录操作及受控暂存位置，再移入清理区，删除登记，最后物理清理。cleanup_details 不依赖已删除的登记外键，清理失败仍能重试。RAG 扩展上线后，检索入口立即以登记状态拒绝该书，后台再删除其缓存。

### 6.6 会话、工具与技能

事件追加和消息投影更新尽量同事务；若异步投影则必须持久化游标。流式增量可合并批量写入，最终块必须有可恢复内容。工具确认请求和决定仍记录为事件。

技能包继续由其版本、文件与索引管理。论文、专业方法论资料属于第二部分知识库，不自动成为可执行技能或高优先级 Agent 指令。

## 7. 性能、保留与验收

| 验证项 | 期望结果 |
|---|---|
| 书架列表 | 不逐本打开全文并逐章汇总；缓存缺失状态可观察 |
| 千章目录、修订列表 | 分页或小字段查询，不携带正文载荷 |
| 编辑过程中并发保存 | CAS 冲突可复现，双方内容不被静默丢弃 |
| 草稿崩溃恢复 | 读取原草稿和基线；不自动覆盖已更新正文 |
| 阅读位置 | 多窗口与旧会话写入不会回退新位置 |
| 导入导出 | 预览与确认使用同一内容；现有格式能力与错误提示保留 |
| 恢复中断 | 各阶段可重试，路径归属和书籍策略明确 |
| 删除失败 | 登记删除后仍有清理记录，重新启动可继续处理 |
| 长会话 | 按序分页读取；事件可重建消息视图；检查点仍能按原协议恢复 |

索引以实际查询为依据，避免给所有字段建索引。普通表可考虑 STRICT 与复合外键，但跨行和业务语义仍需服务验证。[SQLite 外键](https://www.sqlite.org/foreignkeys.html)、[STRICT 表](https://www.sqlite.org/stricttables.html)

保留策略区分草稿、永久修订、运行增量和派生缓存。当前修订、草稿基线、活跃阅读/导出快照及后续 RAG 引用涉及的历史不能被无条件清理。

专项查询测量见实施记录；后续仍应在代表性书库和长会话上比较查询次数、I/O、P50/P95、写入放大和主进程阻塞，再确认总体优化收益。

## 8. 实施边界

业务结构已获批准并按 schema 版本 100 实施，初始化、Repository、IPC 和专项验收已接入。允许舍弃旧数据，重建通过显式命令执行，与常规启动解耦；实际覆盖与边界见实施记录。

本部分落地后的第一条验收标准是：**现有业务完整运行，RAG 服务尚未启动时，也能独立创建、编辑、阅读、导出、归档和恢复。**
