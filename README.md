<div align="center">
  <img src="public/storyos-logo.svg" width="96" height="96" alt="StoryOS Logo" />

  # StoryOS

  **为长篇故事创作而生的本地 AI 桌面工作台**

  把项目管理、分卷分章写作、AI 对话与智能体任务放进同一个创作空间。

  [![Platform](https://img.shields.io/badge/platform-Windows-0078D4?style=flat-square&logo=windows11&logoColor=white)](#环境要求)
  [![Electron](https://img.shields.io/badge/Electron-42-47848F?style=flat-square&logo=electron&logoColor=white)](https://www.electronjs.org/)
  [![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=111)](https://react.dev/)
  [![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
  [![License](https://img.shields.io/badge/license-MIT-2B2730?style=flat-square)](#license)

  [功能概览](#功能概览) · [快速开始](#快速开始) · [项目状态](#项目状态) · [参与开发](#参与开发)
</div>

---

## StoryOS 是什么？

StoryOS 是一个面向小说与长篇故事创作的开源桌面应用。它以本地项目为中心，为创作者提供从作品组织、正文编辑到 AI 辅助写作的一体化工作流。

你可以管理书籍、分卷和章节，在分页富文本编辑器中持续创作；也可以让 AI 读取当前项目与章节上下文，协助分析、续写、改写和执行更复杂的创作任务。

> StoryOS 仍在积极开发中，目前更适合开发体验、功能验证和参与共建，暂不建议用于没有备份的重要稿件。

## 功能概览

### 📚 面向长篇创作的项目结构

- 创建、打开、切换和管理本地创作项目
- 按书籍、分卷、章节组织长篇内容
- 保存章节正文与修订记录
- 在分页富文本编辑器中获得接近纸张的写作体验

### ✨ 理解上下文的 AI 写作

- 在全局、项目或章节上下文中与 AI 对话
- 生成、续写、改写和编辑章节正文
- 展示流式回复、工具调用过程与任务进度
- 对高影响操作提供预览和审批状态

### 🤖 可扩展的 Agent 工作流

- 支持任务规划、执行、审查与结果汇总
- 支持多 Agent 协作处理复杂创作任务
- 通过工具和 Skill 扩展智能体能力
- 保留会话与运行记录，便于回顾任务过程

### 🔒 本地优先，自带模型选择权

- 使用 SQLite 在本地保存项目、会话和运行数据
- 支持 OpenAI、DeepSeek、通义千问等兼容模型服务
- API Key 由用户自行配置，不内置平台账号依赖
- 项目以本地资源目录为边界，便于管理与备份

## 技术栈

| 领域 | 技术 |
| --- | --- |
| 桌面端 | Electron · Electron Forge |
| 前端 | React · TypeScript · Vite · Tailwind CSS |
| 编辑器 | Tiptap |
| AI / Agent | LangChain · LangGraph |
| 本地存储 | SQLite · better-sqlite3 |
| 状态与校验 | Zustand · Zod |
| 测试 | Vitest · Playwright |

## 快速开始

### 环境要求

- Windows 10/11
- Node.js 与 npm
- 一个可用的 OpenAI 兼容模型服务及 API Key（仅使用 AI 功能时需要）

### 从源码运行

```bash
git clone https://github.com/ITDanZF/StoryOS.git
cd StoryOS
npm install
npm start
```

首次启动后，在 StoryOS 的设置页面中选择模型服务，并填写模型名称与 API Key。

> `npm start` 会自动为 Electron 运行时重新构建 `better-sqlite3`。如果原生依赖安装失败，请确认当前 Node.js/npm 环境和网络状态后重新执行 `npm install`。

## 开发命令

```bash
# 启动开发环境
npm start

# 类型检查、测试与 Agent 代码检查
npm run check

# 运行单元测试
npm test

# 验证分页编辑器
npm run test:pagination:e2e

# 打包应用
npm run package

# 生成安装包
npm run make
```

## 数据与隐私

StoryOS 默认将项目内容、对话记录和相关运行数据保存在本地。

当你主动使用 AI 功能时，为完成请求所需的内容会发送给你配置的模型服务。请妥善保管 API Key，并在使用前了解相应服务商的数据处理与隐私政策。对于重要稿件，建议定期备份项目目录。

## 项目状态

StoryOS 目前处于持续开发阶段：

- [x] 本地项目创建、打开与管理
- [x] 书籍、分卷和章节管理
- [x] 分页富文本编辑器
- [x] 上下文 AI 对话与章节生成
- [x] Agent 任务过程、工具调用与审批展示
- [ ] 持续完善 Agent 稳定性与测试覆盖
- [ ] 改进安装、发布与新用户上手体验
- [ ] 探索独立书架、内容导入与多格式导出

路线图会根据实际使用反馈逐步调整。欢迎通过 [Issues](https://github.com/ITDanZF/StoryOS/issues) 分享问题、需求和使用场景。

## 参与开发

StoryOS 仍处于早期阶段，代码贡献、问题反馈和产品建议都很有价值。

1. Fork 本仓库并创建功能分支。
2. 完成修改并运行 `npm run check`。
3. 提交 Pull Request，说明修改动机、实现方式和验证结果。

如果你暂时不准备贡献代码，也欢迎为项目点一个 Star，帮助更多创作者发现 StoryOS。

## License

StoryOS 基于 MIT License 开源。
