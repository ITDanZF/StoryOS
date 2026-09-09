# StoryOS 后端重构实施记录

实施日期：2026-09-09。源码基线：`de463b0`。开始时仅分析和执行方案两份文档未跟踪，没有业务代码修改。

依据：[分析文档](backend-refactoring-and-resource-organization-analysis.md)、[执行方案](backend-refactoring-execution-plan.md)。原分析中的旧路径说明基线，当前入口以本文为准。

## 1. 执行包交付

| 包 | 实际交付 | 状态 |
| --- | --- | --- |
| B00 | 测试源码取消忽略；增加 backend lint、测试、严格类型检查命令；生成结果保持忽略 | 完成 |
| B01 | RunEventPublisher/EventPersistenceError；持久化后广播；失败释放运行；同库终态事务与重启幂等恢复 | 完成 |
| B02 | DTO/事件迁入 shared/contracts；内部归档 Date 记录保留 main；renderer 类型引用改用 shared | 完成 |
| B03 | 6 个分域 IPC 控制器、统一注册器、可信窗口/主帧校验、请求上下文、owner 和注销 | 完成 |
| B04 | StoryAgentService、应用/工作区工厂、ResourceScope、BusinessAccessGate；共享 manager 与租约所有权；环境隔离 | 完成 |
| B05 | BookWorkspaceApplication、ProjectLifecycleApplication、ConversationApplication；桌面门面委托用例 | 完成 |
| B06 | 格式能力与策略统一；会话状态/owner/限额/TTL；快照读取、导入写入、文件发布、临时目录恢复 | 完成 |
| B07 | 结构/修订/草稿接口；修订/草稿 SQL 分离；显式目录投影装饰器替代 Proxy；失败投影保持脏状态 | 完成 |
| B08 | RunStateStore、ApprovalSessionManager、ConversationEventAssembler、CheckpointRecovery；Agent 保留协调职责 | 完成 |
| B09 | 归档发布、恢复、启动恢复、查询协调分离；路径校验与 DTO 转换共用函数 | 完成 |
| B10 | 单一品牌 SVG、ResourceLocator、静态提示词/导出样式分类、PDF Electron 适配器 | 完成 |
| B11 | 通用引擎保留 main/agent，业务外置 main/story 并按职责归类；清理纯路径兼容壳及无用聚合出口；更新源码/脚本/测试；后端全范围 strictNullChecks | 完成 |
| B12 | 单元/行为、类型、lint、打包、桌面存储、业务流程、离线阅读器与资源产物检查通过 | 完成 |

## 2. 当前模块入口

```text
src/main/
  agent/                 通用引擎，八个一级目录
    runtime/             定义、执行、运行状态与预算
    orchestration/       装配、规划、匹配、调度、评审
    model/               模型接口与适配器
    tools/               通用工具与权限机制
    skills/              技能生命周期
    checkpoints/         通用会话检查点
    environment/         环境隔离与通用路径
    prompts/             通用提示词
  story/
    application/
      books/             书籍、章节、书架、阅读与生成
      projects/          项目、绑定、归档生命周期
      conversations/     会话、持久化事件、审批会话与产品运行协调
      transfers/         导入导出、格式策略、预览与发布
    integration/         StoryOS 对引擎的适配与业务工具
    runtime/             项目/书籍运行时与租约装配
    storage/             业务数据库、投影与归档布局
    workspace/           项目目录与用户配置路径
    config/              产品配置与模型提供方选项
    resources/           产品提示词与导出样式
  bootstrap/             应用入口、资源作用域、请求上下文与维护门禁
  desktop/               桌面门面、IPC 控制器、编辑器桥、打印与文件浏览
  resources/             随应用发布资源的定位
src/shared/
  engine/                通用引擎共享契约
  contracts/             StoryOS 业务通信契约
```

`src/shared/agent/contracts.ts` 保留为稳定桌面 API/通道出口。部分同域运行时文件仍 type re-export shared 定义，未复制实现。通用引擎以 `src/main/agent` 为稳定根目录，业务实现位于 `src/main/story`，目录职责与扩展约定见 [Agent 模块说明](../../src/main/agent/README.md)。

ESLint 限制 shared 引入 main/renderer/Electron/SQLite/LangChain，限制模块应用层直接引入 Electron。`tsconfig.backend.json` 对 main/preload/shared 全范围启用 strictNullChecks；原有全项目类型检查继续覆盖 renderer 和测试。生成目录明确排除在源码检查之外。

