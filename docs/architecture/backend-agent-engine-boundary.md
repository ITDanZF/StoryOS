# 通用 Agent 引擎边界与目录调整

调整日期：2026-09-09。依据用户最新要求：`agent` 是可复用的通用核心引擎，不承担 StoryOS 业务职责。本次约定取代此前“所有后端实现统一收回 agent”的目录方案，保留已经完成的可靠性和类职责重构。

## 1. 最终归属

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

`agent` 一级目录由 19 个收敛为 8 个；清理迁移后空目录，去掉未使用的 `PersistenceStore` 占位接口。原 `Agent/`、`Memory/` 改为职责明确的小写目录。业务应用层按四组组织，避免继续在单个 application 根目录堆放服务。

## 2. 实际解耦

| 原耦合 | 当前实现 |
| --- | --- |
| 引擎直接接收书籍/编辑器 DTO | `StoryTurnAdapter` 编译上下文和需求，通用 `AgentInput` 只接收消息、提示词与执行要求 |
| 默认工具集合引用书籍和 Electron 编辑器 | 核心只创建通用工具；`createStoryTools` 在外部组合业务工具 |
| 工具清单、授权器写死书籍操作 | 核心接受清单工厂和授权策略；业务规则由 `StoryToolManifest`、`StoryToolAccess`、`StoryToolPolicy` 提供 |
| 运行器硬编码章节写入及重试 | 外部适配提供完成工具偏好和重试说明；引擎仍校验工具属于本轮授权范围 |
| 能力枚举限定 book/editor | 命名空间能力可以扩展，注册、规划、上下文和效果校验继续生效 |
| 文件工具直接引用 `.storyos` 布局常量 | 核心接受受保护目录配置；`StoryWorkspaceToolContext` 指定产品内部目录，直接访问和递归扫描均保护 |
| 技能编译、检查点和模型配置反向依赖业务层 | 通用契约归入引擎共享类型或检查点模块；配置通过结构接口传入 |

引擎装配只有一份：`agent/orchestration/createAgentOrchestrator.ts`。StoryOS 工厂组合产品配置并转换输入，不复制规划和执行实现。模型通过接口注入；没有新增通用基类或 DI 容器。

## 3. 保持的产品行为

- 原 IPC 通道、preload 方法、用户数据目录和数据库 schema 保持不变。
- 书籍/编辑器普通操作、删除审批、写入完成检测及章节流式生成规则保留在适配层。
- 终态事务、持久化后广播、崩溃恢复、草稿 CAS、书籍租约与窗口 owner 约束保留。
- 品牌/图标仍位于 `assets/`；产品提示词和导出模板随主进程编译，技能继续解包发布。
- 迁移前保存本地源码快照，快照使用非源码后缀，避免参与测试发现。未重置或迁移用户数据库。

## 4. 防止再次耦合

`verify-agent-boundary.cjs` 解析 TypeScript 导入并解析实际目标路径：引擎只允许引用自身、`shared/engine`、Node 内建模块及第三方库，禁止业务目录和 Electron。共享类型不能反向引用引擎实现。配套 ESLint 限制和独立 `tsconfig.agent.json` 纳入日常检查。

`tests/engine/GenericAgentEngine.behavior.test.ts` 使用库存业务的自定义能力和工具验证公共入口，不加载 StoryOS 配置，覆盖真实工具调用、审批、无效果/错误上下文拒绝、规划能力匹配与自定义内部目录保护。

## 5. 本次验证结果

| 检查 | 结果 |
| --- | --- |
| 全项目类型 / 后端严格类型 / 后端 lint | 通过 |
| `check:agent` | 独立类型、lint 和 123 个源码/契约文件的依赖边界检查通过 |
| 完整 Vitest | 71 个文件、327 项通过，含 4 项新增通用引擎测试 |
| `test:storage:phase-a` / `test:reader:storage` | 事务、CAS、恢复、租约、阅读位置与缓存检查通过 |
| `package` / `test:packaged:resources` | 生产打包及 12 项资源检查通过 |
| `test:packaged:smoke` / `test:packaged:business` | 正式 EXE/ASAR 启动、项目创建、正文保存和重启恢复通过 |
| 空目录与差异检查 | agent 下无空目录；`git diff --check` 通过 |

最终原生依赖保持 Electron ABI。测试使用隔离 home 和假模型，没有调用真实外部模型；未执行用户数据重置。此前完整重构中的桌面存储 UI 和离线阅读器端到端测试本次未重复执行。

后续执行 `npm run check:agent` 验证核心引擎，执行 `npm run check:backend` 或 `npm test` 验证完整接入。
