# 通用 Agent 引擎

`src/main/agent` 只负责通用执行能力，不包含书籍、章节、项目、编辑器、桌面 IPC 或业务数据库。对外入口为 `index.ts`。宿主通过模型接口、工具注册、能力声明和已编译上下文接入；引擎不反向引用宿主。

## 八个模块

| 目录 | 职责 |
| --- | --- |
| `runtime/` | Agent 定义与注册、执行器、直接运行、预算、取消、错误与输入契约 |
| `orchestration/` | 引擎装配、需求解析、路由、任务规划、匹配、调度、评审与结果汇总 |
| `model/` | 模型网关接口、LangChain 适配、模型路由与连接快照 |
| `tools/` | 通用工具注册、权限与审批；文件、文本、索引、委派、技能工具 |
| `skills/` | 技能加载、校验、安装、匹配、提示词与技能 Agent 编译 |
| `checkpoints/` | 会话检查点接口、SQLite 适配及恢复，不存储业务实体 |
| `environment/` | 调用环境隔离、引擎 home 和通用工作目录 |
| `prompts/` | 通用执行、规划、评审、汇总与技能生成提示词 |

通用且需要跨进程共享的数据类型位于 `src/shared/engine/`，不包含业务实体，也不引用主进程实现。

## 接入与扩展

1. 向 `createAgentOrchestrator` 注入实现 `ModelGateway` 和 `invokeText` 的模型，无需依赖具体 LangChain 模型类。
2. 通过 `ToolResolver(tools, manifestFactory)` 注册工具及清单，声明能力、效果、所需上下文和审批策略。未知工具缺少清单时拒绝注册。
3. 通过 `agents` 注册 Agent。能力和效果使用命名空间标识，例如 `inventory.inspect`、`inventory.write`，无需修改引擎枚举；规划仍须通过能力匹配、效果和工具授权校验。
4. 宿主将业务上下文编译成 `AgentInput.prompt` 并传入 `requirements`。需要特殊写入完成条件时，可传入 `completion`；所选工具仍须属于本轮已授权工具。
5. 文件工具通过 `WorkspaceToolContext` 指定工作根、索引路径及受保护目录，直接访问和递归扫描均保持目录保护。

默认授权要求工具满足上下文和效果约束，实际执行还受审批策略约束。`policy`、`grantsEffects` 是可信宿主配置，不接受模型输出作为权限策略。

## StoryOS 接入位置

`src/main/story/integration/` 负责书籍/编辑器工具、权限规则、上下文编译和章节生成完成条件；`src/main/story/application/` 负责业务用例；`src/main/story/storage/` 负责业务持久化。`src/main/bootstrap/` 装配应用，`src/main/desktop/` 实现 Electron 适配。

新增业务逻辑放在宿主目录，通过接口接入，避免再次进入引擎内部。

## 验证

- `npm run check:agent`：独立类型检查、依赖边界检查、引擎 lint。
- `npm run test:agent`：外部能力、工具审批、上下文授权及目录保护测试。
- `npm run check:backend`、`npm test`：业务接入和完整回归。
- Node 测试后启动桌面前执行 `npm run native:electron`。

详见 [引擎边界调整记录](../../../docs/architecture/backend-agent-engine-boundary.md)。