| 核心入口 | 当前行数 | 职责 |
| --- | ---: | --- |
| bootstrap/StoryAgentService.ts | 310 | 初始化、配置、维护、退出 |
| bootstrap/ApplicationRuntimeFactory.ts | 111 | 装配、启动失败清理 |
| desktop/DesktopController.ts | 310 | 稳定门面、用例委托 |
| ipc/agent.ts | 50 | 注册组合、事件转发 |
| story/runtime/WorkspaceRuntimeManager.ts | 312 | 激活队列、切换、生命周期 |
| story/application/conversations/AgentApplication.ts | 549 | 运行协调、事件映射、收尾 |
| story/application/transfers/BookTransferService.ts | 363 | 预览与提交协调、原生包兼容 |
| story/storage/book/SqliteNovelStore.ts | 524 | 结构 SQL、修订/草稿委托 |
| story/application/projects/ProjectArchiveService.ts | 184 | 查询与恢复协调 |

物理行数用于定位职责，不代表性能指标；重排格式也会影响行数。

### 2.1 最新引擎边界调整

用户明确 agent 应为通用核心引擎，因此此前统一收回目录的方案进一步调整：agent 保留八个通用模块，书籍、项目、会话和传输移入 story/application；产品工具、需求解析、上下文编译、审批规则及章节写入完成条件通过 story/integration 接入。

此次不仅调整路径，还移除了引擎对业务 DTO、工具与路径常量的反向依赖。新增清单注册、命名空间能力、自定义受保护目录、独立引擎类型检查和依赖边界检查。详见 [引擎边界调整记录](backend-agent-engine-boundary.md)。

## 3. 行为与资源所有权

### 3.1 可靠事件

- 记录失败返回 `event.persistence_failed` 并保留 cause，停止后续正常事件；监听者失败独立隔离。
- 开始、生成、成功/失败终态都处于清理范围；模型上下文同步创建失败也释放活动线程。
- SqliteApplicationEventRecorder 用同步 SQLite transaction 提交消息终态及运行摘要；事务回调不含 await。事件与 message_views 投影仍保持同库事务。
- 重启把未完成运行标记 aborted，并追加确定 ID 的 turn.failed 事件，修复仍在生成中的消息；再次启动不会重复追加。故障触发器测试覆盖终态双写回滚与恢复幂等。
- 工具或文件已执行的写入不属于会话事务，不承诺整轮任务原子回滚。检查点恢复失败记录诊断，原始运行错误继续保留。

### 3.2 生命周期与窗口

- 应用 scope 持有 app 数据库、共享书籍 manager、工作区 manager、传输与 reader；工作区 scope 持有 project 数据库、模型会话、Agent 和书籍租约。借用共享 manager 的工作区不关闭它。
- scope 反序释放，单项失败后继续尝试其余资源，最后汇总错误；关闭幂等。工作区停止接受激活后等待已开始的激活结束。
- 维护入口在请求/运行/传输忙碌时拒绝进入；关闭失败维持 gate 关闭；恢复初始化成功才重新开放。
- StoryAgentService 不再修改全局 home、技能根或模型变量，改为显式配置路径与异步环境上下文。独立配置工具原有环境应用选项保留，host 始终禁用该选项。
- IPC 请求通过 AsyncLocalStorage 携带窗口 owner；编辑器请求发回原窗口，只接受该窗口响应。窗口销毁/退出立即释放等待，PDF 隐藏窗口不作为业务窗口。

### 3.3 书籍、投影与传输

- 修订文档、当前修订指针、草稿版本与 book_changes 保持同步事务，CAS、排序、外键和软删除语义不变。
- CatalogUpdatingBookStore 明确列举需刷新投影的写操作。刷新失败不撤销权威正文，不保存错误 fingerprint，后续读取/启动继续修复。
- 会话有 preparing/prepared/committing 状态，每类默认最多 8 个，prepared 默认 30 分钟过期。同步占用防止重复提交，TTL 不清理正在准备或提交的目录。
- 覆盖确认前的路径校验失败保留预览；确认后可重试。提交结束后释放会话。文件发布再次检查覆盖权限，防止生成期间出现的新文件被覆盖。
- 原生 StoryOS 包继续使用完整数据库快照；可移植格式由统一策略注册表描述能力与处理器。保留两类数据路径是为了维持完整备份语义。
- 预览目录记录 operation 标记和进程 owner。启动只回收确认所属进程已退出的目录；未知 owner、无标记、符号链接或真实路径不匹配的目录不自动删除。

## 4. 资源与兼容边界

