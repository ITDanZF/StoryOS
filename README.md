# StoryOS

StoryOS 是一个面向小说创作的 AI 桌面工作台，尝试将项目管理、小说编辑、AI 对话和智能体任务整合到同一个工作流中。

项目目前以桌面应用的形式运行，支持管理小说项目、分卷分章编辑正文，并让 AI 根据当前书籍、章节或选区上下文提供分析、改写和内容生成能力。

## 主要功能

- 创建、打开、切换和管理本地创作项目
- 管理书籍、卷、章节以及章节修订内容
- 使用分页富文本编辑器编写小说正文
- 在项目或章节上下文中与 AI 对话
- 使用 AI 生成、改写和编辑章节内容
- 展示流式回复、工具调用、任务进度和审批状态
- 支持多 Agent 任务规划、调度、审查和结果汇总
- 使用 SQLite 在本地保存项目、会话和运行记录
- 支持 OpenAI、DeepSeek 和通义千问等兼容模型服务

## 技术栈

- Electron
- React + TypeScript
- Vite + Electron Forge
- Tiptap
- LangChain / LangGraph
- SQLite（better-sqlite3）
- Vitest

## 本地运行

需要准备 Node.js 和 npm。

```bash
npm install
npm start
```

首次运行后，请在设置页面配置模型服务、模型名称和 API Key。

## 常用命令

```bash
# 类型检查、测试和 Agent 代码检查
npm run check

# 运行测试
npm test

# 验证分页编辑器
npm run test:pagination:e2e

# 打包桌面应用
npm run package

# 生成安装包
npm run make
```

## 当前状态

StoryOS 目前处于持续开发阶段，核心编辑器、项目管理、AI 对话和 Agent 基础能力已经具备。Agent 架构仍在进行测试迁移和稳定性验证，现阶段更适合作为开发版或内部测试版使用。

## 数据说明

项目内容、会话记录和相关运行数据默认保存在本地。使用 AI 功能时，相应内容会根据配置发送给所选择的模型服务，请妥善保管 API Key，并了解对应服务商的数据政策。

## License

MIT
