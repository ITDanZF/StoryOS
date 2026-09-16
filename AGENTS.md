# StoryOS AI 开发约定

本文件是仓库级 AI 开发说明。显式用户要求优先于本文件和项目 Skill；更深目录中的 `AGENTS.md` 可补充其目录范围内的约定。

## 项目概览

StoryOS 是 Windows 优先的 Electron + React + TypeScript 本地桌面应用。主进程使用 LangChain/LangGraph 和 SQLite，渲染进程使用 React、Tiptap、Tailwind CSS、Zustand，测试使用 Vitest 与 Playwright。

先阅读与任务最接近的实现和文档，不要仅凭目录名猜测架构。重要边界如下：

- `src/main/agent/` 是通用 Agent 引擎，不放书籍、章节、项目、编辑器或桌面 IPC 等 StoryOS 业务；详细说明见 `src/main/agent/README.md`。
- `src/main/story/` 放 StoryOS 业务用例、集成、运行时和持久化。
- `src/main/bootstrap/` 负责应用装配，`src/main/desktop/` 与 `src/main/ipc/` 负责 Electron/IPC 适配。
- `src/shared/engine/` 只放通用引擎契约，`src/shared/contracts/` 放跨进程业务契约；shared 不反向依赖 main、renderer、Electron、SQLite 或 LangChain 实现。
- `src/renderer/features/` 按业务特性组织前端，复用现有 UI、主题和动效设施。处理 `src/renderer/` 时同时遵守其中的 `AGENTS.md`。
- `skills/` 是 StoryOS 产品运行时的 Skill 格式；`.agents/skills/` 是开发工具使用的 Agent Skills。不要混用两套 frontmatter 或安装路径。

## 修改原则

- 修改前检查 `git status --short`，保留用户已有改动；计划触及有未提交修改的文件时先查看对应 diff。
- 先找最近的同类模块和现有数据流，再决定新增目录、状态、服务或抽象。避免平行架构和没有真实复用需求的公共层。
- 用户、共享契约、schema 或实际 payload 已确认的字段与行为是唯一事实来源。必填数据缺失时走现有校验或错误路径，不要擅自增加备用字段、默认值、静默兼容或吞错。
- 只改完成请求所需的范围。发现相邻问题时单独报告，不顺手扩大重构。
- 高影响写入、数据迁移、发布、依赖新增或不可逆操作需要明确授权；已明确授权的安全本地实现不重复索要确认。

## 验证

优先运行与改动范围匹配的最窄检查：

- Agent 引擎：`npm run check:agent`，必要时 `npm run test:agent`。
- 主进程、preload、shared 或 StoryOS 后端：`npm run check:backend`。
- renderer：`npm run lint:frontend`，并运行相关测试或 `npm run typecheck`。
- 跨层或广泛改动：`npm run check`，再按风险选择桌面、存储、阅读器或打包脚本。
- `better-sqlite3` 在 Node 测试与 Electron 运行间需要不同 ABI；遵循现有 `native:node`、`native:electron` 和脚本前置步骤，不手工覆盖产物。

不要为了形式重复全量检查。说明实际运行的命令、结果，以及未覆盖但仍有意义的风险。

## 项目开发 Skills

支持 Agent Skills 的工具应从 `.agents/skills/` 自动发现。未原生支持该目录的工具在任务匹配时先完整读取对应文件，再按其中流程工作。

- `.agents/skills/storyos-code-change/SKILL.md`：编写、修改、调试、重构或测试代码。
- `.agents/skills/storyos-feature-development/SKILL.md`：新增或扩展产品功能，设计模块边界与接入方式。
- `.agents/skills/storyos-frontend-rebuild/SKILL.md`：依据截图、原型或设计稿实现前端页面。
- `.agents/skills/storyos-issue-analysis/SKILL.md`：结合 issue 与仓库做只读问题诊断。
- `.agents/skills/storyos-code-review/SKILL.md`：审查未提交改动、提交或分支差异。
- `.agents/skills/storyos-skill-authoring/SKILL.md`：创建或维护本仓库两类 Skill。

这些 Skill 是按任务加载的工作流，不是所有任务都要执行的固定步骤。多个 Skill 同时适用时，选择能覆盖请求的最小集合。
