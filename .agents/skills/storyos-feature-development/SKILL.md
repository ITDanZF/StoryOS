---
name: storyos-feature-development
description: Design and implement new or expanded StoryOS product functionality as a coherent module that follows existing architecture, data flow, contracts, and focused verification. Use for feature work spanning new behavior, screens, workflows, storage, IPC, or Agent capabilities.
---

# StoryOS Feature Development

新增功能应形成符合 StoryOS 现有架构的紧凑模块，并以最小接入改动连接现有系统。一般同时遵守 `storyos-code-change`。

## 判断与调研

1. 先判断任务是新功能、缺陷修复、重构、配置、测试还是文档。明显的功能请求无需再次让用户确认分类；只有分类会改变范围或交付方式时才询问。
2. 查找最近的同类功能，确认框架、路由、状态、IPC、业务用例、存储、验证和测试模式。优先遵循本仓库先例，除非它已明确标记为旧实现。
3. 明确入口、主要用户流程、数据源、持久化规则、权限/审批、错误行为和完成标准。不要把未知后端或模型契约当成事实。

## 模块放置

- 通用 Agent 执行能力放 `src/main/agent/`；书籍、章节、项目、编辑器等业务通过 `src/main/story/` 接入，禁止通用引擎反向引用 StoryOS 业务。
- 跨进程通用引擎类型放 `src/shared/engine/`，业务通信契约放 `src/shared/contracts/`。
- renderer 功能优先放 `src/renderer/features/<feature>/`，页面只承担路由级组合；复用现有 UI、theme、motion 和平台适配。
- 只新增完成接入所需的 route、IPC、registry、provider、store slice、导出或 wiring，不创建平行服务层、全局状态或新架构体系。

## 拆分标准

- 以独立变化原因拆分：容器/视图、领域组件、数据适配、领域转换、验证、类型和测试。
- 当一个文件同时处理获取、转换、持久化、状态、布局和渲染时拆分；一次性包装、小片段或单行 helper 不单独成文件。
- 普通功能优先保持约 4–8 个有意义的生产文件；实际职责更多时可以超过，不为满足数字机械拆分。
- 父层负责流程编排，子组件负责展示或局部交互。跨层数据沿用现有 loader、store、应用用例、repository 或 IPC 契约。
- 变换放在原始数据进入功能的边界附近，不重复存储可推导的 canonical state，不提前暴露内部 API。

## 契约与临时数据

- API、IPC、schema、权限、导航入口或持久化规则不清楚且会影响实现时，提出具体问题。
- 用户允许 mock 时，把 mock 隔离在窄适配层并明确替换边界；不要让临时 shape 泄漏到整个模块。
- 必填数据严格读取。`0`、`false`、空字符串可能有效时使用精确的 null/undefined 判断，不使用宽泛 truthiness fallback。

## 完成标准

实现前或实施过程中能回答：模块放在哪里、镜像哪个现有模块、每个新文件为何存在、复用哪条数据流、哪些假设已确认、错误契约如何暴露、运行哪些定向验证。完成后按实际风险执行这些检查并报告结果。