品牌 SVG 唯一源为 `assets/branding/storyos-logo.svg`，renderer、favicon、README 共用。PNG/ICO/ICNS 保留各自平台用途。图标和技能由 Forge 解包，ResourceLocator 基于应用根识别 ASAR，不依赖 cwd。静态提示词和 PDF/EPUB 样式编译进入主进程，保留原文字及条件。详见 [资源说明](../../assets/README.md)。

保持数据库 schema 100、三类业务数据库边界、独立 LangGraph 检查点、原生包格式版本、已有 IPC 通道与 preload 方法签名。没有执行 storage:reset，没有迁移或删除用户数据。

方案中的组件名是职责建议：reader/window/developer 保留专用注册函数；纯格式处理和路径校验保留函数；结构查询留在 SqliteNovelStore，修订和草稿独立提取，避免拆散事务。没有引入通用基类或 DI 容器。

## 5. 验证记录

环境：Windows x64、Node 22.22.1、Electron 42.3.3。原生 SQLite 依赖按命令切换 ABI；最终保留 Electron ABI。

| 检查 | 结果 |
| --- | --- |
| 重构前 npm test | 64 个文件、308 项；306 通过，2 项旧审批断言失败 |
| 最新完整 Vitest | 71 个文件、327 项全部通过，运行前已重建 Node ABI |
| npm run typecheck | 通过 |
| npm run typecheck:backend | 通过 |
| npm run lint:backend | 通过 |
| test:storage:phase-a | 7 组通过；千章目录 20 样本 p50 1.11ms、p95 2.06ms，仅为本机本次记录 |
| test:reader:storage | 固定修订、owner、CAS、清理、租约、Unicode anchor、缓存检查通过 |
| npm run package | 最终产物构建通过，out/storyos-win32-x64/storyos.exe |
| test:packaged:smoke / test:packaged:business | 最终 EXE/ASAR 启动、项目/正文/重启恢复通过 |
| test:storage:desktop | 正式 IPC、目录元数据、草稿 CAS、投影、懒加载、Ctrl+S、崩溃后草稿恢复通过 |
| test:reader:packaged | 正式 IPC、独立书籍、断网 3D 阅读、目录/翻页、应用重启后 SQLite 阅读位置恢复通过 |
| test:packaged:resources | 12 项资源检查通过；技能、图标实际解包，提示词/样式进入 bundle |

最新引擎边界调整另通过 `check:agent`（123 个源码/契约文件依赖检查、独立类型和 lint），增加 4 项非 StoryOS 场景的引擎测试。此表中桌面存储 UI 和离线阅读器端到端结果来自此前完整重构验收；本次重新执行了其余类型、lint、完整 Vitest、存储/阅读器数据层、打包、资源、启动与业务恢复检查。详见 [最新调整记录](backend-agent-engine-boundary.md#5-本次验证结果)。

原有 2 项测试误要求普通书籍写入与编辑器工具全部审批，而 ToolManifest 已允许普通写入、保留删除审批。已校正断言，未放宽运行时策略。

新增测试覆盖事件故障、终态事务/重启恢复、资源清理、gate、预览 owner/TTL、环境隔离、可信帧及编辑器窗口归属。桌面脚本同步修复旧菜单文案、误匹配预加载阅读器节点、直接创建 fixture 后的页面状态刷新；直接启动真实 ASAR 并选择主页面。reader fixture 读取当前 rowVersion 后提交，以满足已有版本校验。

本轮没有相同机器和数据集的重构前导入导出峰值内存基线，不给出性能提升百分比。默认测试使用临时 home、假模型或本地服务，没有调用真实外部模型。

## 6. 复现与回退

```powershell
npm ci
npm run check:backend
npm test
npm run native:electron
npm run test:storage:phase-a
npm run test:reader:storage
npm run package
npm run test:packaged:resources
npm run test:packaged:smoke
npm run test:packaged:business
npm run test:storage:desktop
$env:STORYOS_READER_ASAR = (Resolve-Path 'out/storyos-win32-x64/resources/app.asar').Path
npm run test:reader:packaged
Remove-Item Env:STORYOS_READER_ASAR
```

产物在 `out/storyos-win32-x64/`，结果在 `test-results/`，均保持忽略。测试源码与文档可以随改动纳入版本控制；本轮没有创建 Git 提交或发布。

回退应以本次代码、资源、测试的完整变更集合为单位，保留用户数据目录；不要单独恢复旧 import 或撤掉已被使用的组件。schema 和包版本未变，代码回退不需要数据重置。
